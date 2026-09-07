// ─────────────────────────────────────────────────────────────────────────────
// Weekly settlement (Day 6) — pays out each seller's unsettled purchases once
// the aggregate crosses the Rs. 500 minimum threshold already surfaced by
// earnings.controller.ts's nextPayout math, withholding a flat 10% TDS.
// Also pays out unsettled special-request commission ledger rows
// (SpecialRequestPayout) the same way, merged into the same per-seller total.
//
// Note: this flat-10%-per-payout rule is a different interpretation from
// getEarningsStatement's cumulative ">Rs. 30,000/year" TDS threshold —
// the two were never reconciled (flagged in the Day 6 roadmap notes).
//
// Purchase has no direct sellerId (only via listing.sellerId), so unsettled
// purchases are grouped by seller in JS after one fetch — same style
// getSettlements already uses for its weekly grouping, not a DB-side
// aggregate join. Fine at pilot scale.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { createPayout, RazorpayPayoutError } from '../lib/razorpayPayouts.js'
import { round2 } from './payment.service.js'

const MIN_SETTLEMENT_AMOUNT = 500
const TDS_RATE = 0.1

export async function runWeeklySettlement(): Promise<void> {
  const [unsettledPurchases, unsettledPayouts] = await Promise.all([
    prisma.purchase.findMany({
      where: { settled: false },
      include: { listing: { select: { sellerId: true } } },
    }),
    prisma.specialRequestPayout.findMany({ where: { settled: false } }),
  ])

  const bySeller = new Map<
    string,
    { purchases: typeof unsettledPurchases; payouts: typeof unsettledPayouts }
  >()
  for (const purchase of unsettledPurchases) {
    const sellerId = purchase.listing.sellerId
    const entry = bySeller.get(sellerId)
    if (entry) entry.purchases.push(purchase)
    else bySeller.set(sellerId, { purchases: [purchase], payouts: [] })
  }
  for (const payout of unsettledPayouts) {
    const entry = bySeller.get(payout.sellerId)
    if (entry) entry.payouts.push(payout)
    else bySeller.set(payout.sellerId, { purchases: [], payouts: [payout] })
  }

  for (const [sellerId, { purchases, payouts }] of bySeller) {
    const grossTotal = round2(
      purchases.reduce((sum, p) => sum + p.sellerCut, 0) +
        payouts.reduce((sum, p) => sum + p.amount, 0)
    )
    if (grossTotal < MIN_SETTLEMENT_AMOUNT) continue

    const seller = await prisma.seller.findUnique({ where: { id: sellerId } })
    if (!seller) {
      logger.error(
        `[settlement] seller ${sellerId} not found for ${purchases.length} unsettled purchases — skipping`
      )
      continue
    }
    if (!seller.bankAccount || !seller.ifsc) {
      logger.warn(
        `[settlement] seller ${sellerId} (${seller.name}) has no bank details on file — ` +
          `Rs. ${grossTotal} carried forward to next run`
      )
      continue
    }

    const purchaseIds = purchases.map((p) => p.id)
    const payoutIds = payouts.map((p) => p.id)
    const now = new Date()

    // Claim BEFORE calling RazorpayX, not after: if the payout succeeds but
    // the process dies before this write lands, next week's run must not
    // re-select (and double-pay) the same rows. Claiming first means a
    // DB-write failure after a successful payout needs a manual settledAt
    // backfill — far safer than a duplicate payout from an unclaimed row.
    // Both sources are claimed together; a partial claim (one source claims
    // fully, the other doesn't) is released entirely rather than paying out
    // an amount that no longer matches what got claimed.
    const [purchaseClaim, payoutClaim] = await Promise.all([
      purchaseIds.length > 0
        ? prisma.purchase.updateMany({
            where: { id: { in: purchaseIds }, settled: false },
            data: { settled: true, settledAt: now },
          })
        : { count: 0 },
      payoutIds.length > 0
        ? prisma.specialRequestPayout.updateMany({
            where: { id: { in: payoutIds }, settled: false },
            data: { settled: true, settledAt: now },
          })
        : { count: 0 },
    ])
    if (purchaseClaim.count !== purchaseIds.length || payoutClaim.count !== payoutIds.length) {
      logger.error(
        `[settlement] seller ${sellerId} claim mismatch — purchases expected ${purchaseIds.length} ` +
          `got ${purchaseClaim.count}, payouts expected ${payoutIds.length} got ${payoutClaim.count}. ` +
          `Releasing claim and skipping this run for this seller.`
      )
      if (purchaseIds.length > 0) {
        await prisma.purchase.updateMany({
          where: { id: { in: purchaseIds } },
          data: { settled: false, settledAt: null },
        })
      }
      if (payoutIds.length > 0) {
        await prisma.specialRequestPayout.updateMany({
          where: { id: { in: payoutIds } },
          data: { settled: false, settledAt: null },
        })
      }
      continue
    }

    const tds = round2(grossTotal * TDS_RATE)
    const netPayable = round2(grossTotal - tds)
    const referenceId = `stl_${sellerId}_${now.getTime()}`.slice(0, 40)

    try {
      const payout = await createPayout({
        amount: Math.round(netPayable * 100),
        bankAccount: { name: seller.name, accountNumber: seller.bankAccount, ifsc: seller.ifsc },
        referenceId,
        narration: 'CivilCheck weekly settlement',
      })
      logger.info(
        `[settlement] seller ${sellerId} (${seller.name}) paid out — gross Rs. ${grossTotal}, ` +
          `TDS Rs. ${tds}, net Rs. ${netPayable} (payout ${payout.id}, ${purchaseIds.length} purchases, ` +
          `${payoutIds.length} special-request payouts)`
      )
    } catch (err) {
      // Payout failed — release the claim so these rows are retried next
      // week instead of silently staying "settled" with no money moved.
      const message = err instanceof RazorpayPayoutError ? err.message : 'RazorpayX payout call failed'
      logger.error(
        `[settlement] seller ${sellerId} (${seller.name}) payout FAILED: ${message} — releasing claim`
      )
      if (purchaseIds.length > 0) {
        await prisma.purchase.updateMany({
          where: { id: { in: purchaseIds } },
          data: { settled: false, settledAt: null },
        })
      }
      if (payoutIds.length > 0) {
        await prisma.specialRequestPayout.updateMany({
          where: { id: { in: payoutIds } },
          data: { settled: false, settledAt: null },
        })
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Monday-10am gate — startInterval (scheduler.ts) only supports a
// fixed interval, not a specific day/hour, so the gate lives here: tick
// frequently, only actually run inside the Monday 10:00 hour, and use an
// in-memory "already ran this week" guard so a hits-every-30-minutes tick
// doesn't fire the settlement twice inside that hour.
//
// A restart during the Monday 10:00 hour resets this guard, but a second run
// in the same hour is self-limiting anyway: runWeeklySettlement() only ever
// selects settled: false purchases, and the first run already flipped
// everything it paid out to settled: true.
// ─────────────────────────────────────────────────────────────────────────────
let lastRunWeekKey: string | null = null

function weekKey(now: Date): string {
  const firstDayOfYear = new Date(now.getFullYear(), 0, 1)
  const daysSinceYearStart = Math.floor((now.getTime() - firstDayOfYear.getTime()) / 86_400_000)
  const week = Math.ceil((daysSinceYearStart + firstDayOfYear.getDay() + 1) / 7)
  return `${now.getFullYear()}-W${week}`
}

export async function weeklySettlementTick(): Promise<void> {
  const now = new Date()
  const isMondayTenAm = now.getDay() === 1 && now.getHours() === 10
  if (!isMondayTenAm) return

  const key = weekKey(now)
  if (lastRunWeekKey === key) return
  lastRunWeekKey = key

  logger.info('[settlement] weekly settlement window reached — running')
  await runWeeklySettlement()
}
