import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { Listing, Seller, Prisma, PropertyType, RiskBadge } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { JWT_SECRET } from '../lib/jwt.js'
import { verifyFirebaseToken } from '../lib/firebase.js'
import { TtlCache } from '../lib/cache.js'
import { buildMapUrl } from '../lib/maps.js'
import { getEngagementCounts, getViewerFlags } from '../services/feedEngagement.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Optional buyer identity on a public endpoint.
//
// A buyer reaches this screen with either a local JWT (phone-OTP login) or a
// Firebase ID token (Google/Apple SSO). The old inline decode only understood
// the local JWT, so an SSO buyer's token failed silently and `hasPurchased`
// was always false — they were shown the paywall for a report they had already
// paid for (QA audit 2026-08-03, "SSO buyers not recognized as already paid").
//
// Retrieve-only: unlike the buyer middleware, an unknown SSO identity is NOT
// created here — this is an anonymous-allowed read, so a missing user simply
// means "no purchase to check".
// ─────────────────────────────────────────────────────────────────────────────
async function resolveBuyerId(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)

  // 1) Local JWT — carries userId directly.
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string }
    if (decoded.userId) return decoded.userId
  } catch {
    // Not a local JWT — fall through to Firebase.
  }

  // 2) Firebase ID token (Google/Apple SSO or phone OTP) — resolve the existing
  //    buyer by their normalized phone. Never creates.
  const identity = await verifyFirebaseToken(token)
  if (identity?.phone) {
    const user = await prisma.user.findUnique({ where: { phone: identity.phone } })
    return user?.id ?? null
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Free Preview Format karo
// ─────────────────────────────────────────────────────────────────────────────
// Buyer ko FREE mein sirf yeh milega:
// - Case exists (Yes/No)
// - Risk badge color
// - Address confirmation
// - Property type, city
// Paid details HIDE rahenge jab tak buyer unlock na kare
// ─────────────────────────────────────────────────────────────────────────────
function formatFreePreview(listing: Listing & { seller: Pick<Seller, 'badge'> }) {
  return {
    id: listing.id,
    address: listing.address,
    city: listing.city,
    tehsil: listing.tehsil,
    propertyType: listing.propertyType,
    caseExists: listing.caseExists,       // FREE ✅
    riskBadge: listing.riskBadge,         // FREE ✅ — expert-only assessment, set at creation
    loanDefault: listing.loanDefault,     // FREE ✅
    price: listing.price,
    views: listing.views,
    researchDate: listing.researchDate,
    sellerBadge: listing.seller?.badge,   // Seller ka badge level
    isPaid: false,                         // Frontend ko pata chale — locked hai

    // Property System (Phase 2) — attribution + media + map are free/public,
    // same tier as the other preview fields above (not paywalled).
    uploadedBy: listing.uploaderRole,     // "Uploaded by: Owner / Reporter / Expert"
    images: listing.images,
    videos: listing.videos,
    latitude: listing.latitude,
    longitude: listing.longitude,
    mapUrl: buildMapUrl(listing.latitude, listing.longitude),

    // Yeh sab LOCKED hain — paid ke baad milenge
    caseNumber: null,
    caseType: null,
    caseStatus: null,
    courtName: null,
    partiesInvolved: null,
    lenderName: null,
    documents: [],
    sellerNotes: null,
    sellerContact: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Paid Full Report Format karo
// ─────────────────────────────────────────────────────────────────────────────
function formatPaidReport(listing: Listing & { seller: Pick<Seller, 'phone' | 'name' | 'badge' | 'accuracyScore'> }) {
  return {
    id: listing.id,
    address: listing.address,
    city: listing.city,
    tehsil: listing.tehsil,
    propertyType: listing.propertyType,
    caseExists: listing.caseExists,
    riskBadge: listing.riskBadge,
    loanDefault: listing.loanDefault,
    price: listing.price,
    researchDate: listing.researchDate,
    isPaid: true,                          // Unlocked ✅

    // Property System (Phase 2)
    uploadedBy: listing.uploaderRole,
    images: listing.images,
    videos: listing.videos,
    latitude: listing.latitude,
    longitude: listing.longitude,
    mapUrl: buildMapUrl(listing.latitude, listing.longitude),

    // Ab yeh sab milega
    caseNumber: listing.caseNumber,
    caseType: listing.caseType,
    caseStatus: listing.caseStatus,
    courtName: listing.courtName,
    partiesInvolved: listing.partiesInvolved,
    lenderName: listing.lenderName,
    documents: listing.documents,
    sellerNotes: listing.sellerNotes,
    sellerContact: listing.seller?.phone,  // Seller se directly baat kar sako
    sellerName: listing.seller?.name,
    sellerBadge: listing.seller?.badge,
    sellerAccuracyScore: listing.seller?.accuracyScore,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/search
// ─────────────────────────────────────────────────────────────────────────────
// Buyers properties search karte hain
// Search by: address, city, tehsil, property type, risk badge
// Sirf APPROVED listings dikhti hain buyers ko
// ─────────────────────────────────────────────────────────────────────────────
export const searchProperties = async (req: Request, res: Response) => {
  const {
    query,        // address ya colony name se search
    city,         // city filter
    tehsil,       // tehsil filter
    propertyType, // RESIDENTIAL, COMMERCIAL, etc.
    riskBadge,    // GREEN, AMBER, RED
    minPrice,     // price range
    maxPrice,
    page = '1',
    limit = '10',
  } = req.query

  // Pagination — NaN/negative se bachao (raw SQL LIMIT/OFFSET me jaata hai)
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 10))
  const skip = (pageNum - 1) * limitNum

  const q = typeof query === 'string' ? query.trim() : ''

  // ─── FULL-TEXT SEARCH PATH (PDF 13) ─────────────────────────────────────
  // Jab buyer ne text query di ho, Postgres FTS use karo — GIN-indexed
  // "searchVector" column par address/city/tehsil/khasra/survey ka ranked
  // match. Structured filters (city/tehsil/type/badge/price) isi query me
  // AND hote hain taaki total count filtered result se match kare.
  if (q) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`status = 'APPROVED'`,
      Prisma.sql`"searchVector" @@ websearch_to_tsquery('simple', ${q})`,
    ]
    if (city) conditions.push(Prisma.sql`"city" ILIKE ${`%${city as string}%`}`)
    if (tehsil) conditions.push(Prisma.sql`"tehsil" ILIKE ${`%${tehsil as string}%`}`)
    // Enum ko text ke roop me compare karte hain — invalid value error ke bajaye
    // simply zero rows deta hai.
    if (propertyType) conditions.push(Prisma.sql`"propertyType"::text = ${propertyType as string}`)
    if (riskBadge) conditions.push(Prisma.sql`"riskBadge"::text = ${riskBadge as string}`)
    if (minPrice) conditions.push(Prisma.sql`"price" >= ${parseFloat(minPrice as string)}`)
    if (maxPrice) conditions.push(Prisma.sql`"price" <= ${parseFloat(maxPrice as string)}`)

    const whereSql = Prisma.join(conditions, ' AND ')

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM "Listing"
        WHERE ${whereSql}
        ORDER BY (CASE WHEN "featured" AND ("featuredUntil" IS NULL OR "featuredUntil" > now())
                       THEN 1 ELSE 0 END) DESC,
                 ts_rank("searchVector", websearch_to_tsquery('simple', ${q})) DESC,
                 "views" DESC
        LIMIT ${limitNum} OFFSET ${skip}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count
        FROM "Listing"
        WHERE ${whereSql}
      `,
    ])

    const total = Number(countRows[0]?.count ?? 0)
    const orderedIds = rows.map(r => r.id)

    // Ranked IDs ko type-safe rows me hydrate karo (seller badge ke saath).
    // status: 'APPROVED' yahan bhi rakha hai — agar ranked-id query aur hydrate
    // ke beech koi listing unpublish ho jaye toh woh leak na ho.
    const listings = orderedIds.length
      ? await prisma.listing.findMany({
          where: { id: { in: orderedIds }, status: 'APPROVED' },
          include: { seller: { select: { badge: true, accuracyScore: true } } },
        })
      : []

    // findMany `in` ka ordering guarantee nahi karta — rank order restore karo.
    const byId = new Map(listings.map(l => [l.id, l]))
    const results = orderedIds
      .map(id => byId.get(id))
      .filter((l): l is (typeof listings)[number] => l !== undefined)
      .map(formatFreePreview)

    // View count badhao — jo actually laut rahe hain unhi ke.
    if (orderedIds.length) {
      await prisma.listing.updateMany({
        where: { id: { in: orderedIds } },
        data: { views: { increment: 1 } },
      })
    }

    logSearchHistory(req.user?.id, q)

    res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      results,
    })
    return
  }

  // ─── BROWSE PATH (no text query) — structured filters only, fully typed ──
  const where: Prisma.ListingWhereInput = { status: 'APPROVED' }
  if (city) where.city = { contains: city as string, mode: 'insensitive' }
  if (tehsil) where.tehsil = { contains: tehsil as string, mode: 'insensitive' }
  if (propertyType) where.propertyType = propertyType as PropertyType
  if (riskBadge) where.riskBadge = riskBadge as RiskBadge
  if (minPrice || maxPrice) {
    const price: Prisma.FloatFilter = {}
    if (minPrice) price.gte = parseFloat(minPrice as string)
    if (maxPrice) price.lte = parseFloat(maxPrice as string)
    where.price = price
  }

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        seller: { select: { badge: true, accuracyScore: true } }
      },
      // Featured listings (PDF 3.3) pehle, phir most-viewed. `featured` boolean
      // subscription lifecycle se maintain hota hai; expiry sweep Day 6 cron.
      orderBy: [{ featured: 'desc' }, { views: 'desc' }],
      skip,
      take: limitNum,
    }),
    prisma.listing.count({ where })
  ])

  // View count badhao — user ne search results mein dekha
  const listingIds = listings.map(l => l.id)
  await prisma.listing.updateMany({
    where: { id: { in: listingIds } },
    data: { views: { increment: 1 } }
  })

  // Har listing ke liye free preview format karo
  const results = listings.map(formatFreePreview)

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    results
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Search History Logger (PDF 7.3)
// ─────────────────────────────────────────────────────────────────────────────
// Sirf authenticated buyer ke liye log karte hain — SearchQuery.userId required
// hai aur search route public hai, isliye anonymous searches log nahi hote.
// Fire-and-forget: logging failure kabhi search response ko block ya fail nahi
// karega.
// ─────────────────────────────────────────────────────────────────────────────
function logSearchHistory(userId: string | undefined, query: string): void {
  if (!userId || !query) return

  void prisma.searchQuery
    .create({ data: { userId, query } })
    .catch(err =>
      logger.error(`[search] history log failed for user ${userId}: ${err?.message ?? err}`)
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/searches
// ─────────────────────────────────────────────────────────────────────────────
// Authenticated buyer ke last 10 UNIQUE searches — recent-first.
// distinct + orderBy: har distinct query ka sabse recent occurrence rehta hai.
// ─────────────────────────────────────────────────────────────────────────────
export const getSearchHistory = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const searches = await prisma.searchQuery.findMany({
    where: { userId },
    distinct: ['query'],
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { query: true, createdAt: true },
  })

  res.json({
    success: true,
    total: searches.length,
    searches: searches.map(s => ({ query: s.query, searchedAt: s.createdAt })),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// "Free Check" cache (PDF 7.2) — freeCaseCheck is the highest-traffic query in
// the app (the free hook that pulls buyers in), so results are cached briefly
// instead of hitting Postgres on every call.
//
// Single-instance, in-memory only — does NOT survive a restart and is NOT
// shared across horizontally-scaled API instances (each instance would keep
// its own cache and could disagree for the same query seconds apart). Fine
// for the pilot's single Railway instance; revisit with a shared cache
// (Redis) if the API ever scales beyond one instance.
//
// 60s TTL is a deliberate staleness/perf tradeoff: a listing that just got
// approved, or had its case status updated, can take up to 60s to show up
// here in exchange for the sub-millisecond response the PDF asks for. No
// manual invalidation — it self-heals on expiry.
// ─────────────────────────────────────────────────────────────────────────────
const FREE_CHECK_CACHE_TTL_MS = 60_000
const FREE_CHECK_CACHE_MAX_ENTRIES = 5_000
const freeCheckCache = new TtlCache<Record<string, unknown>>(
  FREE_CHECK_CACHE_TTL_MS,
  FREE_CHECK_CACHE_MAX_ENTRIES
)

function freeCheckCacheKey(address: unknown, khasra: unknown, survey: unknown): string {
  if (address) return `address:${String(address).trim().toLowerCase()}`
  if (khasra) return `khasra:${String(khasra).trim().toLowerCase()}`
  return `survey:${String(survey).trim().toLowerCase()}`
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/check?address=...  ya  ?khasra=...
// ─────────────────────────────────────────────────────────────────────────────
// CivilCheck ka sabse powerful FREE feature
// Buyer sirf address deta hai — system batata hai "Case Hai Ya Nahi"
// Agar case mila → buyer ko paid report unlock karne ki taraf push karo
// Yeh conversion tool hai — free hook jo buyer ko andar kheechta hai
// ─────────────────────────────────────────────────────────────────────────────
export const freeCaseCheck = async (req: Request, res: Response) => {
  const { address, khasra, survey } = req.query

  if (!address && !khasra && !survey) {
    res.status(400).json({
      success: false,
      message: 'Provide at least one of address, khasra number or survey number'
    })
    return
  }

  const cacheKey = freeCheckCacheKey(address, khasra, survey)
  const cached = freeCheckCache.get(cacheKey)
  if (cached) {
    res.json({ ...cached, cacheHit: true })
    return
  }

  // Database mein dhundo — address ya khasra se match karo
  const where: Prisma.ListingWhereInput = { status: 'APPROVED' }

  if (address) {
    where.address = { contains: address as string, mode: 'insensitive' }
  } else if (khasra) {
    where.khasraNumber = { contains: khasra as string, mode: 'insensitive' }
  } else if (survey) {
    where.surveyNumber = { contains: survey as string, mode: 'insensitive' }
  }

  const listing = await prisma.listing.findFirst({ where })

  // ─── Case 1: Property database mein nahi hai ───────────────────────────
  if (!listing) {
    const payload = {
      success: true,
      found: false,
      message: 'We have no record of this property in our database.',
      disclaimer: 'This is not a guarantee that the property is clear — only that no expert has uploaded a report for it yet.',
      cta: 'Submit a Special Request and we will research it within 48 hours.'
    }
    freeCheckCache.set(cacheKey, payload)
    res.json({ ...payload, cacheHit: false })
    return
  }

  // ─── Case 2: Property mili — free result do ────────────────────────────
  const payload = {
    success: true,
    found: true,
    listingId: listing.id,

    // FREE information
    caseExists: listing.caseExists,
    riskBadge: listing.riskBadge,
    loanDefault: listing.loanDefault,
    address: listing.address,
    city: listing.city,
    lastUpdated: listing.researchDate,

    // Agar case hai → buyer ko urgency feel ho
    message: listing.caseExists
      ? `⚠️ There is a civil case on record against this property. Unlock the report for full details.`
      : listing.loanDefault
      ? `⚠️ A loan default was found on record for this property. Unlock the report to see full details.`
      : `✅ Our records show no active case or loan default on this property.`,

    // Paid unlock ka CTA
    unlockPrice: listing.price,
    cta: listing.caseExists || listing.loanDefault
      ? `Unlock the full report for just Rs. ${listing.price} and protect your life savings`
      : `Unlock the full verification report for Rs. ${listing.price}`,
  }
  freeCheckCache.set(cacheKey, payload)
  res.json({ ...payload, cacheHit: false })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/:id
// ─────────────────────────────────────────────────────────────────────────────
// Single property ka preview — buyer detail page par jaata hai
// Agar buyer ne pehle se purchase kiya hai → full paid report milega
// Agar nahi kiya → free preview milega
// ─────────────────────────────────────────────────────────────────────────────
export const getPropertyById = async (req: Request, res: Response) => {
  const id = req.params.id as string

  // Optional: buyer ka userId bhi check karo (agar logged in hai).
  // Local JWT ya Firebase SSO token — dono resolve hote hain (see helper above).
  const userId = await resolveBuyerId(req.headers.authorization)

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      seller: {
        select: {
          badge: true,
          name: true,
          phone: true,
          accuracyScore: true,
          profession: true,
        }
      }
    }
  })

  if (!listing || listing.status !== 'APPROVED') {
    res.status(404).json({
      success: false,
      message: 'Property not found'
    })
    return
  }

  // View count badhao
  await prisma.listing.update({
    where: { id },
    data: { views: { increment: 1 } }
  })

  // Check karo — kya is buyer ne yeh report already purchase ki hai?
  let hasPurchased = false
  if (userId) {
    const purchase = await prisma.purchase.findFirst({
      where: { userId, listingId: id }
    })
    hasPurchased = !!purchase
  }

  // Purchased hai → full paid report do
  // Nahi kiya → free preview do
  const result = hasPurchased
    ? formatPaidReport(listing)
    : formatFreePreview(listing)

  res.json({
    success: true,
    hasPurchased,
    property: result
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/trending
// ─────────────────────────────────────────────────────────────────────────────
// Sabse zyada dekhi gayi properties — city filter bhi ho sakta hai
// Home screen par dikhane ke liye
// ─────────────────────────────────────────────────────────────────────────────
export const getTrendingProperties = async (req: Request, res: Response) => {
  const { city, limit = '10' } = req.query

  const where: Prisma.ListingWhereInput = { status: 'APPROVED' }
  if (city) where.city = { contains: city as string, mode: 'insensitive' }

  const listings = await prisma.listing.findMany({
    where,
    include: {
      seller: { select: { badge: true, accuracyScore: true } }
    },
    orderBy: { views: 'desc' },
    take: parseInt(limit as string),
  })

  res.json({
    success: true,
    total: listings.length,
    results: listings.map(formatFreePreview)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/feed
// ─────────────────────────────────────────────────────────────────────────────
// Unified property discovery feed (Property System foundation — Phase 2).
// Combines Expert paid-verification Listings and Owner free self-verification
// Properties into one normalized, buyer-facing array with a consistent
// "uploaded by" attribution and risk badge on every item.
//
// The two source tables are deliberately NOT merged — Listing carries
// payment/commission/refund/review relations Property does not, and merging
// them would be a large, risky migration for no functional gain. The
// "unified model" is expressed at this read layer instead.
//
// Pagination note: this is an MVP merge, not a true cross-table keyset merge
// — each table is queried independently (most-recent first, capped at
// `limit` rows each), tagged, combined, sorted by createdAt, and trimmed to
// `limit`. Fine at today's scale; revisit if the combined row count grows
// large enough for this to matter.
// ─────────────────────────────────────────────────────────────────────────────
interface FeedItem {
  id: string
  source: 'EXPERT_REPORT' | 'OWNER_LISTING' | 'REPORTER_POST'
  title: string
  city: string | null
  tehsil: string | null
  address: string | null
  propertyType: PropertyType | null // null for a Reporter post — no propertyType on that model
  uploadedBy: string
  riskBadge: RiskBadge | null // Expert-only assessment — null for an Owner listing/Reporter post
  price: number | null // null for a free Owner listing / Reporter post
  isFree: boolean
  images: string[]
  videos: string[]
  latitude: number | null
  longitude: number | null
  mapUrl: string | null
  sellerBadge: string
  views: number
  createdAt: Date
  // Buyer Web social feed (Buyer Experience redesign) — always present;
  // isLiked/isSaved are false for an anonymous viewer.
  likeCount: number
  saveCount: number
  commentCount: number
  isLiked: boolean
  isSaved: boolean
}

// Buyer Web redesign — Home is now a merged feed across all three content
// sources by default. The mobile app (apps/buyer) only ever calls this
// endpoint with city/propertyType/limit, so defaulting `sources` to
// EXPERT+OWNER (its historical behavior) keeps that caller's response
// identical; REPORTER only joins when explicitly requested.
const ALL_SOURCES = ['EXPERT', 'OWNER', 'REPORTER'] as const
type FeedSource = (typeof ALL_SOURCES)[number]

export const getPropertyFeed = async (req: Request, res: Response) => {
  const { city, propertyType, limit = '20', sources } = req.query
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20))

  const requestedSources: FeedSource[] =
    typeof sources === 'string'
      ? (sources
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s): s is FeedSource => (ALL_SOURCES as readonly string[]).includes(s)))
      : ['EXPERT', 'OWNER']
  const activeSources = requestedSources.length ? requestedSources : ['EXPERT', 'OWNER']

  const userId = await resolveBuyerId(req.headers.authorization)

  const listingWhere: Prisma.ListingWhereInput = { status: 'APPROVED' }
  const propertyWhere: Prisma.PropertyWhereInput = { status: 'APPROVED' }
  const reporterPostWhere: Prisma.ReporterPostWhereInput = { status: 'PUBLISHED' }
  if (city) {
    listingWhere.city = { contains: city as string, mode: 'insensitive' }
    propertyWhere.city = { contains: city as string, mode: 'insensitive' }
    reporterPostWhere.city = { contains: city as string, mode: 'insensitive' }
  }
  if (propertyType) {
    listingWhere.propertyType = propertyType as PropertyType
    propertyWhere.propertyType = propertyType as PropertyType
    // ReporterPost has no propertyType field — a propertyType filter simply
    // excludes it from the results (handled below by skipping the query).
  }

  const [listings, properties, reporterPosts] = await Promise.all([
    activeSources.includes('EXPERT')
      ? prisma.listing.findMany({
          where: listingWhere,
          include: { seller: { select: { badge: true } } },
          orderBy: { createdAt: 'desc' },
          take: limitNum,
        })
      : Promise.resolve([]),
    activeSources.includes('OWNER')
      ? prisma.property.findMany({
          where: propertyWhere,
          include: { seller: { select: { badge: true } } },
          orderBy: { createdAt: 'desc' },
          take: limitNum,
        })
      : Promise.resolve([]),
    activeSources.includes('REPORTER') && !propertyType
      ? prisma.reporterPost.findMany({
          where: reporterPostWhere,
          include: { seller: { select: { badge: true } } },
          orderBy: { createdAt: 'desc' },
          take: limitNum,
        })
      : Promise.resolve([]),
  ])

  const [listingCounts, listingFlags, propertyCounts, propertyFlags, postCounts, postFlags] = await Promise.all([
    getEngagementCounts('LISTING', listings.map((l) => l.id)),
    getViewerFlags(userId, 'LISTING', listings.map((l) => l.id)),
    getEngagementCounts('PROPERTY', properties.map((p) => p.id)),
    getViewerFlags(userId, 'PROPERTY', properties.map((p) => p.id)),
    getEngagementCounts('REPORTER_POST', reporterPosts.map((r) => r.id)),
    getViewerFlags(userId, 'REPORTER_POST', reporterPosts.map((r) => r.id)),
  ])

  const listingItems: FeedItem[] = listings.map((l) => ({
    id: l.id,
    source: 'EXPERT_REPORT',
    title: l.address,
    city: l.city,
    tehsil: l.tehsil,
    address: l.address,
    propertyType: l.propertyType,
    uploadedBy: l.uploaderRole,
    riskBadge: l.riskBadge,
    price: l.price,
    isFree: false,
    images: l.images,
    videos: l.videos,
    latitude: l.latitude,
    longitude: l.longitude,
    mapUrl: buildMapUrl(l.latitude, l.longitude),
    sellerBadge: l.seller.badge,
    views: l.views,
    createdAt: l.createdAt,
    ...(listingCounts.get(l.id) ?? { likeCount: 0, saveCount: 0, commentCount: 0 }),
    ...(listingFlags.get(l.id) ?? { isLiked: false, isSaved: false }),
  }))

  const propertyItems: FeedItem[] = properties.map((p) => ({
    id: p.id,
    source: 'OWNER_LISTING',
    title: p.title,
    city: p.city,
    tehsil: p.tehsil,
    address: p.address,
    propertyType: p.propertyType,
    uploadedBy: p.uploaderRole,
    riskBadge: null, // no expert has assessed this listing yet (verification marketplace — later phase)
    price: null,
    isFree: true,
    images: p.images,
    videos: p.videos,
    latitude: p.latitude,
    longitude: p.longitude,
    mapUrl: buildMapUrl(p.latitude, p.longitude),
    sellerBadge: p.seller.badge,
    views: p.views,
    createdAt: p.createdAt,
    ...(propertyCounts.get(p.id) ?? { likeCount: 0, saveCount: 0, commentCount: 0 }),
    ...(propertyFlags.get(p.id) ?? { isLiked: false, isSaved: false }),
  }))

  const reporterPostItems: FeedItem[] = reporterPosts.map((r) => ({
    id: r.id,
    source: 'REPORTER_POST',
    title: r.title || 'Property update',
    city: r.city,
    tehsil: r.tehsil,
    address: null,
    propertyType: null,
    uploadedBy: 'REPORTER',
    riskBadge: null, // a Reporter post is informational — never eligible for a risk assessment
    price: null,
    isFree: true,
    images: r.images,
    videos: [],
    latitude: null,
    longitude: null,
    mapUrl: null,
    sellerBadge: r.seller.badge,
    views: 0, // ReporterPost tracks no view counter
    createdAt: r.createdAt,
    ...(postCounts.get(r.id) ?? { likeCount: 0, saveCount: 0, commentCount: 0 }),
    ...(postFlags.get(r.id) ?? { isLiked: false, isSaved: false }),
  }))

  const combined = [...listingItems, ...propertyItems, ...reporterPostItems]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitNum)

  res.json({
    success: true,
    total: combined.length,
    results: combined,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/properties/mine?kind=saved|liked
// ─────────────────────────────────────────────────────────────────────────────
// Profile → Saved/Liked properties (Buyer Experience redesign §20). Reads
// the buyer's own PropertyLike/PropertySave rows, then hydrates them against
// whichever of the three source tables each targetType points to — same
// per-source shape as getPropertyFeed above, just driven by "what this buyer
// engaged with" instead of "what's recent". A target that was later
// unpublished/rejected is quietly skipped (findMany over a specific id list
// simply returns fewer rows), same as the rest of this file only ever shows
// APPROVED/PUBLISHED content to a buyer.
// ─────────────────────────────────────────────────────────────────────────────
export const getMyEngagedProperties = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const kind = req.query.kind === 'liked' ? 'liked' : 'saved'

  const engagementRows =
    kind === 'liked'
      ? await prisma.propertyLike.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
      : await prisma.propertySave.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })

  const idsByType = {
    LISTING: engagementRows.filter((r) => r.targetType === 'LISTING').map((r) => r.targetId),
    PROPERTY: engagementRows.filter((r) => r.targetType === 'PROPERTY').map((r) => r.targetId),
    REPORTER_POST: engagementRows.filter((r) => r.targetType === 'REPORTER_POST').map((r) => r.targetId),
  }

  const [listings, properties, reporterPosts] = await Promise.all([
    idsByType.LISTING.length
      ? prisma.listing.findMany({
          where: { id: { in: idsByType.LISTING }, status: 'APPROVED' },
          include: { seller: { select: { badge: true } } },
        })
      : Promise.resolve([]),
    idsByType.PROPERTY.length
      ? prisma.property.findMany({
          where: { id: { in: idsByType.PROPERTY }, status: 'APPROVED' },
          include: { seller: { select: { badge: true } } },
        })
      : Promise.resolve([]),
    idsByType.REPORTER_POST.length
      ? prisma.reporterPost.findMany({
          where: { id: { in: idsByType.REPORTER_POST }, status: 'PUBLISHED' },
          include: { seller: { select: { badge: true } } },
        })
      : Promise.resolve([]),
  ])

  const [listingCounts, listingFlags, propertyCounts, propertyFlags, postCounts, postFlags] = await Promise.all([
    getEngagementCounts('LISTING', listings.map((l) => l.id)),
    getViewerFlags(userId, 'LISTING', listings.map((l) => l.id)),
    getEngagementCounts('PROPERTY', properties.map((p) => p.id)),
    getViewerFlags(userId, 'PROPERTY', properties.map((p) => p.id)),
    getEngagementCounts('REPORTER_POST', reporterPosts.map((r) => r.id)),
    getViewerFlags(userId, 'REPORTER_POST', reporterPosts.map((r) => r.id)),
  ])

  const listingItems: FeedItem[] = listings.map((l) => ({
    id: l.id,
    source: 'EXPERT_REPORT',
    title: l.address,
    city: l.city,
    tehsil: l.tehsil,
    address: l.address,
    propertyType: l.propertyType,
    uploadedBy: l.uploaderRole,
    riskBadge: l.riskBadge,
    price: l.price,
    isFree: false,
    images: l.images,
    videos: l.videos,
    latitude: l.latitude,
    longitude: l.longitude,
    mapUrl: buildMapUrl(l.latitude, l.longitude),
    sellerBadge: l.seller.badge,
    views: l.views,
    createdAt: l.createdAt,
    ...(listingCounts.get(l.id) ?? { likeCount: 0, saveCount: 0, commentCount: 0 }),
    ...(listingFlags.get(l.id) ?? { isLiked: false, isSaved: false }),
  }))

  const propertyItems: FeedItem[] = properties.map((p) => ({
    id: p.id,
    source: 'OWNER_LISTING',
    title: p.title,
    city: p.city,
    tehsil: p.tehsil,
    address: p.address,
    propertyType: p.propertyType,
    uploadedBy: p.uploaderRole,
    riskBadge: null,
    price: null,
    isFree: true,
    images: p.images,
    videos: p.videos,
    latitude: p.latitude,
    longitude: p.longitude,
    mapUrl: buildMapUrl(p.latitude, p.longitude),
    sellerBadge: p.seller.badge,
    views: p.views,
    createdAt: p.createdAt,
    ...(propertyCounts.get(p.id) ?? { likeCount: 0, saveCount: 0, commentCount: 0 }),
    ...(propertyFlags.get(p.id) ?? { isLiked: false, isSaved: false }),
  }))

  const reporterPostItems: FeedItem[] = reporterPosts.map((r) => ({
    id: r.id,
    source: 'REPORTER_POST',
    title: r.title || 'Property update',
    city: r.city,
    tehsil: r.tehsil,
    address: null,
    propertyType: null,
    uploadedBy: 'REPORTER',
    riskBadge: null,
    price: null,
    isFree: true,
    images: r.images,
    videos: [],
    latitude: null,
    longitude: null,
    mapUrl: null,
    sellerBadge: r.seller.badge,
    views: 0,
    createdAt: r.createdAt,
    ...(postCounts.get(r.id) ?? { likeCount: 0, saveCount: 0, commentCount: 0 }),
    ...(postFlags.get(r.id) ?? { isLiked: false, isSaved: false }),
  }))

  // Re-order to match the buyer's original engagement order (most recently
  // liked/saved first) rather than each source table's own createdAt.
  const byId = new Map([...listingItems, ...propertyItems, ...reporterPostItems].map((item) => [item.id, item]))
  const ordered = engagementRows.map((r) => byId.get(r.targetId)).filter((item): item is FeedItem => Boolean(item))

  res.json({ success: true, total: ordered.length, results: ordered })
}