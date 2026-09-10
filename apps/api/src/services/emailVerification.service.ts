// ─────────────────────────────────────────────────────────────────────────────
// Signup Email Verification — Buyer + Partner (Seller). Reuses the exact same
// table, security model, and even most of the code shape as
// passwordReset.service.ts (same file's header comments explain the OTP
// discipline in full) — the only structural difference is that verifying IS
// the action here (mark emailVerified + issue a session), so there is no
// separate third "reset" step the way password reset has request → verify →
// reset.
//
// Anti-enumeration: request/resend responses are identical whether or not
// the email exists or is already verified — same reasoning as
// passwordReset.service.ts.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Seller, User } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { sendEmail, type DeliveryResult } from './notification.service.js'

const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes — same as password reset
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000 // 1 minute between sends per account
const OTP_BCRYPT_ROUNDS = 10

export type VerifyActor = 'SELLER' | 'BUYER'

export type RequestResult = { ok: true }
export type VerifyResult =
  | { ok: true; account: User | Seller }
  | { ok: false; reason: 'invalid' }

function generateOtp(): string {
  // crypto.randomInt is uniform and CSPRNG-backed — Math.random() is neither.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

function actorColumn(actor: VerifyActor) {
  return actor === 'SELLER' ? 'sellerId' : 'userId'
}

async function findAccount(actor: VerifyActor, email: string): Promise<User | Seller | null> {
  if (actor === 'SELLER') {
    const seller = await prisma.seller.findUnique({ where: { email } })
    if (!seller || seller.deletedAt) return null
    return seller
  }
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.deletedAt) return null
  return user
}

async function createAndSendOtp(
  actor: VerifyActor,
  accountId: string,
  email: string,
  name: string,
  kind: 'welcome' | 'resend'
): Promise<DeliveryResult> {
  const column = actorColumn(actor)
  const otp = generateOtp()
  const otpHash = await bcrypt.hash(otp, OTP_BCRYPT_ROUNDS)

  await prisma.passwordResetOtp.create({
    data: {
      [column]: accountId,
      purpose: 'EMAIL_VERIFICATION',
      otpHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  })

  const { subject, text, html } =
    kind === 'welcome' ? welcomeEmailContent(actor, name, otp) : resendEmailContent(actor, name, otp)
  const delivery = await sendEmail({ to: email, subject, text, html })
  if (delivery.status === 'failed') {
    logger.error(`[emailVerification] OTP email failed to send for actor=${actor}`)
  }
  return delivery
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 (registration time) — always sends. Called once, immediately after
// registerBuyer/sellerRegister creates the row, never gated behind a cooldown
// check (there is nothing to have "recently sent" yet for a brand-new
// account) — resendVerificationEmail below is the cooldown-guarded path for
// every subsequent send. Returns the delivery result (Resend message id
// included) purely so callers/QA tooling can confirm a real send happened —
// registerBuyer/sellerRegister themselves ignore it (fire-and-forget, same
// as before).
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWelcomeVerificationEmail(
  actor: VerifyActor,
  accountId: string,
  email: string,
  name: string
): Promise<DeliveryResult> {
  return createAndSendOtp(actor, accountId, email, name, 'welcome')
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — resend. Buyer/Partner "Resend OTP" button.
// ─────────────────────────────────────────────────────────────────────────────
export async function resendVerificationEmail(actor: VerifyActor, email: string): Promise<RequestResult> {
  const account = await findAccount(actor, email)
  // Unknown account, or already verified — silent no-op (anti-enumeration,
  // and "existing verified accounts don't get a signup email" per spec).
  if (!account || account.emailVerified) {
    return { ok: true }
  }

  const column = actorColumn(actor)
  const recent = await prisma.passwordResetOtp.findFirst({
    where: { [column]: account.id, purpose: 'EMAIL_VERIFICATION' },
    orderBy: { createdAt: 'desc' },
  })
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { ok: true }
  }

  await createAndSendOtp(actor, account.id, email, account.name || 'there', 'resend')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — verify. Marks emailVerified + consumes the OTP atomically, then
// returns the fresh account row so the controller can issue a session exactly
// like login/register do.
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyEmailOtp(actor: VerifyActor, email: string, otp: string): Promise<VerifyResult> {
  const account = await findAccount(actor, email)
  if (!account) return { ok: false, reason: 'invalid' }

  const column = actorColumn(actor)
  const row = await prisma.passwordResetOtp.findFirst({
    where: { [column]: account.id, purpose: 'EMAIL_VERIFICATION', usedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!row || row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'invalid' }
  }

  const matches = await bcrypt.compare(otp, row.otpHash)
  if (!matches) {
    await prisma.passwordResetOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
    return { ok: false, reason: 'invalid' }
  }

  const [, updated] = await prisma.$transaction([
    prisma.passwordResetOtp.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    actor === 'SELLER'
      ? prisma.seller.update({ where: { id: account.id }, data: { emailVerified: true } })
      : prisma.user.update({ where: { id: account.id }, data: { emailVerified: true } }),
  ])

  logger.info(`[emailVerification] email verified for actor=${actor}`)
  return { ok: true, account: updated as User | Seller }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL CONTENT — Buyer/Partner-specific wording (task spec). Same visual
// style as passwordReset.service.ts's otpEmailContent (large OTP display),
// just with the "Welcome to CivilCheck!" framing on the first send.
// ─────────────────────────────────────────────────────────────────────────────
function accountKindLabel(actor: VerifyActor): 'Buyer' | 'Partner' {
  return actor === 'SELLER' ? 'Partner' : 'Buyer'
}

function welcomeEmailContent(actor: VerifyActor, name: string, otp: string) {
  const kind = accountKindLabel(actor)
  const subject = `Welcome to CivilCheck — Verify Your ${kind} Account`
  const nextStep =
    actor === 'SELLER'
      ? 'you can continue your CivilCheck Partner onboarding and complete the required profile/KYC process.'
      : 'you can use CivilCheck to discover properties and request professional property verification.'
  const text =
    `Welcome to CivilCheck!\n\n` +
    `Hi ${name},\n\n` +
    `Your new account on CivilCheck as a ${kind} has been created successfully.\n\n` +
    `Please use the verification code below to verify your email address:\n\n` +
    `${otp}\n\n` +
    `This verification code will expire in 10 minutes.\n\n` +
    `After verification, ${nextStep}\n\n` +
    `If you did not create this account, please ignore this email and contact CivilCheck support if necessary.\n\n` +
    `Welcome to CivilCheck.\n\n` +
    `CivilCheck Team`
  const html = otpEmailHtml({
    heading: 'Welcome to CivilCheck!',
    intro:
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>Your new account on CivilCheck as a <strong>${kind}</strong> has been created successfully.</p>` +
      `<p>Please use the verification code below to verify your email address:</p>`,
    otp,
    outro:
      `<p>After verification, ${escapeHtml(nextStep)}</p>` +
      `<p style="color:#6b7280;font-size:13px;">If you did not create this account, please ignore this email and contact CivilCheck support if necessary.</p>` +
      `<p>Welcome to CivilCheck.</p>`,
  })
  return { subject, text, html }
}

// Resend — deliberately NOT the welcome/new-account framing (spec: "Resend
// OTP should only send the verification email").
function resendEmailContent(actor: VerifyActor, name: string, otp: string) {
  const kind = accountKindLabel(actor)
  const subject = `Your CivilCheck ${kind} email verification code`
  const text =
    `Hi ${name},\n\n` +
    `Here is your new CivilCheck email verification code:\n\n` +
    `${otp}\n\n` +
    `This code expires in 10 minutes and can only be used once.\n\n` +
    `If you did not request this, you can safely ignore this email.\n\n` +
    `— Team CivilCheck`
  const html = otpEmailHtml({
    heading: 'Verify your email',
    intro: `<p>Hi ${escapeHtml(name)},</p><p>Here is your new CivilCheck email verification code:</p>`,
    otp,
    outro: `<p style="color:#6b7280;font-size:13px;">If you did not request this, you can safely ignore this email.</p>`,
  })
  return { subject, text, html }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Minimal inline-styled table layout — mobile-friendly, renders consistently
// across common email clients (Gmail/Outlook strip <style> blocks, so every
// rule here is inline).
function otpEmailHtml({ heading, intro, otp, outro }: { heading: string; intro: string; otp: string; outro: string }) {
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 20px;color:#111827;">` +
    `<h2 style="margin:0 0 16px;font-size:20px;">${escapeHtml(heading)}</h2>` +
    intro +
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;text-align:center;background:#f9fafb;border-radius:8px;padding:14px 0;">${otp}</p>` +
    `<p>This verification code will expire in <strong>10 minutes</strong>.</p>` +
    outro +
    `<p>CivilCheck Team</p>` +
    `</div>`
  )
}
