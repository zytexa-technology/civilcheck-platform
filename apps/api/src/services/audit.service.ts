// ─────────────────────────────────────────────────────────────────────────────
// Audit trail (PDF 5.1) — every admin mutation leaves a row.
//
// Call it as the LAST step of a handler, once the mutation has actually
// succeeded, so the log never claims something that did not happen.
//
// Two modes:
//   recordAudit(req, entry)      → best-effort, outside any transaction
//   recordAudit(req, entry, tx)  → inside an interactive transaction, so the
//                                  action and its audit row commit together
// ─────────────────────────────────────────────────────────────────────────────
import type { Request } from 'express'
import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'

// Every admin-mutating action in the platform. Kept as a const map rather than
// free strings so a typo is a compile error and the admin panel's action
// filter has a fixed vocabulary to offer.
export const AuditAction = {
  // Authentication
  ADMIN_LOGIN: 'ADMIN_LOGIN',
  ADMIN_LOGIN_FAILED: 'ADMIN_LOGIN_FAILED',
  ADMIN_LOGOUT: 'ADMIN_LOGOUT',
  ADMIN_2FA_SETUP: 'ADMIN_2FA_SETUP',
  ADMIN_2FA_ENABLE: 'ADMIN_2FA_ENABLE',
  ADMIN_2FA_DISABLE: 'ADMIN_2FA_DISABLE',
  // SuperAdmin-assisted recovery — clears ANOTHER admin's TOTP enrollment
  // (lost authenticator). Distinct from ADMIN_2FA_DISABLE, which an admin
  // only ever does to their own account.
  ADMIN_2FA_RESET: 'ADMIN_2FA_RESET',

  // Admin management (Super Admin CRUD)
  ADMIN_CREATE: 'ADMIN_CREATE',
  ADMIN_UPDATE: 'ADMIN_UPDATE',
  ADMIN_BLOCK: 'ADMIN_BLOCK',
  ADMIN_UNBLOCK: 'ADMIN_UNBLOCK',
  ADMIN_ACTIVATE: 'ADMIN_ACTIVATE',
  ADMIN_DEACTIVATE: 'ADMIN_DEACTIVATE',
  ADMIN_DELETE: 'ADMIN_DELETE',
  // Firebase phone-OTP login linking (additive — email+password stays
  // primary). An admin must already be authenticated to link their own
  // firebaseUid; there is no cold-start admin phone login.
  ADMIN_FIREBASE_LINK: 'ADMIN_FIREBASE_LINK',

  // Seller KYC (PDF 5.2)
  SELLER_APPROVE: 'SELLER_APPROVE',
  SELLER_REJECT: 'SELLER_REJECT',
  SELLER_SUSPEND: 'SELLER_SUSPEND',
  SELLER_UNSUSPEND: 'SELLER_UNSUSPEND',
  SELLER_BADGE_UPDATE: 'SELLER_BADGE_UPDATE',

  // Identity document verification (manual review — replaces DigiLocker)
  SELLER_IDENTITY_DOCUMENT_APPROVE: 'SELLER_IDENTITY_DOCUMENT_APPROVE',
  SELLER_IDENTITY_DOCUMENT_REJECT: 'SELLER_IDENTITY_DOCUMENT_REJECT',

  // Listings (PDF 5.3)
  LISTING_APPROVE: 'LISTING_APPROVE',
  LISTING_REJECT: 'LISTING_REJECT',
  LISTING_SPOT_CHECK: 'LISTING_SPOT_CHECK',

  // Owner properties — self-verification, separate from Listings. Reporter
  // no longer creates Property rows (see ReporterPost audit actions below).
  PROPERTY_APPROVE: 'PROPERTY_APPROVE',
  PROPERTY_REJECT: 'PROPERTY_REJECT',
  PROPERTY_SUSPEND: 'PROPERTY_SUSPEND',
  PROPERTY_UNSUSPEND: 'PROPERTY_UNSUSPEND',

  // Partner account management (Phase 4A) — Seller cannot be hard-deleted
  // (see schema.prisma's Seller.deletedAt comment); this is the soft-delete
  // audit trail entry.
  PARTNER_DELETE: 'PARTNER_DELETE',

  // SuperAdmin-only destructive content/account removal — soft delete, same
  // reasoning as PARTNER_DELETE. Never reachable by normal Admin/SUB_ADMIN/
  // VIEWER (route-gated superOnly, see admin.routes.ts).
  SUPER_ADMIN_DELETE_BUYER: 'SUPER_ADMIN_DELETE_BUYER',
  SUPER_ADMIN_DELETE_LISTING: 'SUPER_ADMIN_DELETE_LISTING',
  SUPER_ADMIN_DELETE_PROPERTY: 'SUPER_ADMIN_DELETE_PROPERTY',
  // ReporterPost has no admin-approval step at all (see schema.prisma) — the
  // only admin-side action against it is this one, SuperAdmin-only removal.
  SUPER_ADMIN_DELETE_REPORTER_POST: 'SUPER_ADMIN_DELETE_REPORTER_POST',

  // Reporter Reward Ledger (Phase 4A)
  REWARD_TRANSACTION_APPROVE: 'REWARD_TRANSACTION_APPROVE',
  REWARD_TRANSACTION_REJECT: 'REWARD_TRANSACTION_REJECT',
  REWARD_ADJUSTMENT_CREATE: 'REWARD_ADJUSTMENT_CREATE',
  REWARD_SETTINGS_UPDATE: 'REWARD_SETTINGS_UPDATE',
  REDEEM_REQUEST_APPROVE: 'REDEEM_REQUEST_APPROVE',
  REDEEM_REQUEST_REJECT: 'REDEEM_REQUEST_REJECT',

  // False Information Penalty System (PDF 10.4) — fired when a spot-check
  // FAIL crosses the 3-strike threshold, alongside LISTING_SPOT_CHECK.
  SELLER_STRIKE_ESCALATION: 'SELLER_STRIKE_ESCALATION',

  // Buyer report-outdated flags (PDF 7.8)
  REPORT_FLAG_RESOLVE: 'REPORT_FLAG_RESOLVE',
  REPORT_FLAG_DISMISS: 'REPORT_FLAG_DISMISS',

  // Refunds (PDF 5.5)
  REFUND_CREATE: 'REFUND_CREATE',
  REFUND_PROCESS: 'REFUND_PROCESS',
  REFUND_REJECT: 'REFUND_REJECT',

  // Special requests (PDF 7.9)
  SPECIAL_REQUEST_ASSIGN: 'SPECIAL_REQUEST_ASSIGN',
  SPECIAL_REQUEST_APPROVE: 'SPECIAL_REQUEST_APPROVE',
  SPECIAL_REQUEST_REJECT: 'SPECIAL_REQUEST_REJECT',
  // Fired alongside SPECIAL_REQUEST_APPROVE when the seller's 70% commission
  // ledger row is created (PDF 6.2).
  SPECIAL_REQUEST_PAYOUT_CREATED: 'SPECIAL_REQUEST_PAYOUT_CREATED',

  // Content control (PDF 5.4)
  CATEGORY_CREATE: 'CATEGORY_CREATE',
  CATEGORY_UPDATE: 'CATEGORY_UPDATE',
  CATEGORY_DELETE: 'CATEGORY_DELETE',
  SERVICE_AREA_CREATE: 'SERVICE_AREA_CREATE',
  SERVICE_AREA_UPDATE: 'SERVICE_AREA_UPDATE',
  SERVICE_AREA_DELETE: 'SERVICE_AREA_DELETE',
  DISCLAIMER_UPDATE: 'DISCLAIMER_UPDATE',
  BANNER_CREATE: 'BANNER_CREATE',
  BANNER_UPDATE: 'BANNER_UPDATE',
  BANNER_DELETE: 'BANNER_DELETE',

  // Verification Marketplace (Phase 3) — only actions an Admin actually
  // performs are audited here (matches this table's existing scope). An
  // Expert quoting/accepting/submitting a report is not an admin mutation,
  // same reasoning as Seller actions elsewhere never being audit-logged.
  VERIFICATION_QUOTE_SUBMIT_ADMIN: 'VERIFICATION_QUOTE_SUBMIT_ADMIN',
  VERIFICATION_QUOTE_ACCEPT_ADMIN: 'VERIFICATION_QUOTE_ACCEPT_ADMIN',
  VERIFICATION_REQUEST_FORCE_CANCEL: 'VERIFICATION_REQUEST_FORCE_CANCEL',
  CLAIM_RESOLVE: 'CLAIM_RESOLVE',
  PLATFORM_SETTINGS_UPDATE: 'PLATFORM_SETTINGS_UPDATE',

  // Financial Ledger + Professional Payouts (Phase 4B) — every privileged
  // financial action, SUPER_ADMIN only, gets its own audit row.
  PAYOUT_PROCESS: 'PAYOUT_PROCESS',
  PAYOUT_RETRY: 'PAYOUT_RETRY',
  PAYOUT_MANUAL_REVIEW_RESOLVE: 'PAYOUT_MANUAL_REVIEW_RESOLVE',
  PAYOUT_ELIGIBILITY_UPDATE: 'PAYOUT_ELIGIBILITY_UPDATE',
  RECONCILIATION_SWEEP_RUN: 'RECONCILIATION_SWEEP_RUN',
  RECONCILIATION_ISSUE_RESOLVE: 'RECONCILIATION_ISSUE_RESOLVE',

  // AI / Human Customer Support (Phase 4C)
  SUPPORT_TICKET_ASSIGN: 'SUPPORT_TICKET_ASSIGN',
  SUPPORT_TICKET_REPLY: 'SUPPORT_TICKET_REPLY',
  SUPPORT_TICKET_RESOLVE: 'SUPPORT_TICKET_RESOLVE',
  SUPPORT_TICKET_REOPEN: 'SUPPORT_TICKET_REOPEN',
  SUPPORT_TICKET_RETURN_TO_AI: 'SUPPORT_TICKET_RETURN_TO_AI',
  SUPPORT_TICKET_PRIORITY_UPDATE: 'SUPPORT_TICKET_PRIORITY_UPDATE',
  SUPPORT_KNOWLEDGE_UPDATE: 'SUPPORT_KNOWLEDGE_UPDATE',
} as const
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

export interface AuditEntry {
  action: AuditAction
  // What was acted on — "Seller:0192…" / "Banner:0193…". Free-form on purpose:
  // audit rows must stay readable after the referenced row is gone.
  target?: string | null
  details?: string | null
}

// Prisma's transaction client and the base client share the model methods we
// need, so one signature covers both call styles.
type AuditClient = Pick<typeof prisma, 'auditLog'> | Prisma.TransactionClient

// X-Forwarded-For is a comma-separated chain (client, proxy1, proxy2…) — the
// left-most entry is the original client.
//
// NOTE: this header is trivially spoofable unless Express is told which
// proxies to trust (`app.set('trust proxy', …)`). Treat the value as an
// investigative hint, not as proof of origin.
export function clientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded

  if (raw) {
    const first = raw.split(',')[0]?.trim()
    if (first) return first
  }

  return req.socket.remoteAddress ?? null
}

export async function recordAudit(
  req: Request,
  entry: AuditEntry,
  client: AuditClient = prisma
): Promise<void> {
  const adminId = req.admin?.id

  if (!adminId) {
    // Reachable only from a route that skipped adminMiddleware — a wiring bug.
    // Losing the row is bad, but inventing an actor would be worse.
    logger.error(`[audit] ${entry.action} had no authenticated admin — row not written`)
    return
  }

  const data = {
    adminId,
    action: entry.action,
    target: entry.target ?? null,
    details: entry.details ?? null,
    ipAddress: clientIp(req),
  }

  // Inside a transaction the caller owns failure handling: if the audit write
  // fails the whole action must roll back, so let it throw.
  if (client !== prisma) {
    await client.auditLog.create({ data })
    return
  }

  try {
    await client.auditLog.create({ data })
  } catch (err) {
    // Best-effort outside a transaction: the mutation already committed, so
    // throwing here would report failure for work that actually succeeded.
    logger.error(
      `[audit] failed to record ${entry.action} by admin ${adminId}: ` +
        `${err instanceof Error ? err.message : String(err)}`
    )
  }
}
