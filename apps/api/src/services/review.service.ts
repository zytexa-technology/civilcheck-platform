// ─────────────────────────────────────────────────────────────────────────────
// Reviews + rating (PDF 7.8 / 16). One buyer review per purchase; every insert
// recalculates the seller's avgRating/reviewCount and auto-writes Badge from
// fixed thresholds.
//
// Badge is otherwise an admin-only field (PATCH /api/admin/sellers/:id/badge)
// that drives the commission split — this recalculation auto-overwrites it on
// every new review, so a manual admin override only holds until the next
// review comes in. Deliberate per product sign-off (see roadmap.md Day 7).
// ─────────────────────────────────────────────────────────────────────────────
import type { Badge } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'

function badgeForRating(avgRating: number): Badge {
  if (avgRating >= 4.5) return 'PLATINUM'
  if (avgRating >= 4.0) return 'GOLD'
  if (avgRating >= 3.0) return 'SILVER'
  return 'BRONZE'
}

export async function recalculateSellerRating(sellerId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { sellerId },
    _avg: { rating: true },
    _count: { rating: true },
  })

  const avgRating = agg._avg.rating ?? null
  const reviewCount = agg._count.rating
  const badge = avgRating !== null ? badgeForRating(avgRating) : undefined

  const seller = await prisma.seller.update({
    where: { id: sellerId },
    data: {
      avgRating,
      reviewCount,
      ...(badge ? { badge } : {}),
    },
  })

  if (badge) {
    logger.info(
      `[review] seller ${sellerId} recalculated — avgRating=${avgRating?.toFixed(2)}, ` +
        `reviewCount=${reviewCount}, badge=${seller.badge}`
    )
  }
}
