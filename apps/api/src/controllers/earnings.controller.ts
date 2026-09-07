import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { generatePayoutStatement } from '../services/pdf.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Shared earnings summary — lifetime/month/week/pending + next payout.
// Used by both the standalone overview endpoint and the dashboard aggregator
// so the two never drift apart.
// ─────────────────────────────────────────────────────────────────────────────
interface EarningsSummary {
  earnings: {
    lifetime: number
    thisMonth: number
    thisWeek: number
    pendingSettlement: number
    totalReportsSold: number
  }
  nextPayout: {
    date: Date
    amount: number
    willBeProcessed: boolean
    message: string
  }
}

async function computeEarningsSummary(sellerId: string): Promise<EarningsSummary> {
  // Date ranges calculate karo
  const now = new Date()

  // Is week ka start — Monday
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)

  // Is month ka start
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Sab kuch parallel mein fetch karo — fast response
  const [
    lifetimeData,
    thisMonthData,
    thisWeekData,
    pendingSettlement,
    totalSales,
    lifetimePayouts,
    thisMonthPayouts,
    thisWeekPayouts,
    pendingPayouts,
  ] = await Promise.all([

    // Lifetime total earnings
    prisma.purchase.aggregate({
      where: { listing: { sellerId } },
      _sum: { sellerCut: true }
    }),

    // Is month ki earnings
    prisma.purchase.aggregate({
      where: {
        listing: { sellerId },
        createdAt: { gte: monthStart }
      },
      _sum: { sellerCut: true }
    }),

    // Is week ki earnings
    prisma.purchase.aggregate({
      where: {
        listing: { sellerId },
        createdAt: { gte: weekStart }
      },
      _sum: { sellerCut: true }
    }),

    // Pending settlement — jo abhi tak payout nahi hua
    prisma.purchase.aggregate({
      where: {
        listing: { sellerId },
        settled: false
      },
      _sum: { sellerCut: true }
    }),

    // Total kitni baar reports biki
    prisma.purchase.count({
      where: { listing: { sellerId } }
    }),

    // Special-request commission ledger — same lifetime/month/week/pending
    // shape as report-unlock Purchases, so approved special requests count
    // toward a seller's earnings too.
    prisma.specialRequestPayout.aggregate({
      where: { sellerId },
      _sum: { amount: true }
    }),
    prisma.specialRequestPayout.aggregate({
      where: { sellerId, createdAt: { gte: monthStart } },
      _sum: { amount: true }
    }),
    prisma.specialRequestPayout.aggregate({
      where: { sellerId, createdAt: { gte: weekStart } },
      _sum: { amount: true }
    }),
    prisma.specialRequestPayout.aggregate({
      where: { sellerId, settled: false },
      _sum: { amount: true }
    }),
  ])

  // Next payout date — agle Monday
  const nextMonday = new Date(now)
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7
  nextMonday.setDate(now.getDate() + daysUntilMonday)
  nextMonday.setHours(10, 0, 0, 0) // Monday 10 AM

  const pendingAmount = (pendingSettlement._sum.sellerCut || 0) + (pendingPayouts._sum.amount || 0)

  return {
    earnings: {
      lifetime: (lifetimeData._sum.sellerCut || 0) + (lifetimePayouts._sum.amount || 0),
      thisMonth: (thisMonthData._sum.sellerCut || 0) + (thisMonthPayouts._sum.amount || 0),
      thisWeek: (thisWeekData._sum.sellerCut || 0) + (thisWeekPayouts._sum.amount || 0),
      pendingSettlement: pendingAmount,
      totalReportsSold: totalSales,
    },
    nextPayout: {
      date: nextMonday,
      amount: pendingAmount,
      // Rs. 500 se kam hua toh agle hafte carry forward
      willBeProcessed: pendingAmount >= 500,
      message: pendingAmount < 500
        ? `Rs. ${pendingAmount} pending — another Rs. ${(500 - pendingAmount).toFixed(2)} is needed to reach the Rs. 500 minimum payout threshold`
        : `Rs. ${pendingAmount.toFixed(2)} will be transferred to your bank next Monday`
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/earnings
// ─────────────────────────────────────────────────────────────────────────────
// Seller ka complete earnings overview
// Lifetime, this month, this week — sab ek jagah
// ─────────────────────────────────────────────────────────────────────────────
export const getEarningsOverview = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const summary = await computeEarningsSummary(sellerId)
  res.json({ success: true, ...summary })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/dashboard
// ─────────────────────────────────────────────────────────────────────────────
// Seller home screen — earnings summary + next payout + per-listing
// views/sales in a single round trip, so the dashboard doesn't need to fan
// out to /earnings and /listings separately.
// ─────────────────────────────────────────────────────────────────────────────
export const getDashboard = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id

  const [summary, listings] = await Promise.all([
    computeEarningsSummary(sellerId),
    prisma.listing.findMany({
      where: { sellerId },
      include: {
        _count: { select: { purchases: true, reviews: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
  ])

  // Per-listing average rating (Review model, Day 7) — one grouped query
  // rather than N+1 aggregates per listing.
  const ratings = await prisma.review.groupBy({
    by: ['listingId'],
    where: { listingId: { in: listings.map((l) => l.id) } },
    _avg: { rating: true },
  })
  const ratingByListing = new Map(ratings.map((r) => [r.listingId, r._avg.rating]))

  res.json({
    success: true,
    earnings: summary.earnings,
    nextPayout: summary.nextPayout,
    totalListings: listings.length,
    listings: listings.map(l => ({
      id: l.id,
      address: l.address,
      city: l.city,
      propertyType: l.propertyType,
      status: l.status,
      riskBadge: l.riskBadge,
      price: l.price,
      views: l.views,
      totalSales: l._count.purchases,
      rating: ratingByListing.get(l.id) ?? null,
      reviewCount: l._count.reviews,
      createdAt: l.createdAt,
    })),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/earnings/transactions
// ─────────────────────────────────────────────────────────────────────────────
// Per-listing earnings breakdown
// Kaunsi property se kitna mila — detail mein
// ─────────────────────────────────────────────────────────────────────────────
export const getTransactions = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { settled, page = '1', limit = '20' } = req.query

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const skip = (pageNum - 1) * limitNum

  // Filter — settled ya pending
  const where: Prisma.PurchaseWhereInput = { listing: { sellerId } }
  if (settled === 'true') where.settled = true
  if (settled === 'false') where.settled = false

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: {
        listing: {
          select: {
            address: true,
            city: true,
            price: true,
            riskBadge: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.purchase.count({ where })
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    transactions: purchases.map(p => ({
      purchaseId: p.id,
      buyerPaid: p.amountPaid,      // Buyer ne kitna diya
      platformCut: p.platformCut,   // Platform ka 40%
      yourEarning: p.sellerCut,     // Aapka 60%
      settled: p.settled,           // Payout hua ya nahi
      date: p.createdAt,
      property: p.listing,
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/settlements
// ─────────────────────────────────────────────────────────────────────────────
// Settlement history — kab kab kitna mila bank mein
// ─────────────────────────────────────────────────────────────────────────────
export const getSettlements = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id

  // Settled purchases ko week ke hisaab se group karo
  // Har week ek settlement batch hota hai — settledAt (jab payout hua) se
  // group karte hain, createdAt (jab report unlock hui) se nahi. Purane rows
  // jo Day 6 settledAt column se pehle settle hue the, unke liye createdAt
  // fallback hai.
  const settledPurchases = await prisma.purchase.findMany({
    where: {
      listing: { sellerId },
      settled: true
    },
    select: {
      sellerCut: true,
      amountPaid: true,
      createdAt: true,
      settledAt: true,
    },
    orderBy: { createdAt: 'desc' }
  })

  // Week ke hisaab se group karo
  const weeklyMap: Record<string, { amount: number; transactions: number; weekStart: string }> = {}

  settledPurchases.forEach(p => {
    const date = new Date(p.settledAt ?? p.createdAt)
    // Week start (Monday) calculate karo
    const monday = new Date(date)
    monday.setDate(date.getDate() - date.getDay() + 1)
    monday.setHours(0, 0, 0, 0)
    const key = monday.toISOString().split('T')[0]

    if (!weeklyMap[key]) {
      weeklyMap[key] = { amount: 0, transactions: 0, weekStart: key }
    }
    weeklyMap[key].amount += p.sellerCut
    weeklyMap[key].transactions += 1
  })

  const settlements = Object.values(weeklyMap)
    .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime())

  res.json({
    success: true,
    totalSettlements: settlements.length,
    settlements: settlements.map(s => ({
      weekOf: s.weekStart,
      amountPaid: parseFloat(s.amount.toFixed(2)),
      transactions: s.transactions,
      status: 'PAID',
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/settlements/pending
// ─────────────────────────────────────────────────────────────────────────────
// Next payout ka detail — kab aayega, kitna aayega
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingSettlement = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id

  // Unsettled purchases + unsettled special-request payouts — both feed the
  // same weekly settlement run (settlement.service.ts), so both belong here.
  const [pending, pendingPayouts] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        listing: { sellerId },
        settled: false
      },
      include: {
        listing: {
          select: { address: true, city: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.specialRequestPayout.findMany({
      where: { sellerId, settled: false },
      include: {
        specialRequest: { select: { address: true, city: true } }
      },
      orderBy: { createdAt: 'asc' }
    }),
  ])

  const totalPending =
    pending.reduce((sum, p) => sum + p.sellerCut, 0) +
    pendingPayouts.reduce((sum, p) => sum + p.amount, 0)

  // Next Monday calculate karo
  const now = new Date()
  const nextMonday = new Date(now)
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7
  nextMonday.setDate(now.getDate() + daysUntilMonday)
  nextMonday.setHours(10, 0, 0, 0)

  res.json({
    success: true,
    pendingAmount: parseFloat(totalPending.toFixed(2)),
    transactionCount: pending.length + pendingPayouts.length,
    nextPayoutDate: nextMonday,
    meetsThreshold: totalPending >= 500,
    minimumThreshold: 500,
    pendingTransactions: [
      ...pending.map(p => ({
        source: 'REPORT_UNLOCK' as const,
        purchaseId: p.id,
        earning: p.sellerCut,
        date: p.createdAt,
        property: p.listing,
      })),
      ...pendingPayouts.map(p => ({
        source: 'SPECIAL_REQUEST' as const,
        specialRequestPayoutId: p.id,
        earning: p.amount,
        date: p.createdAt,
        property: p.specialRequest,
      })),
    ]
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared statement computation — used by both the JSON endpoint and the PDF
// export, so the two can never disagree on the numbers.
// ─────────────────────────────────────────────────────────────────────────────
interface EarningsStatement {
  sellerName: string | undefined
  sellerPhone: string | undefined
  sellerPan: string | null | undefined
  period: { from: Date; to: Date }
  summary: {
    grossEarnings: number
    tdsDeducted: number
    netPayable: number
    totalTransactions: number
    tdsApplicable: boolean
  }
  transactions: { date: Date; property: string; city: string; grossAmount: number }[]
}

// Default: is financial year ka data (April se March). ?from=/?to= override it.
function resolveStatementPeriod(from: unknown, to: unknown): { dateFrom: Date; dateTo: Date } {
  const now = new Date()
  const fyStart = now.getMonth() >= 3
    ? new Date(now.getFullYear(), 3, 1)      // April 1 current year
    : new Date(now.getFullYear() - 1, 3, 1)  // April 1 last year

  const dateFrom = typeof from === 'string' ? new Date(from) : fyStart
  const dateTo = typeof to === 'string' ? new Date(to) : now
  return { dateFrom, dateTo }
}

async function computeEarningsStatement(
  sellerId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<EarningsStatement> {
  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: { name: true, phone: true, pan: true }
  })

  const purchases = await prisma.purchase.findMany({
    where: {
      listing: { sellerId },
      createdAt: { gte: dateFrom, lte: dateTo }
    },
    include: {
      listing: { select: { address: true, city: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  const totalEarned = purchases.reduce((sum, p) => sum + p.sellerCut, 0)
  const tdsApplicable = totalEarned > 30000 // Rs. 30,000 se zyada → TDS

  // TDS 10% hoga agar earnings > Rs. 30,000/year
  const tdsAmount = tdsApplicable ? totalEarned * 0.1 : 0
  const netPayable = totalEarned - tdsAmount

  return {
    sellerName: seller?.name,
    sellerPhone: seller?.phone,
    sellerPan: seller?.pan,
    period: { from: dateFrom, to: dateTo },
    summary: {
      grossEarnings: parseFloat(totalEarned.toFixed(2)),
      tdsDeducted: parseFloat(tdsAmount.toFixed(2)),
      netPayable: parseFloat(netPayable.toFixed(2)),
      totalTransactions: purchases.length,
      tdsApplicable,
    },
    transactions: purchases.map(p => ({
      date: p.createdAt,
      property: p.listing.address,
      city: p.listing.city,
      grossAmount: p.sellerCut,
    }))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/earnings/statement
// ─────────────────────────────────────────────────────────────────────────────
// Income tax ke liye earnings statement
// Date range filter kar sakte hain
// ─────────────────────────────────────────────────────────────────────────────
export const getEarningsStatement = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { dateFrom, dateTo } = resolveStatementPeriod(req.query.from, req.query.to)
  const statement = await computeEarningsStatement(sellerId, dateFrom, dateTo)
  res.json({ success: true, statement })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/earnings/statement/pdf
// ─────────────────────────────────────────────────────────────────────────────
// Same statement, rendered as a downloadable PDF for the seller's own records.
// ─────────────────────────────────────────────────────────────────────────────
export const getEarningsStatementPdf = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { dateFrom, dateTo } = resolveStatementPeriod(req.query.from, req.query.to)
  const statement = await computeEarningsStatement(sellerId, dateFrom, dateTo)

  const bytes = await generatePayoutStatement(statement)
  const filename = `statement-${dateFrom.toISOString().slice(0, 10)}-to-${dateTo.toISOString().slice(0, 10)}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(Buffer.from(bytes))
}