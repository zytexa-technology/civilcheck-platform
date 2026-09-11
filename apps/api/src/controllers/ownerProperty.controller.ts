import { Request, Response } from 'express'
import { Property, Prisma, PropertyType } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { buildMapUrl } from '../lib/maps.js'

// ─────────────────────────────────────────────────────────────────────────────
// BUYER-FACING OWNER PROPERTIES (self-verification, separate from Listing).
// Product decision: free trust signal only — no price, no purchase, no
// commission. Owner listing is direct-publish (property.status === 'APPROVED'
// is set immediately on submission by property-owner.controller.ts, no admin
// approval gate) — this does NOT mean CivilCheck has independently verified
// the property, and this API/UI must never claim that. Property VERIFICATION
// is the separate, unchanged, opt-in flow a Buyer can request afterward (see
// verification.service.ts). No "Verified" badge is rendered anywhere a buyer
// sees this data — see apps/buyer-web + apps/buyer's OwnerProperty*
// components. The owner's
// uploaded DOCUMENTS are never exposed here (owner/admin only, via
// property-owner.controller.ts / admin.controller.ts). Images and videos ARE
// exposed — Property System (Phase 2) media is the buyer-facing visual for
// this listing, same as a Listing's images/videos, and is not identity/KYC
// material the way `documents` is.
// ─────────────────────────────────────────────────────────────────────────────
function formatOwnerProperty(property: Property & { seller: { name: string; badge: string } }) {
  return {
    id: property.id,
    title: property.title,
    area: property.area,
    age: property.age,
    city: property.city,
    tehsil: property.tehsil,
    address: property.address,
    propertyType: property.propertyType,
    health: property.health,
    views: property.views,
    // Renamed from `verifiedSince` — this is when the listing was published/
    // last updated, not a verification date. Coordinate with the frontend
    // types (types/api.ts) if this field name ever changes again.
    listedSince: property.updatedAt,
    ownerName: property.seller?.name,
    ownerBadge: property.seller?.badge,

    // Property System (Phase 2). Always OWNER today — Reporter no longer
    // creates Property rows (see ReporterPost) and Expert never has.
    uploadedBy: property.uploaderRole,
    images: property.images,
    videos: property.videos,
    latitude: property.latitude,
    longitude: property.longitude,
    mapUrl: buildMapUrl(property.latitude, property.longitude),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/owner-properties/search
// ─────────────────────────────────────────────────────────────────────────────
// Buyers search karte hain — sirf APPROVED properties dikhti hain.
// No full-text search index on Property (unlike Listing's searchVector), so
// this is a simple case-insensitive ILIKE, OR'd across every field a buyer's
// free-text query (address/locality box on Browse Property) could plausibly
// be describing — title, address, city, tehsil — fine at this table's scale.
// Previously this only matched `title`, so an address/locality search never
// found a Property even when its address/city/tehsil matched exactly.
// ─────────────────────────────────────────────────────────────────────────────
export const searchOwnerProperties = async (req: Request, res: Response) => {
  const { query, city, tehsil, propertyType, page = '1', limit = '10' } = req.query

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 10))
  const skip = (pageNum - 1) * limitNum

  const where: Prisma.PropertyWhereInput = { status: 'APPROVED' }
  const q = typeof query === 'string' ? query.trim() : ''
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { address: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { tehsil: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (city) where.city = { contains: city as string, mode: 'insensitive' }
  if (tehsil) where.tehsil = { contains: tehsil as string, mode: 'insensitive' }
  if (propertyType) where.propertyType = propertyType as PropertyType

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { seller: { select: { name: true, badge: true } } },
      orderBy: { views: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.property.count({ where })
  ])

  const ids = properties.map(p => p.id)
  if (ids.length) {
    await prisma.property.updateMany({ where: { id: { in: ids } }, data: { views: { increment: 1 } } })
  }

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    results: properties.map(formatOwnerProperty),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/owner-properties/trending
// ─────────────────────────────────────────────────────────────────────────────
export const getTrendingOwnerProperties = async (req: Request, res: Response) => {
  const { city, limit = '10' } = req.query

  const where: Prisma.PropertyWhereInput = { status: 'APPROVED' }
  if (city) where.city = { contains: city as string, mode: 'insensitive' }

  const properties = await prisma.property.findMany({
    where,
    include: { seller: { select: { name: true, badge: true } } },
    orderBy: { views: 'desc' },
    take: parseInt(limit as string),
  })

  res.json({
    success: true,
    total: properties.length,
    results: properties.map(formatOwnerProperty),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/owner-properties/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getOwnerPropertyById = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const property = await prisma.property.findUnique({
    where: { id },
    include: { seller: { select: { name: true, badge: true } } },
  })

  if (!property || property.status !== 'APPROVED') {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }

  await prisma.property.update({ where: { id }, data: { views: { increment: 1 } } })

  res.json({ success: true, property: formatOwnerProperty(property) })
}
