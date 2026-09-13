// ─────────────────────────────────────────────────────────────────────────────
// 7-Day Verification Acceptance, Claim & Professional Settlement System.
//
// Extends the Verification Marketplace (Phase 3) and its Financial Ledger +
// Professional Payouts (Phase 4B) — does not replace either. Phase 4B's
// ledger.service.ts already tracks a professional's earning through
// EARNED → PENDING_SETTLEMENT → AVAILABLE_FOR_PAYOUT → PAYOUT_REQUESTED →
// PROCESSING → PAID; this file is what decides WHEN PENDING_SETTLEMENT is
// allowed to become AVAILABLE_FOR_PAYOUT, instead of that happening the
// instant the report unlocks (the old behavior — see
// ledger.service.ts's promoteEarningsOnUnlock, modified alongside this file).
//
// Three things can race for the same VerificationRequest at almost the same
// moment: the buyer accepting, the buyer raising a claim, and the hourly
// expiry sweep. Every entry point below starts by taking a row-level lock
// (`SELECT ... FOR UPDATE`) on that one VerificationRequest row inside its
// own transaction — Postgres then simply blocks the second concurrent
// caller until the first commits, at which point the second re-reads the
// now-updated row under its own lock and correctly refuses (already
// ACCEPTED / already has a claim / deadline already passed). Exactly one
// transition can ever win; the other two see a state that no longer
// qualifies and throw a clear, typed error instead of silently corrupting
// anything.
// ─────────────────────────────────────────────────────────────────────────────
import type { Prisma, ProfessionalEarningStatus, VerificationRequest, PayoutReleaseReason } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'

export class SettlementError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SettlementError'
    this.status = status
  }
}

const EARNING_STATUSES_HELD: ProfessionalEarningStatus[] = ['EARNED', 'PENDING_SETTLEMENT']

/** Row-level lock — see file header. Must only ever be called inside a `tx`. */
async function lockRequestForUpdate(
  tx: Prisma.TransactionClient,
  requestId: string
): Promise<VerificationRequest> {
  const rows = await tx.$queryRaw<VerificationRequest[]>`
    SELECT * FROM "VerificationRequest" WHERE id = ${requestId} FOR UPDATE
  `
  const request = rows[0]
  if (!request) throw new SettlementError('Verification request not found', 404)
  return request
}

async function hasActiveClaim(tx: Prisma.TransactionClient, requestId: string): Promise<boolean> {
  const active = await tx.claim.findFirst({
    where: { verificationRequestId: requestId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
    select: { id: true },
  })
  return active !== null
}

/**
 * Release every held (EARNED/PENDING_SETTLEMENT) — and, for a rejected
 * claim, FROZEN — earning on a request to AVAILABLE_FOR_PAYOUT. Called from
 * inside the caller's own transaction/lock; never opens its own.
 */
async function releaseEarnings(
  tx: Prisma.TransactionClient,
  requestId: string,
  reason: PayoutReleaseReason,
  fromStatuses: ProfessionalEarningStatus[]
): Promise<number> {
  const now = new Date()
  const { count } = await tx.professionalEarning.updateMany({
    where: { verificationRequestId: requestId, status: { in: fromStatuses } },
    data: { status: 'AVAILABLE_FOR_PAYOUT', releaseReason: reason, payoutEligibleAt: now },
  })
  return count
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPT — buyer confirms they reviewed the report and have no claim. Backend
// validates every precondition itself (never trusts that the frontend only
// showed the button when it should have).
// ─────────────────────────────────────────────────────────────────────────────
export async function acceptReport(requestId: string, userId: string): Promise<VerificationRequest> {
  return prisma.$transaction(async (tx) => {
    const request = await lockRequestForUpdate(tx, requestId)

    if (request.userId !== userId) {
      // 404, not 403 — never confirm another buyer's verification even exists.
      throw new SettlementError('Verification request not found', 404)
    }
    if (request.status !== 'REPORT_UNLOCKED') {
      throw new SettlementError('This report has not been delivered yet', 400)
    }
    if (request.buyerAcceptanceStatus === 'ACCEPTED') {
      throw new SettlementError('You have already accepted this verification report', 409)
    }
    if (request.claimDeadline && new Date() > request.claimDeadline) {
      throw new SettlementError(
        'Your 7-day review window has ended — the payout is already being processed automatically',
        409
      )
    }
    if (await hasActiveClaim(tx, requestId)) {
      throw new SettlementError('You have an active claim on this request — withdraw it before accepting', 409)
    }

    const now = new Date()
    const updated = await tx.verificationRequest.update({
      where: { id: requestId },
      data: { buyerAcceptanceStatus: 'ACCEPTED', buyerAcceptedAt: now },
    })

    const released = await releaseEarnings(tx, requestId, 'BUYER_ACCEPTED', EARNING_STATUSES_HELD)
    if (released > 0) {
      logger.info(`[settlement] request ${requestId} accepted by buyer — ${released} earning(s) now AVAILABLE_FOR_PAYOUT`)
    }

    return updated
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM — freezes payout the instant a claim is created. Deadline is
// enforced here, server-side, from the stored claimDeadline — never a
// client-supplied or recomputed value, and impossible to bypass by device
// time, a stale screen, or a direct API call.
// ─────────────────────────────────────────────────────────────────────────────
export interface CreateClaimInput {
  reason: string
  description: string
  evidence: string[]
}

export async function createClaimWithFreeze(
  requestId: string,
  userId: string,
  input: CreateClaimInput
) {
  return prisma.$transaction(async (tx) => {
    const request = await lockRequestForUpdate(tx, requestId)

    if (request.userId !== userId) {
      throw new SettlementError('Verification request not found', 404)
    }
    if (request.status !== 'REPORT_UNLOCKED') {
      throw new SettlementError('A claim can only be raised after the report has been delivered', 400)
    }
    if (!request.claimDeadline || new Date() > request.claimDeadline) {
      throw new SettlementError('Your 7-day claim window has expired.', 409)
    }
    if (request.buyerAcceptanceStatus === 'ACCEPTED') {
      throw new SettlementError('You have already accepted this verification report', 409)
    }
    if (await hasActiveClaim(tx, requestId)) {
      throw new SettlementError('An active claim already exists for this request', 409)
    }

    const claim = await tx.claim.create({
      data: {
        verificationRequestId: requestId,
        userId,
        reason: input.reason,
        description: input.description,
        evidence: input.evidence,
      },
    })

    const { count } = await tx.professionalEarning.updateMany({
      where: { verificationRequestId: requestId, status: { in: EARNING_STATUSES_HELD } },
      data: { status: 'FROZEN' },
    })
    if (count > 0) {
      logger.info(`[settlement] request ${requestId} claim ${claim.id} opened — ${count} earning(s) FROZEN`)
    }

    return claim
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVE — called from admin.controller.ts's resolveClaim after the Claim
// row's own status update, inside the SAME transaction (pass its `tx`
// through, do not open a second one). REJECTED releases the freeze;
// REFUND_APPROVED/RESOLVED/PARTIALLY_RESOLVED-equivalent outcomes are left
// FROZEN for the existing refund pipeline to resolve on its own timeline —
// recordReversalForRefund (ledger.service.ts) is what actually reverses a
// FROZEN earning once a refund is PROCESSED.
// ─────────────────────────────────────────────────────────────────────────────
export async function releaseEarningsOnClaimRejected(
  tx: Prisma.TransactionClient,
  requestId: string
): Promise<number> {
  return releaseEarnings(tx, requestId, 'CLAIM_REJECTED', ['FROZEN'])
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPIRY SWEEP — see verificationExpiry.service.ts for the scheduled caller.
// One row, one lock, one transaction per request — never a single giant
// transaction across every expired request, so a slow run never holds many
// locks at once and a failure on one row can never roll back another.
// ─────────────────────────────────────────────────────────────────────────────
export async function expireClaimWindowIfEligible(requestId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const request = await lockRequestForUpdate(tx, requestId)

    if (
      request.status !== 'REPORT_UNLOCKED' ||
      !request.claimDeadline ||
      request.claimDeadline > new Date() ||
      request.buyerAcceptanceStatus !== 'PENDING'
    ) {
      return false // no longer eligible — another transition already won, or not due yet
    }
    if (await hasActiveClaim(tx, requestId)) {
      return false // an open/under-review claim blocks automatic expiry release
    }

    const released = await releaseEarnings(tx, requestId, 'CLAIM_WINDOW_EXPIRED', EARNING_STATUSES_HELD)
    if (released === 0) {
      // Nothing was actually held (e.g. no professional ever earned on this
      // request) — still a legitimate, terminal outcome, not an error.
      return false
    }

    logger.info(`[settlement] request ${requestId} claim window expired — ${released} earning(s) now AVAILABLE_FOR_PAYOUT`)
    return true
  })
}
