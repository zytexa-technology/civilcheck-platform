import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { generateUploadSignature, generateSignedDownloadUrl, parseCloudinaryUrl, UploadKind } from '../lib/cloudinary.js'
import { notifySeller } from '../services/notification.service.js'
import { sendWelcomeVerificationEmail } from '../services/emailVerification.service.js'

// bcrypt has a hard 72-byte input limit; sellerRegistrationSchema's
// passwordSchema already caps input at 72 characters so this only guards
// against callers that bypass Zod.
const PASSWORD_BCRYPT_ROUNDS = 10

// Profession was removed from the signup flow (audit 2026-09-02) — sellers
// are no longer asked for it and the client no longer sends it. The
// Seller.profession column is still NOT NULL with no default (kept
// untouched deliberately, per instruction, rather than migrated), so a
// value still has to land there on every insert. This is a placeholder for
// that DB constraint only — it is never shown to the seller as a choice
// they made and never surfaced anywhere as a real claim about them.
const LEGACY_DEFAULT_PROFESSION = 'PROPERTY_CONSULTANT' as const

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/seller/register
// ─────────────────────────────────────────────────────────────────────────────
// Seller pehli baar register karta hai
// Phone, name, profession, bank details deta hai
// JWT token milta hai — seller panel mein login ho jaata hai
// KYC status PENDING rehta hai jab tak admin approve na kare
// ─────────────────────────────────────────────────────────────────────────────
export const sellerRegister = async (req: Request, res: Response) => {
  // Body Zod-validated hai (sellerRegistrationSchema) — tcAccepted true hai,
  // bank pair (account+IFSC) format-checked hai, phone normalized hai,
  // email + password mandatory hain (auth cutover — MSG91 removed)
  const {
    phone, name, email, address, password, city, state, profession, bankAccount, ifsc, partnerRole,
    tcAccepted, selfieUrl, barCouncilDoc, digitalSignature, licenseNumber, yearsOfExperience,
  } = req.body

  // Basic validation — yeh sab fields zaroori hain
  // (profession intentionally NOT required here anymore — see
  // LEGACY_DEFAULT_PROFESSION above)
  if (!phone || !name) {
    res.status(400).json({
      success: false,
      message: 'Phone and name are both required'
    })
    return
  }

  try {
    // Email login identifier hai — duplicate nahi ho sakta (checked first,
    // ahead of phone, so an abandoned unverified signup on this email can be
    // resumed below rather than tripping the phone-uniqueness check against
    // its own existing row).
    const existingEmail = await prisma.seller.findUnique({ where: { email } })
    if (existingEmail && existingEmail.emailVerified) {
      res.status(409).json({
        success: false,
        message: 'This email is already registered.'
      })
      return
    }

    // Kya is phone se (kisi doosre account se) seller pehle se registered hai?
    const existingPhone = await prisma.seller.findUnique({ where: { phone } })
    if (existingPhone && existingPhone.id !== existingEmail?.id) {
      res.status(409).json({
        success: false,
        message: 'Is phone number se seller already registered hai'
      })
      return
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS)

    // Partner Module item 1.8 — Property Owner approval is instant.
    // Owners auto-activate on registration and skip the KYC review queue.
    // Phase 4A: Reporter also instant-activates — a Reporter sources public
    // property information rather than performing licensed professional
    // work, so there is nothing for KYC to gate (contrast Expert, who
    // performs paid verification work and stays gated behind Super Admin
    // approval — kycStatus keeps the schema default PENDING for them).
    // Signup Email Verification is orthogonal to all of this — instant KYC
    // approval does not skip email verification; see sellerLogin's
    // emailVerified gate.
    const instantApprove = partnerRole === 'OWNER' || partnerRole === 'REPORTER'

    const sellerData = {
      phone,
      name,
      email,
      address: address || null,
      passwordHash,
      city: city || null,
      state: state || null,
      // Client no longer sends this (removed from signup) — fall back to
      // the fixed placeholder so the NOT NULL column is still satisfied.
      // If a caller ever does send a real value, it's honored as before.
      profession: profession || LEGACY_DEFAULT_PROFESSION,
      // Property Expert KYC hardening — only Expert applications collect
      // these (sellerRegistrationSchema requires yearsOfExperience for
      // EXPERT; licenseNumber stays optional there too — "where
      // applicable"). Owner/Reporter never send them, so this is a no-op
      // for those roles.
      licenseNumber: licenseNumber || null,
      yearsOfExperience: yearsOfExperience ?? null,
      bankAccount: bankAccount || null,
      ifsc: ifsc || null,
      partnerRole: partnerRole || null,   // OWNER | EXPERT (REPORTER not offered at signup yet)
      tcAccepted: tcAccepted === true,    // compliance checkbox (PDF 6.1)
      selfieUrl: selfieUrl || null,
      barCouncilDoc: barCouncilDoc || null,
      digitalSignature: digitalSignature || null,
      // Owner → APPROVED immediately; everyone else keeps the schema default.
      ...(instantApprove ? { kycStatus: 'APPROVED' as const } : {}),
      // baaki sab default values schema se aayenge:
      // badge: BRONZE, kycStatus: PENDING, accuracyScore: 100, totalEarnings: 0
    }

    // A previously abandoned signup (unverified row already sitting on this
    // exact email — a verified one already short-circuited with 409 above)
    // is updated in place rather than rejected or duplicated.
    const seller = existingEmail
      ? await prisma.seller.update({ where: { id: existingEmail.id }, data: sellerData })
      : await prisma.seller.create({ data: { ...sellerData, emailVerified: false } })

    await sendWelcomeVerificationEmail('SELLER', seller.id, email, name)

    res.status(201).json({
      success: true,
      message: 'Account created. Please check your email for a verification code.',
      requiresVerification: true,
      email: seller.email,
    })
  } catch (err) {
    // Full error logged server-side only — the response used to echo the raw
    // Prisma message/code (e.g. P2002/P2022) to the client, more internal
    // detail than the rest of the codebase's error handling exposes (QA
    // audit 2026-08-03, finding #9).
    logger.error('[sellerRegister] ERROR:', err)
    res.status(500).json({ success: false, message: 'Registration failed — please try again' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/seller/kyc/certificate
// ─────────────────────────────────────────────────────────────────────────────
// Seller apna Bar Council ya CE certificate ka URL deta hai
// (File upload Cloudinary se hogi — yahan sirf URL save hota hai)
// Real implementation mein: frontend Cloudinary SDK se directly upload karega
// aur URL backend ko bhejega
// ─────────────────────────────────────────────────────────────────────────────
export const uploadCertificate = async (req: Request, res: Response) => {
  // sellerMiddleware ne req.seller set kiya tha
  const sellerId = req.seller!.id
  // Body Zod-validated hai (kycUploadSchema) — certificateUrl valid URL hai
  const { certificateUrl, selfieUrl } = req.body

  // Seller ka barCouncilDoc (+ selfie agar aayi ho) update karo. A fresh
  // document after a REJECTED decision re-enters the review queue —
  // kyc.service.ts's listPendingApplications only shows kycStatus PENDING,
  // so without this a seller who fixed their documents would silently
  // vanish from the admin's queue forever (QA audit finding, 2026-09-03).
  // Read-then-write inside a transaction so the resubmission check can't
  // race a concurrent admin decision.
  const seller = await prisma.$transaction(async (tx) => {
    const current = await tx.seller.findUnique({ where: { id: sellerId }, select: { kycStatus: true } })
    const resubmittingAfterRejection = current?.kycStatus === 'REJECTED'

    return tx.seller.update({
      where: { id: sellerId },
      data: {
        barCouncilDoc: certificateUrl,
        ...(selfieUrl ? { selfieUrl } : {}),
        ...(resubmittingAfterRejection ? { kycStatus: 'PENDING' as const } : {}),
      }
    })
  })

  res.json({
    success: true,
    message: seller.kycStatus === 'PENDING'
      ? 'Certificate submitted — your application is back in the review queue.'
      : 'Certificate uploaded. An admin will review it within 24-48 hours.',
    kycStatus: seller.kycStatus,
    barCouncilDoc: seller.barCouncilDoc
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/seller/kyc/identity-document
// ─────────────────────────────────────────────────────────────────────────────
// Manual identity-document verification (replaces DigiLocker OAuth) — the
// seller uploads a document via the same Cloudinary signed-upload flow as the
// certificate/selfie above, and an Admin reviews it by hand (see
// admin.controller.ts's approveIdentityDocument/rejectIdentityDocument).
// Status is always forced to PENDING here — never accepted from the request
// body (identityDocumentUploadSchema has no status field at all) — so a
// seller can never set their own verification result. A resubmission clears
// any prior review, since the new document has not been looked at yet.
// ─────────────────────────────────────────────────────────────────────────────
export const uploadIdentityDocument = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  // Body Zod-validated hai (identityDocumentUploadSchema) — documentUrl valid URL hai
  const { documentUrl } = req.body

  const seller = await prisma.seller.update({
    where: { id: sellerId },
    data: {
      identityDocumentUrl: documentUrl,
      identityVerificationStatus: 'PENDING',
      identityDocumentUploadedAt: new Date(),
      identityDocumentRejectionReason: null,
      identityDocumentReviewedAt: null,
      identityDocumentReviewedByAdminId: null,
    },
  })

  res.json({
    success: true,
    message: 'Identity document submitted. An admin will review it within 24-48 hours.',
    identityVerificationStatus: seller.identityVerificationStatus,
    identityDocumentUrl: seller.identityDocumentUrl,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/uploads/signature?purpose=kyc-certificate|kyc-selfie|kyc-identity-document|listing-document|listing-image|listing-video|property-document|property-image|property-video
// ─────────────────────────────────────────────────────────────────────────────
// Client Cloudinary ko DIRECTLY upload karega — file kabhi humare Express
// server se hokar nahi jaati. `purpose` folder AND upload kind decide karta
// hai; allowed formats aur max size signature ke andar already baked hain
// (cloudinary.ts) per kind — image purposes reject a video file's extension,
// document purposes reject a video's, etc. — isliye ek malicious client
// size/type change nahi kar sakta bina signature invalid kiye.
// ─────────────────────────────────────────────────────────────────────────────
// `authenticated: true` — KYC document security hardening. Only these three
// purposes hold sensitive identity/professional-credential material; every
// other purpose is deliberately left on public delivery, unchanged.
const UPLOAD_PURPOSES: Record<string, { folder: string; kind: UploadKind; authenticated?: boolean }> = {
  'kyc-certificate': { folder: 'kyc', kind: 'document', authenticated: true },
  'kyc-selfie': { folder: 'kyc', kind: 'image', authenticated: true },
  'kyc-identity-document': { folder: 'kyc-identity', kind: 'document', authenticated: true },
  'listing-document': { folder: 'listings', kind: 'document' },
  'listing-image': { folder: 'listings', kind: 'image' },
  'listing-video': { folder: 'listings', kind: 'video' },
  'property-document': { folder: 'properties', kind: 'document' },
  'property-image': { folder: 'properties', kind: 'image' },
  'property-video': { folder: 'properties', kind: 'video' },
  'reporter-post-image': { folder: 'reporter-posts', kind: 'image' },
}

export const getUploadSignature = (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const purpose = typeof req.query.purpose === 'string' ? req.query.purpose : ''

  const target = UPLOAD_PURPOSES[purpose]
  if (!target) {
    res.status(400).json({
      success: false,
      message: `purpose must be one of: ${Object.keys(UPLOAD_PURPOSES).join(', ')}`,
    })
    return
  }

  const upload = generateUploadSignature(`civilcheck/${target.folder}/${sellerId}`, target.kind, target.authenticated)

  res.json({
    success: true,
    upload,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/kyc/documents/:field/signed-url
// ─────────────────────────────────────────────────────────────────────────────
// KYC document security hardening — the certificate/selfie/identity-document
// URLs are now `type: authenticated` (see getUploadSignature above), so the
// raw stored URL is no longer directly viewable. This mints a fresh,
// short-lived signed URL on demand instead.
//
// :field is derived from the URL path (not client-trusted), sellerId comes
// ONLY from req.seller (the authenticated JWT) — never from anything the
// browser supplies — so a seller can only ever request a signed URL for
// their OWN documents. Same ownership guarantee as every other
// req.seller!.id-scoped endpoint in this file.
// ─────────────────────────────────────────────────────────────────────────────
const KYC_DOCUMENT_FIELDS = {
  certificate: 'barCouncilDoc',
  selfie: 'selfieUrl',
  'identity-document': 'identityDocumentUrl',
} as const
type KycDocumentField = keyof typeof KYC_DOCUMENT_FIELDS

// 5 minutes — long enough to open a viewer/tab, short enough that a leaked
// link (chat, screenshot, log line) is worthless shortly after.
const KYC_SIGNED_URL_TTL_SECONDS = 300

export const getKycDocumentSignedUrl = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const fieldParam = req.params.field as string

  if (!Object.prototype.hasOwnProperty.call(KYC_DOCUMENT_FIELDS, fieldParam)) {
    res.status(400).json({
      success: false,
      message: `field must be one of: ${Object.keys(KYC_DOCUMENT_FIELDS).join(', ')}`,
    })
    return
  }
  const column = KYC_DOCUMENT_FIELDS[fieldParam as KycDocumentField]

  // Selecting a fixed, literal-keyed object (rather than `{ [column]: true }`)
  // keeps Prisma's select typing precise; the dynamic pick happens afterward
  // on a plain, already-narrow object.
  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: { barCouncilDoc: true, selfieUrl: true, identityDocumentUrl: true },
  })
  const storedUrl = seller?.[column]

  if (!storedUrl) {
    res.status(404).json({ success: false, message: 'No document has been uploaded for this field yet' })
    return
  }

  const parsed = parseCloudinaryUrl(storedUrl)
  if (!parsed) {
    // Mock mode (no CLOUDINARY_* configured) or a pre-hardening public URL —
    // either way there is no real authenticated asset to sign against.
    // Returning the stored value as-is preserves local dev without a real
    // Cloudinary account, exactly like every other mock fallback in this
    // codebase.
    res.json({ success: true, url: storedUrl, mock: true })
    return
  }

  const signedUrl = generateSignedDownloadUrl({
    publicId: parsed.publicId,
    format: parsed.format,
    resourceType: parsed.resourceType,
    expiresInSeconds: KYC_SIGNED_URL_TTL_SECONDS,
  })

  if (!signedUrl) {
    res.json({ success: true, url: storedUrl, mock: true })
    return
  }

  res.json({ success: true, url: signedUrl, expiresInSeconds: KYC_SIGNED_URL_TTL_SECONDS })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/kyc/status
// ─────────────────────────────────────────────────────────────────────────────
// Seller check karta hai ki uska KYC approved hua ya nahi
// Frontend polling kar sakta hai ya seller manually check kar sakta hai
// ─────────────────────────────────────────────────────────────────────────────
export const getKycStatus = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id

  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: {
      kycStatus: true,
      kycRejectionReason: true,
      badge: true,
      aadhaarVerified: true,
      barCouncilDoc: true,
      accuracyScore: true,
      identityDocumentUrl: true,
      identityVerificationStatus: true,
      identityDocumentRejectionReason: true,
      profession: true,
      licenseNumber: true,
      yearsOfExperience: true,
    }
  })

  if (!seller) {
    res.status(404).json({ success: false, message: 'Seller not found' })
    return
  }

  // KYC ke basis par message show karo
  const statusMessages: Record<string, string> = {
    PENDING: 'KYC review is pending — an admin will approve it within 24-48 hours',
    APPROVED: 'KYC approved. You can now create listings.',
    REJECTED: 'KYC was rejected — please upload your documents again',
    SUSPENDED: 'Account is suspended — please contact support',
  }

  res.json({
    success: true,
    kycStatus: seller.kycStatus,
    kycRejectionReason: seller.kycRejectionReason,
    message: statusMessages[seller.kycStatus],
    badge: seller.badge,
    aadhaarVerified: seller.aadhaarVerified, // legacy — no longer set by anything, see schema.prisma
    certificateUploaded: !!seller.barCouncilDoc,
    accuracyScore: seller.accuracyScore,
    identityDocumentUrl: seller.identityDocumentUrl,
    identityVerificationStatus: seller.identityVerificationStatus,
    identityDocumentRejectionReason: seller.identityDocumentRejectionReason,
    profession: seller.profession,
    licenseNumber: seller.licenseNumber,
    yearsOfExperience: seller.yearsOfExperience,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/profile
// ─────────────────────────────────────────────────────────────────────────────
// Seller apni poori profile dekh sakta hai
// Listings count, earnings bhi saath mein aata hai
// ─────────────────────────────────────────────────────────────────────────────
export const getSellerProfile = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id

  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    include: {
      // Listings ka count aur basic info
      listings: {
        select: {
          id: true,
          address: true,
          city: true,
          status: true,
          riskBadge: true,
          views: true,
          price: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5, // sirf latest 5 listings
      }
    }
  })

  if (!seller) {
    res.status(404).json({ success: false, message: 'Seller not found' })
    return
  }

  // Total listings count alag se nikaalo
  const totalListings = await prisma.listing.count({ where: { sellerId } })
  const approvedListings = await prisma.listing.count({
    where: { sellerId, status: 'APPROVED' }
  })

  res.json({
    success: true,
    seller: {
      id: seller.id,
      name: seller.name,
      phone: seller.phone,
      email: seller.email,
      city: seller.city,
      state: seller.state,
      profession: seller.profession,
      licenseNumber: seller.licenseNumber,
      yearsOfExperience: seller.yearsOfExperience,
      partnerRole: seller.partnerRole,
      badge: seller.badge,
      kycStatus: seller.kycStatus,
      kycRejectionReason: seller.kycRejectionReason,
      aadhaarVerified: seller.aadhaarVerified, // legacy — no longer set by anything, see schema.prisma
      identityDocumentUrl: seller.identityDocumentUrl,
      identityVerificationStatus: seller.identityVerificationStatus,
      identityDocumentRejectionReason: seller.identityDocumentRejectionReason,
      accuracyScore: seller.accuracyScore,
      avgRating: seller.avgRating,
      reviewCount: seller.reviewCount,
      totalEarnings: seller.totalEarnings,
      bankAccount: seller.bankAccount,
      ifsc: seller.ifsc,
      createdAt: seller.createdAt,
      stats: {
        totalListings,
        approvedListings,
        pendingListings: totalListings - approvedListings,
      },
      recentListings: seller.listings,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/reviews
// ─────────────────────────────────────────────────────────────────────────────
// Buyer reviews jo is seller ko mile — review.service.ts har insert par
// avgRating/reviewCount recalculate karta hai; yeh endpoint un reviews ki
// actual list deta hai (reviewer, rating, comment).
// ─────────────────────────────────────────────────────────────────────────────
export const getSellerReviews = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { page = '1', limit = '50' } = req.query

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const skip = (pageNum - 1) * limitNum

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { sellerId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.review.count({ where: { sellerId } })
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    reviews: reviews.map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      reviewerName: r.user.name || 'Buyer',
      createdAt: r.createdAt,
    })),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/seller/profile
// ─────────────────────────────────────────────────────────────────────────────
// Seller apna name, bank account, IFSC update kar sakta hai
// Phone aur profession change nahi kar sakta (KYC se tied hain)
// ─────────────────────────────────────────────────────────────────────────────
export const updateSellerProfile = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { name, email, city, state, bankAccount, ifsc } = req.body

  // Sirf yeh fields update ho sakti hain
  // Phone aur profession intentionally nahi diya — wo KYC se tied hain
  const updateData: Prisma.SellerUpdateInput = {}
  if (name) updateData.name = name
  if (email) updateData.email = email
  if (city) updateData.city = city
  if (state) updateData.state = state
  if (bankAccount) updateData.bankAccount = bankAccount
  if (ifsc) updateData.ifsc = ifsc

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({
      success: false,
      message: 'Send at least one field to update — name, email, city, state, bankAccount or ifsc'
    })
    return
  }

  const seller = await prisma.seller.update({
    where: { id: sellerId },
    data: updateData,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      city: true,
      state: true,
      bankAccount: true,
      ifsc: true,
      badge: true,
      kycStatus: true,
    }
  })

  // Bank details drive the next weekly settlement payout — a receipt here
  // means an account takeover changing them doesn't go unnoticed by the
  // real owner (QA audit 2026-08-03, finding #4).
  if (bankAccount || ifsc) {
    notifySeller(seller, {
      type: 'profile',
      title: 'Bank details updated',
      body: `${seller.name}, your CivilCheck payout bank account was just changed. If this wasn't you, contact support immediately.`,
    }).catch((err) => logger.error('[updateSellerProfile] bank-change notify failed:', err))
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    seller
  })
}