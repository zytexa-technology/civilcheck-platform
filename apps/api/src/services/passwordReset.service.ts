// ─────────────────────────────────────────────────────────────────────────────
// Email-OTP password reset — Admin (SUPER_ADMIN only), Seller, Buyer.
//
// Three-call flow per actor: request → verify → reset. The OTP is the only
// credential involved (no separate "reset token" is ever minted) — verify()
// is an advisory pre-check for the UI only; reset() independently
// re-validates the OTP in full before ever touching the password, so a
// client can never skip straight to reset with an unverified/guessed code
// and get a different (weaker) check than verify() applied.
//
// Anti-enumeration: every request()/verify() response is identical whether
// or not the email/OTP is valid — the caller cannot learn whether an account
// exists, whether an OTP was ever sent, or why a check failed.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { sendEmail } from './notification.service.js'

const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000 // 1 minute between sends per account
const OTP_BCRYPT_ROUNDS = 10
const PASSWORD_BCRYPT_ROUNDS = 10 // matches auth.controller.ts's PASSWORD_BCRYPT_ROUNDS

export type ResetActor = 'ADMIN' | 'SELLER' | 'BUYER'

// Every caller gets one of these two outcomes — never anything more specific,
// so the HTTP layer has nothing account-revealing to accidentally forward.
export type RequestResult = { ok: true }
export type VerifyResult = { ok: true } | { ok: false; reason: 'invalid' }
export type ResetResult = { ok: true } | { ok: false; reason: 'invalid' }

function generateOtp(): string {
  // crypto.randomInt is uniform and CSPRNG-backed — Math.random() is neither.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

type EligibleAccount = { id: string; email: string; name: string }

// Resolves the row this actor/email is allowed to reset, or null if the
// flow should silently no-op (unknown email, wrong role, no password to
// reset, or a soft-deleted account). Never throws on "not found" — the
// caller treats null exactly like a real account that simply didn't need an
// email sent, which is what keeps this enumeration-safe.
async function findEligibleAccount(actor: ResetActor, email: string): Promise<EligibleAccount | null> {
  if (actor === 'ADMIN') {
    const admin = await prisma.admin.findUnique({ where: { email } })
    // Only the SUPER_ADMIN role gets self-service reset (PDF: SUB_ADMIN/
    // VIEWER credentials stay SuperAdmin-managed — see admin.routes.ts's
    // superOnly admin CRUD). A blocked/deactivated admin is excluded for the
    // same reason adminLogin checks these before issuing a session — though
    // in practice the SUPER_ADMIN row can never reach either state (every
    // admin-management route structurally refuses to touch it).
    if (!admin || admin.role !== 'SUPER_ADMIN' || admin.blocked || !admin.active) return null
    return { id: admin.id, email: admin.email, name: admin.name }
  }

  if (actor === 'SELLER') {
    const seller = await prisma.seller.findUnique({ where: { email } })
    if (!seller || seller.deletedAt || !seller.passwordHash) return null
    return { id: seller.id, email: seller.email as string, name: seller.name }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.deletedAt || !user.passwordHash) return null
  return { id: user.id, email: user.email as string, name: user.name || 'there' }
}

function actorColumn(actor: ResetActor) {
  return actor === 'ADMIN' ? 'adminId' : actor === 'SELLER' ? 'sellerId' : 'userId'
}

function otpEmailContent(name: string, otp: string) {
  const subject = 'Your CivilCheck password reset code'
  const text =
    `Hi ${name},\n\n` +
    `Use this code to reset your CivilCheck password: ${otp}\n\n` +
    `This code expires in 10 minutes and can only be used once.\n\n` +
    `If you did not request this, you can safely ignore this email — your ` +
    `password will not change unless this exact code is used.\n\n` +
    `— Team CivilCheck`
  const html =
    `<p>Hi ${name},</p>` +
    `<p>Use this code to reset your CivilCheck password:</p>` +
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">${otp}</p>` +
    `<p>This code expires in <strong>10 minutes</strong> and can only be used once.</p>` +
    `<p style="color:#6b7280;font-size:13px;">If you did not request this, you can safely ignore this ` +
    `email — your password will not change unless this exact code is used.</p>` +
    `<p>— Team CivilCheck</p>`
  return { subject, text, html }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — request an OTP
// ─────────────────────────────────────────────────────────────────────────────
export async function requestPasswordReset(actor: ResetActor, email: string): Promise<RequestResult> {
  const account = await findEligibleAccount(actor, email)
  if (!account) {
    // No account, wrong role, or nothing to reset — do nothing, but return
    // the exact same shape as the real-send path below.
    return { ok: true }
  }

  const column = actorColumn(actor)

  // Resend cooldown — silent no-op (not a different response) so timing
  // alone never reveals whether a previous request actually existed.
  // Scoped to purpose: PASSWORD_RESET (Signup Email Verification, added
  // later, reuses this same table under OtpPurpose.EMAIL_VERIFICATION) —
  // without this filter, a more recent verification-email OTP for the same
  // account would otherwise be picked up here instead of the real most
  // recent password-reset OTP.
  const recent = await prisma.passwordResetOtp.findFirst({
    where: { [column]: account.id, purpose: 'PASSWORD_RESET' },
    orderBy: { createdAt: 'desc' },
  })
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { ok: true }
  }

  const otp = generateOtp()
  const otpHash = await bcrypt.hash(otp, OTP_BCRYPT_ROUNDS)

  await prisma.passwordResetOtp.create({
    data: {
      [column]: account.id,
      purpose: 'PASSWORD_RESET',
      otpHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  })

  const { subject, text, html } = otpEmailContent(account.name, otp)
  const delivery = await sendEmail({ to: account.email, subject, text, html })
  // Never let a dead email provider turn into a 500 for the caller, and
  // never log the OTP/email content — only that a send was attempted.
  if (delivery.status === 'failed') {
    logger.error(`[passwordReset] OTP email failed to send for actor=${actor}`)
  }

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — verify (advisory pre-check for the UI; does not consume the OTP)
// ─────────────────────────────────────────────────────────────────────────────
async function findUsableOtp(actor: ResetActor, accountId: string) {
  const column = actorColumn(actor)
  // purpose: 'PASSWORD_RESET' — see requestPasswordReset's identical filter above.
  return prisma.passwordResetOtp.findFirst({
    where: { [column]: accountId, purpose: 'PASSWORD_RESET', usedAt: null },
    orderBy: { createdAt: 'desc' },
  })
}

export async function verifyPasswordResetOtp(actor: ResetActor, email: string, otp: string): Promise<VerifyResult> {
  const account = await findEligibleAccount(actor, email)
  if (!account) return { ok: false, reason: 'invalid' }

  const row = await findUsableOtp(actor, account.id)
  if (!row || row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'invalid' }
  }

  const matches = await bcrypt.compare(otp, row.otpHash)
  if (!matches) {
    await prisma.passwordResetOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
    return { ok: false, reason: 'invalid' }
  }

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — reset (re-validates the OTP fully, then atomically consumes it +
// updates the password)
// ─────────────────────────────────────────────────────────────────────────────
export async function resetPassword(
  actor: ResetActor,
  email: string,
  otp: string,
  newPassword: string
): Promise<ResetResult> {
  const account = await findEligibleAccount(actor, email)
  if (!account) return { ok: false, reason: 'invalid' }

  const row = await findUsableOtp(actor, account.id)
  if (!row || row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'invalid' }
  }

  const matches = await bcrypt.compare(otp, row.otpHash)
  if (!matches) {
    await prisma.passwordResetOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
    return { ok: false, reason: 'invalid' }
  }

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_BCRYPT_ROUNDS)

  await prisma.$transaction(async (tx) => {
    // Mark used first — if the password write below ever failed, a half-
    // applied reset must never leave a still-usable OTP behind.
    await tx.passwordResetOtp.update({ where: { id: row.id }, data: { usedAt: new Date() } })

    if (actor === 'ADMIN') {
      await tx.admin.update({ where: { id: account.id }, data: { password: passwordHash } })
    } else if (actor === 'SELLER') {
      await tx.seller.update({ where: { id: account.id }, data: { passwordHash } })
    } else {
      await tx.user.update({ where: { id: account.id }, data: { passwordHash } })
    }
  })

  logger.info(`[passwordReset] password reset completed for actor=${actor}`)
  return { ok: true }
}
