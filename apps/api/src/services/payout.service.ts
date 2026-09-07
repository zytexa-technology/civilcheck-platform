// ─────────────────────────────────────────────────────────────────────────────
// Professional Payout workflow (Phase 4B).
//
// EARNED → PENDING_SETTLEMENT → AVAILABLE_FOR_PAYOUT  (ledger.service.ts)
//        → PAYOUT_REQUESTED → PROCESSING → PAID        (this file)
//                                        ↘ FAILED → RETRYABLE / MANUAL_REVIEW
//        PAID → REVERSED                               (webhook-driven only)
//
// Payout execution reuses lib/razorpayPayouts.ts (RazorpayX Payouts) — the
// SAME adapter the existing weekly settlement (settlement.service.ts) already
// uses for real bank transfers. Razorpay Route (lib/razorpayRoute.ts) is not
// configured for this account, so it is never selected here; see that file's
// header for exactly what would need to change for it to become an option.
//
// The one deliberate difference from the existing weekly settlement: that
// code trusts RazorpayX's synchronous "processed" response as final (Day 6
// behavior, unchanged by this phase). This NEW payout path does not — a
// successful createPayout() call only ever moves a record to PROCESSING;
// only a webhook-confirmed payout.processed event (webhook.controller.ts)
// moves it to PAID. "Never mark a professional as PAID merely because the
// internal ledger says the amount is payable."
// ─────────────────────────────────────────────────────────────────────────────
import type { ProfessionalPayoutRecord } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { createPayout, RazorpayPayoutError } from '../lib/razorpayPayouts.js'
import { isRouteConfigured } from '../lib/razorpayRoute.js'

export class PayoutError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'PayoutError'
    this.status = status
  }
}

// Operational safety cap, not a financial/business rule — how many automatic
// retries a failed transfer gets before it needs a human. Distinct from the
// brief's "never hardcode business numbers" (which is about money/percentages);
// this is a retry-count constant, kept here rather than in PlatformSetting.
const MAX_PAYOUT_RETRY_ATTEMPTS = 3

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST — a professional (or an admin on their behalf) claims every
// AVAILABLE_FOR_PAYOUT earning into one new payout record. Atomic claim,
// same "first-acceptance-wins" shape as verification.service.ts's quote
// acceptance and reward.service.ts's redeem-request approval: the earnings
// are claimed with a guarded updateMany inside the same transaction that
// creates the record, so two concurrent requests for the same seller can
// never both claim the same earning into two different payout records.
// ─────────────────────────────────────────────────────────────────────────────
export async function requestPayout(sellerId: string): Promise<ProfessionalPayoutRecord> {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } })
  if (!seller || seller.deletedAt) throw new PayoutError('Seller not found', 404)
  if (!seller.bankAccount || !seller.ifsc) {
    throw new PayoutError('Bank account details are required before requesting a payout', 400)
  }
  if (seller.payoutEligibilityStatus !== 'ELIGIBLE') {
    throw new PayoutError(
      `Payout is not currently available for this account (status: ${seller.payoutEligibilityStatus})`,
      403
    )
  }

  return prisma.$transaction(async (tx) => {
    const claimable = await tx.professionalEarning.findMany({
      where: { sellerId, status: 'AVAILABLE_FOR_PAYOUT' },
      select: { id: true, grossEarningPaise: true },
    })
    if (claimable.length === 0) {
      throw new PayoutError('No earnings are currently available for payout', 400)
    }

    const totalAmountPaise = claimable.reduce((sum, e) => sum + e.grossEarningPaise, 0)
    const ids = claimable.map((e) => e.id)

    const record = await tx.professionalPayoutRecord.create({
      data: { sellerId, totalAmountPaise, status: 'PAYOUT_REQUESTED' },
    })

    const claim = await tx.professionalEarning.updateMany({
      where: { id: { in: ids }, status: 'AVAILABLE_FOR_PAYOUT' },
      data: { status: 'PAYOUT_REQUESTED', payoutRecordId: record.id },
    })
    if (claim.count !== ids.length) {
      // Lost a race against a concurrent payout request for the same seller —
      // rolling back the whole transaction is simpler and safer than trying
      // to partially unwind a payout record with a wrong total.
      throw new PayoutError('Available balance changed while requesting payout — please try again', 409)
    }

    logger.info(
      `[payout] request ${record.id} created for seller ${sellerId} — ₹${totalAmountPaise / 100} ` +
        `(${ids.length} earning(s) claimed)`
    )
    return record
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS — Super Admin sends a PAYOUT_REQUESTED/RETRYABLE record to the
// payout provider. Can only ever reach PROCESSING here — PAID is
// webhook-only (see the file header).
// ─────────────────────────────────────────────────────────────────────────────
export async function processPayout(payoutRecordId: string): Promise<ProfessionalPayoutRecord> {
  const record = await prisma.professionalPayoutRecord.findUnique({
    where: { id: payoutRecordId },
    include: { seller: true },
  })
  if (!record) throw new PayoutError('Payout record not found', 404)
  if (record.status !== 'PAYOUT_REQUESTED' && record.status !== 'RETRYABLE') {
    throw new PayoutError(`Only PAYOUT_REQUESTED or RETRYABLE payouts can be processed (current: ${record.status})`, 400)
  }
  if (!record.seller.bankAccount || !record.seller.ifsc) {
    throw new PayoutError('Seller has no bank account on file', 400)
  }

  // Route is not configured for this account (see lib/razorpayRoute.ts) —
  // always RazorpayX Payouts today. isRouteConfigured() is checked so the
  // mechanism recorded on the row reflects reality even after Route is
  // eventually turned on, without this function needing to change.
  const mechanism = isRouteConfigured() ? 'RAZORPAY_ROUTE' : 'RAZORPAYX_PAYOUT'
  if (mechanism === 'RAZORPAY_ROUTE') {
    // Foundation only — see razorpayRoute.ts. Falling through to RazorpayX
    // Payouts would silently use a different mechanism than recorded, so
    // this refuses outright instead.
    throw new PayoutError('Razorpay Route is configured but transfer execution is not yet implemented', 501)
  }

  const referenceId = `payout_${record.id}`.slice(0, 40)

  try {
    const payout = await createPayout({
      amount: record.totalAmountPaise,
      bankAccount: {
        name: record.seller.name,
        accountNumber: record.seller.bankAccount,
        ifsc: record.seller.ifsc,
      },
      referenceId,
      narration: 'CivilCheck verification marketplace payout',
    })

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.professionalPayoutRecord.updateMany({
        where: { id: payoutRecordId, status: { in: ['PAYOUT_REQUESTED', 'RETRYABLE'] } },
        data: {
          status: 'PROCESSING',
          mechanism: 'RAZORPAYX_PAYOUT',
          razorpayPayoutId: payout.id,
          processedAt: new Date(),
        },
      })
      if (claim.count === 0) {
        throw new PayoutError('Payout record changed state before it could be processed', 409)
      }
      await tx.professionalEarning.updateMany({
        where: { payoutRecordId },
        data: { status: 'PROCESSING' },
      })
      return tx.professionalPayoutRecord.findUniqueOrThrow({ where: { id: payoutRecordId } })
    })

    logger.info(`[payout] record ${payoutRecordId} sent to RazorpayX — payout ${payout.id}, awaiting webhook confirmation`)
    return updated
  } catch (err) {
    const message = err instanceof RazorpayPayoutError ? err.message : 'RazorpayX payout call failed'
    logger.error(`[payout] record ${payoutRecordId} FAILED at RazorpayX: ${message}`)

    const nextStatus = record.retryCount + 1 >= MAX_PAYOUT_RETRY_ATTEMPTS ? 'MANUAL_REVIEW' : 'RETRYABLE'
    await prisma.$transaction(async (tx) => {
      await tx.professionalPayoutRecord.update({
        where: { id: payoutRecordId },
        data: { status: nextStatus, failureReason: message, retryCount: { increment: 1 } },
      })
      await tx.professionalEarning.updateMany({
        where: { payoutRecordId },
        data: { status: nextStatus },
      })
    })

    if (err instanceof RazorpayPayoutError) throw new PayoutError(message, err.status)
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK — the only place a payout ever becomes PAID or REVERSED. Called
// from webhook.controller.ts's existing handler (see that file's `switch`),
// not a separate route. Idempotent: only a PROCESSING record's claim
// succeeds, so a duplicate payout.processed delivery is a silent no-op on
// the second delivery (count 0), never a double-credit.
// ─────────────────────────────────────────────────────────────────────────────
export type PayoutWebhookOutcome = 'PAID' | 'FAILED' | 'REVERSED' | 'IGNORED'

export async function handlePayoutWebhookEvent(
  razorpayPayoutId: string,
  eventType: 'payout.processed' | 'payout.failed' | 'payout.rejected' | 'payout.reversed',
  failureReason?: string
): Promise<PayoutWebhookOutcome> {
  const record = await prisma.professionalPayoutRecord.findUnique({ where: { razorpayPayoutId } })
  if (!record) {
    logger.warn(`[payout] webhook ${eventType} for unknown payout ${razorpayPayoutId} — ignored`)
    return 'IGNORED'
  }

  if (eventType === 'payout.processed') {
    const claim = await prisma.professionalPayoutRecord.updateMany({
      where: { id: record.id, status: 'PROCESSING' },
      data: { status: 'PAID', paidAt: new Date() },
    })
    if (claim.count === 0) return 'IGNORED' // already handled by a prior delivery
    await prisma.professionalEarning.updateMany({
      where: { payoutRecordId: record.id },
      data: { status: 'PAID' },
    })
    logger.info(`[payout] record ${record.id} confirmed PAID by webhook (payout ${razorpayPayoutId})`)
    return 'PAID'
  }

  if (eventType === 'payout.failed' || eventType === 'payout.rejected') {
    // Re-fetch retryCount fresh rather than trusting the closed-over `record`
    // — this webhook can race a manual retry.
    const current = await prisma.professionalPayoutRecord.findUniqueOrThrow({ where: { id: record.id } })
    if (current.status !== 'PROCESSING') return 'IGNORED'

    const nextStatus = current.retryCount >= MAX_PAYOUT_RETRY_ATTEMPTS ? 'MANUAL_REVIEW' : 'RETRYABLE'
    const claim = await prisma.$transaction(async (tx) => {
      const result = await tx.professionalPayoutRecord.updateMany({
        where: { id: record.id, status: 'PROCESSING' },
        data: { status: nextStatus, failureReason: failureReason ?? eventType },
      })
      if (result.count > 0) {
        await tx.professionalEarning.updateMany({
          where: { payoutRecordId: record.id },
          data: { status: nextStatus },
        })
      }
      return result
    })
    if (claim.count === 0) return 'IGNORED' // a concurrent delivery already handled this
    logger.warn(`[payout] record ${record.id} FAILED via webhook (${eventType}) → ${nextStatus}`)
    return 'FAILED'
  }

  if (eventType === 'payout.reversed') {
    const claim = await prisma.professionalPayoutRecord.updateMany({
      where: { id: record.id, status: 'PAID' },
      data: { status: 'REVERSED', reversedAt: new Date() },
    })
    if (claim.count === 0) return 'IGNORED'
    await prisma.professionalEarning.updateMany({
      where: { payoutRecordId: record.id },
      data: { status: 'REVERSED', reversalReason: 'Payout reversed by Razorpay' },
    })
    logger.error(`[payout] record ${record.id} REVERSED by webhook — funds returned to the platform`)
    return 'REVERSED'
  }

  return 'IGNORED'
}

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────
export async function listSellerPayouts(sellerId: string) {
  return prisma.professionalPayoutRecord.findMany({
    where: { sellerId },
    orderBy: { requestedAt: 'desc' },
    include: { earnings: { select: { id: true, grossEarningPaise: true, verificationRequestId: true } } },
  })
}
