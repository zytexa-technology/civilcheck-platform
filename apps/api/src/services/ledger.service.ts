// ─────────────────────────────────────────────────────────────────────────────
// Financial Ledger (Phase 4B) — the append-only record of every rupee moved
// by the Verification Marketplace (Phase 3). Nothing here replaces
// PaymentOrder/Purchase/Refund — those stay the authoritative "did money
// move" record exactly as Phases 1-3 left them. This is the additional,
// immutable layer that answers "what happened to it, and can it be proven."
//
// Every function here is called from INSIDE an existing transaction in
// payment.service.ts / refund.service.ts / verification.service.ts — never
// opens its own. That keeps "the payment state flipped" and "the ledger
// recorded it" atomic with each other, the same discipline this codebase
// already applies everywhere else (see payment.service.ts's atomic claims).
//
// Money: integer paise throughout. Every paise figure here is
// Math.round(rupees * 100) from an existing frozen Float field — never an
// independent recomputation — so the ledger can never disagree with the
// payment state machine about what was actually charged.
// ─────────────────────────────────────────────────────────────────────────────
import type { Prisma, PaymentOrder, Refund, VerificationRequest } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPTURE — a VERIFICATION_ADVANCE or VERIFICATION_FINAL PaymentOrder just
// flipped CREATED → PAID. Records GROSS_PAYMENT + PLATFORM_COMMISSION +
// PROFESSIONAL_EARNING (+ PROCESSING_FEE, when the webhook reported one),
// and creates the ProfessionalEarning tracker row that will walk through the
// payout state machine.
//
// Idempotency: every entry's key is derived from paymentOrder.id, and
// ProfessionalEarning.paymentOrderId is itself unique — a webhook replay
// calling this twice throws on the second attempt's unique constraints
// rather than double-recording. Callers only reach this function from
// inside the SAME atomic CREATED→PAID claim that already guards against
// replay (see payment.service.ts), so in practice it only ever runs once
// per payment; the DB constraints are the belt-and-braces backstop.
// ─────────────────────────────────────────────────────────────────────────────
export interface CaptureLedgerInput {
  paymentOrder: PaymentOrder
  verificationRequest: VerificationRequest
  processingFeePaise?: number | null // from the Razorpay webhook payload, when present
}

export async function recordCaptureLedgerEntries(
  tx: Prisma.TransactionClient,
  input: CaptureLedgerInput
): Promise<void> {
  const { paymentOrder, verificationRequest, processingFeePaise } = input

  const commissionRate = verificationRequest.platformCommissionRate
  if (commissionRate == null) {
    logger.error(
      `[ledger] payment order ${paymentOrder.id} has no frozen commission rate on request ${verificationRequest.id} — skipping ledger entries`
    )
    return
  }

  const grossPaise = paymentOrder.amount // already integer paise — the authoritative charged amount
  const platformPaise = toPaise(paymentOrder.platformCut)
  const earningPaise = toPaise(paymentOrder.sellerCut)

  const grossEntry = await tx.financialLedgerEntry.create({
    data: {
      verificationRequestId: verificationRequest.id,
      paymentOrderId: paymentOrder.id,
      userId: paymentOrder.userId,
      type: 'GROSS_PAYMENT',
      amountPaise: grossPaise,
      status: 'RECORDED',
      commissionRateSnapshot: commissionRate,
      idempotencyKey: `${paymentOrder.id}:GROSS_PAYMENT`,
    },
  })

  const commissionEntry = await tx.financialLedgerEntry.create({
    data: {
      verificationRequestId: verificationRequest.id,
      paymentOrderId: paymentOrder.id,
      type: 'PLATFORM_COMMISSION',
      amountPaise: platformPaise,
      status: 'RECORDED',
      commissionRateSnapshot: commissionRate,
      idempotencyKey: `${paymentOrder.id}:PLATFORM_COMMISSION`,
    },
  })

  const earningEntry = await tx.financialLedgerEntry.create({
    data: {
      verificationRequestId: verificationRequest.id,
      paymentOrderId: paymentOrder.id,
      sellerId: paymentOrder.sellerId,
      type: 'PROFESSIONAL_EARNING',
      amountPaise: earningPaise,
      status: 'RECORDED',
      commissionRateSnapshot: commissionRate,
      idempotencyKey: `${paymentOrder.id}:PROFESSIONAL_EARNING`,
    },
  })

  if (processingFeePaise != null && processingFeePaise > 0) {
    await tx.financialLedgerEntry.create({
      data: {
        verificationRequestId: verificationRequest.id,
        paymentOrderId: paymentOrder.id,
        type: 'PROCESSING_FEE',
        amountPaise: processingFeePaise,
        status: 'RECORDED',
        idempotencyKey: `${paymentOrder.id}:PROCESSING_FEE`,
      },
    })
  }

  if (paymentOrder.sellerId) {
    await tx.professionalEarning.create({
      data: {
        sellerId: paymentOrder.sellerId,
        verificationRequestId: verificationRequest.id,
        paymentOrderId: paymentOrder.id,
        ledgerEntryId: earningEntry.id,
        grossEarningPaise: earningPaise,
        status: 'EARNED',
      },
    })
  }

  logger.info(
    `[ledger] recorded capture for order ${paymentOrder.id} — gross ₹${grossPaise / 100}, ` +
      `commission ₹${platformPaise / 100}, earning ₹${earningPaise / 100} (entries ${grossEntry.id}/${commissionEntry.id}/${earningEntry.id})`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMOTE — once a request reaches REPORT_UNLOCKED (both legs captured, work
// delivered), every EARNED/PENDING_SETTLEMENT earning tied to it becomes
// AVAILABLE_FOR_PAYOUT. A Claim can only be raised AFTER the report is
// unlocked (see Claim's own model comment), so there is structurally no open
// claim to check for at the moment this runs.
// ─────────────────────────────────────────────────────────────────────────────
export async function promoteEarningsOnUnlock(
  tx: Prisma.TransactionClient,
  verificationRequestId: string
): Promise<void> {
  const { count } = await tx.professionalEarning.updateMany({
    where: { verificationRequestId, status: { in: ['EARNED', 'PENDING_SETTLEMENT'] } },
    data: { status: 'AVAILABLE_FOR_PAYOUT' },
  })
  if (count > 0) {
    logger.info(`[ledger] ${count} earning(s) for request ${verificationRequestId} now AVAILABLE_FOR_PAYOUT`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCELLATION — the platform retains VerificationRequest.cancellationFee
// (already computed by verification.service.ts's executeCancellation).
// Split it by the SAME frozen commission rate the request's payments used —
// the least-hardcoded, most-consistent choice available, since the brief
// does not specify a different cancellation-fee split rule. Called from
// inside executeCancellation's own transaction.
// ─────────────────────────────────────────────────────────────────────────────
export async function recordCancellationLedgerEntries(
  tx: Prisma.TransactionClient,
  request: VerificationRequest,
  cancellationFeeRupees: number
): Promise<void> {
  if (cancellationFeeRupees <= 0) return
  const commissionRate = request.platformCommissionRate ?? 0
  const feePaise = toPaise(cancellationFeeRupees)
  const platformSharePaise = Math.round(feePaise * commissionRate)
  const professionalSharePaise = feePaise - platformSharePaise

  await tx.financialLedgerEntry.create({
    data: {
      verificationRequestId: request.id,
      type: 'CANCELLATION_FEE',
      amountPaise: platformSharePaise,
      commissionRateSnapshot: commissionRate,
      notes: 'Platform share of the cancellation fee',
      idempotencyKey: `${request.id}:CANCELLATION_FEE:PLATFORM`,
    },
  })

  if (professionalSharePaise > 0 && request.assignedSellerId) {
    await tx.financialLedgerEntry.create({
      data: {
        verificationRequestId: request.id,
        sellerId: request.assignedSellerId,
        type: 'CANCELLATION_FEE',
        amountPaise: professionalSharePaise,
        commissionRateSnapshot: commissionRate,
        notes: 'Professional share of the cancellation fee',
        idempotencyKey: `${request.id}:CANCELLATION_FEE:PROFESSIONAL`,
      },
    })
  }

  logger.info(
    `[ledger] request ${request.id} cancellation fee ₹${cancellationFeeRupees} — ` +
      `platform ₹${platformSharePaise / 100}, professional ₹${professionalSharePaise / 100}`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// REFUND PROCESSED — reverses the oldest unreversed GROSS_PAYMENT entries for
// this refund's verification request, up to refund.amount. In practice this
// codebase only ever produces a verification-marketplace Refund for the
// advance payment (cancellation is only reachable before the final payment
// captures — see verification.service.ts's CANCELLABLE_STATUSES), so this
// almost always reverses exactly one entry; the loop exists for the general
// case (e.g. a manual admin refund on a fully-paid request) without assuming
// it away.
//
// A PAID payout is never silently clawed back — if the ProfessionalEarning
// behind an entry has already reached PAID, the reversal entries are written
// as REQUIRES_RECONCILIATION instead of RECORDED, and a ReconciliationIssue
// is opened for a Super Admin to resolve by hand. Nothing here ever deletes
// or edits the original entries.
// ─────────────────────────────────────────────────────────────────────────────
export async function recordReversalForRefund(
  tx: Prisma.TransactionClient,
  refund: Refund
): Promise<void> {
  if (!refund.verificationRequestId) return // not a verification-marketplace refund

  const refundPaise = toPaise(refund.amount)
  let remaining = refundPaise

  const grossEntries = await tx.financialLedgerEntry.findMany({
    where: { verificationRequestId: refund.verificationRequestId, type: 'GROSS_PAYMENT', status: 'RECORDED' },
    orderBy: { createdAt: 'asc' },
  })

  for (const grossEntry of grossEntries) {
    if (remaining <= 0) break
    if (!grossEntry.paymentOrderId) continue

    const reverseAmount = Math.min(remaining, grossEntry.amountPaise)
    const fraction = reverseAmount / grossEntry.amountPaise

    const [commissionEntry, earningEntry] = await Promise.all([
      tx.financialLedgerEntry.findFirst({
        where: { paymentOrderId: grossEntry.paymentOrderId, type: 'PLATFORM_COMMISSION', status: 'RECORDED' },
      }),
      tx.financialLedgerEntry.findFirst({
        where: { paymentOrderId: grossEntry.paymentOrderId, type: 'PROFESSIONAL_EARNING', status: 'RECORDED' },
      }),
    ])

    const earning = earningEntry
      ? await tx.professionalEarning.findUnique({ where: { ledgerEntryId: earningEntry.id } })
      : null
    const alreadyPaid = earning?.status === 'PAID'

    if (commissionEntry) {
      const reverseCommissionPaise = Math.round(commissionEntry.amountPaise * fraction)
      await tx.financialLedgerEntry.create({
        data: {
          verificationRequestId: refund.verificationRequestId,
          paymentOrderId: grossEntry.paymentOrderId,
          refundId: refund.id,
          type: 'REVERSAL_COMMISSION',
          amountPaise: reverseCommissionPaise,
          status: alreadyPaid ? 'REQUIRES_RECONCILIATION' : 'RECORDED',
          reversesEntryId: commissionEntry.id,
          idempotencyKey: `${refund.id}:REVERSAL_COMMISSION:${commissionEntry.id}`,
        },
      })
    }

    if (earningEntry) {
      const reverseEarningPaise = Math.round(earningEntry.amountPaise * fraction)
      await tx.financialLedgerEntry.create({
        data: {
          verificationRequestId: refund.verificationRequestId,
          paymentOrderId: grossEntry.paymentOrderId,
          refundId: refund.id,
          sellerId: earningEntry.sellerId,
          type: 'REVERSAL_EARNING',
          amountPaise: reverseEarningPaise,
          status: alreadyPaid ? 'REQUIRES_RECONCILIATION' : 'RECORDED',
          reversesEntryId: earningEntry.id,
          idempotencyKey: `${refund.id}:REVERSAL_EARNING:${earningEntry.id}`,
        },
      })

      if (earning) {
        if (alreadyPaid) {
          await tx.reconciliationIssue.create({
            data: {
              type: 'REFUND_MISMATCH',
              reference: `ProfessionalEarning:${earning.id}`,
              details:
                `Refund ${refund.id} (₹${refund.amount}) reverses a payment whose professional earning ` +
                `(₹${earning.grossEarningPaise / 100}) was already PAID out. Requires manual recovery — ` +
                `the earning was NOT automatically adjusted.`,
            },
          })
          logger.error(
            `[ledger] refund ${refund.id} reverses an ALREADY-PAID earning ${earning.id} — ` +
              `flagged for manual reconciliation, no automatic clawback`
          )
        } else if (
          ['EARNED', 'PENDING_SETTLEMENT', 'AVAILABLE_FOR_PAYOUT', 'FAILED', 'RETRYABLE'].includes(earning.status)
        ) {
          await tx.professionalEarning.update({
            where: { id: earning.id },
            data: { status: 'REVERSED', reversalReason: `Refund ${refund.id}: ${refund.reason}` },
          })
        }
        // PAYOUT_REQUESTED/PROCESSING: a payout is actively in flight for
        // this earning — also left untouched rather than raced with the
        // payout pipeline; the REQUIRES_RECONCILIATION-equivalent path
        // above only fires for PAID, so this is caught by the same
        // "leave it, flag it" branch structure below for completeness.
        else if (['PAYOUT_REQUESTED', 'PROCESSING'].includes(earning.status)) {
          await tx.reconciliationIssue.create({
            data: {
              type: 'REFUND_MISMATCH',
              reference: `ProfessionalEarning:${earning.id}`,
              details:
                `Refund ${refund.id} reverses a payment whose professional earning is mid-payout ` +
                `(status ${earning.status}). Requires manual coordination with the payout — not automatically reversed.`,
            },
          })
        }
      }
    }

    if (reverseAmount === grossEntry.amountPaise) {
      await tx.financialLedgerEntry.update({ where: { id: grossEntry.id }, data: { status: 'REVERSED' } })
    }
    remaining -= reverseAmount
  }

  await tx.financialLedgerEntry.create({
    data: {
      verificationRequestId: refund.verificationRequestId,
      refundId: refund.id,
      userId: refund.userId,
      type: 'REFUND',
      amountPaise: refundPaise,
      idempotencyKey: `${refund.id}:REFUND`,
    },
  })

  if (remaining > 0) {
    // The refund amount exceeded every unreversed GROSS_PAYMENT entry for
    // this request — should not happen in normal operation (refund.amount is
    // always derived from what was actually captured), but flag it rather
    // than silently under-reversing.
    await tx.reconciliationIssue.create({
      data: {
        type: 'REFUND_MISMATCH',
        reference: `Refund:${refund.id}`,
        details: `₹${remaining / 100} of this refund could not be matched to an unreversed captured payment.`,
      },
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ — per-request ledger drill-down and per-seller earnings summary.
// ─────────────────────────────────────────────────────────────────────────────
export async function getVerificationRequestLedger(verificationRequestId: string) {
  return prisma.financialLedgerEntry.findMany({
    where: { verificationRequestId },
    orderBy: { createdAt: 'asc' },
  })
}

export interface SellerEarningsSummary {
  totalEarnedPaise: number
  pendingSettlementPaise: number
  availableForPayoutPaise: number
  inPayoutPaise: number // PAYOUT_REQUESTED + PROCESSING
  paidPaise: number
  reversedPaise: number
  failedPaise: number
}

export async function getSellerEarningsSummary(sellerId: string): Promise<SellerEarningsSummary> {
  const rows = await prisma.professionalEarning.findMany({
    where: { sellerId },
    select: { status: true, grossEarningPaise: true },
  })

  const summary: SellerEarningsSummary = {
    totalEarnedPaise: 0,
    pendingSettlementPaise: 0,
    availableForPayoutPaise: 0,
    inPayoutPaise: 0,
    paidPaise: 0,
    reversedPaise: 0,
    failedPaise: 0,
  }

  for (const row of rows) {
    summary.totalEarnedPaise += row.grossEarningPaise
    if (row.status === 'EARNED' || row.status === 'PENDING_SETTLEMENT') {
      summary.pendingSettlementPaise += row.grossEarningPaise
    } else if (row.status === 'AVAILABLE_FOR_PAYOUT') {
      summary.availableForPayoutPaise += row.grossEarningPaise
    } else if (row.status === 'PAYOUT_REQUESTED' || row.status === 'PROCESSING') {
      summary.inPayoutPaise += row.grossEarningPaise
    } else if (row.status === 'PAID') {
      summary.paidPaise += row.grossEarningPaise
    } else if (row.status === 'REVERSED') {
      summary.reversedPaise += row.grossEarningPaise
    } else if (row.status === 'FAILED' || row.status === 'RETRYABLE' || row.status === 'MANUAL_REVIEW') {
      summary.failedPaise += row.grossEarningPaise
    }
  }

  return summary
}
