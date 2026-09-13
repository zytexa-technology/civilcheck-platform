// ─────────────────────────────────────────────────────────────────────────────
// 7-Day claim-window expiry sweep. Reuses the existing in-process interval
// scheduler (lib/scheduler.ts) — the same mechanism settlement.service.ts /
// specialRequestSla.service.ts already run on, not a new cron dependency.
//
// Runs hourly. Finds candidate requests with an indexed query
// (VerificationRequest_buyerAcceptanceStatus_claimDeadline_idx), then hands
// each one to verificationSettlement.service.ts's expireClaimWindowIfEligible,
// which takes its own row lock and re-validates every precondition before
// touching anything — so this sweep never needs its own locking, and a
// request that a buyer accepted (or claimed) one second before the sweep
// reached it is simply skipped, not raced.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { resolveVerificationPerformer, notifyPerformerOfPayoutEligible } from './notification.service.js'
import { expireClaimWindowIfEligible } from './verificationSettlement.service.js'

// Caps how many candidate requests one sweep processes — an unbounded scan
// under real volume would hold the sweep (and the DB) far longer than an
// hourly job should. Any remainder is simply picked up by next hour's run;
// nothing here is lost, only deferred by up to another sweep interval.
const BATCH_SIZE = 200

export async function runVerificationExpirySweep(): Promise<{ scanned: number; released: number }> {
  const now = new Date()

  const candidates = await prisma.verificationRequest.findMany({
    where: {
      status: 'REPORT_UNLOCKED',
      buyerAcceptanceStatus: 'PENDING',
      claimDeadline: { lte: now },
      // Only requests that still have something actually held — already-
      // processed requests (earnings now AVAILABLE_FOR_PAYOUT/FROZEN/etc.)
      // are excluded here so this sweep never re-selects the same finished
      // row on every future run.
      professionalEarnings: { some: { status: { in: ['EARNED', 'PENDING_SETTLEMENT'] } } },
      claims: { none: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } },
    },
    // A ProfessionalEarning can only exist for an Expert-role Seller (see
    // ledger.service.ts) — every candidate this query matches is therefore
    // already guaranteed Expert-performed. assignedSellerId/assignedAdminId
    // are selected only so notifyPerformerOfPayoutEligible can be reused
    // as-is (it is a no-op for a non-Expert performer by construction, so
    // this stays correct even if that structural guarantee were ever
    // loosened later).
    select: { id: true, assignedSellerId: true, assignedAdminId: true },
    take: BATCH_SIZE,
  })

  let released = 0
  for (const candidate of candidates) {
    try {
      if (await expireClaimWindowIfEligible(candidate.id)) {
        released += 1
        const performer = await resolveVerificationPerformer(candidate)
        void notifyPerformerOfPayoutEligible(performer, 'CLAIM_WINDOW_EXPIRED')
      }
    } catch (err) {
      logger.error(`[verification-expiry] failed processing request ${candidate.id}: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (candidates.length > 0) {
    logger.info(`[verification-expiry] sweep scanned ${candidates.length}, released ${released}`)
  }
  return { scanned: candidates.length, released }
}
