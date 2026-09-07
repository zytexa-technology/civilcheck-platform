// ─────────────────────────────────────────────────────────────────────────────
// Refund execution — the atomic claim + Razorpay call + status sync that both
// the admin "process" action (admin.controller.ts) and the special-request
// SLA auto-refund sweep (Day 6) need. Kept in one place so there is exactly
// one code path that ever moves money back to a buyer.
// ─────────────────────────────────────────────────────────────────────────────
import type { Refund } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { refundPayment, RazorpayError } from '../lib/razorpay.js'
import { recordReversalForRefund } from './ledger.service.js'
import { notifyBuyerAlert } from './notification.service.js'

export interface ExecuteRefundResult {
  ok: boolean
  refund: Refund | null
  message: string
}

// A refund reverses a purchase, a special-request advance, or a
// verification-marketplace payment (the DB CHECK constraint on Refund
// guarantees exactly one is set). Resolve the Razorpay payment id from
// whichever side is populated.
async function resolveRazorpayPaymentId(refund: Refund): Promise<string | null> {
  if (refund.purchaseId) {
    const purchase = await prisma.purchase.findUnique({ where: { id: refund.purchaseId } })
    return purchase?.razorpayId ?? null
  }
  if (refund.specialRequestId) {
    const paymentOrder = await prisma.paymentOrder.findFirst({
      where: {
        specialRequestId: refund.specialRequestId,
        kind: 'SPECIAL_REQUEST_ADVANCE',
        status: 'PAID',
      },
    })
    return paymentOrder?.paymentId ?? null
  }
  if (refund.verificationRequestId) {
    // Phase 4B fix: this branch was missing entirely — a verification-
    // marketplace refund could be created (cancellation always writes one
    // when money was captured) but never actually processed, since this
    // function fell through to `return null` for it. The most recent PAID
    // order for the request is the right one to reverse: cancellation is
    // only reachable before the final payment can be captured (see
    // verification.service.ts's CANCELLABLE_STATUSES), so in normal
    // operation at most the advance is ever PAID at cancellation time.
    const paymentOrder = await prisma.paymentOrder.findFirst({
      where: {
        verificationRequestId: refund.verificationRequestId,
        kind: { in: ['VERIFICATION_ADVANCE', 'VERIFICATION_FINAL'] },
        status: 'PAID',
      },
      orderBy: { createdAt: 'desc' },
    })
    return paymentOrder?.paymentId ?? null
  }
  return null
}

// Claims the refund row (PENDING → PROCESSED) BEFORE calling Razorpay, not
// after — two racing callers (admin double-click, SLA sweep racing an admin
// action) must not both reach Razorpay for the same refund. A failed
// Razorpay call releases the claim back to PENDING so it can be retried.
export async function executeRefund(refundId: string, note?: string): Promise<ExecuteRefundResult> {
  const claim = await prisma.refund.updateMany({
    where: { id: refundId, status: 'PENDING' },
    data: { status: 'PROCESSED', adminNote: note || 'Refund processing…' },
  })

  if (claim.count === 0) {
    const refund = await prisma.refund.findUnique({ where: { id: refundId } })
    return {
      ok: false,
      refund,
      message: refund ? 'Only PENDING refunds can be processed' : 'Refund request not found',
    }
  }

  const refund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })

  const paymentId = await resolveRazorpayPaymentId(refund)
  if (!paymentId) {
    logger.error(`[refund] ${refundId} has no resolvable Razorpay payment id — releasing claim`)
    await prisma.refund.update({
      where: { id: refundId },
      data: { status: 'PENDING', adminNote: 'No captured payment found — the refund could not be processed' },
    })
    return { ok: false, refund, message: 'No captured payment was found behind this refund' }
  }

  try {
    await refundPayment({
      paymentId,
      amount: Math.round(refund.amount * 100),
      notes: {
        refundId: refund.id,
        ...(refund.purchaseId ? { purchaseId: refund.purchaseId } : {}),
        ...(refund.specialRequestId ? { specialRequestId: refund.specialRequestId } : {}),
      },
    })
  } catch (err) {
    const message = err instanceof RazorpayError ? err.message : 'Razorpay refund call failed'
    logger.error(`[refund] ${refundId} failed at Razorpay: ${message}`)
    await prisma.refund.update({
      where: { id: refundId },
      data: { status: 'PENDING', adminNote: `Razorpay refund failed — ${message}` },
    })
    return { ok: false, refund, message }
  }

  const finalNote = note || 'Refund processed'
  // Financial ledger reversal (Phase 4B) commits in the SAME transaction as
  // the refund's final note update — a processed refund can never end up
  // without its REVERSAL_COMMISSION/REVERSAL_EARNING/REFUND ledger entries,
  // or neither.
  const updatedRefund = await prisma.$transaction(async (tx) => {
    const updated = await tx.refund.update({ where: { id: refundId }, data: { adminNote: finalNote } })
    if (refund.specialRequestId) {
      await tx.specialRequest.update({
        where: { id: refund.specialRequestId },
        data: { status: 'REFUNDED' },
      })
    }
    if (refund.verificationRequestId) {
      await recordReversalForRefund(tx, updated)
    }
    return updated
  })

  logger.info(`[refund] ${refundId} processed — Rs. ${refund.amount} refunded (payment ${paymentId})`)

  // Buyer-facing refund/cancellation update (Phase 4C) — only for
  // verification-marketplace refunds; Purchase/SpecialRequest refund
  // notifications are unchanged, out of this phase's scope.
  if (refund.verificationRequestId) {
    const buyer = await prisma.user.findUnique({ where: { id: refund.userId } })
    if (buyer) {
      void notifyBuyerAlert(
        { id: buyer.id, phone: buyer.phone, email: buyer.email, fcmToken: buyer.fcmToken, pushEnabled: buyer.pushEnabled },
        {
          type: 'cancellation',
          title: 'Refund processed',
          body: `Your refund of ₹${refund.amount} has been processed.`,
          data: { verificationRequestId: refund.verificationRequestId, refundId },
        }
      ).catch((err) => logger.error(`[refund] buyer notification failed for ${refundId}: ${err}`))
    }
  }
  return { ok: true, refund: updatedRefund, message: `₹${refund.amount} refund successfully processed!` }
}
