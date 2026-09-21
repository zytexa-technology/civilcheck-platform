import { Request, Response } from 'express'
import { Prisma, PropertyStatus } from '@prisma/client'
import { REQUIRED_PROPERTY_DOCUMENT_TYPES, type PropertyDocumentInput } from '@civilcheck/shared'
import prisma from '../lib/prisma.js'
import { applyClassificationUpdate, ClassificationError } from '../lib/propertyClassification.js'

// ─────────────────────────────────────────────────────────────────────────────
//  OWNER PROPERTY CONTROLLER
//  Property Owner apni property list karta hai. Listing (report-listing) se
//  alag hai — yeh owner ki apni property hai.
//  Sab routes sellerMiddleware ke peeche hain (har partner = seller record).
//
//  Business rule change (direct-publish) — Owner property LISTING and
//  property VERIFICATION are separate flows. Listing no longer waits on any
//  Admin/Super Admin approval: a submitted property is APPROVED (buyer-
//  visible) immediately. PROPERTY VERIFICATION is a distinct, unchanged flow
//  a Buyer opts into afterward (see verification.service.ts), still gated on
//  status === 'APPROVED' exactly as before. Admin/SuperAdmin still retain
//  suspend/delete/moderate ability (admin.controller.ts) — only the
//  pre-publish approval gate is removed.
// ─────────────────────────────────────────────────────────────────────────────

// HELPER — documents ki count se health score (0-100)
function calcHealth(docCount: number): number {
  return Math.min(95, 30 + docCount * 8)
}

// Ownership Document rule (Owner Add Property): the submitted documents must contain exactly
// one OWNERSHIP_DOCUMENT with a real https URL. Other document types (legacy Sale Deed /
// Electricity Bill / Aadhaar / Registry … sent by older clients) are accepted as extra
// evidence and never required. Enforced here, not just in the UI.
const OWNERSHIP_DOCUMENT_REQUIRED = 'Ownership document is required.'
function findDocumentTypeErrors(docs: PropertyDocumentInput[]): string | null {
  const ownership = docs.filter((d) => d.type === 'OWNERSHIP_DOCUMENT')
  if (ownership.length === 0) return OWNERSHIP_DOCUMENT_REQUIRED
  if (ownership.length > 1) return 'Only one ownership document can be attached.'
  if (!/^https:\/\//i.test(ownership[0].url)) return 'The ownership document upload is invalid — please upload it again.'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/seller/properties  → nayi property, directly APPROVED (no admin
// approval gate for Owner listing — see file header)
// ─────────────────────────────────────────────────────────────────────────────
export const createProperty = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const {
    title, area, age, city, tehsil, address, latitude, longitude,
    propertyType, documents, images, videos, propertyStatus, disputeType,
  } = req.body

  if (!title || !area) {
    res.status(400).json({ success: false, message: 'title and area are both required' })
    return
  }

  // Clear / Disputed classification is mandatory (also enforced by
  // propertyCreateSchema and a DB CHECK constraint). The buyer's Red/Green
  // indicator is derived from it — never supplied by the client.
  if (!propertyStatus) {
    res.status(400).json({ success: false, message: 'propertyStatus (CLEAR or DISPUTED) is required' })
    return
  }
  let classification
  try {
    classification = applyClassificationUpdate({ propertyStatus: null, disputeType: null }, { propertyStatus, disputeType })
  } catch (e) {
    if (e instanceof ClassificationError) {
      res.status(400).json({ success: false, message: e.message })
      return
    }
    throw e
  }

  // Property Discovery flow (Step 2) — propertyCreateSchema (validateBody,
  // see routes) already enforces this, but checked directly too, matching
  // this function's existing title/area pattern: every buyer-visible
  // property must have a real map pin from the moment it's created.
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.status(400).json({ success: false, message: 'latitude and longitude are both required' })
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
      propertyStatus: classification.propertyStatus,
      disputeType: classification.disputeType,
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
      // Direct-publish business rule — Owner listing no longer waits on
      // admin approval; the property is buyer-visible immediately
      // (buyer-facing reads filter status === 'APPROVED', see
      // ownerProperty.controller.ts / property.controller.ts). Property
      // VERIFICATION remains a separate, unchanged, opt-in Buyer flow.
      status: 'APPROVED',
    },
  })

  res.status(201).json({
    success: true,
    message: 'Property submit ho gayi — Users ko turant dikh rahi hai.',
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
// PUT /api/seller/properties/:id  → update (status untouched — direct-publish
// means an edit no longer forces re-review / drops buyer visibility)
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
    propertyType, documents, images, videos, propertyStatus, disputeType, ownershipDocumentUrl,
  } = req.body
  let classification
  try {
    classification = applyClassificationUpdate(
      { propertyStatus: existing.propertyStatus, disputeType: existing.disputeType },
      { propertyStatus, disputeType }
    )
  } catch (e) {
    if (e instanceof ClassificationError) {
      res.status(400).json({ success: false, message: e.message })
      return
    }
    throw e
  }
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

  // Replace / add the Ownership Document only — every other stored document is kept as-is
  // (whatever shape, including pre-migration plain-URL rows).
  if (ownershipDocumentUrl) {
    if (!/^https:\/\//i.test(ownershipDocumentUrl)) {
      res.status(400).json({ success: false, message: 'The ownership document upload is invalid — please upload it again.' })
      return
    }
    const current = Array.isArray(docs) ? (docs as Prisma.JsonArray) : []
    const kept = current.filter((d) => !(d && typeof d === 'object' && !Array.isArray(d) && (d as { type?: unknown }).type === 'OWNERSHIP_DOCUMENT'))
    docs = [...kept, { type: 'OWNERSHIP_DOCUMENT', url: ownershipDocumentUrl }] as Prisma.JsonArray
    docCount = docs.length
  }

  const updated = await prisma.property.update({
    where: { id },
    data: {
      propertyStatus: classification.propertyStatus,
      disputeType: classification.disputeType,
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
      // Direct-publish business rule — status is deliberately NOT reset here.
      // An edit no longer requires re-review; a SUSPENDED/DELETED property
      // (admin moderation) also correctly stays that way rather than an edit
      // silently reinstating it.
    },
  })

  res.json({ success: true, message: 'Property updated.', property: updated })
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