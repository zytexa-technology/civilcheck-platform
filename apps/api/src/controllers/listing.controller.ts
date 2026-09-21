import { Request, Response } from 'express'
import { Prisma, ListingStatus } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { triggerAlerts } from './alert.controller.js'
import { createNotification } from './notification.controller.js'
import { applyClassificationUpdate, ClassificationError } from '../lib/propertyClassification.js'

// Risk badge is DERIVED from the seller-declared propertyStatus (see
// lib/propertyClassification.ts): CLEAR => GREEN, DISPUTED => RED. The old
// case/loan-based Green/Amber/Red calculator (which produced the yellow
// "caution" state) is gone; the client never sends a colour.

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/seller/listings
// ─────────────────────────────────────────────────────────────────────────────
// Seller naya property listing create karta hai
// Status PENDING_REVIEW hogi — admin approve karega tab APPROVED hogi
// Risk badge automatically calculate hoga
// ─────────────────────────────────────────────────────────────────────────────
export const createListing = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id

  // Seller ka KYC approved hai ya nahi check karo
  // Bina KYC ke listing nahi bana sakte
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } })
  if (seller?.kycStatus !== 'APPROVED') {
    res.status(403).json({
      success: false,
      message: 'You can only create listings once your KYC is approved'
    })
    return
  }

  const {
    address,
    surveyNumber,
    khasraNumber,
    propertyType,
    city,
    tehsil,
    propertyStatus, // CLEAR | DISPUTED — required; drives the Red/Green indicator
    disputeType,    // CIVIL | CRIMINAL | OTHER — required iff DISPUTED
    caseExists: caseExistsInput,
    caseNumber,
    caseType,
    caseStatus,
    courtName,
    partiesInvolved,
    loanDefault,
    lenderName,
    latitude,      // geospatial pin (PDF 7.3)
    longitude,
    price,
    sellerNotes,
    documents,     // Array of Cloudinary URLs (non-media documents)
    images,        // Array of Cloudinary image URLs (Phase 2 — Property System)
    videos,        // Array of Cloudinary video URLs (Phase 2 — Property System)
    researchDate,
  } = req.body

  // Zaroori fields check karo
  if (!address || !propertyType || !city || !tehsil || !propertyStatus || !price || !researchDate) {
    res.status(400).json({
      success: false,
      message: 'address, propertyType, city, tehsil, propertyStatus, price and researchDate are all required'
    })
    return
  }
  // Same rule as listingCreateSchema, re-checked so it holds for any caller.
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
  // Legacy case flag: kept for stored data / reports, defaulting from the classification.
  const caseExists: boolean = caseExistsInput ?? classification.propertyStatus === 'DISPUTED'

  // Property Discovery flow (Step 2) — listingCreateSchema (validateBody,
  // see routes) already enforces this, but checked directly too, matching
  // this function's existing pattern: every buyer-visible Listing must have
  // a real map pin from the moment it's created.
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.status(400).json({
      success: false,
      message: 'latitude and longitude are both required'
    })
    return
  }

  // Agar case exists hai toh case details bhi chahiye
  // Only when the caller explicitly declares a case (a plain Disputed listing does not need case details).
  if (caseExistsInput && (!caseNumber || !caseType || !caseStatus || !courtName)) {
    res.status(400).json({
      success: false,
      message: 'When a case exists, caseNumber, caseType, caseStatus and courtName are also required'
    })
    return
  }

  // Price range validation — Rs. 99 se Rs. 4999 tak
  if (price < 99 || price > 4999) {
    res.status(400).json({
      success: false,
      message: 'Price must be between ₹99 and ₹4,999'
    })
    return
  }

  // Documents optional hain abhi — baad mein Cloudinary se add karenge
  // if (!documents || documents.length === 0) { ... }


  // 10% Spot-Check Auto-Flagging (PDF 5.3) — rolled once per listing at
  // creation, routes into the admin QC queue. Not returned to the seller.
  const flaggedForSpotCheck = Math.random() < 0.1

  // Listing create karo
  const listing = await prisma.listing.create({
    data: {
      sellerId,
      // Snapshot of the creating seller's role — see schema.prisma comment
      // on Listing.uploaderRole. Always EXPERT today (route-gated), but never
      // hardcoded — reads from the actual authenticated seller.
      uploaderRole: seller.partnerRole!,
      flaggedForSpotCheck,
      address,
      surveyNumber: surveyNumber || null,
      khasraNumber: khasraNumber || null,
      propertyType,
      city,
      tehsil,
      caseExists,
      caseNumber: caseNumber || null,
      caseType: caseType || null,
      caseStatus: caseStatus || null,
      courtName: courtName || null,
      partiesInvolved: partiesInvolved || null,
      loanDefault: loanDefault || false,
      lenderName: lenderName || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      propertyStatus: classification.propertyStatus,
      disputeType: classification.disputeType,
      price,
      sellerNotes: sellerNotes || null,
      documents: documents || [],
      images: images || [],
      videos: videos || [],
      researchDate: new Date(researchDate),
      status: 'PENDING_REVIEW', // Admin approve karega
    }
  })

  // Seller ko notification bhejo (fail ho to bhi listing create ho chuki hai)
  await createNotification(sellerId, {
    type: 'approval',
    title: 'Listing submitted',
    body: `"${listing.address}" has been submitted for review. An admin will approve it within 24-48 hours.`,
  })

  res.status(201).json({
    success: true,
    message: `Listing created (${classification.propertyStatus === 'CLEAR' ? 'Clear property' : 'Disputed property'}). An admin will review it within 24-48 hours.`,
    listing: {
      id: listing.id,
      address: listing.address,
      city: listing.city,
      propertyStatus: listing.propertyStatus,
      disputeType: listing.disputeType,
      uploaderRole: listing.uploaderRole,
      images: listing.images,
      videos: listing.videos,
      status: listing.status,
      price: listing.price,
      createdAt: listing.createdAt,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/listings
// ─────────────────────────────────────────────────────────────────────────────
// Seller ki apni saari listings — with views, purchases count, status
// Optional filter: ?status=APPROVED ya ?status=PENDING_REVIEW
// ─────────────────────────────────────────────────────────────────────────────
export const getMyListings = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { status } = req.query

  // Filter build karo
  const where: Prisma.ListingWhereInput = { sellerId }
  if (status) where.status = status as ListingStatus

  const listings = await prisma.listing.findMany({
    where,
    include: {
      // Har listing ke kitne purchases hue — seller ka income source
      _count: {
        select: { purchases: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Response format clean karo
  const formatted = listings.map(l => ({
    id: l.id,
    address: l.address,
    city: l.city,
    tehsil: l.tehsil,
    propertyType: l.propertyType,
    propertyStatus: l.propertyStatus,
    disputeType: l.disputeType,
    uploaderRole: l.uploaderRole,
    images: l.images,
    videos: l.videos,
    status: l.status,
    price: l.price,
    views: l.views,
    totalSales: l._count.purchases,  // Kitni baar yeh report biki
    caseExists: l.caseExists,
    researchDate: l.researchDate,
    createdAt: l.createdAt,
  }))

  res.json({
    success: true,
    total: listings.length,
    listings: formatted
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/listings/:id
// ─────────────────────────────────────────────────────────────────────────────
// Single listing ka poora detail — seller sirf apni listing dekh sakta hai
// ─────────────────────────────────────────────────────────────────────────────
export const getSingleListing = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      _count: { select: { purchases: true, alerts: true } }
    }
  })

  // Listing exist nahi karti ya dusre seller ki hai
  if (!listing || listing.sellerId !== sellerId) {
    res.status(404).json({
      success: false,
      message: 'Listing not found, or it does not belong to you'
    })
    return
  }

  res.json({
    success: true,
    listing: {
      ...listing,
      totalSales: listing._count.purchases,
      totalAlerts: listing._count.alerts,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/seller/listings/:id
// ─────────────────────────────────────────────────────────────────────────────
// Listing update karo — mostly case status change ke liye
// Example: ACTIVE → DISPOSED (case khatam ho gaya)
// Update ke baad status wapas PENDING_REVIEW ho jaati hai — admin recheck karega
// ─────────────────────────────────────────────────────────────────────────────
export const updateListing = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  // Pehle check karo ki yeh listing is seller ki hai
  const existing = await prisma.listing.findUnique({ where: { id } })

  if (!existing || existing.sellerId !== sellerId) {
    res.status(404).json({
      success: false,
      message: 'Listing not found'
    })
    return
  }

  const {
    propertyStatus,
    disputeType,
    caseStatus,
    caseNumber,
    courtName,
    partiesInvolved,
    loanDefault,
    lenderName,
    sellerNotes,
    documents,
    images,
    videos,
    price,
  } = req.body

  // Clear <-> Disputed changes. CLEAR clears any old dispute type; DISPUTED
  // requires one. Legacy (unclassified) listings keep their stored badge
  // until a classification is supplied.
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

  const updated = await prisma.listing.update({
    where: { id },
    data: {
      caseStatus: caseStatus || existing.caseStatus,
      caseNumber: caseNumber || existing.caseNumber,
      courtName: courtName || existing.courtName,
      partiesInvolved: partiesInvolved || existing.partiesInvolved,
      loanDefault: loanDefault !== undefined ? loanDefault : existing.loanDefault,
      lenderName: lenderName || existing.lenderName,
      sellerNotes: sellerNotes || existing.sellerNotes,
      documents: documents || existing.documents,
      images: images || existing.images,
      videos: videos || existing.videos,
      price: price || existing.price,
      propertyStatus: classification.propertyStatus,
      disputeType: classification.disputeType,
      status: 'PENDING_REVIEW',
    }
  })

  // Alert trigger karo — subscribers ko notify karo case status change ka
  await triggerAlerts(
    id,
    existing.caseStatus,     // purani status
    caseStatus || existing.caseStatus, // nayi status
    classification.propertyStatus
  )

  res.json({
    success: true,
    message: 'Listing updated! Admin dobara review karega.',
    propertyStatus: classification.propertyStatus,
    disputeType: classification.disputeType,
    listing: updated
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/seller/listings/:id
// ─────────────────────────────────────────────────────────────────────────────
// Listing delete karo — sirf PENDING_REVIEW ya REJECTED listings delete ho sakti hain
// APPROVED listing delete nahi kar sakte — buyers ne purchase kiya hoga
// ─────────────────────────────────────────────────────────────────────────────
export const deleteListing = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  const listing = await prisma.listing.findUnique({ where: { id } })

  if (!listing || listing.sellerId !== sellerId) {
    res.status(404).json({
      success: false,
      message: 'Listing not found'
    })
    return
  }

  // APPROVED listing delete nahi kar sakte
  if (listing.status === 'APPROVED') {
    res.status(400).json({
      success: false,
      message: 'An approved listing cannot be deleted. Ask an admin to unpublish it first.'
    })
    return
  }

  await prisma.listing.delete({ where: { id } })

  res.json({
    success: true,
    message: 'Listing deleted successfully'
  })
}