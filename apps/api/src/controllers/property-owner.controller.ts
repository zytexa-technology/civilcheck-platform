import { Request, Response } from 'express'
import { Prisma, PropertyStatus } from '@prisma/client'
import { REQUIRED_PROPERTY_DOCUMENT_TYPES, type PropertyDocumentInput } from '@civilcheck/shared'
import prisma from '../lib/prisma.js'

// ─────────────────────────────────────────────────────────────────────────────
//  OWNER PROPERTY CONTROLLER
//  Property Owner apni property list karta hai. Listing (report-listing) se
//  alag hai — yeh owner ki apni property hai jo verify hoke publish hoti hai.
//  Sab routes sellerMiddleware ke peeche hain (har partner = seller record).
// ─────────────────────────────────────────────────────────────────────────────

// HELPER — documents ki count se health score (0-100)
function calcHealth(docCount: number): number {
  return Math.min(95, 30 + docCount * 8)
}

// Verifies every one of the 8 mandatory document TYPES (see
// REQUIRED_PROPERTY_DOCUMENT_TYPES, shared with propertyCreateSchema's shape
// check) is present exactly once — not just that "8 URLs" arrived, which a
// direct API call could satisfy with 8 copies of the same document (audit
// 2026-09-01, finding #1: the old REQUIRED_DOCUMENT_COUNT floor only checked
// docs.length). Entries whose `type` isn't one of the 8 required keys (NOC,
// Builder Documents, an unrecognized/typo'd key, …) are simply ignored here
// — they're optional/extra evidence, never able to fill a required slot,
// and never trigger a duplicate error on their own.
function findDocumentTypeErrors(docs: PropertyDocumentInput[]): string | null {
  const countByType = new Map<string, number>()
  for (const doc of docs) {
    if ((REQUIRED_PROPERTY_DOCUMENT_TYPES as readonly string[]).includes(doc.type)) {
      countByType.set(doc.type, (countByType.get(doc.type) ?? 0) + 1)
    }
  }

  const missing = REQUIRED_PROPERTY_DOCUMENT_TYPES.filter((t) => !countByType.has(t))
  const duplicated = [...countByType.entries()].filter(([, count]) => count > 1).map(([type]) => type)

  if (missing.length === 0 && duplicated.length === 0) return null

  const parts: string[] = []
  if (missing.length) parts.push(`missing: ${missing.join(', ')}`)
  if (duplicated.length) parts.push(`duplicated: ${duplicated.join(', ')}`)
  return `All 8 mandatory document types must each be present exactly once (${parts.join('; ')})`
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/seller/properties  → nayi property (status PENDING)
// ─────────────────────────────────────────────────────────────────────────────
export const createProperty = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const {
    title, area, age, city, tehsil, address, latitude, longitude,
    propertyType, documents, images, videos,
  } = req.body

  if (!title || !area) {
    res.status(400).json({ success: false, message: 'title and area are both required' })
    return
  }

  // req.body already passed propertyCreateSchema (validateBody, see routes)
  // by this point, so every entry is a real { type, url } pair — the shape
  // check happened there, the composition check (all 8 types, no dupes)
  // happens here.
  const docs: PropertyDocumentInput[] = Array.isArray(documents) ? documents : []
  const imgs: string[] = Array.isArray(images) ? images : []
  const vids: string[] = Array.isArray(videos) ? videos : []

  const docTypeError = findDocumentTypeErrors(docs)
  if (docTypeError) {
    res.status(400).json({ success: false, message: docTypeError })
    return
  }

  const property = await prisma.property.create({
    data: {
      sellerId,
      // Snapshot of the creating seller's role — see schema.prisma comment
      // on Property.uploaderRole. Always OWNER today (route-gated).
      uploaderRole: req.seller!.partnerRole!,
      title,
      area: String(area),
      age: age || null,
      city: city || null,
      tehsil: tehsil || null,
      address: address || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      propertyType: propertyType || 'RESIDENTIAL',
      // Audit 2026-09-01 (Admin Document Type Visibility) — the validated
      // { type, url } pairs are now stored as-is (Property.documents is
      // jsonb), so Admin can show the real document name instead of
      // discarding the type at write time.
      documents: docs as Prisma.InputJsonValue,
      images: imgs,
      videos: vids,
      health: calcHealth(docs.length),
      status: 'PENDING', // Super Admin approve karega
    },
  })

  res.status(201).json({
    success: true,
    message: 'Property submit ho gayi — Pending Review. Admin approval ke baad publish hogi.',
    property,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/properties  → apni saari properties (deleted chhod ke)
// Optional filter: ?status=APPROVED / PENDING / DRAFT / REJECTED / DELETED
// ─────────────────────────────────────────────────────────────────────────────
export const getMyProperties = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { status } = req.query

  const where: Prisma.PropertyWhereInput = { sellerId }
  if (status) where.status = status as PropertyStatus
  else where.status = { not: 'DELETED' } // default: deleted mat dikhao

  const properties = await prisma.property.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  res.json({ success: true, total: properties.length, properties })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/properties/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getSingleProperty = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  const property = await prisma.property.findUnique({ where: { id } })
  if (!property || property.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }
  res.json({ success: true, property })
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/seller/properties/:id  → update (status wapas PENDING)
// ─────────────────────────────────────────────────────────────────────────────
export const updateProperty = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  const existing = await prisma.property.findUnique({ where: { id } })
  if (!existing || existing.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }

  const {
    title, area, age, city, tehsil, address, latitude, longitude,
    propertyType, documents, images, videos,
  } = req.body
  const imgs: string[] = Array.isArray(images) ? images : existing.images
  const vids: string[] = Array.isArray(videos) ? videos : existing.videos

  // req.body already passed propertyUpdateSchema (validateBody, see routes),
  // so when `documents` is present every entry is a real { type, url } pair
  // (audit 2026-09-01: propertyUpdateSchema used to accept bare URL strings
  // here, silently dropping every document's type on the next edit). Only
  // re-run the composition check when documents were actually submitted —
  // an update that doesn't touch documents keeps the existing value as-is,
  // whatever shape it's already in (including a pre-migration legacy row).
  let docs: PropertyDocumentInput[] | Prisma.JsonValue = existing.documents
  let docCount = Array.isArray(existing.documents) ? existing.documents.length : 0
  if (Array.isArray(documents)) {
    const incoming = documents as PropertyDocumentInput[]
    const docTypeError = findDocumentTypeErrors(incoming)
    if (docTypeError) {
      res.status(400).json({ success: false, message: docTypeError })
      return
    }
    docs = incoming
    docCount = incoming.length
  }

  const updated = await prisma.property.update({
    where: { id },
    data: {
      title: title || existing.title,
      area: area ? String(area) : existing.area,
      age: age ?? existing.age,
      city: city ?? existing.city,
      tehsil: tehsil ?? existing.tehsil,
      address: address ?? existing.address,
      latitude: latitude ?? existing.latitude,
      longitude: longitude ?? existing.longitude,
      propertyType: propertyType || existing.propertyType,
      documents: docs as Prisma.InputJsonValue,
      images: imgs,
      videos: vids,
      health: calcHealth(docCount),
      status: 'PENDING', // update hone par dobara review
    },
  })

  res.json({ success: true, message: 'Property updated — dobara review me gayi.', property: updated })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/seller/properties/:id  → soft delete (status DELETED)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteProperty = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  const property = await prisma.property.findUnique({ where: { id } })
  if (!property || property.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }

  await prisma.property.update({ where: { id }, data: { status: 'DELETED' } })
  res.json({ success: true, message: 'Property Deleted me move ho gayi' })
}