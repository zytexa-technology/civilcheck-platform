import { Request, Response } from 'express'
import { Prisma, ListingStatus } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { triggerAlerts } from './alert.controller.js'
import { createNotification } from './notification.controller.js'

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Risk Badge Auto Calculator
// ─────────────────────────────────────────────────────────────────────────────
// Yeh function case aur loan ki details dekhke automatically
// GREEN / AMBER / RED badge assign karta hai
// Seller khud badge nahi choose karta — system decide karta hai
// ─────────────────────────────────────────────────────────────────────────────
function calculateRiskBadge(
  caseExists: boolean,
  caseStatus: string | null,
  loanDefault: boolean
): 'GREEN' | 'AMBER' | 'RED' {
  // Loan default hai → hamesha RED
  if (loanDefault) return 'RED'

  // Koi case nahi, koi loan nahi → GREEN (clean property)
  if (!caseExists) return 'GREEN'

  // Case hai — status ke hisaab se decide karo
  if (caseStatus === 'ACTIVE') return 'RED'   // Active case → danger
  if (caseStatus === 'STAYED') return 'RED'   // Stayed bhi risky hai
  if (caseStatus === 'DISPOSED') return 'AMBER' // Purana case — caution

  return 'AMBER' // Default — kuch uncertainty hai
}

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
    caseExists,
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
  if (!address || !propertyType || !city || !tehsil || caseExists === undefined || !price || !researchDate) {
    res.status(400).json({
      success: false,
      message: 'address, propertyType, city, tehsil, caseExists, price and researchDate are all required'
    })
    return
  }

  // Agar case exists hai toh case details bhi chahiye
  if (caseExists && (!caseNumber || !caseType || !caseStatus || !courtName)) {
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
      message: 'Price must be between Rs. 99 and Rs. 4999'
    })
    return
  }

  // Documents optional hain abhi — baad mein Cloudinary se add karenge
  // if (!documents || documents.length === 0) { ... }

  // Risk badge auto calculate karo
  const riskBadge = calculateRiskBadge(
    caseExists,
    caseStatus || null,
    loanDefault || false
  )

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
      riskBadge,           // System ne calculate kiya
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
    message: `Listing created. Risk badge: ${riskBadge}. An admin will review it within 24-48 hours.`,
    listing: {
      id: listing.id,
      address: listing.address,
      city: listing.city,
      riskBadge: listing.riskBadge,
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
    riskBadge: l.riskBadge,
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

  // Naya risk badge recalculate karo updated values se
  const newRiskBadge = calculateRiskBadge(
    existing.caseExists,
    caseStatus || existing.caseStatus,
    loanDefault !== undefined ? loanDefault : existing.loanDefault
  )

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
      riskBadge: newRiskBadge,
      status: 'PENDING_REVIEW',
    }
  })

  // Alert trigger karo — subscribers ko notify karo case status change ka
  await triggerAlerts(
    id,
    existing.caseStatus,     // purani status
    caseStatus || existing.caseStatus, // nayi status
    newRiskBadge
  )

  res.json({
    success: true,
    message: 'Listing updated! Admin dobara review karega.',
    newRiskBadge,
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