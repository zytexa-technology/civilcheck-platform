import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import {
  Prisma,
  KycStatus,
  Badge,
  ListingStatus,
  PropertyStatus,
  RefundStatus,
  FlagStatus,
  AdminRole,
  PartnerRole,
  VerificationRequestStatus,
  ClaimStatus,
} from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import * as kycService from '../services/kyc.service.js'
import { generateSignedDownloadUrl, parseCloudinaryUrl } from '../lib/cloudinary.js'
import { notifySeller, notifyBuyerAlert } from '../services/notification.service.js'
import { getSubscriptionMetrics } from '../services/analytics.service.js'
import { AuditAction, clientIp, recordAudit } from '../services/audit.service.js'
import { executeRefund } from '../services/refund.service.js'
import { applyStrikeEscalation } from '../services/penalty.service.js'
import { getPlatformSettings, updatePlatformSettings } from '../services/platformSettings.service.js'
import { VerificationError, adminForceCancelVerificationRequest } from '../services/verification.service.js'
import * as rewardService from '../services/reward.service.js'
import * as payoutService from '../services/payout.service.js'
import { runReconciliationSweep } from '../services/reconciliation.service.js'
import { round2 } from '../services/payment.service.js'
import * as supportService from '../services/support.service.js'

// KYC decisions run inside a transaction and the audit row joins it, so the
// action and its evidence commit together. See kyc.service.ts.
const auditInTx = (req: Request, entry: Parameters<typeof recordAudit>[1]) =>
  (tx: Prisma.TransactionClient) => recordAudit(req, entry, tx)

// ─────────────────────────────────────────────────────────────────────────────
// SELLER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/sellers
// ─────────────────────────────────────────────────────────────────────────────
// Saare sellers list karo — filter by kycStatus, badge, city
// Admin dekh sakta hai kaun pending hai, kaun approved, kaun suspended
// ─────────────────────────────────────────────────────────────────────────────
export const getAllSellers = async (req: Request, res: Response) => {
  // partnerRole filter (Phase 4A) — lets the Super Admin view Owners,
  // Reporters and Experts as separate lists ("view partners, view partner
  // roles"). includeDeleted opts back into soft-deleted partner rows, which
  // are excluded by default.
  const { kycStatus, badge, partnerRole, includeDeleted, page = '1', limit = '20' } = req.query

  const where: Prisma.SellerWhereInput = {}
  if (kycStatus) where.kycStatus = kycStatus as KycStatus
  if (badge) where.badge = badge as Badge
  if (partnerRole) where.partnerRole = partnerRole as PartnerRole
  if (includeDeleted !== 'true') where.deletedAt = null

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const skip = (pageNum - 1) * limitNum

  const [sellers, total] = await Promise.all([
    prisma.seller.findMany({
      where,
      include: {
        _count: {
          select: {
            listings: true,  // Kitni listings hain
            properties: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.seller.count({ where })
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    sellers: sellers.map(s => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email,
      profession: s.profession,
      partnerRole: s.partnerRole,
      badge: s.badge,
      kycStatus: s.kycStatus,
      aadhaarVerified: s.aadhaarVerified, // legacy — no longer set by anything, see schema.prisma
      identityVerificationStatus: s.identityVerificationStatus,
      certificateUploaded: !!s.barCouncilDoc,
      accuracyScore: s.accuracyScore,
      totalEarnings: s.totalEarnings,
      totalListings: s._count.listings,
      totalProperties: s._count.properties,
      deletedAt: s.deletedAt,
      createdAt: s.createdAt,
    }))
  })
}

// DELETE /api/admin/sellers/:id — soft delete (Phase 4A). See
// schema.prisma's Seller.deletedAt comment for why this is soft, not hard,
// unlike deleteAdmin. Blocks login (sellerMiddleware checks deletedAt) and
// is excluded from getAllSellers by default; every row the partner ever
// created (listings, properties, reward ledger, reviews) stays intact.
export const deleteSeller = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const seller = await prisma.seller.findUnique({ where: { id } })
  if (!seller) {
    res.status(404).json({ success: false, message: 'Seller not found' })
    return
  }
  if (seller.deletedAt) {
    res.status(400).json({ success: false, message: 'This partner account is already deleted' })
    return
  }

  await prisma.seller.update({ where: { id }, data: { deletedAt: new Date() } })

  await recordAudit(req, {
    action: AuditAction.PARTNER_DELETE,
    target: `Seller:${id}`,
    details: `Deleted partner "${seller.name}" (${seller.email ?? seller.phone}, role: ${seller.partnerRole ?? 'none'})`,
  })

  res.json({ success: true, message: 'Partner account deleted' })
}

// GET /api/admin/sellers/:id
// ─────────────────────────────────────────────────────────────────────────────
// Single seller ka full detail — KYC documents bhi
// ─────────────────────────────────────────────────────────────────────────────
export const getSellerById = async (req: Request, res: Response) => {
  const id = req.params.id as string

  // Explicit `select` (Phase 4B), not a bare `include` — the previous
  // version returned every scalar field via Prisma's include-implies-all-
  // scalars default, including passwordHash and the seller's full bank
  // account number/IFSC to any admin role (VIEWER included). Bank details
  // are masked to a last-4 digit hint here, same convention
  // kyc.service.ts's getApplication already uses; passwordHash is never
  // selected at all — an admin never needs it and it should never leave
  // the server regardless of who's asking.
  const seller = await prisma.seller.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      city: true,
      state: true,
      profession: true,
      partnerRole: true,
      badge: true,
      kycStatus: true,
      aadhaarVerified: true, // legacy — no longer set by anything, see schema.prisma
      identityDocumentUrl: true,
      identityVerificationStatus: true,
      identityDocumentRejectionReason: true,
      identityDocumentUploadedAt: true,
      identityDocumentReviewedAt: true,
      barCouncilDoc: true,
      selfieUrl: true,
      accuracyScore: true,
      totalEarnings: true,
      strikeCount: true,
      avgRating: true,
      reviewCount: true,
      deletedAt: true,
      createdAt: true,
      payoutEligibilityStatus: true,
      razorpayLinkedAccountId: true,
      bankAccount: true, // masked below before the response goes out
      ifsc: true,
      pan: true,
      listings: {
        select: {
          id: true,
          address: true,
          city: true,
          status: true,
          riskBadge: true,
          price: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      _count: { select: { listings: true } },
    },
  })

  if (!seller) {
    res.status(404).json({ success: false, message: 'Seller not found' })
    return
  }

  const { bankAccount, ifsc, pan, ...rest } = seller
  res.json({
    success: true,
    seller: {
      ...rest,
      banking: {
        bankAccountLast4: bankAccount ? bankAccount.slice(-4) : null,
        ifsc: ifsc ?? null,
        panOnFile: Boolean(pan),
      },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// KYC APPROVAL PIPELINE (PDF 5.2)
//
// State transitions live in kyc.service.ts. These handlers only translate a
// service result into HTTP and report which notification channels reached the
// seller — the admin should be able to see that the SMS went out (or that it
// was only logged because no key is configured) without reading the server log.
// ─────────────────────────────────────────────────────────────────────────────

type DeliveryLike = { channel: string; status: string }
const deliverySummary = (results: DeliveryLike[] = []) =>
  Object.fromEntries(results.map((r) => [r.channel, r.status]))

const kycFailureStatus = (code: kycService.KycFailureCode) => (code === 'NOT_FOUND' ? 404 : 400)

// GET /api/admin/kyc/pending
// ─────────────────────────────────────────────────────────────────────────────
// The review queue: every PENDING application with its certificate, selfie and
// Aadhaar flag exposed, oldest first.
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingKycApplications = async (req: Request, res: Response) => {
  const { page = '1', limit = '20' } = req.query

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const result = await kycService.listPendingApplications(pageNum, limitNum)
  res.json({ success: true, ...result })
}

// GET /api/admin/kyc/:id
// ─────────────────────────────────────────────────────────────────────────────
// One application in full — documents, compliance flags, payout readiness.
// ─────────────────────────────────────────────────────────────────────────────
export const getKycApplication = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const application = await kycService.getApplication(id)

  if (!application) {
    res.status(404).json({ success: false, message: 'Seller not found' })
    return
  }

  res.json({ success: true, application })
}

// GET /api/admin/sellers/:id/kyc/documents/:field/signed-url
// ─────────────────────────────────────────────────────────────────────────────
// KYC document security hardening (admin side) — mints a fresh, short-lived
// signed URL for a seller's certificate/selfie/identity-document during
// review. adminMiddleware alone gates this, same as the existing
// GET /kyc/pending and GET /kyc/:id above — no additional role restriction,
// matching current admin KYC-view access exactly. :id is the seller being
// reviewed (legitimate cross-seller admin access, unlike the seller-side
// endpoint which only ever resolves its own id from the JWT).
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_KYC_DOCUMENT_FIELDS = {
  certificate: 'barCouncilDoc',
  selfie: 'selfieUrl',
  'identity-document': 'identityDocumentUrl',
} as const
type AdminKycDocumentField = keyof typeof ADMIN_KYC_DOCUMENT_FIELDS

const ADMIN_KYC_SIGNED_URL_TTL_SECONDS = 300

export const getSellerKycDocumentSignedUrl = async (req: Request, res: Response) => {
  const sellerId = req.params.id as string
  const fieldParam = req.params.field as string

  if (!Object.prototype.hasOwnProperty.call(ADMIN_KYC_DOCUMENT_FIELDS, fieldParam)) {
    res.status(400).json({
      success: false,
      message: `field must be one of: ${Object.keys(ADMIN_KYC_DOCUMENT_FIELDS).join(', ')}`,
    })
    return
  }
  const column = ADMIN_KYC_DOCUMENT_FIELDS[fieldParam as AdminKycDocumentField]

  // Selecting a fixed, literal-keyed object (rather than `{ [column]: true }`)
  // keeps Prisma's select typing precise; the dynamic pick happens afterward
  // on a plain, already-narrow object.
  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: { barCouncilDoc: true, selfieUrl: true, identityDocumentUrl: true },
  })
  if (!seller) {
    res.status(404).json({ success: false, message: 'Seller not found' })
    return
  }
  const storedUrl = seller[column]

  if (!storedUrl) {
    res.status(404).json({ success: false, message: 'No document has been uploaded for this field yet' })
    return
  }

  const parsed = parseCloudinaryUrl(storedUrl)
  if (!parsed) {
    res.json({ success: true, url: storedUrl, mock: true })
    return
  }

  const signedUrl = generateSignedDownloadUrl({
    publicId: parsed.publicId,
    format: parsed.format,
    resourceType: parsed.resourceType,
    expiresInSeconds: ADMIN_KYC_SIGNED_URL_TTL_SECONDS,
  })

  if (!signedUrl) {
    res.json({ success: true, url: storedUrl, mock: true })
    return
  }

  res.json({ success: true, url: signedUrl, expiresInSeconds: ADMIN_KYC_SIGNED_URL_TTL_SECONDS })
}

// POST /api/admin/sellers/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
// Seller KYC approve karo — ab woh listings create kar sakta hai.
// Email + SMS + in-app notification automatically jaate hain.
// ─────────────────────────────────────────────────────────────────────────────
export const approveSeller = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const result = await kycService.approveSeller(
    id,
    auditInTx(req, {
      action: AuditAction.SELLER_APPROVE,
      target: `Seller:${id}`,
      details: 'KYC approved',
    })
  )

  if (!result.ok) {
    res.status(kycFailureStatus(result.code)).json({ success: false, message: result.message })
    return
  }

  res.json({
    success: true,
    message: `${result.seller.name}'s KYC has been approved. The seller can now create listings.`,
    notifications: deliverySummary(result.delivery),
  })
}

// POST /api/admin/sellers/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
// Seller KYC reject karo — reason seller ko verbatim bheja jaata hai.
// PENDING applications only: ek APPROVED seller ko hataane ke liye /suspend
// use karo, warna uski live listings publish hi rehti hain.
// ─────────────────────────────────────────────────────────────────────────────
export const rejectSeller = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { reason } = req.body as { reason: string }

  const result = await kycService.rejectSeller(
    id,
    reason,
    auditInTx(req, {
      action: AuditAction.SELLER_REJECT,
      target: `Seller:${id}`,
      details: `KYC rejected — reason: ${reason}`,
    })
  )

  if (!result.ok) {
    res.status(kycFailureStatus(result.code)).json({ success: false, message: result.message })
    return
  }

  res.json({
    success: true,
    message: `${result.seller.name}'s KYC has been rejected.`,
    reason,
    notifications: deliverySummary(result.delivery),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY DOCUMENT VERIFICATION (manual review — replaces DigiLocker OAuth)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/sellers/:id/identity-document/approve
export const approveIdentityDocument = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const result = await kycService.approveIdentityDocument(
    id,
    req.admin!.id,
    auditInTx(req, {
      action: AuditAction.SELLER_IDENTITY_DOCUMENT_APPROVE,
      target: `Seller:${id}`,
      details: 'Identity document approved',
    })
  )

  if (!result.ok) {
    res.status(kycFailureStatus(result.code)).json({ success: false, message: result.message })
    return
  }

  res.json({
    success: true,
    message: `${result.seller.name}'s identity document has been approved.`,
    notifications: deliverySummary(result.delivery),
  })
}

// POST /api/admin/sellers/:id/identity-document/reject
export const rejectIdentityDocument = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { reason } = req.body as { reason: string }

  const result = await kycService.rejectIdentityDocument(
    id,
    reason,
    req.admin!.id,
    auditInTx(req, {
      action: AuditAction.SELLER_IDENTITY_DOCUMENT_REJECT,
      target: `Seller:${id}`,
      details: `Identity document rejected — reason: ${reason}`,
    })
  )

  if (!result.ok) {
    res.status(kycFailureStatus(result.code)).json({ success: false, message: result.message })
    return
  }

  res.json({
    success: true,
    message: `${result.seller.name}'s identity document has been rejected.`,
    reason,
    notifications: deliverySummary(result.delivery),
  })
}

// POST /api/admin/sellers/:id/suspend
// ─────────────────────────────────────────────────────────────────────────────
// Seller suspend karo — saari APPROVED listings usi transaction mein
// unpublish ho jaati hain (PDF 5.2 cascade).
// ─────────────────────────────────────────────────────────────────────────────
export const suspendSeller = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { reason } = req.body as { reason: string }

  const result = await kycService.suspendSeller(
    id,
    reason,
    auditInTx(req, {
      action: AuditAction.SELLER_SUSPEND,
      target: `Seller:${id}`,
      details: `Suspended — reason: ${reason}`,
    })
  )

  if (!result.ok) {
    res.status(kycFailureStatus(result.code)).json({ success: false, message: result.message })
    return
  }

  res.json({
    success: true,
    message:
      `${result.seller.name} has been suspended. ` +
      `${result.unpublishedListings ?? 0} listing(s) have been unpublished.`,
    reason,
    unpublishedListings: result.unpublishedListings ?? 0,
    notifications: deliverySummary(result.delivery),
  })
}

// POST /api/admin/sellers/:id/unsuspend
// ─────────────────────────────────────────────────────────────────────────────
// Suspension hataao. Listings JAAN-BUJHKAR republish nahi hoti — har ek
// dobara review se guzregi.
// ─────────────────────────────────────────────────────────────────────────────
export const unsuspendSeller = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const result = await kycService.unsuspendSeller(
    id,
    auditInTx(req, {
      action: AuditAction.SELLER_UNSUSPEND,
      target: `Seller:${id}`,
      details: 'Suspension lifted',
    })
  )

  if (!result.ok) {
    res.status(kycFailureStatus(result.code)).json({ success: false, message: result.message })
    return
  }

  res.json({
    success: true,
    message:
      'Seller has been unsuspended. Listings unpublished during the suspension must be resubmitted for review.',
    notifications: deliverySummary(result.delivery),
  })
}

// PATCH /api/admin/sellers/:id/badge
// ─────────────────────────────────────────────────────────────────────────────
// Seller badge manually update karo — commission split isi par depend karta hai
// ─────────────────────────────────────────────────────────────────────────────
export const updateSellerBadge = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { badge } = req.body as { badge: string }

  const validBadges: Badge[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']
  if (!validBadges.includes(badge as Badge)) {
    res.status(400).json({
      success: false,
      message: `Badge must be one of: ${validBadges.join(', ')}`
    })
    return
  }

  const result = await kycService.updateBadge(
    id,
    badge as Badge,
    auditInTx(req, {
      action: AuditAction.SELLER_BADGE_UPDATE,
      target: `Seller:${id}`,
      details: `Badge set to ${badge}`,
    })
  )

  if (!result.ok) {
    res.status(kycFailureStatus(result.code)).json({ success: false, message: result.message })
    return
  }

  res.json({
    success: true,
    message: `${result.seller.name}'s badge changed from ${result.previousBadge} to ${badge}.`,
    notifications: deliverySummary(result.delivery),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTINGS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/listings
// ─────────────────────────────────────────────────────────────────────────────
// Saari listings — filter by status
// Default: PENDING_REVIEW dikhao — jo approve karne hain
// ─────────────────────────────────────────────────────────────────────────────
export const getAllListings = async (req: Request, res: Response) => {
  const { status = 'PENDING_REVIEW', city, flaggedForSpotCheck, page = '1', limit = '20' } = req.query

  const where: Prisma.ListingWhereInput = {}
  if (status) where.status = status as ListingStatus
  if (city) where.city = { contains: city as string, mode: 'insensitive' }
  // 10% Spot-Check Auto-Flagging (PDF 5.3) — GET /api/admin/listings?flaggedForSpotCheck=true
  // surfaces the auto-flagged 10% as their own QC queue.
  if (flaggedForSpotCheck !== undefined) where.flaggedForSpotCheck = flaggedForSpotCheck === 'true'

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const skip = (pageNum - 1) * limitNum

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        seller: {
          select: { name: true, phone: true, badge: true, kycStatus: true }
        },
        _count: { select: { purchases: true } }
      },
      orderBy: { createdAt: 'asc' }, // Purani listings pehle review karein
      skip,
      take: limitNum,
    }),
    prisma.listing.count({ where })
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    listings: listings.map(l => ({
      id: l.id,
      address: l.address,
      city: l.city,
      tehsil: l.tehsil,
      propertyType: l.propertyType,
      caseExists: l.caseExists,
      // QC review needs the actual case/loan details, not just the boolean —
      // these were missing here, so the admin review modal always showed
      // blank case data regardless of what the seller actually submitted.
      caseNumber: l.caseNumber,
      caseType: l.caseType,
      caseStatus: l.caseStatus,
      courtName: l.courtName,
      partiesInvolved: l.partiesInvolved,
      loanDefault: l.loanDefault,
      lenderName: l.lenderName,
      sellerNotes: l.sellerNotes,
      riskBadge: l.riskBadge,
      status: l.status,
      price: l.price,
      documents: l.documents,
      images: l.images,
      videos: l.videos,
      latitude: l.latitude,
      longitude: l.longitude,
      uploaderRole: l.uploaderRole,
      flaggedForSpotCheck: l.flaggedForSpotCheck,
      totalPurchases: l._count.purchases,
      seller: l.seller,
      createdAt: l.createdAt,
    }))
  })
}

// POST /api/admin/listings/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
// Listing approve karo — buyers ko dikhne lagegi
// ─────────────────────────────────────────────────────────────────────────────
export const approveListing = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { seller: { select: { id: true, name: true, phone: true, email: true } } }
  })

  if (!listing) {
    res.status(404).json({ success: false, message: 'Listing not found' })
    return
  }

  // Property Discovery flow (Step 2) — a Listing must never become
  // buyer-visible without a real map pin. New listings are already required
  // to submit latitude/longitude (listingCreateSchema), but this is the
  // actual publish gate — it also protects any pre-existing PENDING_REVIEW
  // row created before that requirement existed.
  if (listing.latitude == null || listing.longitude == null) {
    res.status(400).json({
      success: false,
      message: 'This listing has no latitude/longitude on file and cannot be approved until location data is supplied.',
    })
    return
  }

  // Guarded: two reviewers clicking Approve produce one winner, and an
  // already-APPROVED listing does not re-notify the seller.
  const { count } = await prisma.listing.updateMany({
    where: { id, status: { not: 'APPROVED' } },
    data: { status: 'APPROVED' }
  })

  if (count === 0) {
    res.status(400).json({ success: false, message: 'Listing already approved hai' })
    return
  }

  await recordAudit(req, {
    action: AuditAction.LISTING_APPROVE,
    target: `Listing:${id}`,
    details: `Approved "${listing.address}" (${listing.city}) — risk ${listing.riskBadge}`,
  })

  const delivery = await notifySeller(listing.seller, {
    type: 'approval',
    title: 'Listing approved ✅',
    body: `Your listing "${listing.address}" has been approved — buyers can now find it in search.`,
    email: {
      subject: 'Your CivilCheck listing is live',
      text:
        `Hi ${listing.seller.name},\n\nYour listing "${listing.address}, ${listing.city}" has been ` +
        `approved and is now visible to buyers.\n\n— Team CivilCheck`,
      html:
        `<p>Hi ${listing.seller.name},</p><p>Your listing "<strong>${listing.address}, ` +
        `${listing.city}</strong>" has been approved and is now visible to buyers.</p>` +
        `<p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: listing.seller.name, status: 'listing approved' } },
  })

  res.json({
    success: true,
    message: `Listing approved. Buyers can now find this property in search.`,
    address: listing.address,
    riskBadge: listing.riskBadge,
    notifications: deliverySummary(delivery),
  })
}

// POST /api/admin/listings/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
// Listing reject karo — reason bhi do
// Seller ko pata chalega kya galat tha
// ─────────────────────────────────────────────────────────────────────────────
export const rejectListing = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { reason } = req.body

  if (!reason) {
    res.status(400).json({ success: false, message: 'A rejection reason is required' })
    return
  }

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { seller: { select: { id: true, name: true, phone: true, email: true } } }
  })
  if (!listing) {
    res.status(404).json({ success: false, message: 'Listing not found' })
    return
  }

  const { count } = await prisma.listing.updateMany({
    where: { id, status: { not: 'REJECTED' } },
    data: { status: 'REJECTED' }
  })

  if (count === 0) {
    res.status(400).json({ success: false, message: 'Listing already rejected hai' })
    return
  }

  await recordAudit(req, {
    action: AuditAction.LISTING_REJECT,
    target: `Listing:${id}`,
    details: `Rejected "${listing.address}" — reason: ${reason}`,
  })

  const delivery = await notifySeller(listing.seller, {
    type: 'approval',
    title: 'Listing rejected',
    body: `Aapki listing "${listing.address}" reject ho gayi. Reason: ${reason}`,
    email: {
      subject: 'Your CivilCheck listing was not approved',
      text:
        `Hi ${listing.seller.name},\n\nYour listing "${listing.address}, ${listing.city}" was not ` +
        `approved.\n\nReason: ${reason}\n\nFix the issue and submit it again.\n\n— Team CivilCheck`,
      html:
        `<p>Hi ${listing.seller.name},</p><p>Your listing "<strong>${listing.address}, ` +
        `${listing.city}</strong>" was not approved.</p><p><strong>Reason:</strong> ${reason}</p>` +
        `<p>Fix the issue and submit it again.</p><p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: listing.seller.name, status: 'listing rejected', reason } },
  })

  res.json({
    success: true,
    message: 'Listing reject ho gayi.',
    reason,
    notifications: deliverySummary(delivery),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// OWNER PROPERTIES (self-verification, separate from Listings — no risk/case
// data, no spot-check; just a submit → review → approve/reject cycle)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/properties
// ─────────────────────────────────────────────────────────────────────────────
// Default: PENDING dikhao — jo review karni hain
// ─────────────────────────────────────────────────────────────────────────────
export const getAllProperties = async (req: Request, res: Response) => {
  const { status = 'PENDING', city, page = '1', limit = '20' } = req.query

  const where: Prisma.PropertyWhereInput = {}
  if (status) where.status = status as PropertyStatus
  if (city) where.city = { contains: city as string, mode: 'insensitive' }

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const skip = (pageNum - 1) * limitNum

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        seller: { select: { name: true, phone: true, badge: true, kycStatus: true } }
      },
      orderBy: { createdAt: 'asc' }, // Purani properties pehle review karein
      skip,
      take: limitNum,
    }),
    prisma.property.count({ where })
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    properties,
  })
}

// POST /api/admin/properties/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
export const approveProperty = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const property = await prisma.property.findUnique({
    where: { id },
    include: { seller: { select: { id: true, name: true, phone: true, email: true } } }
  })

  if (!property) {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }

  // Property Discovery flow (Step 2) — a Property must never become
  // buyer-visible without a real map pin. New properties are already
  // required to submit latitude/longitude (propertyCreateSchema), but this
  // is the actual publish gate — it also protects any pre-existing PENDING
  // row created before that requirement existed.
  if (property.latitude == null || property.longitude == null) {
    res.status(400).json({
      success: false,
      message: 'This property has no latitude/longitude on file and cannot be approved until location data is supplied.',
    })
    return
  }

  // Approval + audit row commit together. Approval only gates buyer
  // visibility (property.status === 'APPROVED') — it is deliberately NOT
  // presented to buyers as a CivilCheck "Verified" claim (see
  // ownerProperty.controller.ts's header comment), so nothing here credits
  // a reward or issues a badge as a side effect of this transition. Reporter
  // no longer creates Property rows at all (see ReporterPost) — the reward
  // credit that used to fire here for uploaderRole === 'REPORTER' has no
  // event left to attach to; a Reporter's only path to reward points today
  // is a SuperAdmin-issued manual adjustment (createRewardAdjustment below).
  //
  // The only valid transition into APPROVED is from PENDING — the atomic
  // `status: 'PENDING'` condition (not just "not already APPROVED") is what
  // actually enforces that: a DELETED/REJECTED/SUSPENDED property can never
  // slip through a race or a direct API call, because the UPDATE itself only
  // matches a currently-PENDING row (audit 2026-09-01, finding: approve/
  // reject previously only checked "not already at the target status").
  const count = await prisma.$transaction(async (tx) => {
    const { count } = await tx.property.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED' }
    })

    if (count > 0) {
      await recordAudit(req, {
        action: AuditAction.PROPERTY_APPROVE,
        target: `Property:${id}`,
        details: `Approved "${property.title}" (${property.city || '—'})`,
      }, tx)
    }

    return count
  })

  if (count === 0) {
    res.status(400).json({
      success: false,
      message: property.status === 'APPROVED'
        ? 'Property already approved hai'
        : `Only PENDING properties can be approved — this property is currently ${property.status}.`,
    })
    return
  }

  const delivery = await notifySeller(property.seller, {
    type: 'approval',
    title: 'Property approved ✅',
    body: `Your property "${property.title}" has been approved and is now published.`,
    email: {
      subject: 'Your CivilCheck property has been approved',
      text:
        `Hi ${property.seller.name},\n\nYour property "${property.title}" has been approved and ` +
        `is now published to buyers.\n\n— Team CivilCheck`,
      html:
        `<p>Hi ${property.seller.name},</p><p>Your property "<strong>${property.title}</strong>" ` +
        `has been approved and is now published to buyers.</p><p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: property.seller.name, status: 'property approved' } },
  })

  res.json({
    success: true,
    message: 'Property approved.',
    title: property.title,
    notifications: deliverySummary(delivery),
  })
}

// POST /api/admin/properties/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
export const rejectProperty = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { reason } = req.body

  if (!reason) {
    res.status(400).json({ success: false, message: 'A rejection reason is required' })
    return
  }

  const property = await prisma.property.findUnique({
    where: { id },
    include: { seller: { select: { id: true, name: true, phone: true, email: true } } }
  })
  if (!property) {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }

  // Same atomic-transition reasoning as approveProperty above — only a
  // currently-PENDING property can be rejected. An APPROVED property is not
  // directly rejectable (suspend is the supported path for pulling a
  // published listing back), and a DELETED/SUSPENDED one can never be
  // "rejected" into changing its status at all.
  const { count } = await prisma.property.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED' }
  })

  if (count === 0) {
    res.status(400).json({
      success: false,
      message: property.status === 'REJECTED'
        ? 'Property already rejected hai'
        : `Only PENDING properties can be rejected — this property is currently ${property.status}.`,
    })
    return
  }

  await recordAudit(req, {
    action: AuditAction.PROPERTY_REJECT,
    target: `Property:${id}`,
    details: `Rejected "${property.title}" — reason: ${reason}`,
  })

  const delivery = await notifySeller(property.seller, {
    type: 'approval',
    title: 'Property rejected',
    body: `Aapki property "${property.title}" reject ho gayi. Reason: ${reason}`,
    email: {
      subject: 'Your CivilCheck property was not approved',
      text:
        `Hi ${property.seller.name},\n\nYour property "${property.title}" was not approved.\n\n` +
        `Reason: ${reason}\n\nFix the issue and submit it again.\n\n— Team CivilCheck`,
      html:
        `<p>Hi ${property.seller.name},</p><p>Your property "<strong>${property.title}</strong>" ` +
        `was not approved.</p><p><strong>Reason:</strong> ${reason}</p>` +
        `<p>Fix the issue and submit it again.</p><p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: property.seller.name, status: 'property rejected', reason } },
  })

  res.json({
    success: true,
    message: 'Property reject ho gayi.',
    reason,
    notifications: deliverySummary(delivery),
  })
}

// POST /api/admin/properties/:id/suspend (Phase 4A)
// ─────────────────────────────────────────────────────────────────────────────
// Pulls a previously-APPROVED property back out of every buyer-facing read
// path (property.controller.ts's feed, ownerProperty.controller.ts —
// both already gate on status === 'APPROVED', so this value alone hides it,
// no read-path change needed). Reachable from any current status except
// DELETED.
export const suspendProperty = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { reason } = req.body

  if (!reason) {
    res.status(400).json({ success: false, message: 'A suspension reason is required' })
    return
  }

  const property = await prisma.property.findUnique({ where: { id } })
  if (!property) {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }
  if (property.status === 'DELETED' || property.status === 'SUSPENDED') {
    res.status(400).json({ success: false, message: `Property is already ${property.status}` })
    return
  }

  await prisma.property.update({ where: { id }, data: { status: 'SUSPENDED' } })

  await recordAudit(req, {
    action: AuditAction.PROPERTY_SUSPEND,
    target: `Property:${id}`,
    details: `Suspended "${property.title}" — reason: ${reason}`,
  })

  res.json({ success: true, message: 'Property suspended — no longer visible to buyers.' })
}

// POST /api/admin/properties/:id/unsuspend (Phase 4A)
// ─────────────────────────────────────────────────────────────────────────────
// Restores visibility. Goes back to PENDING, not straight back to APPROVED —
// same "must be reviewed again" discipline suspendSeller's listing-unpublish
// cascade already applies elsewhere, so a suspension is never silently
// reversible without a fresh admin look.
export const unsuspendProperty = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const { count } = await prisma.property.updateMany({
    where: { id, status: 'SUSPENDED' },
    data: { status: 'PENDING' },
  })

  if (count === 0) {
    res.status(400).json({ success: false, message: 'Property is not currently suspended' })
    return
  }

  await recordAudit(req, {
    action: AuditAction.PROPERTY_UNSUSPEND,
    target: `Property:${id}`,
    details: 'Suspension lifted — back in moderation review',
  })

  res.json({ success: true, message: 'Suspension lifted. Property is back in moderation review.' })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/properties/:id — SuperAdmin-only (route-gated `superOnly`)
// ─────────────────────────────────────────────────────────────────────────────
// Soft delete only (status: 'DELETED') — reuses the exact enum value and
// pattern property-owner.controller.ts already uses for a seller's own
// self-delete of their own property; this lets a SuperAdmin do the same for
// ANY property, regardless of owner.
export const deleteProperty = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const property = await prisma.property.findUnique({ where: { id } })
  if (!property) {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }
  if (property.status === 'DELETED') {
    res.status(400).json({ success: false, message: 'This property is already deleted' })
    return
  }

  await prisma.property.update({ where: { id }, data: { status: 'DELETED' } })

  await recordAudit(req, {
    action: AuditAction.SUPER_ADMIN_DELETE_PROPERTY,
    target: `Property:${id}`,
    details: `Deleted property "${property.title}" (${property.city ?? '—'}, seller ${property.sellerId})`,
  })

  res.json({ success: true, message: 'Property deleted' })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/reporter-posts — read open to all three admin roles, same
// tier as every other admin list endpoint. ReporterPost has no moderation
// state (no PENDING/APPROVED) — this is oversight visibility only.
// ─────────────────────────────────────────────────────────────────────────────
export const getAllReporterPosts = async (req: Request, res: Response) => {
  const { status, sellerId, page = '1', limit = '20' } = req.query

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20))

  const where: Prisma.ReporterPostWhereInput = {}
  if (status === 'REMOVED' || status === 'PUBLISHED') where.status = status
  if (typeof sellerId === 'string' && sellerId) where.sellerId = sellerId

  const [posts, total] = await Promise.all([
    prisma.reporterPost.findMany({
      where,
      include: { seller: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.reporterPost.count({ where }),
  ])

  res.json({ success: true, total, page: pageNum, totalPages: Math.max(1, Math.ceil(total / limitNum)), posts })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/reporter-posts/:id — SuperAdmin-only (route-gated
// `superOnly`). ReporterPost has no admin-approval step at all (see
// schema.prisma) — this is the only admin-side action against it. Soft
// delete only (status: 'REMOVED'), same convention as Property/Listing.
// ─────────────────────────────────────────────────────────────────────────────
export const deleteReporterPost = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const post = await prisma.reporterPost.findUnique({ where: { id } })
  if (!post) {
    res.status(404).json({ success: false, message: 'Post not found' })
    return
  }
  if (post.status === 'REMOVED') {
    res.status(400).json({ success: false, message: 'This post is already removed' })
    return
  }

  await prisma.reporterPost.update({ where: { id }, data: { status: 'REMOVED' } })

  await recordAudit(req, {
    action: AuditAction.SUPER_ADMIN_DELETE_REPORTER_POST,
    target: `ReporterPost:${id}`,
    details: `Removed reporter post ${id} (seller ${post.sellerId})`,
  })

  res.json({ success: true, message: 'Post removed' })
}

// POST /api/admin/listings/:id/spot-check
// ─────────────────────────────────────────────────────────────────────────────
// Quality control — admin verify karta hai ki information sahi hai
// FAIL hone par seller ki accuracy score giregi
// ─────────────────────────────────────────────────────────────────────────────
export const spotCheckListing = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { result, adminNote } = req.body // result: 'PASS' | 'FAIL'

  if (!result || !['PASS', 'FAIL'].includes(result)) {
    res.status(400).json({ success: false, message: 'result must be PASS or FAIL' })
    return
  }

  const listing = await prisma.listing.findUnique({
    where: { id }
  })

  if (!listing) {
    res.status(404).json({ success: false, message: 'Listing not found' })
    return
  }

  // Spot check record banao
  await prisma.spotCheck.create({
    data: {
      listingId: id,
      result,
      adminNote: adminNote || null,
    }
  })

  // Agar FAIL hua → seller ki accuracy score girao
  let strike: Awaited<ReturnType<typeof applyStrikeEscalation>> | null = null
  if (result === 'FAIL') {
    // Har failure par 10 points girate hain — atomic decrement (DB-level, race-safe)
    // Minimum 0 tak ja sakta hai
    await prisma.$transaction([
      // Accuracy score update karo
      prisma.seller.update({
        where: { id: listing.sellerId },
        data: { accuracyScore: { decrement: 10 } }
      }),
      // Listing remove karo
      prisma.listing.update({
        where: { id },
        data: { status: 'REJECTED' }
      }),
      // Floor 0 par — decrement se score negative ja sakta hai baar baar fail hone par
      prisma.seller.updateMany({
        where: { id: listing.sellerId, accuracyScore: { lt: 0 } },
        data: { accuracyScore: 0 }
      })
    ])

    // False Information Penalty System (PDF 10.4) — strikes 1-2 are a warning;
    // strike 3+ suspends the seller, fines Rs. 500, and auto-refunds this
    // listing's buyers. See penalty.service.ts.
    strike = await applyStrikeEscalation(listing.sellerId, id)

    if (strike.escalated) {
      await recordAudit(req, {
        action: AuditAction.SELLER_STRIKE_ESCALATION,
        target: `Seller:${listing.sellerId}`,
        details:
          `Strike ${strike.strikeCount} — suspended=${strike.suspended}, fine=Rs.500, ` +
          `refunds=${strike.refundsIssued}/${strike.refundsAttempted} (triggering listing ${id})`,
      })
    }
  }

  await recordAudit(req, {
    action: AuditAction.LISTING_SPOT_CHECK,
    target: `Listing:${id}`,
    details:
      result === 'FAIL'
        ? `Spot check FAIL — listing rejected, seller ${listing.sellerId} accuracy -10, strike ${strike?.strikeCount}. Note: ${adminNote || '—'}`
        : `Spot check PASS. Note: ${adminNote || '—'}`,
  })

  res.json({
    success: true,
    message: result === 'PASS'
      ? 'Spot check passed! Listing quality verified ✅'
      : strike?.escalated
        ? `Spot check FAILED! Strike ${strike.strikeCount}/3 reached — seller suspended, Rs. 500 fined, ${strike.refundsIssued} buyer(s) refunded.`
        : `Spot check FAILED! Listing removed, seller accuracy score updated. Warning strike ${strike?.strikeCount}/3.`,
    result,
    strike,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/listings/:id — SuperAdmin-only (route-gated `superOnly`)
// ─────────────────────────────────────────────────────────────────────────────
// Soft delete only (status: 'DELETED') — a hard delete is not possible today:
// Listing has purchases/paymentOrders/reviews/verificationRequests/etc. as
// required relations with no explicit onDelete in schema.prisma, so
// Postgres's default RESTRICT would reject a hard DELETE for any listing
// with real purchase history. This reuses the exact `DELETED` enum value
// added alongside PropertyStatus's precedent, not a new mechanism.
export const deleteListing = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const listing = await prisma.listing.findUnique({ where: { id } })
  if (!listing) {
    res.status(404).json({ success: false, message: 'Listing not found' })
    return
  }
  if (listing.status === 'DELETED') {
    res.status(400).json({ success: false, message: 'This listing is already deleted' })
    return
  }

  await prisma.listing.update({ where: { id }, data: { status: 'DELETED' } })

  await recordAudit(req, {
    action: AuditAction.SUPER_ADMIN_DELETE_LISTING,
    target: `Listing:${id}`,
    details: `Deleted listing "${listing.address}" (${listing.city}, seller ${listing.sellerId})`,
  })

  res.json({ success: true, message: 'Listing deleted' })
}

// ─────────────────────────────────────────────────────────────────────────────
// BUYER "REPORT OUTDATED" FLAGS (PDF 7.8)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/report-flags
// ─────────────────────────────────────────────────────────────────────────────
// Review queue for buyer-submitted flags. Default PENDING-only, same as the
// listing QC queue defaulting to PENDING_REVIEW.
// ─────────────────────────────────────────────────────────────────────────────
export const getReportFlags = async (req: Request, res: Response) => {
  const { status = 'PENDING', page = '1', limit = '20' } = req.query

  const where: Prisma.ReportFlagWhereInput = {}
  if (status) where.status = status as FlagStatus

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const skip = (pageNum - 1) * limitNum

  const [flags, total] = await Promise.all([
    prisma.reportFlag.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        listing: { select: { id: true, address: true, city: true, tehsil: true, status: true } },
      },
      orderBy: { createdAt: 'asc' }, // Purane flags pehle review karein
      skip,
      take: limitNum,
    }),
    prisma.reportFlag.count({ where }),
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    flags,
  })
}

// POST /api/admin/report-flags/:id/resolve
// ─────────────────────────────────────────────────────────────────────────────
// Admin confirms the buyer's flag was legitimate (report is in fact outdated
// — the actual listing correction happens through the normal seller update
// path, this just closes the flag out).
// ─────────────────────────────────────────────────────────────────────────────
export const resolveReportFlag = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { adminNote } = req.body as { adminNote?: string }

  const { count } = await prisma.reportFlag.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'RESOLVED', adminNote: adminNote || null },
  })

  if (count === 0) {
    res.status(400).json({ success: false, message: 'Only PENDING flags can be resolved' })
    return
  }

  await recordAudit(req, {
    action: AuditAction.REPORT_FLAG_RESOLVE,
    target: `ReportFlag:${id}`,
    details: `Resolved. Note: ${adminNote || '—'}`,
  })

  res.json({ success: true, message: 'Flag resolved.' })
}

// POST /api/admin/report-flags/:id/dismiss
// ─────────────────────────────────────────────────────────────────────────────
// Admin decides the flag wasn't warranted — the listing stays as-is.
// ─────────────────────────────────────────────────────────────────────────────
export const dismissReportFlag = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { adminNote } = req.body as { adminNote?: string }

  const { count } = await prisma.reportFlag.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'DISMISSED', adminNote: adminNote || null },
  })

  if (count === 0) {
    res.status(400).json({ success: false, message: 'Only PENDING flags can be dismissed' })
    return
  }

  await recordAudit(req, {
    action: AuditAction.REPORT_FLAG_DISMISS,
    target: `ReportFlag:${id}`,
    details: `Dismissed. Note: ${adminNote || '—'}`,
  })

  res.json({ success: true, message: 'Flag dismissed.' })
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/analytics/overview
// ─────────────────────────────────────────────────────────────────────────────
// Platform ka overall health — users, listings, revenue
// ─────────────────────────────────────────────────────────────────────────────
export const getAnalyticsOverview = async (req: Request, res: Response) => {

  // Sab kuch parallel mein fetch karo — fast response ke liye
  const [
    totalBuyers,
    totalSellers,
    approvedSellers,
    totalListings,
    approvedListings,
    pendingListings,
    totalPurchases,
    revenueData,
    pendingKyc,
    suspendedSellers,
    activeAlertSubs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.seller.count(),
    prisma.seller.count({ where: { kycStatus: 'APPROVED' } }),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: 'APPROVED' } }),
    prisma.listing.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.purchase.count(),
    // Total revenue — platform ka 40% cut
    prisma.purchase.aggregate({
      _sum: { platformCut: true, amountPaid: true }
    }),
    prisma.seller.count({ where: { kycStatus: 'PENDING' } }),
    prisma.seller.count({ where: { kycStatus: 'SUSPENDED' } }),
    prisma.alert.count({ where: { active: true } }),
  ])

  res.json({
    success: true,
    overview: {
      users: {
        totalBuyers,
        totalSellers,
        approvedSellers,
        // Counted directly instead of `total - approved`: that subtraction
        // lumped REJECTED and SUSPENDED sellers in with the review queue.
        pendingSellers: pendingKyc,
        suspendedSellers,
      },
      listings: {
        total: totalListings,
        approved: approvedListings,
        pendingReview: pendingListings,
      },
      revenue: {
        totalGMV: revenueData._sum.amountPaid || 0,         // Total transaction value
        platformRevenue: revenueData._sum.platformCut || 0, // Platform ka actual income
        totalTransactions: totalPurchases,
      },
      // Headline number for the alert dashboard (PDF 5.6); the full breakdown
      // lives at /analytics/subscriptions.
      subscriptions: {
        activeAlertSubscriptions: activeAlertSubs,
      }
    }
  })
}

// GET /api/admin/analytics/subscriptions
// ─────────────────────────────────────────────────────────────────────────────
// Alert subscription dashboard (PDF 5.6). Renewal rate and churn come back as
// null until Razorpay subscription records exist on Day 4 — see
// analytics.service.ts for why null and not zero.
// ─────────────────────────────────────────────────────────────────────────────
export const getSubscriptionAnalytics = async (_req: Request, res: Response) => {
  const metrics = await getSubscriptionMetrics()
  res.json({ success: true, subscriptions: metrics })
}

// GET /api/admin/analytics/funnel
// ─────────────────────────────────────────────────────────────────────────────
// Free check → Paid report conversion funnel
// Kitne log free check karte hain vs kitne pay karte hain
// ─────────────────────────────────────────────────────────────────────────────
export const getConversionFunnel = async (req: Request, res: Response) => {

  const [
    totalListings,    // Total approved listings = free checks possible
    totalPurchases,   // Kitne log actually pay karte hain
    totalAlerts,      // Kitne log alert subscribe karte hain
  ] = await Promise.all([
    prisma.listing.count({ where: { status: 'APPROVED' } }),
    prisma.purchase.count(),
    prisma.alert.count({ where: { active: true } }),
  ])

  // Conversion rate calculate karo
  const conversionRate = totalListings > 0
    ? ((totalPurchases / totalListings) * 100).toFixed(2)
    : '0'

  res.json({
    success: true,
    funnel: {
      step1_freeChecks: totalListings,         // Kitni properties check ho sakti hain
      step2_paidUnlocks: totalPurchases,       // Kitne log pay karte hain
      step3_alertSubscriptions: totalAlerts,   // Kitne log alert lete hain
      conversionRate: `${conversionRate}%`,    // Free → Paid conversion
    }
  })
}

// GET /api/admin/analytics/top-sellers
// ─────────────────────────────────────────────────────────────────────────────
// Sabse zyada kamaane wale sellers — leaderboard
// ─────────────────────────────────────────────────────────────────────────────
export const getTopSellers = async (req: Request, res: Response) => {
  const sellers = await prisma.seller.findMany({
    where: { kycStatus: 'APPROVED' },
    include: {
      _count: { select: { listings: true } }
    },
    orderBy: { totalEarnings: 'desc' },
    take: 10,
  })

  res.json({
    success: true,
    topSellers: sellers.map(s => ({
      id: s.id,
      name: s.name,
      profession: s.profession,
      badge: s.badge,
      totalEarnings: s.totalEarnings,
      accuracyScore: s.accuracyScore,
      totalListings: s._count.listings,
    }))
  })
}

// GET /api/admin/analytics/top-cities
// ─────────────────────────────────────────────────────────────────────────────
// Sabse zyada activity wale cities — expansion planning ke liye
// ─────────────────────────────────────────────────────────────────────────────
export const getTopCities = async (req: Request, res: Response) => {
  // City ke hisaab se listings group karo
  const cityData = await prisma.listing.groupBy({
    by: ['city'],
    where: { status: 'APPROVED' },
    _count: { id: true },
    _sum: { views: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  })

  res.json({
    success: true,
    topCities: cityData.map(c => ({
      city: c.city,
      totalListings: c._count.id,
      totalViews: c._sum.views || 0,
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/analytics/monthly-revenue
// Last 7 months ka revenue — Bar chart ke liye
// ─────────────────────────────────────────────────────────────────────────────
export const getMonthlyRevenue = async (req: Request, res: Response) => {
  const months = []
  const now = new Date()

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = new Date(date.getFullYear(), date.getMonth(), 1)
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)

    const result = await prisma.purchase.aggregate({
      where: {
        createdAt: { gte: start, lte: end }
      },
      _sum: { amountPaid: true }
    })

    months.push({
      month: date.toLocaleString('en-IN', { month: 'short' }),
      revenue: result._sum.amountPaid || 0,
    })
  }

  res.json({ success: true, data: months })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/analytics/risk-breakdown
// Listings ka risk badge breakdown — Pie chart ke liye
// ─────────────────────────────────────────────────────────────────────────────
export const getRiskBreakdown = async (req: Request, res: Response) => {
  const breakdown = await prisma.listing.groupBy({
    by: ['riskBadge'],
    where: { status: 'APPROVED' },
    _count: { id: true }
  })

  const total = breakdown.reduce((sum, b) => sum + b._count.id, 0)

  const result = ['RED', 'AMBER', 'GREEN'].map(badge => {
    const found = breakdown.find(b => b.riskBadge === badge)
    const count = found?._count.id || 0
    const pct = total > 0 ? Math.round((count / total) * 100) : 0
    return { badge, count, pct }
  })

  res.json({ success: true, data: result, total })
}

// GET /api/admin/buyers
export const getAllBuyers = async (req: Request, res: Response) => {
  const { page = '1', limit = '20' } = req.query

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const skip = (pageNum - 1) * limitNum

  // Platform-wide stats — deliberately NOT derived from the paginated
  // `buyers` array below (that would only ever reflect the current page).
  // Cheap indexed aggregates, same pattern as getAllRefunds's `stats`.
  const [buyers, total, purchaseAgg, activeAlerts] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      include: {
        purchases: { select: { amountPaid: true } },
        alerts: { where: { active: true }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.purchase.aggregate({ _sum: { amountPaid: true }, _count: true }),
    prisma.alert.count({ where: { active: true } }),
  ])

  res.json({
    success: true,
    total,
    stats: {
      totalPurchases: purchaseAgg._count,
      totalSpent: purchaseAgg._sum.amountPaid || 0,
      activeAlerts,
    },
    buyers: buyers.map(b => ({
      id: b.id,
      name: b.name,
      phone: b.phone,
      email: b.email,
      createdAt: b.createdAt,
      totalPurchases: b.purchases.length,
      totalSpent: b.purchases.reduce((sum, p) => sum + p.amountPaid, 0),
      activeAlerts: b.alerts.length,
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/buyers/:id — SuperAdmin-only (route-gated `superOnly`)
// ─────────────────────────────────────────────────────────────────────────────
// Soft delete only — deletedAt, never a row removal. A hard delete is not
// even possible today: User has purchases/alerts/paymentOrders/reviews/
// financialLedgerEntries/etc. as required relations with no explicit
// onDelete in schema.prisma, so Postgres's default RESTRICT would reject a
// hard DELETE outright for any buyer with real history. Same reasoning and
// shape as deleteSeller below.
export const deleteBuyer = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const buyer = await prisma.user.findUnique({ where: { id } })
  if (!buyer) {
    res.status(404).json({ success: false, message: 'Buyer not found' })
    return
  }
  if (buyer.deletedAt) {
    res.status(400).json({ success: false, message: 'This buyer account is already deleted' })
    return
  }

  await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } })

  await recordAudit(req, {
    action: AuditAction.SUPER_ADMIN_DELETE_BUYER,
    target: `User:${id}`,
    details: `Deleted buyer "${buyer.name ?? buyer.phone}" (${buyer.email ?? buyer.phone})`,
  })

  res.json({ success: true, message: 'Buyer account deleted' })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/refunds
// Saare refund requests — filter by status
// ─────────────────────────────────────────────────────────────────────────────
export const getAllRefunds = async (req: Request, res: Response) => {
  const { status, page = '1', limit = '20' } = req.query

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)

  const where: Prisma.RefundWhereInput = {}
  if (status) where.status = status as RefundStatus

  const [refunds, total] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: {
        user: { select: { name: true, phone: true } },
        purchase: {
          include: {
            listing: { select: { address: true, city: true } }
          }
        },
        specialRequest: { select: { address: true, city: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.refund.count({ where })
  ])

  // Stats
  const [pending, processed, totalRefunded] = await Promise.all([
    prisma.refund.count({ where: { status: 'PENDING' } }),
    prisma.refund.count({ where: { status: 'PROCESSED' } }),
    prisma.refund.aggregate({
      where: { status: 'PROCESSED' },
      _sum: { amount: true }
    })
  ])

  res.json({
    success: true,
    total,
    stats: {
      pending,
      processed,
      totalRefunded: totalRefunded._sum.amount || 0,
    },
    refunds: refunds.map(r => ({
      id: r.id,
      refundRef: `REF-${r.id.slice(-4).toUpperCase()}`,
      buyer: r.user,
      // Report-unlock refund → the listing; special-request refund → the
      // request's address/city. Exactly one of these is ever populated.
      listing: r.purchase?.listing ?? r.specialRequest ?? null,
      source: r.purchaseId ? 'PURCHASE' : 'SPECIAL_REQUEST',
      amount: r.amount,
      reason: r.reason,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/purchases?phone=...&address=...
// Purchase lookup for the manual refund flow — createRefund needs a specific
// purchaseId, and there was no way to find one from the admin UI before this.
// Read-only, open to all roles (same as every other GET/list endpoint).
// ─────────────────────────────────────────────────────────────────────────────
export const searchPurchases = async (req: Request, res: Response) => {
  const { phone, address } = req.query

  if (!phone && !address) {
    res.status(400).json({ success: false, message: 'A phone or address query is required' })
    return
  }

  const purchases = await prisma.purchase.findMany({
    where: {
      ...(phone ? { user: { phone: { contains: phone as string } } } : {}),
      ...(address ? { listing: { address: { contains: address as string, mode: 'insensitive' } } } : {}),
    },
    include: {
      user: { select: { name: true, phone: true } },
      listing: { select: { address: true, city: true } },
      refunds: { select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  res.json({
    success: true,
    purchases: purchases.map(p => ({
      id: p.id,
      buyerName: p.user?.name || '—',
      buyerPhone: p.user?.phone || '—',
      property: p.listing?.address || '—',
      city: p.listing?.city || '—',
      amountPaid: p.amountPaid,
      createdAt: p.createdAt,
      settled: p.settled,
      // A purchase already under an active refund shouldn't be picked again
      // — createRefund's own duplicate-guard would 409 anyway, but surfacing
      // it here saves the admin a wasted round-trip.
      hasActiveRefund: p.refunds.some(r => r.status === 'PENDING' || r.status === 'PROCESSED'),
    })),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/refunds
// Naya refund request create karo (admin manually bhi kar sakta hai)
// ─────────────────────────────────────────────────────────────────────────────
export const createRefund = async (req: Request, res: Response) => {
  const { purchaseId, reason, amount } = req.body

  if (!purchaseId || !reason) {
    res.status(400).json({ success: false, message: 'purchaseId and reason are both required' })
    return
  }

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { user: true }
  })

  if (!purchase) {
    res.status(404).json({ success: false, message: 'Purchase not found' })
    return
  }

  // Duplicate refund gating — is purchase ke liye already koi active refund na ho
  const existingRefund = await prisma.refund.findFirst({
    where: { purchaseId, status: { in: ['PENDING', 'PROCESSED'] } }
  })

  if (existingRefund) {
    res.status(409).json({
      success: false,
      message: 'A PENDING or PROCESSED refund request already exists for this purchase'
    })
    return
  }

  const refundAmount = amount || purchase.amountPaid

  // The findFirst above is a TOCTOU-racy fast path — two admins submitting
  // within milliseconds could both pass it. The DB-level partial unique
  // index (migration 20260804070000_refund_active_unique_per_purchase, QA
  // audit 2026-08-03 finding #10) is what actually closes the race; this
  // create() is the second, real gate.
  let refund
  try {
    refund = await prisma.refund.create({
      data: {
        purchaseId,
        userId: purchase.userId,
        amount: refundAmount,
        reason,
        status: 'PENDING',
      }
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'A PENDING or PROCESSED refund request already exists for this purchase'
      })
      return
    }
    throw err
  }

  await recordAudit(req, {
    action: AuditAction.REFUND_CREATE,
    target: `Refund:${refund.id}`,
    details: `Created Rs. ${refundAmount} refund on purchase ${purchaseId} — reason: ${reason}`,
  })

  res.status(201).json({
    success: true,
    message: 'Refund request create ho gayi',
    refund
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/refunds/:id/process
// Refund process karo — PENDING → PROCESSED
// Razorpay se paisa waapas bhejte hain, tabhi status flip hota hai
// ─────────────────────────────────────────────────────────────────────────────
export const processRefund = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { adminNote } = req.body

  const existing = await prisma.refund.findUnique({ where: { id }, include: { user: true } })

  if (!existing) {
    res.status(404).json({ success: false, message: 'Refund request not found' })
    return
  }

  if (existing.status !== 'PENDING') {
    res.status(400).json({ success: false, message: 'Only PENDING refunds can be processed' })
    return
  }

  // executeRefund owns the atomic claim + Razorpay call + status sync — the
  // same path the special-request SLA auto-refund sweep uses (Day 6), so
  // there is exactly one place that ever moves money back to a buyer.
  const result = await executeRefund(id, adminNote)

  if (!result.ok) {
    const status = result.message.toLowerCase().includes('razorpay') ? 502 : 400
    res.status(status).json({ success: false, message: result.message })
    return
  }

  await recordAudit(req, {
    action: AuditAction.REFUND_PROCESS,
    target: `Refund:${id}`,
    details: `Processed Rs. ${existing.amount} to buyer ${existing.userId}. Note: ${adminNote || '—'}`,
  })

  res.json({
    success: true,
    message: result.message,
    refundId: id,
    buyerPhone: existing.user.phone,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/refunds/:id/reject
// Refund reject karo
// ─────────────────────────────────────────────────────────────────────────────
export const rejectRefund = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { adminNote } = req.body

  if (!adminNote) {
    res.status(400).json({ success: false, message: 'A rejection reason is required' })
    return
  }

  const refund = await prisma.refund.findUnique({ where: { id } })

  if (!refund) {
    res.status(404).json({ success: false, message: 'Refund request not found' })
    return
  }

  // Atomic guarded update — sirf tabhi succeed hoga jab status abhi bhi PENDING ho
  const updateResult = await prisma.refund.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED', adminNote }
  })

  if (updateResult.count === 0) {
    res.status(400).json({ success: false, message: 'Only PENDING refunds can be rejected' })
    return
  }

  await recordAudit(req, {
    action: AuditAction.REFUND_REJECT,
    target: `Refund:${id}`,
    details: `Rejected Rs. ${refund.amount} refund — reason: ${adminNote}`,
  })

  res.json({
    success: true,
    message: 'Refund rejected',
    reason: adminNote
  })
}


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/reports/revenue
// Revenue report — purchases data with GST breakup
// ─────────────────────────────────────────────────────────────────────────────
export const getRevenueReport = async (req: Request, res: Response) => {
  const { month, year } = req.query

  const now = new Date()
  const m = month ? parseInt(month as string) - 1 : now.getMonth()
  const y = year ? parseInt(year as string) : now.getFullYear()

  const start = new Date(y, m, 1)
  const end   = new Date(y, m + 1, 0, 23, 59, 59)

  const purchases = await prisma.purchase.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: {
      user:    { select: { name: true, phone: true } },
      listing: { select: { address: true, city: true, propertyType: true } },
    },
    orderBy: { createdAt: 'desc' }
  })

  const totalGMV      = purchases.reduce((s, p) => s + p.amountPaid, 0)
  const totalPlatform = purchases.reduce((s, p) => s + p.platformCut, 0)
  const totalSeller   = purchases.reduce((s, p) => s + p.sellerCut, 0)

  // GST 18% on platform commission
  const gstAmount = totalPlatform * 0.18
  const netRevenue = totalPlatform - gstAmount

  res.json({
    success: true,
    period: { month: m + 1, year: y },
    summary: {
      totalTransactions: purchases.length,
      totalGMV,
      platformRevenue: totalPlatform,
      sellerPayouts:   totalSeller,
      gstCollected:    gstAmount,
      netRevenue,
    },
    transactions: purchases.map(p => ({
      date:        p.createdAt,
      buyerName:   p.user?.name || '—',
      buyerPhone:  p.user?.phone || '—',
      property:    p.listing?.address || '—',
      city:        p.listing?.city || '—',
      type:        p.listing?.propertyType || '—',
      amountPaid:  p.amountPaid,
      platformCut: p.platformCut,
      sellerCut:   p.sellerCut,
      gst:         p.platformCut * 0.18,
      razorpayId:  p.razorpayId,
      settled:     p.settled,
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/reports/settlements
// Seller settlement report
// ─────────────────────────────────────────────────────────────────────────────
export const getSettlementReport = async (req: Request, res: Response) => {
  const { month, year } = req.query

  const now = new Date()
  const m = month ? parseInt(month as string) - 1 : now.getMonth()
  const y = year ? parseInt(year as string) : now.getFullYear()

  const start = new Date(y, m, 1)
  const end   = new Date(y, m + 1, 0, 23, 59, 59)

  // Sellers ke saath unke purchases
  const sellers = await prisma.seller.findMany({
    where: { kycStatus: 'APPROVED' },
    include: {
      listings: {
        include: {
          purchases: {
            where: { createdAt: { gte: start, lte: end } },
            select: { sellerCut: true, settled: true, amountPaid: true }
          }
        }
      }
    }
  })

  const settlementData = sellers
    .map(seller => {
      const allPurchases = seller.listings.flatMap(l => l.purchases)
      const totalEarned  = allPurchases.reduce((s, p) => s + p.sellerCut, 0)
      const settled      = allPurchases.filter(p => p.settled).reduce((s, p) => s + p.sellerCut, 0)
      const pending      = totalEarned - settled
      const tds          = totalEarned > 30000 ? totalEarned * 0.1 : 0

      return {
        sellerId:    seller.id,
        sellerName:  seller.name,
        phone:       seller.phone,
        badge:       seller.badge,
        profession:  seller.profession,
        totalEarned,
        settled,
        pending,
        tds,
        netPayable:  pending - tds,
        transactions: allPurchases.length,
      }
    })
    .filter(s => s.transactions > 0)

  res.json({
    success: true,
    period: { month: m + 1, year: y },
    summary: {
      totalSellers:  settlementData.length,
      totalPending:  settlementData.reduce((s, d) => s + d.pending, 0),
      totalSettled:  settlementData.reduce((s, d) => s + d.settled, 0),
      totalTDS:      settlementData.reduce((s, d) => s + d.tds, 0),
    },
    sellers: settlementData
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/reports/qc
// Quality Control report — spot checks, accuracy scores
// ─────────────────────────────────────────────────────────────────────────────
export const getQCReport = async (req: Request, res: Response) => {
  const { month, year } = req.query

  const now = new Date()
  const m = month ? parseInt(month as string) - 1 : now.getMonth()
  const y = year ? parseInt(year as string) : now.getFullYear()

  const start = new Date(y, m, 1)
  const end   = new Date(y, m + 1, 0, 23, 59, 59)

  const [spotChecks, totalChecks, passedChecks, failedChecks, sellers] = await Promise.all([
    prisma.spotCheck.findMany({
      where: { checkedAt: { gte: start, lte: end } },
      include: {
        listing: {
          include: { seller: { select: { name: true, badge: true } } }
        }
      },
      orderBy: { checkedAt: 'desc' }
    }),
    prisma.spotCheck.count({ where: { checkedAt: { gte: start, lte: end } } }),
    prisma.spotCheck.count({ where: { checkedAt: { gte: start, lte: end }, result: 'PASS' } }),
    prisma.spotCheck.count({ where: { checkedAt: { gte: start, lte: end }, result: 'FAIL' } }),
    prisma.seller.findMany({
      where: { kycStatus: 'APPROVED' },
      select: { name: true, badge: true, accuracyScore: true, phone: true },
      orderBy: { accuracyScore: 'asc' },
      take: 10
    })
  ])

  res.json({
    success: true,
    period: { month: m + 1, year: y },
    summary: {
      totalChecks,
      passedChecks,
      failedChecks,
      passRate: totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0,
    },
    flaggedSellers: sellers.filter(s => s.accuracyScore < 95),
    spotChecks: spotChecks.map(sc => ({
      id:        sc.id,
      result:    sc.result,
      adminNote: sc.adminNote,
      checkedAt: sc.checkedAt,
      listing:   sc.listing?.address || '—',
      seller:    sc.listing?.seller?.name || '—',
      badge:     sc.listing?.seller?.badge || '—',
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/alert-subs
// ─────────────────────────────────────────────────────────────────────────────
export const getAllAlertSubs = async (req: Request, res: Response) => {
  const { page = '1', limit = '20' } = req.query
  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      include: {
        user: { select: { name: true, phone: true } },
        listing: { select: { address: true, city: true, riskBadge: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.alert.count()
  ])

  const activeCount   = await prisma.alert.count({ where: { active: true } })
  const inactiveCount = await prisma.alert.count({ where: { active: false } })

  res.json({
    success: true,
    total,
    stats: { active: activeCount, inactive: inactiveCount },
    alerts: alerts.map(a => ({
      id: a.id,
      active: a.active,
      buyer: a.user,
      listing: a.listing,
      subscribedAt: a.createdAt,
    }))
  })
}



// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/audit-logs
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditLogs = async (req: Request, res: Response) => {
  const { page = '1', limit = '20', action, adminId, from, to } = req.query
  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const where: Prisma.AuditLogWhereInput = {}
  if (action) where.action = { contains: action as string, mode: 'insensitive' }
  if (adminId) where.adminId = adminId as string

  // Date filters are what an investigation actually starts from ("what
  // happened on the 3rd"), so both bounds are supported independently.
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from as string)
    if (to) where.createdAt.lte = new Date(to as string)
  }

  // Approvals/Rejections/Suspensions counts — same `where` scope as `total`
  // (so an active date/adminId filter applies to these too), but never
  // scoped to the current page. Cheap indexed counts, not a full table scan.
  const [logs, total, approvals, rejections, suspensions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { ...where, action: { contains: 'APPROVE', mode: 'insensitive' } } }),
    prisma.auditLog.count({ where: { ...where, action: { contains: 'REJECT', mode: 'insensitive' } } }),
    prisma.auditLog.count({ where: { ...where, action: { contains: 'SUSPEND', mode: 'insensitive' } } }),
  ])

  // AuditLog has no FK to Admin on purpose (rows must outlive the admin they
  // describe), so identity is resolved here with one batched lookup rather
  // than a join. A deleted admin simply resolves to null — the row survives.
  const adminIds = [...new Set(logs.map((l) => l.adminId))]
  const admins = await prisma.admin.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, name: true, email: true, role: true },
  })
  const adminById = new Map(admins.map((a) => [a.id, a]))

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    stats: { approvals, rejections, suspensions },
    logs: logs.map((l) => ({
      ...l,
      admin: adminById.get(l.adminId) ?? null,
    })),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/audit-logs
// ─────────────────────────────────────────────────────────────────────────────
// Manual entry point, kept for the admin panel. Server-side actions no longer
// need it: every admin mutation now records its own row through
// recordAudit(), so the trail is complete even if a client forgets to call.
// ─────────────────────────────────────────────────────────────────────────────
export const createAuditLog = async (req: Request, res: Response) => {
  const { action, target, details } = req.body as {
    action?: string
    target?: string
    details?: string
  }

  if (!action || typeof action !== 'string' || action.trim().length === 0) {
    res.status(400).json({ success: false, message: 'action is required' })
    return
  }

  const log = await prisma.auditLog.create({
    data: {
      adminId: req.admin!.id,
      action: action.trim(),
      target: target ?? null,
      details: details ?? null,
      ipAddress: clientIp(req),
    }
  })

  res.status(201).json({ success: true, log })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/special-request-payouts
// Seller payout ledger for approved special requests (Day 8's
// SpecialRequestPayout) — the ledger settles correctly via the weekly cron,
// but had no admin-facing read endpoint at all before this.
// ─────────────────────────────────────────────────────────────────────────────
export const getSpecialRequestPayouts = async (req: Request, res: Response) => {
  const { page = '1', limit = '20', settled } = req.query
  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const where: Prisma.SpecialRequestPayoutWhereInput = {}
  if (settled === 'true') where.settled = true
  if (settled === 'false') where.settled = false

  const [payouts, total] = await Promise.all([
    prisma.specialRequestPayout.findMany({
      where,
      include: {
        seller: { select: { id: true, name: true, phone: true, badge: true } },
        specialRequest: { select: { id: true, address: true, city: true, tehsil: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.specialRequestPayout.count({ where })
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    payouts,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN MANAGEMENT (Super Admin CRUD)
//
// Every route here is superOnly (requireAdminRole() with no args — see
// admin.routes.ts). Two invariants hold across all of them:
//
//   1. role can only ever be SUB_ADMIN or VIEWER — adminCreateSchema/
//      adminUpdateSchema restrict it at the edge, so this endpoint can never
//      create or promote another SUPER_ADMIN.
//   2. A target admin whose role is SUPER_ADMIN is refused by every mutating
//      action here (including self-targeting), so the protected top-level
//      account can't be blocked/deactivated/deleted/edited through this API
//      — not even by itself.
// ─────────────────────────────────────────────────────────────────────────────

const PASSWORD_BCRYPT_ROUNDS = 10

const adminListSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  blocked: true,
  createdAt: true,
  lastActivityAt: true,
  // Boolean only — never twoFactorSecret. Lets the admin panel show whether
  // 2FA reset is relevant for a given admin without a separate round trip.
  twoFactorEnabled: true,
} satisfies Prisma.AdminSelect

// Reusable guard: refuses acting on a SUPER_ADMIN target (protects the
// protected top-level account structurally, not just by UI convention).
async function findManageableAdmin(id: string) {
  const target = await prisma.admin.findUnique({ where: { id } })
  if (!target) return { target: null, error: 'Admin not found' as const, status: 404 }
  if (target.role === AdminRole.SUPER_ADMIN) {
    return { target: null, error: 'The Super Admin account cannot be managed through this endpoint' as const, status: 403 }
  }
  return { target, error: null, status: 200 }
}

// GET /api/admin/admins
export const listAdmins = async (req: Request, res: Response) => {
  const { role, page = '1', limit = '20' } = req.query

  const where: Prisma.AdminWhereInput = {}
  if (role) where.role = role as AdminRole

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const [admins, total] = await Promise.all([
    prisma.admin.findMany({
      where,
      select: adminListSelect,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.admin.count({ where }),
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    admins,
  })
}

// GET /api/admin/admins/:id
export const getAdminById = async (req: Request, res: Response) => {
  const admin = await prisma.admin.findUnique({
    where: { id: req.params.id as string },
    select: adminListSelect,
  })
  if (!admin) {
    res.status(404).json({ success: false, message: 'Admin not found' })
    return
  }
  res.json({ success: true, admin })
}

// POST /api/admin/admins — body Zod-validated (adminCreateSchema): role can
// only be SUB_ADMIN or VIEWER.
export const createAdmin = async (req: Request, res: Response) => {
  const { name, email, phone, password, role } = req.body as {
    name: string
    email: string
    phone: string
    password: string
    role: 'SUB_ADMIN' | 'VIEWER'
  }

  const existing = await prisma.admin.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ success: false, message: 'An admin with this email already exists' })
    return
  }

  const password_hash = await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS)

  const admin = await prisma.admin.create({
    data: { name, email, phone, password: password_hash, role },
    select: adminListSelect,
  })

  await recordAudit(req, {
    action: AuditAction.ADMIN_CREATE,
    target: `Admin:${admin.id}`,
    details: `Created ${admin.role} "${admin.name}" (${admin.email})`,
  })

  res.status(201).json({ success: true, message: 'Admin created', admin })
}

// PATCH /api/admin/admins/:id — body Zod-validated (adminUpdateSchema)
export const updateAdmin = async (req: Request, res: Response) => {
  const { target, error, status } = await findManageableAdmin(req.params.id as string)
  if (!target) {
    res.status(status).json({ success: false, message: error })
    return
  }

  const { name, phone, role } = req.body as { name?: string; phone?: string; role?: 'SUB_ADMIN' | 'VIEWER' }

  const admin = await prisma.admin.update({
    where: { id: target.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(role !== undefined ? { role } : {}),
    },
    select: adminListSelect,
  })

  await recordAudit(req, {
    action: AuditAction.ADMIN_UPDATE,
    target: `Admin:${admin.id}`,
    details: `Updated ${JSON.stringify({ name, phone, role })}`,
  })

  res.json({ success: true, message: 'Admin updated', admin })
}

// Shared body for block/unblock/activate/deactivate — same shape, same
// self-targeting guard, same SUPER_ADMIN protection, different field+value.
async function setAdminFlag(
  req: Request,
  res: Response,
  field: 'blocked' | 'active',
  value: boolean,
  action: (typeof AuditAction)[keyof typeof AuditAction]
) {
  if (req.params.id === req.admin!.id) {
    res.status(400).json({ success: false, message: 'You cannot perform this action on your own account' })
    return
  }

  const { target, error, status } = await findManageableAdmin(req.params.id as string)
  if (!target) {
    res.status(status).json({ success: false, message: error })
    return
  }

  const admin = await prisma.admin.update({
    where: { id: target.id },
    data: { [field]: value },
    select: adminListSelect,
  })

  await recordAudit(req, {
    action,
    target: `Admin:${admin.id}`,
    details: `${field} = ${value} for "${admin.name}" (${admin.email})`,
  })

  res.json({ success: true, message: 'Admin updated', admin })
}

// POST /api/admin/admins/:id/block
export const blockAdmin = (req: Request, res: Response) =>
  setAdminFlag(req, res, 'blocked', true, AuditAction.ADMIN_BLOCK)

// POST /api/admin/admins/:id/unblock
export const unblockAdmin = (req: Request, res: Response) =>
  setAdminFlag(req, res, 'blocked', false, AuditAction.ADMIN_UNBLOCK)

// POST /api/admin/admins/:id/activate
export const activateAdmin = (req: Request, res: Response) =>
  setAdminFlag(req, res, 'active', true, AuditAction.ADMIN_ACTIVATE)

// POST /api/admin/admins/:id/deactivate
export const deactivateAdmin = (req: Request, res: Response) =>
  setAdminFlag(req, res, 'active', false, AuditAction.ADMIN_DEACTIVATE)

// POST /api/admin/admins/:id/2fa/reset
// ─────────────────────────────────────────────────────────────────────────────
// SuperAdmin-assisted 2FA recovery — the only path back in for an admin who
// has lost their authenticator device. /2fa/disable (twoFactor.controller.ts)
// cannot help there since it demands a LIVE code from the very device that's
// lost; this is the deliberate escape hatch, gated to SUPER_ADMIN only and
// fully audited. Same self-targeting + SUPER_ADMIN-target guards as
// block/deactivate/delete above. Clears exactly the three 2FA fields —
// password, role, blocked and active are never touched, and the account
// itself is never deleted.
// ─────────────────────────────────────────────────────────────────────────────
export const resetAdminTwoFactor = async (req: Request, res: Response) => {
  if (req.params.id === req.admin!.id) {
    res.status(400).json({
      success: false,
      message: 'You cannot reset your own 2FA through this endpoint — use /api/admin/2fa/disable instead.',
    })
    return
  }

  const { target, error, status } = await findManageableAdmin(req.params.id as string)
  if (!target) {
    res.status(status).json({ success: false, message: error })
    return
  }

  const admin = await prisma.admin.update({
    where: { id: target.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null, lastTotpStep: null },
    select: adminListSelect,
  })

  await recordAudit(req, {
    action: AuditAction.ADMIN_2FA_RESET,
    target: `Admin:${admin.id}`,
    details: `2FA reset for "${admin.name}" (${admin.email}) — they can log in with password only and must re-enroll`,
  })

  res.json({
    success: true,
    message: '2FA reset. This admin can now log in with password only and must set up 2FA again.',
    admin,
  })
}

// DELETE /api/admin/admins/:id — hard delete. Safe: AuditLog deliberately
// has no FK to Admin (see schema.prisma), so a deleted admin's history stays
// intact and resolves to a null actor on read, same as any other departure.
export const deleteAdmin = async (req: Request, res: Response) => {
  if (req.params.id === req.admin!.id) {
    res.status(400).json({ success: false, message: 'You cannot delete your own account' })
    return
  }

  const { target, error, status } = await findManageableAdmin(req.params.id as string)
  if (!target) {
    res.status(status).json({ success: false, message: error })
    return
  }

  await prisma.admin.delete({ where: { id: target.id } })

  await recordAudit(req, {
    action: AuditAction.ADMIN_DELETE,
    target: `Admin:${target.id}`,
    details: `Deleted ${target.role} "${target.name}" (${target.email})`,
  })

  res.json({ success: true, message: 'Admin deleted' })
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION MARKETPLACE — SUPER ADMIN OVERSIGHT (Phase 3)
//
// Admin acting as a PARTICIPANT (competing for verification work) is
// verification.controller.ts / verification.routes.ts's adminMarketplaceRouter.
// Everything here is oversight: view everything, review claims, intervene,
// and hold the configurable platform rules — never hardcoded elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/verification-requests
export const getAllVerificationRequests = async (req: Request, res: Response) => {
  const { status, page = '1', limit = '20' } = req.query

  const where: Prisma.VerificationRequestWhereInput = {}
  if (status) where.status = status as VerificationRequestStatus

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const [requests, total] = await Promise.all([
    prisma.verificationRequest.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        assignedSeller: { select: { id: true, name: true, badge: true } },
        acceptedQuote: true,
        _count: { select: { quotes: true, claims: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.verificationRequest.count({ where }),
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    requests,
  })
}

// GET /api/admin/verification-requests/:id
// ─────────────────────────────────────────────────────────────────────────────
// Full drill-down (Phase 4B extends this, doesn't replace it): Payment →
// Verification Request → Buyer → Professional → Commission → Professional
// earning → Payout → Refund/reversal, all in one response.
export const getVerificationRequestDetail = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const request = await prisma.verificationRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, phone: true, email: true } },
      listing: true,
      property: true,
      assignedSeller: { select: { id: true, name: true, badge: true, phone: true, email: true } },
      quotes: { include: { quotedBySeller: { select: { name: true, badge: true } } } },
      paymentOrders: true,
      refunds: true,
      claims: true,
      report: true,
    },
  })

  if (!request) {
    res.status(404).json({ success: false, message: 'Verification request not found' })
    return
  }

  const [ledgerEntries, professionalEarnings] = await Promise.all([
    prisma.financialLedgerEntry.findMany({ where: { verificationRequestId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.professionalEarning.findMany({
      where: { verificationRequestId: id },
      include: { payoutRecord: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  res.json({ success: true, request, ledgerEntries, professionalEarnings })
}

// POST /api/admin/verification-requests/:id/force-cancel
// Super Admin intervention — cancels a request outside the buyer's own
// action, e.g. to resolve a dispute or a stuck professional. Reuses the exact
// same cancellation-fee logic (configurable rate, real Refund row) as the
// buyer-facing cancel, just without the ownership check.
export const forceCancelVerificationRequest = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { reason } = req.body as { reason: string }

  if (!reason) {
    res.status(400).json({ success: false, message: 'A reason is required' })
    return
  }

  try {
    const result = await adminForceCancelVerificationRequest(id, reason)

    await recordAudit(req, {
      action: AuditAction.VERIFICATION_REQUEST_FORCE_CANCEL,
      target: `VerificationRequest:${id}`,
      details: `Force-cancelled by admin — reason: ${reason}. Refund: ₹${result.refundAmount}, fee: ₹${result.cancellationFee}`,
    })

    res.json({ success: true, message: 'Verification request cancelled by admin', ...result })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// GET /api/admin/claims
export const getAllClaims = async (req: Request, res: Response) => {
  const { status, page = '1', limit = '20' } = req.query

  const where: Prisma.ClaimWhereInput = {}
  if (status) where.status = status as ClaimStatus

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        verificationRequest: { select: { id: true, status: true, agreedFee: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.claim.count({ where }),
  ])

  res.json({ success: true, total, page: pageNum, totalPages: Math.ceil(total / limitNum), claims })
}

// POST /api/admin/claims/:id/resolve
// Admin/Super Admin moves a claim through its status machine by hand — never
// an automatic refund decision (per the brief). A REFUND_APPROVED/
// REFUND_PROCESSED status here records the decision; actually moving money
// still goes through the normal Refund flow (executeRefund), which an admin
// triggers separately via the existing /api/admin/refunds endpoints once a
// Refund row exists for this — deliberately not auto-wired, so a human always
// makes the actual money-movement decision.
export const resolveClaim = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { status, resolutionNote } = req.body as { status: string; resolutionNote: string }

  const claim = await prisma.claim.findUnique({ where: { id } })
  if (!claim) {
    res.status(404).json({ success: false, message: 'Claim not found' })
    return
  }
  if (claim.status === 'RESOLVED' || claim.status === 'REJECTED' || claim.status === 'REFUND_PROCESSED') {
    res.status(400).json({ success: false, message: 'This claim has already reached a final status' })
    return
  }

  const isTerminal = status === 'RESOLVED' || status === 'REJECTED' || status === 'REFUND_PROCESSED'

  const updated = await prisma.claim.update({
    where: { id },
    data: {
      status: status as ClaimStatus,
      resolutionNote,
      assignedAdminId: req.admin!.id,
      ...(isTerminal ? { resolvedAt: new Date() } : {}),
    },
  })

  await recordAudit(req, {
    action: AuditAction.CLAIM_RESOLVE,
    target: `Claim:${id}`,
    details: `Status → ${status}. Note: ${resolutionNote}`,
  })

  // Buyer-facing claim update (Phase 4C) — best-effort, never blocks the
  // admin action that triggered it.
  const claimant = await prisma.user.findUnique({ where: { id: updated.userId } })
  if (claimant) {
    void notifyBuyerAlert(
      {
        id: claimant.id,
        phone: claimant.phone,
        email: claimant.email,
        fcmToken: claimant.fcmToken,
        pushEnabled: claimant.pushEnabled,
      },
      {
        type: 'claim',
        title: 'Your claim was updated',
        body: `Status: ${status}. ${resolutionNote}`,
        data: { verificationRequestId: updated.verificationRequestId, claimId: id },
      }
    ).catch((err) => logger.error(`[admin] buyer claim-update notification failed for claim ${id}: ${err}`))
  }

  res.json({ success: true, message: 'Claim updated', claim: updated })
}

// GET /api/admin/verification-settings
// Phase 4B — `verificationPlatformCommissionRate` (0-1) stays the ONE stored
// value (unchanged Phase 3 field, frozen per-transaction onto every
// VerificationRequest exactly as before); professionalSharePercent is
// derived here, never stored separately, so "commission + professional
// share = 100" holds by construction rather than by a validation check that
// two independently-stored fields could still drift out of.
function withCommissionPercents<T extends { verificationPlatformCommissionRate: number }>(settings: T) {
  const verificationPlatformCommissionPercent = round2(settings.verificationPlatformCommissionRate * 100)
  return {
    ...settings,
    verificationPlatformCommissionPercent,
    professionalSharePercent: round2(100 - verificationPlatformCommissionPercent),
  }
}

export const getVerificationSettings = async (_req: Request, res: Response) => {
  const settings = await getPlatformSettings()
  res.json({ success: true, settings: withCommissionPercents(settings) })
}

// PATCH /api/admin/verification-settings
export const updateVerificationSettings = async (req: Request, res: Response) => {
  const {
    minVerificationFee,
    verificationPlatformCommissionRate,
    cancellationFeeRateAfterAcceptance,
  } = req.body as {
    minVerificationFee?: number
    verificationPlatformCommissionRate?: number
    cancellationFeeRateAfterAcceptance?: number
  }

  const settings = await updatePlatformSettings(
    { minVerificationFee, verificationPlatformCommissionRate, cancellationFeeRateAfterAcceptance },
    req.admin!.id
  )

  await recordAudit(req, {
    action: AuditAction.PLATFORM_SETTINGS_UPDATE,
    target: 'PlatformSetting:default',
    details: `Updated: ${JSON.stringify(req.body)}`,
  })

  res.json({ success: true, message: 'Platform settings updated', settings: withCommissionPercents(settings) })
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTER REWARD LEDGER — ADMIN/SUPER ADMIN CONTROLS (Phase 4A)
//
// Reads open to all three roles (same tier as every other admin list/detail
// endpoint); every decision that moves points (approve/reject an earn,
// create an adjustment, approve/reject a redemption) or changes the reward
// rate is a money-adjacent action, same tier as refunds/KYC — SUPER_ADMIN
// only, same convention as the Verification Marketplace oversight section
// above.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/reward-transactions
export const getAllRewardTransactions = async (req: Request, res: Response) => {
  const { sellerId, status, type, page = '1', limit = '20' } = req.query

  const where: Prisma.RewardTransactionWhereInput = {}
  if (sellerId) where.sellerId = sellerId as string
  if (status) where.status = status as Prisma.RewardTransactionWhereInput['status']
  if (type) where.type = type as Prisma.RewardTransactionWhereInput['type']

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const [transactions, total] = await Promise.all([
    prisma.rewardTransaction.findMany({
      where,
      include: { seller: { select: { id: true, name: true, phone: true, partnerRole: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.rewardTransaction.count({ where }),
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    transactions,
  })
}

// POST /api/admin/reward-transactions/:id/approve
export const approveRewardTransaction = async (req: Request, res: Response) => {
  const id = req.params.id as string
  try {
    const transaction = await rewardService.decideEarnedTransaction(id, req.admin!.id, true)
    await recordAudit(req, {
      action: AuditAction.REWARD_TRANSACTION_APPROVE,
      target: `RewardTransaction:${id}`,
      details: `Approved ${transaction.points} points for seller ${transaction.sellerId}`,
    })
    res.json({ success: true, message: 'Reward transaction approved', transaction })
  } catch (err) {
    if (err instanceof rewardService.RewardError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/admin/reward-transactions/:id/reject
export const rejectRewardTransaction = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { reason } = req.body as { reason?: string }
  try {
    const transaction = await rewardService.decideEarnedTransaction(id, req.admin!.id, false, reason)
    await recordAudit(req, {
      action: AuditAction.REWARD_TRANSACTION_REJECT,
      target: `RewardTransaction:${id}`,
      details: `Rejected ${transaction.points} points for seller ${transaction.sellerId}${reason ? ` — reason: ${reason}` : ''}`,
    })
    res.json({ success: true, message: 'Reward transaction rejected', transaction })
  } catch (err) {
    if (err instanceof rewardService.RewardError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/admin/sellers/:id/reward-adjustment
export const createRewardAdjustment = async (req: Request, res: Response) => {
  const sellerId = req.params.id as string
  const { points, reason } = req.body as { points: number; reason: string }

  try {
    const transaction = await rewardService.createAdjustment(sellerId, points, reason, req.admin!.id)
    await recordAudit(req, {
      action: AuditAction.REWARD_ADJUSTMENT_CREATE,
      target: `Seller:${sellerId}`,
      details: `${points >= 0 ? 'Credited' : 'Debited'} ${Math.abs(points)} points — reason: ${reason}`,
    })
    res.status(201).json({ success: true, message: 'Adjustment recorded', transaction })
  } catch (err) {
    if (err instanceof rewardService.RewardError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// GET /api/admin/sellers/:id/reward-summary
export const getSellerRewardSummary = async (req: Request, res: Response) => {
  const sellerId = req.params.id as string
  const summary = await rewardService.getRewardSummary(sellerId)
  res.json({ success: true, summary })
}

// GET /api/admin/redeem-requests
export const getAllRedeemRequests = async (req: Request, res: Response) => {
  const { sellerId, status, page = '1', limit = '20' } = req.query

  const where: Prisma.RedeemRequestWhereInput = {}
  if (sellerId) where.sellerId = sellerId as string
  if (status) where.status = status as Prisma.RedeemRequestWhereInput['status']

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const { requests, total } = await rewardService.listRedeemRequests(where, pageNum, limitNum)

  const sellers = requests.length
    ? await prisma.seller.findMany({
        where: { id: { in: [...new Set(requests.map((r) => r.sellerId))] } },
        select: { id: true, name: true, phone: true, partnerRole: true },
      })
    : []
  const sellerById = new Map(sellers.map((s) => [s.id, s]))

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    requests: requests.map((r) => ({ ...r, seller: sellerById.get(r.sellerId) ?? null })),
  })
}

// POST /api/admin/redeem-requests/:id/approve
export const approveRedeemRequest = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { adminNote } = req.body as { adminNote?: string }

  try {
    const request = await rewardService.decideRedeemRequest(id, req.admin!.id, true, adminNote)
    await recordAudit(req, {
      action: AuditAction.REDEEM_REQUEST_APPROVE,
      target: `RedeemRequest:${id}`,
      details: `Approved redemption of ${request.points} points for seller ${request.sellerId}`,
    })
    res.json({ success: true, message: 'Redeem request approved', request })
  } catch (err) {
    if (err instanceof rewardService.RewardError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/admin/redeem-requests/:id/reject
export const rejectRedeemRequest = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { adminNote } = req.body as { adminNote: string }

  try {
    const request = await rewardService.decideRedeemRequest(id, req.admin!.id, false, adminNote)
    await recordAudit(req, {
      action: AuditAction.REDEEM_REQUEST_REJECT,
      target: `RedeemRequest:${id}`,
      details: `Rejected redemption of ${request.points} points — reason: ${adminNote}`,
    })
    res.json({ success: true, message: 'Redeem request rejected', request })
  } catch (err) {
    if (err instanceof rewardService.RewardError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// GET /api/admin/reward-settings
export const getRewardSettings = async (_req: Request, res: Response) => {
  const settings = await getPlatformSettings()
  res.json({ success: true, settings })
}

// PATCH /api/admin/reward-settings
export const updateRewardSettings = async (req: Request, res: Response) => {
  const { reporterRewardPointsPerApprovedProperty } = req.body as {
    reporterRewardPointsPerApprovedProperty?: number
  }

  const settings = await updatePlatformSettings(
    { reporterRewardPointsPerApprovedProperty },
    req.admin!.id
  )

  await recordAudit(req, {
    action: AuditAction.REWARD_SETTINGS_UPDATE,
    target: 'PlatformSetting:default',
    details: `Updated: ${JSON.stringify(req.body)}`,
  })

  res.json({ success: true, message: 'Reward settings updated', settings })
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPER ADMIN FINANCIAL DASHBOARD (Phase 4B)
//
// Reads open to all three admin roles (VIEWER included — same tier as every
// other admin list/detail/overview endpoint in this codebase). Every action
// that moves money, triggers a payout attempt, or touches payout eligibility
// is SUPER_ADMIN only — a SUB_ADMIN cannot change the commission rate
// (already superOnly on /verification-settings), manually mark a payout
// paid (no endpoint anywhere does this — only a Razorpay webhook can, see
// payout.service.ts), trigger/retry a payout, resolve a reconciliation
// issue, or change payout eligibility.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/finance/overview
export const getFinancialOverview = async (_req: Request, res: Response) => {
  const [
    grossPayment,
    platformCommission,
    professionalEarning,
    processingFee,
    cancellationFee,
    refund,
    reversalCommission,
    reversalEarning,
    payoutsByStatus,
    openReconciliationIssues,
  ] = await Promise.all([
    prisma.financialLedgerEntry.aggregate({ where: { type: 'GROSS_PAYMENT' }, _sum: { amountPaise: true } }),
    prisma.financialLedgerEntry.aggregate({ where: { type: 'PLATFORM_COMMISSION' }, _sum: { amountPaise: true } }),
    prisma.financialLedgerEntry.aggregate({ where: { type: 'PROFESSIONAL_EARNING' }, _sum: { amountPaise: true } }),
    prisma.financialLedgerEntry.aggregate({ where: { type: 'PROCESSING_FEE' }, _sum: { amountPaise: true } }),
    prisma.financialLedgerEntry.aggregate({ where: { type: 'CANCELLATION_FEE' }, _sum: { amountPaise: true } }),
    prisma.financialLedgerEntry.aggregate({ where: { type: 'REFUND' }, _sum: { amountPaise: true } }),
    prisma.financialLedgerEntry.aggregate({ where: { type: 'REVERSAL_COMMISSION', status: 'RECORDED' }, _sum: { amountPaise: true } }),
    prisma.financialLedgerEntry.aggregate({ where: { type: 'REVERSAL_EARNING', status: 'RECORDED' }, _sum: { amountPaise: true } }),
    prisma.professionalPayoutRecord.groupBy({ by: ['status'], _sum: { totalAmountPaise: true }, _count: true }),
    prisma.reconciliationIssue.count({ where: { status: 'OPEN' } }),
  ])

  const paise = (v: number | null | undefined) => v ?? 0
  const toRupees = (v: number) => v / 100

  const payoutTotals = Object.fromEntries(
    payoutsByStatus.map((p) => [p.status, { amount: toRupees(paise(p._sum.totalAmountPaise)), count: p._count }])
  )

  res.json({
    success: true,
    overview: {
      grossPayments: toRupees(paise(grossPayment._sum.amountPaise)),
      platformCommission:
        toRupees(paise(platformCommission._sum.amountPaise)) - toRupees(paise(reversalCommission._sum.amountPaise)),
      professionalPayable:
        toRupees(paise(professionalEarning._sum.amountPaise)) - toRupees(paise(reversalEarning._sum.amountPaise)),
      processingFees: toRupees(paise(processingFee._sum.amountPaise)),
      cancellationFees: toRupees(paise(cancellationFee._sum.amountPaise)),
      refunds: toRupees(paise(refund._sum.amountPaise)),
      reversedCommission: toRupees(paise(reversalCommission._sum.amountPaise)),
      reversedEarning: toRupees(paise(reversalEarning._sum.amountPaise)),
      payoutsByStatus: payoutTotals,
      paidToProfessionals: payoutTotals.PAID?.amount ?? 0,
      pendingPayouts:
        (payoutTotals.PAYOUT_REQUESTED?.amount ?? 0) + (payoutTotals.PROCESSING?.amount ?? 0),
      failedPayouts: (payoutTotals.FAILED?.amount ?? 0) + (payoutTotals.MANUAL_REVIEW?.amount ?? 0),
      openReconciliationIssues,
    },
  })
}

// GET /api/admin/finance/ledger?type=&status=&sellerId=&verificationRequestId=
export const getFinancialLedger = async (req: Request, res: Response) => {
  const { type, status, sellerId, verificationRequestId, page = '1', limit = '50' } = req.query

  const where: Prisma.FinancialLedgerEntryWhereInput = {}
  if (type) where.type = type as Prisma.FinancialLedgerEntryWhereInput['type']
  if (status) where.status = status as Prisma.FinancialLedgerEntryWhereInput['status']
  if (sellerId) where.sellerId = sellerId as string
  if (verificationRequestId) where.verificationRequestId = verificationRequestId as string

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 50))

  const [entries, total] = await Promise.all([
    prisma.financialLedgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.financialLedgerEntry.count({ where }),
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    entries,
  })
}

// ─── PAYOUT OVERSIGHT ─────────────────────────────────────────────────────

// GET /api/admin/payouts?status=&sellerId=
export const getAllPayoutRecords = async (req: Request, res: Response) => {
  const { status, sellerId, page = '1', limit = '20' } = req.query

  const where: Prisma.ProfessionalPayoutRecordWhereInput = {}
  if (status) where.status = status as Prisma.ProfessionalPayoutRecordWhereInput['status']
  if (sellerId) where.sellerId = sellerId as string

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const [records, total] = await Promise.all([
    prisma.professionalPayoutRecord.findMany({
      where,
      include: {
        seller: { select: { id: true, name: true, phone: true, badge: true } },
        earnings: { select: { id: true, grossEarningPaise: true, verificationRequestId: true } },
      },
      orderBy: { requestedAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.professionalPayoutRecord.count({ where }),
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    payouts: records,
  })
}

// POST /api/admin/payouts/:id/process — also covers retry (RETRYABLE → PROCESSING)
export const processPayoutRecord = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const before = await prisma.professionalPayoutRecord.findUnique({ where: { id } })
  if (!before) {
    res.status(404).json({ success: false, message: 'Payout record not found' })
    return
  }
  const isRetry = before.status === 'RETRYABLE'

  try {
    const record = await payoutService.processPayout(id)
    await recordAudit(req, {
      action: isRetry ? AuditAction.PAYOUT_RETRY : AuditAction.PAYOUT_PROCESS,
      target: `ProfessionalPayoutRecord:${id}`,
      details: `Sent ₹${record.totalAmountPaise / 100} to RazorpayX (payout ${record.razorpayPayoutId}) — awaiting webhook confirmation`,
    })
    res.json({ success: true, message: 'Payout sent to provider — awaiting confirmation', payout: record })
  } catch (err) {
    if (err instanceof payoutService.PayoutError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/admin/payouts/:id/resolve — for a MANUAL_REVIEW payout: retry it
// (back to RETRYABLE, retry count reset) or write it off (REVERSED — a
// deliberate decision that this amount will not be paid out, never silent).
export const resolveManualReviewPayout = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { action, note } = req.body as { action: 'retry' | 'write_off'; note?: string }

  if (action !== 'retry' && action !== 'write_off') {
    res.status(400).json({ success: false, message: "action must be 'retry' or 'write_off'" })
    return
  }

  const record = await prisma.professionalPayoutRecord.findUnique({ where: { id } })
  if (!record) {
    res.status(404).json({ success: false, message: 'Payout record not found' })
    return
  }
  if (record.status !== 'MANUAL_REVIEW') {
    res.status(400).json({ success: false, message: 'Only a MANUAL_REVIEW payout can be resolved this way' })
    return
  }

  const nextStatus = action === 'retry' ? 'RETRYABLE' : 'REVERSED'
  await prisma.$transaction(async (tx) => {
    await tx.professionalPayoutRecord.update({
      where: { id },
      data: {
        status: nextStatus,
        retryCount: action === 'retry' ? 0 : record.retryCount,
        reversedAt: action === 'write_off' ? new Date() : null,
      },
    })
    await tx.professionalEarning.updateMany({
      where: { payoutRecordId: id },
      data: {
        status: nextStatus,
        reversalReason: action === 'write_off' ? note ?? 'Written off by Super Admin' : undefined,
      },
    })
  })

  await recordAudit(req, {
    action: AuditAction.PAYOUT_MANUAL_REVIEW_RESOLVE,
    target: `ProfessionalPayoutRecord:${id}`,
    details: `Resolved as ${action}${note ? ` — ${note}` : ''}`,
  })

  res.json({ success: true, message: `Payout ${action === 'retry' ? 'reset for retry' : 'written off'}` })
}

// PATCH /api/admin/sellers/:id/payout-eligibility
export const updatePayoutEligibility = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { payoutEligibilityStatus, razorpayLinkedAccountId } = req.body as {
    payoutEligibilityStatus?: string
    razorpayLinkedAccountId?: string
  }

  const seller = await prisma.seller.findUnique({ where: { id } })
  if (!seller) {
    res.status(404).json({ success: false, message: 'Seller not found' })
    return
  }

  const updated = await prisma.seller.update({
    where: { id },
    data: {
      ...(payoutEligibilityStatus
        ? { payoutEligibilityStatus: payoutEligibilityStatus as Prisma.SellerUpdateInput['payoutEligibilityStatus'] }
        : {}),
      ...(razorpayLinkedAccountId !== undefined ? { razorpayLinkedAccountId } : {}),
    },
    select: { id: true, name: true, payoutEligibilityStatus: true, razorpayLinkedAccountId: true },
  })

  await recordAudit(req, {
    action: AuditAction.PAYOUT_ELIGIBILITY_UPDATE,
    target: `Seller:${id}`,
    details: `Updated: ${JSON.stringify(req.body)}`,
  })

  res.json({ success: true, message: 'Payout profile updated', seller: updated })
}

// ─── RECONCILIATION ───────────────────────────────────────────────────────

// POST /api/admin/reconciliation/run
export const runReconciliation = async (req: Request, res: Response) => {
  const result = await runReconciliationSweep()

  await recordAudit(req, {
    action: AuditAction.RECONCILIATION_SWEEP_RUN,
    target: 'ReconciliationIssue:sweep',
    details: `Internal issues opened: ${result.internalIssuesOpened}, remote issues opened: ${result.remoteIssuesOpened}, remote check skipped: ${result.remoteCheckSkipped}`,
  })

  res.json({ success: true, result })
}

// GET /api/admin/reconciliation/issues?status=
export const getReconciliationIssues = async (req: Request, res: Response) => {
  const { status = 'OPEN', page = '1', limit = '50' } = req.query

  const where: Prisma.ReconciliationIssueWhereInput = {}
  if (status) where.status = status as Prisma.ReconciliationIssueWhereInput['status']

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 50))

  const [issues, total] = await Promise.all([
    prisma.reconciliationIssue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.reconciliationIssue.count({ where }),
  ])

  res.json({ success: true, total, page: pageNum, totalPages: Math.ceil(total / limitNum), issues })
}

// POST /api/admin/reconciliation/issues/:id/resolve
export const resolveReconciliationIssue = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { resolutionNote } = req.body as { resolutionNote: string }

  if (!resolutionNote) {
    res.status(400).json({ success: false, message: 'A resolution note is required' })
    return
  }

  const { count } = await prisma.reconciliationIssue.updateMany({
    where: { id, status: 'OPEN' },
    data: { status: 'RESOLVED', resolutionNote, resolvedByAdminId: req.admin!.id, resolvedAt: new Date() },
  })
  if (count === 0) {
    res.status(400).json({ success: false, message: 'Issue not found or already resolved' })
    return
  }

  await recordAudit(req, {
    action: AuditAction.RECONCILIATION_ISSUE_RESOLVE,
    target: `ReconciliationIssue:${id}`,
    details: resolutionNote,
  })

  res.json({ success: true, message: 'Reconciliation issue resolved — no financial data was changed by this action' })
}

// ─────────────────────────────────────────────────────────────────────────────
// AI / HUMAN CUSTOMER SUPPORT — SUPER ADMIN / AUTHORIZED SUPPORT ADMIN (Phase 4C)
//
// Reads (list/search/detail) open to all three admin roles, same tier as
// every other admin list/detail endpoint. Assign/reply/reopen/return-to-AI
// are SUB_ADMIN+ — day-to-day support work, same tier as report-flags/
// listing QC. Resolving a PAYMENT/CANCELLATION/CLAIM-category ticket is
// SUPER_ADMIN only — a resolution there can carry a financial/legal
// implication, checked inside resolveSupportTicket itself rather than at
// the route level, since the restriction depends on the ticket's own data.
// ─────────────────────────────────────────────────────────────────────────────

const SENSITIVE_SUPPORT_CATEGORIES = ['PAYMENT', 'CANCELLATION', 'CLAIM']

// GET /api/admin/support/tickets?status=&priority=&category=&q=
export const getAllSupportTickets = async (req: Request, res: Response) => {
  const { status, priority, category, q, page = '1', limit = '20' } = req.query

  const where: Prisma.SupportTicketWhereInput = {}
  if (status) where.status = status as Prisma.SupportTicketWhereInput['status']
  if (priority) where.priority = priority as Prisma.SupportTicketWhereInput['priority']
  if (category) where.category = category as Prisma.SupportTicketWhereInput['category']
  if (q) where.subject = { contains: q as string, mode: 'insensitive' }

  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
        seller: { select: { id: true, name: true, phone: true, email: true, partnerRole: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.supportTicket.count({ where }),
  ])

  res.json({ success: true, total, page: pageNum, totalPages: Math.ceil(total / limitNum), tickets })
}

// GET /api/admin/support/tickets/:id
export const getSupportTicketDetail = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, phone: true, email: true } },
      seller: { select: { id: true, name: true, phone: true, email: true, partnerRole: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Support ticket not found' })
    return
  }

  res.json({ success: true, ticket })
}

// POST /api/admin/support/tickets/:id/assign
export const assignSupportTicket = async (req: Request, res: Response) => {
  const id = req.params.id as string
  try {
    const ticket = await supportService.assignTicket(id, req.admin!.id)
    await recordAudit(req, {
      action: AuditAction.SUPPORT_TICKET_ASSIGN,
      target: `SupportTicket:${id}`,
      details: `Assigned to admin ${req.admin!.id}`,
    })
    res.json({ success: true, message: 'Ticket assigned to you', ticket })
  } catch (err) {
    if (err instanceof supportService.SupportError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/admin/support/tickets/:id/reply
export const replySupportTicket = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { body } = req.body as { body: string }
  try {
    const ticket = await supportService.postAdminReply(id, req.admin!.id, body)
    await recordAudit(req, {
      action: AuditAction.SUPPORT_TICKET_REPLY,
      target: `SupportTicket:${id}`,
      details: body.length > 200 ? `${body.slice(0, 200)}…` : body,
    })
    res.json({ success: true, message: 'Reply sent', ticket })
  } catch (err) {
    if (err instanceof supportService.SupportError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/admin/support/tickets/:id/resolve
export const resolveSupportTicket = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const ticket = await prisma.supportTicket.findUnique({ where: { id } })
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Support ticket not found' })
    return
  }
  if (SENSITIVE_SUPPORT_CATEGORIES.includes(ticket.category) && req.admin!.role !== 'SUPER_ADMIN') {
    res.status(403).json({
      success: false,
      message: `Resolving a ${ticket.category} ticket requires a Super Admin`,
    })
    return
  }

  try {
    const updated = await supportService.resolveTicket(id)
    await recordAudit(req, {
      action: AuditAction.SUPPORT_TICKET_RESOLVE,
      target: `SupportTicket:${id}`,
      details: `Resolved (${ticket.category})`,
    })
    res.json({ success: true, message: 'Ticket resolved', ticket: updated })
  } catch (err) {
    if (err instanceof supportService.SupportError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/admin/support/tickets/:id/reopen
export const reopenSupportTicket = async (req: Request, res: Response) => {
  const id = req.params.id as string
  try {
    const ticket = await supportService.reopenTicket(id)
    await recordAudit(req, {
      action: AuditAction.SUPPORT_TICKET_REOPEN,
      target: `SupportTicket:${id}`,
      details: 'Reopened',
    })
    res.json({ success: true, message: 'Ticket reopened', ticket })
  } catch (err) {
    if (err instanceof supportService.SupportError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/admin/support/tickets/:id/return-to-ai
export const returnSupportTicketToAi = async (req: Request, res: Response) => {
  const id = req.params.id as string
  try {
    const ticket = await supportService.returnToAi(id)
    await recordAudit(req, {
      action: AuditAction.SUPPORT_TICKET_RETURN_TO_AI,
      target: `SupportTicket:${id}`,
      details: 'Returned to AI assistant',
    })
    res.json({ success: true, message: 'Ticket returned to AI', ticket })
  } catch (err) {
    if (err instanceof supportService.SupportError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// PATCH /api/admin/support/tickets/:id/priority
export const updateSupportTicketPriority = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { priority } = req.body as { priority: string }

  const { count } = await prisma.supportTicket.updateMany({
    where: { id },
    data: { priority: priority as Prisma.SupportTicketUpdateInput['priority'] },
  })
  if (count === 0) {
    res.status(404).json({ success: false, message: 'Support ticket not found' })
    return
  }

  await recordAudit(req, {
    action: AuditAction.SUPPORT_TICKET_PRIORITY_UPDATE,
    target: `SupportTicket:${id}`,
    details: `Priority → ${priority}`,
  })

  res.json({ success: true, message: 'Priority updated' })
}