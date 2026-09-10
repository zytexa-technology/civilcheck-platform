// ─────────────────────────────────────────────────────────────────────────────
// Property Verification Marketplace (Phase 3) — buyer-facing and
// professional-facing (Admin + Expert) endpoints. Admin OVERSIGHT endpoints
// (list everything, claims review, platform settings, force-cancel) live in
// admin.controller.ts instead, matching this codebase's existing split
// between "admin acts as a participant in a domain" (kept in that domain's
// own controller — see specialRequest.controller.ts's assign/approve) and
// "admin oversees everything" (admin.controller.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response } from 'express'
import type { PurchaseVerifyInput } from '@civilcheck/shared'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { getRazorpayKeyId, RazorpayError, verifyPaymentSignature } from '../lib/razorpay.js'
import {
  createVerificationAdvanceOrder,
  createVerificationFinalOrder,
  finalizeVerificationAdvance,
  finalizeVerificationFinalPayment,
} from '../services/payment.service.js'
import {
  VerificationError,
  acceptVerificationQuote,
  cancelVerificationRequest,
  createVerificationRequest,
  getMarketplaceRequestDetail,
  getQuotesForRequest,
  linkDiscoveredProperty,
  startVerification,
  submitVerificationQuote,
  submitVerificationReport,
  type CreateVerificationRequestInput,
  type ProfessionalActor,
} from '../services/verification.service.js'
import { notifySeller, notifyBuyerAlert } from '../services/notification.service.js'
import { getPlatformSettings } from '../services/platformSettings.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — lets any property-detail screen show "Verification starts from
// ₹X" (the brief's CTA copy) without duplicating the number client-side.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/verification-requests/config
export const getMarketplaceConfig = async (_req: Request, res: Response) => {
  const settings = await getPlatformSettings()
  res.json({ success: true, minVerificationFee: settings.minVerificationFee })
}

// ─────────────────────────────────────────────────────────────────────────────
// BUYER SIDE
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/verification-requests
export const createRequest = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const {
    source,
    listingId,
    propertyId,
    initialOfferAmount,
    desiredAddress,
    desiredCity,
    desiredTehsil,
    desiredPropertyType,
    desiredKhasraOrSurvey,
  } = req.body as CreateVerificationRequestInput

  try {
    const request = await createVerificationRequest(userId, {
      source,
      listingId,
      propertyId,
      initialOfferAmount,
      desiredAddress,
      desiredCity,
      desiredTehsil,
      desiredPropertyType,
      desiredKhasraOrSurvey,
    })
    void notifyBuyer(userId, {
      type: 'verification',
      title: 'Verification request submitted',
      body: `Your offer of ₹${request.buyerInitialOfferAmount.toLocaleString('en-IN')} is now open to professionals — you'll be able to compare their quotes and choose one.`,
      data: { verificationRequestId: request.id },
    })
    res.status(201).json({
      success: true,
      message: `Verification request submitted — your offer of ₹${request.buyerInitialOfferAmount.toLocaleString('en-IN')} is open to professionals. No payment is due yet.`,
      request,
    })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// GET /api/verification-requests
export const getMyRequests = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const requests = await prisma.verificationRequest.findMany({
    where: { userId },
    include: {
      acceptedQuote: true,
      assignedSeller: { select: { name: true, badge: true, profession: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // "Quotes available" badge for still-OPEN requests — one grouped query
  // rather than N, same reasoning as feedEngagement.service.ts's counts.
  const openIds = requests.filter((r) => r.status === 'OPEN').map((r) => r.id)
  const pendingCounts = openIds.length
    ? await prisma.verificationQuote.groupBy({
        by: ['requestId'],
        where: { requestId: { in: openIds }, status: 'PENDING' },
        _count: true,
      })
    : []
  const pendingByRequest = new Map(pendingCounts.map((c) => [c.requestId, c._count]))

  res.json({
    success: true,
    total: requests.length,
    requests: requests.map((r) => ({ ...r, pendingQuoteCount: pendingByRequest.get(r.id) ?? 0 })),
  })
}

// GET /api/verification-requests/:id
// Buyer must be able to see the quotation and professional details — the
// accepted quote's fee and the assigned professional's public info are
// included; nothing about competing (CLOSED) quotes is exposed, since those
// carry another professional's pricing.
//
// Property Discovery flow (Step 4E) — also selects the target `listing`/
// `property` (only public location fields, no seller-private data), which
// this endpoint never returned before. Needed so the buyer's detail page
// can transition from "Property Discovery" (desired* fields, no target) to
// the real linked Listing's location once linkDiscoveredProperty sets
// listingId — that transition was otherwise impossible to observe from this
// endpoint's response. Purely additive to an existing read query; no write
// path, payment, ledger, or other model is touched.
export const getRequestById = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const request = await prisma.verificationRequest.findUnique({
    where: { id },
    include: {
      acceptedQuote: true,
      assignedSeller: { select: { name: true, badge: true, profession: true, accuracyScore: true } },
      report: true,
      listing: { select: { address: true, city: true, tehsil: true, propertyType: true, latitude: true, longitude: true } },
      property: { select: { title: true, address: true, city: true, tehsil: true, propertyType: true, latitude: true, longitude: true } },
    },
  })

  if (!request || request.userId !== userId) {
    res.status(404).json({ success: false, message: 'Verification request not found' })
    return
  }

  // Report content is gated behind REPORT_UNLOCKED regardless of whether the
  // row exists (it's created on COMPLETED, well before payment finishes).
  const { report, ...rest } = request
  const reportVisible = request.status === 'REPORT_UNLOCKED'

  res.json({
    success: true,
    request: {
      ...rest,
      reportAvailable: Boolean(report),
      report: reportVisible ? report : null,
    },
  })
}

// GET /api/verification-requests/:id/quotes
// Buyer's comparison list — every PENDING quote on their own OPEN request,
// cheapest first. Once the request is no longer OPEN this naturally returns
// an empty list (all quotes are ACCEPTED/CLOSED by then), which the buyer-web
// UI treats the same as "nothing to compare".
export const getQuotes = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  try {
    const quotes = await getQuotesForRequest(id, userId)
    res.json({ success: true, total: quotes.length, quotes })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/verification-requests/:id/quotes/:quoteId/accept
export const acceptQuote = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string
  const quoteId = req.params.quoteId as string

  try {
    const result = await acceptVerificationQuote(id, userId, quoteId)

    void notifyAssignedProfessional(
      result.request.id,
      'Quote accepted',
      `The buyer accepted your quote of ₹${result.quote.proposedFee.toLocaleString('en-IN')} — they will be asked to pay the advance next.`
    )
    for (const closed of result.closedQuotes) {
      if (closed.quotedBySellerId) void notifyLosingProfessional(closed.quotedBySellerId, id)
    }
    void notifyBuyer(userId, {
      type: 'verification',
      title: 'Quote accepted',
      body: `You accepted a quote of ₹${result.quote.proposedFee.toLocaleString('en-IN')}. Pay the advance to begin verification.`,
      data: { verificationRequestId: id },
    })

    res.json({
      success: true,
      message: `Quote accepted — pay the advance to begin verification.`,
      request: result.request,
      quote: result.quote,
    })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/verification-requests/:id/advance-order
export const createAdvanceOrder = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const request = await prisma.verificationRequest.findUnique({ where: { id } })
  if (!request || request.userId !== userId) {
    res.status(404).json({ success: false, message: 'Verification request not found' })
    return
  }
  // ACCEPTED (first attempt) and ADVANCE_PAYMENT_PENDING (buyer closed the
  // checkout sheet before paying, or the earlier order simply expired) both
  // get a fresh order — createVerificationAdvanceOrder's status write is
  // idempotent, and finalizeVerificationAdvance settles the request from
  // whichever specific order the buyer actually pays.
  if (request.status !== 'ACCEPTED' && request.status !== 'ADVANCE_PAYMENT_PENDING') {
    res.status(400).json({ success: false, message: 'An advance payment order can only be created once a professional has been assigned' })
    return
  }

  try {
    const { order } = await createVerificationAdvanceOrder(userId, request)
    res.status(201).json({
      success: true,
      message: 'Advance payment order created — 50% of the agreed fee',
      order,
      razorpayKeyId: getRazorpayKeyId(),
    })
  } catch (err) {
    if (err instanceof RazorpayError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/verification-requests/:id/advance-verify
export const verifyAdvancePayment = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string
  const { orderId, paymentId, signature } = req.body as PurchaseVerifyInput

  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    res.status(400).json({ success: false, message: 'Payment signature invalid' })
    return
  }

  const paymentOrder = await prisma.paymentOrder.findUnique({ where: { id: orderId } })
  if (!paymentOrder || paymentOrder.userId !== userId || paymentOrder.verificationRequestId !== id) {
    res.status(404).json({ success: false, message: 'Order not found' })
    return
  }
  if (paymentOrder.kind !== 'VERIFICATION_ADVANCE') {
    res.status(400).json({ success: false, message: 'This order is not a verification advance payment' })
    return
  }

  const { request, alreadyProcessed } = await finalizeVerificationAdvance(paymentOrder, paymentId)

  if (!alreadyProcessed && request?.status === 'ADVANCE_PAID') {
    void notifyAssignedProfessional(request.id, 'Advance payment received', 'The buyer has paid the advance — you can begin verification.')
    void notifyBuyer(request.userId, {
      type: 'payment',
      title: 'Advance payment successful',
      body: 'Your advance payment was received. The professional will begin verification shortly.',
      data: { verificationRequestId: request.id },
    })
  }

  res.json({
    success: true,
    message: alreadyProcessed ? 'Advance payment already verified' : 'Advance payment verified',
    alreadyProcessed,
    request,
  })
}

// POST /api/verification-requests/:id/final-order
export const createFinalOrder = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const request = await prisma.verificationRequest.findUnique({ where: { id } })
  if (!request || request.userId !== userId) {
    res.status(404).json({ success: false, message: 'Verification request not found' })
    return
  }
  // Same retry allowance as the advance order: COMPLETED (first attempt) or
  // FINAL_PAYMENT_PENDING (checkout was abandoned last time).
  if (request.status !== 'COMPLETED' && request.status !== 'FINAL_PAYMENT_PENDING') {
    res.status(400).json({ success: false, message: 'The remaining payment can only be requested once verification is complete' })
    return
  }

  try {
    const { order } = await createVerificationFinalOrder(userId, request)
    res.status(201).json({
      success: true,
      message: 'Final payment order created — the remaining 50%',
      order,
      razorpayKeyId: getRazorpayKeyId(),
    })
  } catch (err) {
    if (err instanceof RazorpayError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/verification-requests/:id/final-verify
export const verifyFinalPayment = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string
  const { orderId, paymentId, signature } = req.body as PurchaseVerifyInput

  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    res.status(400).json({ success: false, message: 'Payment signature invalid' })
    return
  }

  const paymentOrder = await prisma.paymentOrder.findUnique({ where: { id: orderId } })
  if (!paymentOrder || paymentOrder.userId !== userId || paymentOrder.verificationRequestId !== id) {
    res.status(404).json({ success: false, message: 'Order not found' })
    return
  }
  if (paymentOrder.kind !== 'VERIFICATION_FINAL') {
    res.status(400).json({ success: false, message: 'This order is not a verification final payment' })
    return
  }

  const { request, alreadyProcessed } = await finalizeVerificationFinalPayment(paymentOrder, paymentId)

  if (!alreadyProcessed && request?.status === 'REPORT_UNLOCKED') {
    void notifyBuyer(request.userId, {
      type: 'verification',
      title: 'Report unlocked 🎉',
      body: 'Your final payment was received — the full verification report is now available.',
      data: { verificationRequestId: request.id },
    })
  }

  res.json({
    success: true,
    message: alreadyProcessed
      ? 'Final payment already verified'
      : 'Final payment verified — your full report is unlocked',
    alreadyProcessed,
    request,
  })
}

// GET /api/verification-requests/:id/report
export const getReport = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const request = await prisma.verificationRequest.findUnique({
    where: { id },
    include: { report: true },
  })
  if (!request || request.userId !== userId) {
    res.status(404).json({ success: false, message: 'Verification request not found' })
    return
  }
  if (request.status !== 'REPORT_UNLOCKED') {
    res.status(403).json({
      success: false,
      message: 'The full report unlocks once the remaining payment is complete',
      status: request.status,
    })
    return
  }
  if (!request.report) {
    res.status(404).json({ success: false, message: 'Report not found' })
    return
  }

  res.json({ success: true, report: request.report })
}

// POST /api/verification-requests/:id/cancel
export const cancelRequest = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string
  const { reason } = req.body as { reason: string }

  try {
    const result = await cancelVerificationRequest(id, userId, reason)
    void notifyBuyer(userId, {
      type: 'cancellation',
      title: 'Verification request cancelled',
      body:
        result.cancellationFee > 0
          ? `Your request was cancelled. A cancellation fee of ₹${result.cancellationFee} applies — ₹${result.refundAmount} will be refunded once processed.`
          : 'Your request was cancelled. No cancellation fee applies.',
      data: { verificationRequestId: id },
    })
    res.json({
      success: true,
      message:
        result.cancellationFee > 0
          ? `Request cancelled. A cancellation fee of ₹${result.cancellationFee} applies — ₹${result.refundAmount} will be refunded.`
          : 'Request cancelled. No cancellation fee applies.',
      ...result,
    })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/verification-requests/:id/claims
// Buyer's "Raise a Claim" — only after the report has actually been
// delivered (REPORT_UNLOCKED). No automatic refund decision happens here;
// this only records the dispute for an Admin/Super Admin to review (see
// admin.controller.ts's resolveClaim).
export const createClaim = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string
  const { reason, description, evidence } = req.body as {
    reason: string
    description: string
    evidence: string[]
  }

  const request = await prisma.verificationRequest.findUnique({ where: { id } })
  if (!request || request.userId !== userId) {
    res.status(404).json({ success: false, message: 'Verification request not found' })
    return
  }
  if (request.status !== 'REPORT_UNLOCKED') {
    res.status(400).json({ success: false, message: 'A claim can only be raised after the report has been delivered' })
    return
  }

  const existingActive = await prisma.claim.findFirst({
    where: { verificationRequestId: id, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
  })
  if (existingActive) {
    res.status(409).json({ success: false, message: 'An active claim already exists for this request' })
    return
  }

  const claim = await prisma.claim.create({
    data: { verificationRequestId: id, userId, reason, description, evidence: evidence ?? [] },
  })

  void notifyBuyer(userId, {
    type: 'claim',
    title: 'Claim submitted',
    body: `Your claim ("${reason}") has been submitted — an admin will review it.`,
    data: { verificationRequestId: id, claimId: claim.id },
  })

  res.status(201).json({
    success: true,
    message: 'Claim submitted — an admin will review it.',
    claim,
  })
}

// GET /api/verification-requests/:id/claims
export const getMyClaims = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const request = await prisma.verificationRequest.findUnique({ where: { id } })
  if (!request || request.userId !== userId) {
    res.status(404).json({ success: false, message: 'Verification request not found' })
    return
  }

  const claims = await prisma.claim.findMany({
    where: { verificationRequestId: id, userId },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ success: true, total: claims.length, claims })
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFESSIONAL SIDE (Admin + Expert) — resolveActor() builds a
// ProfessionalActor from whichever authenticated principal called in.
// ─────────────────────────────────────────────────────────────────────────────

function resolveActor(req: Request): ProfessionalActor {
  if (req.admin) return { adminId: req.admin.id }
  return { sellerId: req.seller!.id }
}

// GET /api/{seller/verification-marketplace,admin/verification-marketplace}
// The open marketplace — every request still accepting quotes. Each row
// carries `myQuote` (this actor's own quote on it, or null) so the list can
// show a per-request quote-status column without a follow-up call per row —
// never another professional's quote, same restraint as the detail endpoint.
//
// Property Discovery flow (Step 4B) — a DISCOVERY row here has `listing:
// null, property: null` (Prisma resolves an absent relation to null, it
// never throws), while its desiredAddress/desiredCity/desiredTehsil/
// desiredPropertyType/desiredKhasraOrSurvey columns are already present on
// every row regardless of source — this query never `select`s a narrower
// shape. No buyer identity is joined here for any source, so there is
// nothing DISCOVERY-specific to further restrict for PII. Quoting
// eligibility (Expert-only, KYC-approved, one quote per professional) for
// DISCOVERY is enforced in submitVerificationQuote, not here — this
// endpoint is a read of what's open, same visibility for every source.
export const getMarketplaceRequests = async (req: Request, res: Response) => {
  const actor = resolveActor(req)

  const requests = await prisma.verificationRequest.findMany({
    where: { status: 'OPEN' },
    include: {
      listing: { select: { address: true, city: true, tehsil: true, propertyType: true } },
      property: { select: { title: true, city: true, tehsil: true, address: true, propertyType: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const myQuotes = requests.length
    ? await prisma.verificationQuote.findMany({
        where: {
          requestId: { in: requests.map((r) => r.id) },
          ...(actor.sellerId ? { quotedBySellerId: actor.sellerId } : { quotedByAdminId: actor.adminId }),
        },
      })
    : []
  const myQuoteByRequest = new Map(myQuotes.map((q) => [q.requestId, q]))

  res.json({
    success: true,
    total: requests.length,
    requests: requests.map((r) => ({ ...r, myQuote: myQuoteByRequest.get(r.id) ?? null })),
  })
}

// GET /api/{seller,admin}/verification-marketplace/:id
export const getMarketplaceRequestById = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const actor = resolveActor(req)

  try {
    const result = await getMarketplaceRequestDetail(id, actor)
    res.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/{...}/verification-marketplace/:id/quote
export const submitQuote = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { proposedFee, message } = req.body as { proposedFee: number; message?: string }
  const actor = resolveActor(req)

  // "verified Experts" per the brief — an Expert whose KYC isn't APPROVED
  // yet cannot compete for verification work. Admins have no KYC concept.
  if (actor.sellerId) {
    const seller = await prisma.seller.findUnique({ where: { id: actor.sellerId } })
    if (seller?.kycStatus !== 'APPROVED') {
      res.status(403).json({ success: false, message: 'Only KYC-approved Experts can submit a verification quote' })
      return
    }
  }

  try {
    const quote = await submitVerificationQuote(id, actor, { proposedFee, message })

    void notifyBuyerNewQuote(id, proposedFee)

    res.status(201).json({
      success: true,
      message: 'Quote submitted — waiting for the buyer to review it.',
      quote,
    })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// GET /api/{seller,admin}/verification-marketplace/my-assignments
export const getMyAssignments = async (req: Request, res: Response) => {
  const actor = resolveActor(req)
  const where = actor.sellerId ? { assignedSellerId: actor.sellerId } : { assignedAdminId: actor.adminId }

  const requests = await prisma.verificationRequest.findMany({
    where: { ...where, status: { not: 'OPEN' } },
    include: {
      user: { select: { name: true, phone: true } },
      listing: { select: { address: true, city: true } },
      property: { select: { title: true, city: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  res.json({ success: true, total: requests.length, requests })
}

// POST /api/{...}/verification-marketplace/:id/start
export const start = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const actor = resolveActor(req)

  try {
    const request = await startVerification(id, actor)
    void notifyBuyer(request.userId, {
      type: 'verification',
      title: 'Verification started',
      body: 'The assigned professional has started work on your verification request.',
      data: { verificationRequestId: request.id },
    })
    res.json({ success: true, message: 'Verification started', request })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/seller/verification-marketplace/:id/discovered-listing
// Property Discovery flow (Step 4B) — Expert-only (see verification.routes.ts;
// this is deliberately not mounted on adminMarketplaceRouter). Links a
// Listing the Expert already created via the normal New Listing flow onto
// their accepted DISCOVERY request; every business rule (assignment, role,
// KYC, ownership, listing validity, request state, race-safety) lives in
// linkDiscoveredProperty.
export const linkListing = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const actor = resolveActor(req)
  const { listingId } = req.body as { listingId: string }

  try {
    const { request } = await linkDiscoveredProperty(id, actor, listingId)
    // Notify the buyer exactly once, only on a successful link — never on a
    // failed/rejected/duplicate attempt (those all throw above and are
    // caught below without reaching this line).
    void notifyBuyer(request.userId, {
      type: 'verification',
      title: 'Property found',
      body: 'The assigned Expert found and linked your property — verification will begin shortly.',
      data: { verificationRequestId: request.id },
    })
    res.json({ success: true, message: 'Listing linked — verification can now proceed.', request })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/{...}/verification-marketplace/:id/report
export const submitReport = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const actor = resolveActor(req)
  const { findings, riskAssessment, documents, images, videos } = req.body as {
    findings: string
    riskAssessment?: 'GREEN' | 'AMBER' | 'RED'
    documents: string[]
    images: string[]
    videos: string[]
  }

  try {
    const report = await submitVerificationReport(id, actor, {
      findings,
      riskAssessment,
      documents,
      images,
      videos,
    })
    void notifyBuyerVerificationCompleted(id)
    res.status(201).json({
      success: true,
      message: 'Verification report submitted. The buyer will be asked for the remaining payment.',
      report,
    })
  } catch (err) {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS — best-effort, never block the request that triggered them.
// ─────────────────────────────────────────────────────────────────────────────

// Generic buyer notifier (Phase 4C) — reuses notifyBuyerAlert, the one
// existing buyer notification pathway, for every verification/payment/
// cancellation/claim lifecycle event. Looks the buyer up by id so call
// sites only ever need to pass the id they already have on hand.
async function notifyBuyer(
  userId: string,
  notification: { type: string; title: string; body: string; data?: Record<string, string> }
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return
    await notifyBuyerAlert(
      { id: user.id, phone: user.phone, email: user.email, fcmToken: user.fcmToken, pushEnabled: user.pushEnabled },
      notification
    )
  } catch (err) {
    logger.error(`[verification] notifyBuyer failed for user ${userId}: ${err}`)
  }
}

async function notifyLosingProfessional(sellerId: string, requestId: string): Promise<void> {
  try {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      select: { id: true, name: true, phone: true, email: true },
    })
    if (!seller) return
    await notifySeller(seller, {
      type: 'request',
      title: 'Request no longer available',
      body: 'Another professional accepted this verification request before your quote landed.',
    })
  } catch (err) {
    logger.error(`[verification] notifyLosingProfessional failed for seller ${sellerId} / request ${requestId}: ${err}`)
  }
}

async function notifyAssignedProfessional(requestId: string, title: string, body: string): Promise<void> {
  try {
    const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
    if (!request?.assignedSellerId) return // no in-app channel for an assigned Admin today
    const seller = await prisma.seller.findUnique({
      where: { id: request.assignedSellerId },
      select: { id: true, name: true, phone: true, email: true },
    })
    if (!seller) return
    await notifySeller(seller, { type: 'request', title, body })
  } catch (err) {
    logger.error(`[verification] notifyAssignedProfessional failed for request ${requestId}: ${err}`)
  }
}

// New quote received (buyer-choice negotiation flow) — lets the buyer know
// there's something to compare, without leaking the professional's identity
// or exposing every quote's price via push copy (the buyer reviews the full
// list in-app via getQuotesForRequest).
async function notifyBuyerNewQuote(requestId: string, proposedFee: number): Promise<void> {
  try {
    const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
    if (!request) return
    void notifyBuyer(request.userId, {
      type: 'verification',
      title: 'New verification quote',
      body: `A professional quoted ₹${proposedFee.toLocaleString('en-IN')} for your verification request. Review and accept a quote to proceed.`,
      data: { verificationRequestId: requestId },
    })
  } catch (err) {
    logger.error(`[verification] notifyBuyerNewQuote failed for request ${requestId}: ${err}`)
  }
}

async function notifyBuyerVerificationCompleted(requestId: string): Promise<void> {
  try {
    const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
    if (!request) return
    const user = await prisma.user.findUnique({ where: { id: request.userId } })
    if (!user) return
    await notifyBuyerAlert(
      { id: user.id, phone: user.phone, email: user.email, fcmToken: user.fcmToken, pushEnabled: user.pushEnabled },
      {
        title: 'Verification completed',
        body: 'The professional has submitted their findings. Pay the remaining amount to unlock the full report.',
        data: { verificationRequestId: request.id },
      }
    )
  } catch (err) {
    logger.error(`[verification] notifyBuyerVerificationCompleted failed for request ${requestId}: ${err}`)
  }
}
