// ─────────────────────────────────────────────────────────────────────────────
// Multi-channel notification adapter — email (Resend, via the official SDK),
// SMS (deactivated, see below), in-app, push (Firebase).
//
// Credentials are read PER CALL, never at module load. Dropping RESEND_API_KEY
// into .env therefore needs a process restart and nothing else: no code
// change, no flag to flip, no fallback to delete later.
//
//   key present → real HTTP send against the provider
//   key absent  → delivery is skipped and logged at a minimal level — no
//                 recipient, sender, subject or body (see sendEmail below)
//
// Both paths return the same DeliveryResult, so callers never branch on
// whether a provider happens to be configured. Nothing here throws: a dead
// provider must not roll back the business action that triggered the message.
// ─────────────────────────────────────────────────────────────────────────────
import { Resend } from 'resend'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { sendPush } from '../lib/firebase.js'

// How long to wait on a provider before giving up. Notifications are sent
// inline from request handlers, so this bounds the admin's wait too.
const PROVIDER_TIMEOUT_MS = 10_000

export type NotificationChannel = 'email' | 'sms' | 'in_app' | 'push'

export type DeliveryStatus =
  | 'sent' // provider accepted it
  | 'logged' // no credentials — payload written to the log instead
  | 'skipped' // nothing to send to (no address / no phone)
  | 'failed' // provider rejected it or the call blew up

export interface DeliveryResult {
  channel: NotificationChannel
  status: DeliveryStatus
  provider: 'resend' | 'database' | 'console' | 'fcm'
  id?: string
  error?: string
}

export interface EmailMessage {
  to: string | null | undefined
  subject: string
  html: string
  text: string
}

export interface SmsMessage {
  to: string | null | undefined
  body: string
  // Unused now that the SMS channel is deactivated (MSG91 removed) — kept on
  // the type so the ~15 call sites across kyc/penalty/refund/specialRequest/
  // alert services that still pass these don't all need editing in this pass.
  templateId?: string
  variables?: Record<string, string>
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL — Resend (https://resend.com/docs/api-reference/emails/send-email)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendEmail(message: EmailMessage): Promise<DeliveryResult> {
  const { to, subject, html, text } = message

  if (!to) {
    // No recipient/subject in the log — see the header comment above for why
    // email content never appears in a log line, missing-address case included.
    logger.warn('[notify:email] skipped — no address on record')
    return { channel: 'email', status: 'skipped', provider: 'console' }
  }

  const apiKey = process.env.RESEND_API_KEY
  // civilcheck.online is the domain actually verified with Resend — never
  // fall back to an unverified/placeholder domain here.
  const from = process.env.RESEND_FROM_EMAIL || 'CivilCheck <no-reply@civilcheck.online>'

  if (!apiKey) {
    // Deliberately minimal: recipient, sender, subject and body are all
    // business-sensitive (rejection reasons, payout amounts, etc.) and must
    // never land in a log line just because a provider isn't configured.
    logger.info('[notify:email] Resend not configured; email delivery skipped.')
    return { channel: 'email', status: 'logged', provider: 'console' }
  }

  // Read (and the client constructed) per call, never at module load — same
  // "credentials read per call" discipline as cloudinary.ts/razorpay.ts, so
  // dropping RESEND_API_KEY into .env only needs a process restart.
  const resend = new Resend(apiKey)

  try {
    // The SDK has no built-in request timeout, so this bounds it the same
    // way the previous raw-fetch implementation did — an admin action that
    // triggers a notification must not hang indefinitely on a dead provider.
    const result = await Promise.race([
      resend.emails.send({ from, to: [to], subject, html, text }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Resend request timed out')), PROVIDER_TIMEOUT_MS)
      }),
    ])

    if (result.error) {
      // No recipient address in the log — same reasoning as the missing-key
      // path above; the Resend error code/message is enough to debug by.
      // (The SDK itself also console.errors this same {status, error, path}
      // shape outside production — never the API key, recipient, or body.)
      logger.error(`[notify:email] Resend rejected the message: ${result.error.message}`)
      return { channel: 'email', status: 'failed', provider: 'resend', error: result.error.message }
    }

    logger.info(`[notify:email] sent via Resend (id: ${result.data?.id ?? 'unknown'})`)
    return { channel: 'email', status: 'sent', provider: 'resend', id: result.data?.id }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error(`[notify:email] Resend call failed: ${error}`)
    return { channel: 'email', status: 'failed', provider: 'resend', error }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMS — deactivated. MSG91 was removed platform-wide (auth cutover to
// email+password login — see docs/changes-required-2026-08-05.md's Phase 1
// and the auth.controller.ts rewrite). This stays as a no-op stub, rather
// than being deleted, so the ~15 call sites across kyc/penalty/refund/
// specialRequest/alert services that pass an `sms:` option to notifySeller()/
// notifyBuyerAlert() don't all need editing in the same pass — the SMS
// channel now always reports 'skipped' and nothing is ever sent.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendSms(message: SmsMessage): Promise<DeliveryResult> {
  if (!message.to) {
    logger.warn(`[notify:sms] skipped — no phone on record (body: "${message.body}")`)
  }
  return { channel: 'sms', status: 'skipped', provider: 'console' }
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-APP — a row in the seller's OR buyer's notification feed (Phase 4C
// extended this from seller-only to a shared inbox — see Notification's
// schema comment for the XOR-by-CHECK constraint backing this).
// ─────────────────────────────────────────────────────────────────────────────
export type InAppRecipient = { sellerId: string; userId?: undefined } | { userId: string; sellerId?: undefined }

export async function sendInApp(
  recipient: InAppRecipient,
  data: { type: string; title: string; body: string }
): Promise<DeliveryResult> {
  const who = recipient.sellerId ? `seller ${recipient.sellerId}` : `buyer ${recipient.userId}`
  try {
    const row = await prisma.notification.create({
      data: {
        sellerId: recipient.sellerId ?? null,
        userId: recipient.userId ?? null,
        type: data.type,
        title: data.title,
        body: data.body,
      },
    })
    return { channel: 'in_app', status: 'sent', provider: 'database', id: row.id }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error(`[notify:in_app] failed for ${who}: ${error}`)
    return { channel: 'in_app', status: 'failed', provider: 'database', error }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FAN-OUT — one seller-facing event across every channel we can reach
// ─────────────────────────────────────────────────────────────────────────────
export interface SellerNotification {
  type: string // Notification.type — sale | approval | platform | …
  title: string
  // In-app body and the SMS text. Kept short: SMS is the tightest channel.
  body: string
  email?: { subject: string; html: string; text: string }
  sms?: { templateId?: string; variables?: Record<string, string> }
}

export async function notifySeller(
  seller: { id: string; name: string; phone: string; email: string | null },
  notification: SellerNotification
): Promise<DeliveryResult[]> {
  // Settled in parallel — one dead provider must not delay or fail the others.
  const results = await Promise.all([
    sendInApp({ sellerId: seller.id }, {
      type: notification.type,
      title: notification.title,
      body: notification.body,
    }),
    notification.email
      ? sendEmail({ to: seller.email, ...notification.email })
      : Promise.resolve<DeliveryResult>({
          channel: 'email',
          status: 'skipped',
          provider: 'console',
        }),
    sendSms({
      to: seller.phone,
      body: notification.body,
      templateId: notification.sms?.templateId,
      variables: notification.sms?.variables,
    }),
  ])

  const summary = results.map((r) => `${r.channel}:${r.status}`).join(' ')
  logger.info(`[notify] seller ${seller.id} "${notification.title}" → ${summary}`)

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// BUYER ALERT FAN-OUT (PDF 7.7 / 12/20) — one alert across the buyer's channels.
//
// Channel policy, straight from PDF 7.7 ("SMS alerts to buyers who have disabled
// push notifications"):
//   · push  — only when the buyer has push enabled AND a device token
//   · sms   — the FALLBACK: fires only when push did not (disabled / no token)
//   · email — opportunistic, when the buyer has an address on record
//
// A push that was accepted OR logged (mock mode) counts as "reached", so the SMS
// fallback does not double-send in dev where every channel merely logs.
// ─────────────────────────────────────────────────────────────────────────────
export interface BuyerRecipient {
  id: string
  phone: string
  email: string | null
  fcmToken: string | null
  pushEnabled: boolean
}

export interface BuyerAlertNotification {
  // Notification.type for the in-app row — defaults to 'alert' so the two
  // pre-Phase-4C call sites (case-update alerts) don't need updating.
  // Phase 4C call sites (verification/payment/cancellation/claim/support)
  // pass their own: 'verification' | 'payment' | 'cancellation' | 'claim' | 'support'.
  type?: string
  title: string
  body: string
  data?: Record<string, string> // FCM data payload (e.g. { listingId })
  email?: { subject: string; html: string; text: string }
  sms?: { templateId?: string; variables?: Record<string, string> }
}

// One buyer-facing event across every channel we can reach — push, SMS
// fallback, opportunistic email, and (Phase 4C) an in-app inbox row. This is
// the ONE buyer notification pathway in the codebase; every Phase 4C
// verification/payment/cancellation/claim/support event reuses it rather
// than a second notify function, same as notifySeller() is the one seller
// pathway.
export async function notifyBuyerAlert(
  user: BuyerRecipient,
  notification: BuyerAlertNotification
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = []

  // In-app — always written, regardless of push/SMS/email outcome, so the
  // buyer's inbox is a complete history even if every other channel is
  // unreachable (no token, no credentials configured, etc.).
  results.push(
    await sendInApp(
      { userId: user.id },
      { type: notification.type ?? 'alert', title: notification.title, body: notification.body }
    )
  )

  // Push — enabled + token dono chahiye
  let pushReached = false
  if (user.pushEnabled && user.fcmToken) {
    const push = await sendPush({
      token: user.fcmToken,
      title: notification.title,
      body: notification.body,
      data: notification.data,
    })
    results.push({
      channel: 'push',
      status: push.status,
      provider: 'fcm',
      id: push.id,
      error: push.error,
    })
    pushReached = push.status === 'sent' || push.status === 'logged'
  }

  // SMS — sirf tab jab push nahi pahuncha (disabled ya token missing/failed)
  if (!pushReached) {
    results.push(
      await sendSms({
        to: user.phone,
        body: notification.body,
        templateId: notification.sms?.templateId,
        variables: notification.sms?.variables,
      })
    )
  }

  // Email — opportunistic
  if (user.email && notification.email) {
    results.push(await sendEmail({ to: user.email, ...notification.email }))
  }

  const summary = results.map((r) => `${r.channel}:${r.status}`).join(' ')
  logger.info(`[notify] buyer ${user.id} "${notification.title}" → ${summary}`)

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPER ADMIN — PLATFORM-OPERATIONS ALERTS ONLY (never a claim notification —
// see resolveVerificationPerformer/notifyVerificationPerformer below for who
// actually gets those). Reserved for things only a Super Admin can act on
// platform-wide, e.g. a payout that failed at the provider. The Notification
// model (above) is buyer/seller only (its XOR CHECK constraint has no
// adminId column at all) — the same "no in-app channel for admins"
// convention every other verification-marketplace notification in this
// codebase already follows. Rather than adding a third recipient type to
// that model, this reuses the existing sendEmail() adapter directly,
// addressed to every active, non-blocked SUPER_ADMIN account — there is
// ordinarily exactly one, per this feature's own "do not modify the real
// Super Admin account" rule, but this fans out correctly if that ever
// changes. Best-effort: a dead/unconfigured email provider must never roll
// back the business action that triggered this (same discipline as
// notifyBuyerAlert/notifySeller above).
//
// Do NOT call this for claim-submitted, buyer-accepted, claim-rejected, or
// claim-window-expired events — those go to the actual verification
// performer only (see below). A Super Admin who did not personally perform
// a verification must not be notified just because a claim exists on it;
// they still see every claim via the existing Claims dashboard.
// ─────────────────────────────────────────────────────────────────────────────
export async function notifySuperAdmins(notification: { subject: string; body: string }): Promise<void> {
  try {
    const superAdmins = await prisma.admin.findMany({
      where: { role: 'SUPER_ADMIN', active: true, blocked: false },
      select: { id: true, email: true },
    })
    if (superAdmins.length === 0) {
      logger.warn('[notify] no active Super Admin account found — skipping admin notification')
      return
    }

    const results = await Promise.all(
      superAdmins.map((admin) =>
        sendEmail({
          to: admin.email,
          subject: notification.subject,
          html: `<p>${notification.body}</p>`,
          text: notification.body,
        })
      )
    )

    const summary = results.map((r) => r.status).join(' ')
    logger.info(`[notify] super admin(s) "${notification.subject}" → ${summary}`)
  } catch (err) {
    logger.error(`[notify] super admin notification failed: ${err instanceof Error ? err.message : err}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION PERFORMER RESOLUTION — the single source of truth for "who
// actually performed/handled this specific verification."
//
// This is deliberately separate from "who is eligible for the Expert 30/70
// payout" (that question is answered only by whether a ProfessionalEarning
// row exists — see ledger.service.ts — which structurally can only ever
// belong to an EXPERT-role Seller). A claim recipient and a payout
// beneficiary are two different questions with two different answers:
//
//   Expert-performed verification:      claim recipient = Expert,  payout beneficiary = Expert
//   Admin-performed verification:       claim recipient = Admin,   payout beneficiary = NONE
//   SuperAdmin-performed verification:  claim recipient = SuperAdmin, payout beneficiary = NONE
//
// Reads the actual assignment (VerificationRequest.assignedSellerId /
// assignedAdminId) — never the current session, never "last active user",
// never a role-wide broadcast.
// ─────────────────────────────────────────────────────────────────────────────
export type VerificationPerformer =
  | {
      type: 'EXPERT'
      // Seller has no fcmToken/pushEnabled column at all (that push-channel
      // pair exists only on User/buyer) — performer.seller is only ever
      // passed to notifySeller(), which needs exactly these four fields, so
      // the select below intentionally matches this type one-to-one.
      seller: { id: string; name: string; phone: string; email: string | null }
    }
  | { type: 'ADMIN' | 'SUPER_ADMIN'; admin: { id: string; name: string; email: string } }
  | { type: 'NONE' }

export async function resolveVerificationPerformer(request: {
  assignedSellerId: string | null
  assignedAdminId: string | null
}): Promise<VerificationPerformer> {
  if (request.assignedSellerId) {
    const seller = await prisma.seller.findUnique({
      where: { id: request.assignedSellerId },
      select: { id: true, name: true, phone: true, email: true },
    })
    if (seller) return { type: 'EXPERT', seller }
  }
  if (request.assignedAdminId) {
    const admin = await prisma.admin.findUnique({
      where: { id: request.assignedAdminId },
      select: { id: true, name: true, email: true, role: true },
    })
    if (admin) return { type: admin.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN', admin }
  }
  return { type: 'NONE' }
}

/** A targeted email to exactly one Admin/SuperAdmin — never a role-wide broadcast. */
async function notifyOneAdmin(admin: { email: string }, notification: { subject: string; body: string }): Promise<void> {
  try {
    await sendEmail({ to: admin.email, subject: notification.subject, html: `<p>${notification.body}</p>`, text: notification.body })
  } catch (err) {
    logger.error(`[notify] admin notification failed: ${err instanceof Error ? err.message : err}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM SUBMITTED — notifies ONLY the actual verification performer, per
// their role. Never every Expert, never every Admin, never every
// SuperAdmin — SuperAdmin sees every claim via the existing Claims
// dashboard regardless, but is not separately alerted unless they
// themselves performed this verification.
// ─────────────────────────────────────────────────────────────────────────────
export async function notifyPerformerOfClaimSubmitted(
  performer: VerificationPerformer,
  context: { verificationRequestId: string; claimId: string }
): Promise<void> {
  if (performer.type === 'EXPERT') {
    await notifySeller(performer.seller, {
      type: 'claim',
      title: 'A claim was raised on your verification',
      body: '⚠️ User has submitted a claim regarding your verification report. An admin will review it.',
    })
  } else if (performer.type === 'ADMIN' || performer.type === 'SUPER_ADMIN') {
    await notifyOneAdmin(performer.admin, {
      subject: 'CivilCheck — Claim submitted',
      body: `⚠️ User has submitted a claim regarding the verification you handled. Verification: ${context.verificationRequestId} · Claim: ${context.claimId}`,
    })
  }
}

/** Claim resolved (rejected, or otherwise) — same "actual performer only" rule. */
export async function notifyPerformerOfClaimResolved(
  performer: VerificationPerformer,
  context: { status: string; resolutionNote: string }
): Promise<void> {
  if (performer.type === 'EXPERT') {
    await notifySeller(performer.seller, {
      type: 'claim',
      title: 'Claim resolved',
      body: `A claim against your verification work was resolved — status: ${context.status}.`,
    })
  } else if (performer.type === 'ADMIN' || performer.type === 'SUPER_ADMIN') {
    await notifyOneAdmin(performer.admin, {
      subject: 'CivilCheck — Claim resolved',
      body: `A claim on a verification you handled was resolved — status: ${context.status}. ${context.resolutionNote}`,
    })
  }
}

/**
 * Payout became eligible (buyer accepted, claim rejected, or the claim
 * window expired) — Expert-only, by construction: an Admin/SuperAdmin
 * performer never has a payout to become eligible, so this is a silent
 * no-op for them rather than a misleading "your payout is eligible" email.
 */
export async function notifyPerformerOfPayoutEligible(
  performer: VerificationPerformer,
  releaseReason: 'BUYER_ACCEPTED' | 'CLAIM_REJECTED' | 'CLAIM_WINDOW_EXPIRED'
): Promise<void> {
  if (performer.type !== 'EXPERT') return

  const body =
    releaseReason === 'BUYER_ACCEPTED'
      ? 'User accepted the verification report. Your 70% Expert payout is now eligible for processing.'
      : releaseReason === 'CLAIM_REJECTED'
        ? 'The claim on your verification was rejected. Your Expert payout is now eligible for processing.'
        : 'The user’s 7-day claim window expired with no claim. Your Expert payout is now eligible for processing.'

  await notifySeller(performer.seller, { type: 'payment', title: 'Expert payout eligible', body })
}
