import { Request, Response } from 'express'
import prisma from '../lib/prisma.js'
import { getSellerEarningsSummary } from '../services/ledger.service.js'
import * as payoutService from '../services/payout.service.js'

// ─────────────────────────────────────────────────────────────────────────────
//  PROFESSIONAL-FACING EARNINGS + PAYOUT (Phase 4B)
//  Mounted at /api/seller/verification-marketplace/earnings and .../payouts,
//  behind sellerMiddleware + requireSellerRole(EXPERT) — a professional can
//  only ever read/act on their own earnings (req.seller.id). All financial
//  calculations happen server-side; nothing here trusts a client-supplied
//  amount.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/seller/verification-marketplace/earnings/summary
export const getMyEarningsSummary = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const summaryPaise = await getSellerEarningsSummary(sellerId)

  // Rupee view for display convenience — the paise figures above remain the
  // source of truth for any further calculation.
  const toRupees = (paise: number) => paise / 100
  res.json({
    success: true,
    summary: {
      totalEarned: toRupees(summaryPaise.totalEarnedPaise),
      pendingSettlement: toRupees(summaryPaise.pendingSettlementPaise),
      availableForPayout: toRupees(summaryPaise.availableForPayoutPaise),
      inPayout: toRupees(summaryPaise.inPayoutPaise),
      paid: toRupees(summaryPaise.paidPaise),
      reversed: toRupees(summaryPaise.reversedPaise),
      failed: toRupees(summaryPaise.failedPaise),
    },
    summaryPaise,
  })
}

// GET /api/seller/verification-marketplace/earnings/transactions
export const getMyEarningsTransactions = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { page = '1', limit = '20' } = req.query
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20))

  const [earnings, total] = await Promise.all([
    prisma.professionalEarning.findMany({
      where: { sellerId },
      include: {
        verificationRequest: {
          select: { id: true, source: true, listingId: true, propertyId: true, status: true },
        },
        payoutRecord: { select: { id: true, status: true, requestedAt: true, paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.professionalEarning.count({ where: { sellerId } }),
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    transactions: earnings.map((e) => ({
      id: e.id,
      amount: e.grossEarningPaise / 100,
      status: e.status,
      verificationRequest: e.verificationRequest,
      payoutRecord: e.payoutRecord,
      createdAt: e.createdAt,
    })),
  })
}

// GET /api/seller/verification-marketplace/payouts
export const getMyPayouts = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const records = await payoutService.listSellerPayouts(sellerId)
  res.json({
    success: true,
    total: records.length,
    payouts: records.map((r) => ({
      id: r.id,
      amount: r.totalAmountPaise / 100,
      status: r.status,
      mechanism: r.mechanism,
      failureReason: r.failureReason,
      retryCount: r.retryCount,
      earningsCount: r.earnings.length,
      requestedAt: r.requestedAt,
      processedAt: r.processedAt,
      paidAt: r.paidAt,
      reversedAt: r.reversedAt,
    })),
  })
}

// POST /api/seller/verification-marketplace/payouts
export const requestMyPayout = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  try {
    const record = await payoutService.requestPayout(sellerId)
    res.status(201).json({
      success: true,
      message: 'Payout requested — an admin will process it.',
      payout: { id: record.id, amount: record.totalAmountPaise / 100, status: record.status },
    })
  } catch (err) {
    if (err instanceof payoutService.PayoutError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// GET /api/seller/verification-marketplace/payout-profile
// Bank details themselves are read/written via the existing
// GET/PATCH /api/seller/profile (bankAccount/ifsc, unchanged) — this only
// surfaces the two fields that are genuinely new to Phase 4B and are never
// seller-settable: payout eligibility and the (currently always null)
// Razorpay Route linked-account id.
export const getMyPayoutProfile = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: {
      bankAccount: true,
      ifsc: true,
      payoutEligibilityStatus: true,
      razorpayLinkedAccountId: true,
    },
  })
  if (!seller) {
    res.status(404).json({ success: false, message: 'Seller not found' })
    return
  }
  res.json({
    success: true,
    profile: {
      bankAccountOnFile: Boolean(seller.bankAccount),
      bankAccountLast4: seller.bankAccount ? seller.bankAccount.slice(-4) : null,
      ifsc: seller.ifsc,
      payoutEligibilityStatus: seller.payoutEligibilityStatus,
      razorpayLinkedAccountId: seller.razorpayLinkedAccountId,
    },
  })
}
