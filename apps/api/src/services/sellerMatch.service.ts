// ─────────────────────────────────────────────────────────────────────────────
// Nearest-qualified-seller-in-tehsil auto-selection (PDF 7.9 — Day 6 carry-over).
//
// `Seller` has no declared city/tehsil field, and registration never collects
// one — so "nearest" is derived from the tehsil/city of Listing rows a seller
// has already authored, not a declared service area. Known limitation: a
// newly onboarded specialist with no prior listings can never rank above one
// with even a single local listing. Not solved here — see roadmap notes.
//
// "Qualified" is the same bar assignRequest already used before this file
// existed: kycStatus === 'APPROVED'. There's no data anywhere mapping a
// SpecialRequest to a required Profession (LAWYER/CIVIL_ENGINEER/…), so this
// doesn't filter by profession — only ranks by locality and workload.
// ─────────────────────────────────────────────────────────────────────────────
import type { SpecialRequest } from '@prisma/client'
import prisma from '../lib/prisma.js'

export interface SellerMatch {
  sellerId: string
  reason: string
}

export async function selectBestSellerForRequest(
  request: SpecialRequest
): Promise<SellerMatch | null> {
  const candidates = await prisma.seller.findMany({
    where: { kycStatus: 'APPROVED' },
    select: { id: true, avgRating: true, accuracyScore: true },
  })
  if (candidates.length === 0) return null

  const candidateIds = candidates.map((c) => c.id)

  const [tehsilCounts, cityCounts, workloadCounts] = await Promise.all([
    prisma.listing.groupBy({
      by: ['sellerId'],
      where: { sellerId: { in: candidateIds }, tehsil: request.tehsil },
      _count: { _all: true },
    }),
    prisma.listing.groupBy({
      by: ['sellerId'],
      where: { sellerId: { in: candidateIds }, city: request.city },
      _count: { _all: true },
    }),
    prisma.specialRequest.groupBy({
      by: ['sellerId'],
      where: { sellerId: { in: candidateIds }, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
      _count: { _all: true },
    }),
  ])

  const tehsilMap = new Map(tehsilCounts.map((r) => [r.sellerId, r._count._all]))
  const cityMap = new Map(cityCounts.map((r) => [r.sellerId, r._count._all]))
  const workloadMap = new Map(
    workloadCounts
      .filter((r): r is typeof r & { sellerId: string } => r.sellerId !== null)
      .map((r) => [r.sellerId, r._count._all])
  )

  const scored = candidates.map((c) => ({
    sellerId: c.id,
    tehsilCount: tehsilMap.get(c.id) ?? 0,
    cityCount: cityMap.get(c.id) ?? 0,
    workload: workloadMap.get(c.id) ?? 0,
    avgRating: c.avgRating,
    accuracyScore: c.accuracyScore,
  }))

  // Tehsil match first, city match as a fallback signal, then least-loaded,
  // then best-rated, then most-accurate as the final tiebreak.
  scored.sort((a, b) => {
    if (a.tehsilCount !== b.tehsilCount) return b.tehsilCount - a.tehsilCount
    if (a.cityCount !== b.cityCount) return b.cityCount - a.cityCount
    if (a.workload !== b.workload) return a.workload - b.workload
    const ratingA = a.avgRating ?? -1
    const ratingB = b.avgRating ?? -1
    if (ratingA !== ratingB) return ratingB - ratingA
    return b.accuracyScore - a.accuracyScore
  })

  const best = scored[0]!
  const reason =
    best.tehsilCount > 0
      ? `${best.tehsilCount} prior listing(s) in ${request.tehsil}`
      : best.cityCount > 0
        ? `${best.cityCount} prior listing(s) in ${request.city} (no exact tehsil match)`
        : 'no tehsil/city listing history — selected by lowest workload and rating'

  return { sellerId: best.sellerId, reason }
}
