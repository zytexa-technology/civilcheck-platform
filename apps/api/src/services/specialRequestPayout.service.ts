// ─────────────────────────────────────────────────────────────────────────────
// Seller payout ledger for approved special requests (PDF 6.2) — the 70/30
// split computeCommission() already applies to report unlocks, wired here for
// the first time. One SpecialRequestPayout row per approved request; picked
// up by the weekly settlement cron the same way Purchase.sellerCut is.
// ─────────────────────────────────────────────────────────────────────────────
import type { Seller, SpecialRequest, SpecialRequestPayout } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { computeCommission } from './payment.service.js'

export async function createPayoutForApprovedRequest(
  request: SpecialRequest,
  seller: Seller
): Promise<SpecialRequestPayout> {
  const { platformCut, sellerCut } = computeCommission(
    'SPECIAL_REQUEST_ADVANCE',
    seller.badge,
    request.advanceAmount
  )

  return prisma.specialRequestPayout.create({
    data: {
      specialRequestId: request.id,
      sellerId: seller.id,
      amount: sellerCut,
      platformCut,
    },
  })
}
