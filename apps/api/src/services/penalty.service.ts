// ─────────────────────────────────────────────────────────────────────────────
// False Information Penalty System (PDF 10.4) — escalation triggered from a
// spot-check FAIL (admin.controller.ts spotCheckListing). Strikes accumulate
// on Seller.strikeCount and never reset on unsuspend, same lifetime-counter
// shape as accuracyScore.
//
// Strikes 1-2: a warning notification only — accuracyScore already took the
// -10 hit in the caller's transaction.
//
// Strike 3 and every FAIL after: suspend (reuses kyc.service.ts — a no-op if
// already suspended, since suspendSeller guards on kycStatus), fine Rs. 500
// off totalEarnings (floored at 0, same pattern as accuracyScore), and
// auto-refund every un-refunded purchase of the specific listing that just
// failed. This repeats on every FAIL past the threshold, not just the one
// that first crosses it — each fraudulent listing has its own buyers to make
// whole, independent of whether the seller was already suspended.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { notifySeller } from './notification.service.js'
import { suspendSeller } from './kyc.service.js'
import { executeRefund } from './refund.service.js'

const STRIKE_THRESHOLD = 3
const STRIKE_FINE = 500

export interface StrikeEscalationResult {
  strikeCount: number
  escalated: boolean
  suspended: boolean
  refundsIssued: number
  refundsAttempted: number
}

export async function applyStrikeEscalation(
  sellerId: string,
  triggeringListingId: string
): Promise<StrikeEscalationResult> {
  const seller = await prisma.seller.update({
    where: { id: sellerId },
    data: { strikeCount: { increment: 1 } },
  })

  if (seller.strikeCount < STRIKE_THRESHOLD) {
    await notifySeller(
      { id: seller.id, name: seller.name, phone: seller.phone, email: seller.email },
      {
        type: 'platform',
        title: `Spot-check strike ${seller.strikeCount}/${STRIKE_THRESHOLD}`,
        body:
          `${seller.name}, one of your listings failed a spot check. This is strike ` +
          `${seller.strikeCount} — on strike ${STRIKE_THRESHOLD} your account will be suspended ` +
          `and a Rs. ${STRIKE_FINE} fine will apply.`,
      }
    )
    return {
      strikeCount: seller.strikeCount,
      escalated: false,
      suspended: false,
      refundsIssued: 0,
      refundsAttempted: 0,
    }
  }

  const suspension = await suspendSeller(
    sellerId,
    `${STRIKE_THRESHOLD} spot-check strikes — false/fraudulent listing information (PDF 10.4)`
  )

  await prisma.seller.update({
    where: { id: sellerId },
    data: { totalEarnings: { decrement: STRIKE_FINE } },
  })
  await prisma.seller.updateMany({
    where: { id: sellerId, totalEarnings: { lt: 0 } },
    data: { totalEarnings: 0 },
  })

  // Un-refunded purchases of the listing that just failed — a purchase with a
  // PENDING or already-PROCESSED refund is left alone.
  const purchases = await prisma.purchase.findMany({
    where: {
      listingId: triggeringListingId,
      refunds: { none: { status: { not: 'REJECTED' } } },
    },
  })

  let refundsIssued = 0
  for (const purchase of purchases) {
    const refund = await prisma.refund.create({
      data: {
        purchaseId: purchase.id,
        userId: purchase.userId,
        amount: purchase.amountPaid,
        reason: 'Auto-refund: seller struck for a fraudulent listing (PDF 10.4, 3-strike penalty)',
        status: 'PENDING',
      },
    })
    const result = await executeRefund(refund.id, 'Auto-refund: 3-strike penalty')
    if (result.ok) {
      refundsIssued += 1
    } else {
      logger.error(
        `[penalty] strike auto-refund FAILED for purchase ${purchase.id}, refund ${refund.id} left PENDING: ${result.message}`
      )
    }
  }

  logger.info(
    `[penalty] seller ${sellerId} hit strike ${seller.strikeCount} — ` +
      `suspended=${suspension.ok}, fine=Rs.${STRIKE_FINE}, refunds=${refundsIssued}/${purchases.length}`
  )

  return {
    strikeCount: seller.strikeCount,
    escalated: true,
    suspended: suspension.ok,
    refundsIssued,
    refundsAttempted: purchases.length,
  }
}
