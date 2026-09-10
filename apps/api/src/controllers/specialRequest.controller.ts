import { Request, Response } from 'express'
import { Prisma, SpecialRequestStatus } from '@prisma/client'
import type { PurchaseVerifyInput } from '@civilcheck/shared'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { AuditAction, recordAudit } from '../services/audit.service.js'
import { notifySeller } from '../services/notification.service.js'
import { getRazorpayKeyId, RazorpayError, verifyPaymentSignature } from '../lib/razorpay.js'
import { createSpecialRequestOrder, finalizeSpecialRequestAdvance } from '../services/payment.service.js'
import { executeRefund } from '../services/refund.service.js'
import { createPayoutForApprovedRequest } from '../services/specialRequestPayout.service.js'
import { selectBestSellerForRequest } from '../services/sellerMatch.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// BUYER SIDE
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/special-requests
// ─────────────────────────────────────────────────────────────────────────────
// Buyer koi aisi property verify karwana chahta hai
// jo abhi CivilCheck database mein nahi hai
// Request row turant create hoti hai (PENDING, advancePaid: false), phir ek
// Razorpay order bhi banta hai — buyer checkout complete karke POST
// /api/special-requests/:id/verify se advance confirm karta hai. Admin tabhi
// assign kar sakta hai jab advancePaid true ho (see assignRequest).
// ─────────────────────────────────────────────────────────────────────────────
export const createSpecialRequest = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const {
    address,
    city,
    tehsil,
    propertyType,
    questions,     // Buyer ke specific questions
    documents,     // Buyer ke paas jo existing docs hain (Cloudinary URLs)
    advanceAmount, // Rs. 999 - Rs. 4999
  } = req.body

  // Validation
  if (!address || !city || !tehsil || !propertyType || !questions || !advanceAmount) {
    res.status(400).json({
      success: false,
      message: 'address, city, tehsil, propertyType, questions and advanceAmount are all required'
    })
    return
  }

  // Advance amount range check
  if (advanceAmount < 999 || advanceAmount > 4999) {
    res.status(400).json({
      success: false,
      message: 'Advance amount must be between Rs. 999 and Rs. 4999'
    })
    return
  }

  const specialRequest = await prisma.specialRequest.create({
    data: {
      userId,
      address,
      city,
      tehsil,
      propertyType,
      questions,
      documents: documents || [],
      advanceAmount,
      status: 'PENDING',
    }
  })

  try {
    const { order } = await createSpecialRequestOrder(userId, specialRequest)

    res.status(201).json({
      success: true,
      message: 'Special request submitted — please complete the advance payment',
      requestId: specialRequest.id,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      // null in mock mode; the frontend runs its mock checkout then calls /verify.
      razorpayKeyId: getRazorpayKeyId(),
      expectedDelivery: '48-72 hours',
      request: {
        id: specialRequest.id,
        address: specialRequest.address,
        city: specialRequest.city,
        status: specialRequest.status,
        advanceAmount: specialRequest.advanceAmount,
        advancePaid: specialRequest.advancePaid,
        createdAt: specialRequest.createdAt,
      }
    })
  } catch (err) {
    if (err instanceof RazorpayError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/special-requests/:id/retry
// ─────────────────────────────────────────────────────────────────────────────
// Reopens checkout for a request that's still PENDING/unpaid — covers both
// createSpecialRequestOrder throwing after the row was already committed
// (Razorpay hiccup) and the buyer simply abandoning the first checkout.
// Mints a fresh order the same way createSpecialRequest does; a stale earlier
// CREATED order (if one exists) is left alone — finalizeSpecialRequestAdvance
// validates orderId+specialRequestId+kind, so whichever order actually gets
// paid completes correctly.
// ─────────────────────────────────────────────────────────────────────────────
export const retrySpecialRequestPayment = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const request = await prisma.specialRequest.findUnique({ where: { id } })

  if (!request || request.userId !== userId) {
    res.status(404).json({ success: false, message: 'Request not found' })
    return
  }

  if (request.advancePaid || request.status !== 'PENDING') {
    res.status(400).json({
      success: false,
      message: 'This request has already been paid or assigned — no retry is needed'
    })
    return
  }

  try {
    const { order } = await createSpecialRequestOrder(userId, request)

    res.status(201).json({
      success: true,
      message: 'New order created — please complete the advance payment',
      requestId: request.id,
      order: { id: order.id, amount: order.amount, currency: order.currency },
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

// POST /api/special-requests/:id/verify
// ─────────────────────────────────────────────────────────────────────────────
// Confirms the checkout handshake for a special-request advance — mirrors
// purchase.controller.ts's verifyPurchase. The signature proves the payment
// belongs to the order; the webhook is the safety net if the client never
// calls this. Body is validated + normalized by purchaseVerifySchema (same
// snake_case → camelCase shape Razorpay Checkout returns for any order).
// ─────────────────────────────────────────────────────────────────────────────
export const verifySpecialRequestAdvance = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string
  const { orderId, paymentId, signature } = req.body as PurchaseVerifyInput

  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    res.status(400).json({ success: false, message: 'Payment signature invalid' })
    return
  }

  const paymentOrder = await prisma.paymentOrder.findUnique({ where: { id: orderId } })

  // The order must exist, belong to the caller, and belong to THIS request —
  // a valid signature for someone else's order must not confirm this one.
  if (!paymentOrder || paymentOrder.userId !== userId || paymentOrder.specialRequestId !== id) {
    res.status(404).json({ success: false, message: 'Order not found' })
    return
  }

  if (paymentOrder.kind !== 'SPECIAL_REQUEST_ADVANCE') {
    res.status(400).json({ success: false, message: 'This order is not for a special request advance' })
    return
  }

  const { specialRequest, alreadyProcessed } = await finalizeSpecialRequestAdvance(paymentOrder, paymentId)

  res.json({
    success: true,
    message: alreadyProcessed
      ? 'Advance pehle se verified hai'
      : 'Advance payment verified — admin jaldi assign karega',
    alreadyProcessed,
    request: specialRequest,
  })
}

// GET /api/special-requests
// ─────────────────────────────────────────────────────────────────────────────
// Buyer ki saari special requests aur unka current status
// ─────────────────────────────────────────────────────────────────────────────
export const getMySpecialRequests = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const requests = await prisma.specialRequest.findMany({
    where: { userId },
    include: {
      seller: {
        select: { name: true, badge: true, profession: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  res.json({
    success: true,
    total: requests.length,
    requests: requests.map(r => ({
      id: r.id,
      address: r.address,
      city: r.city,
      tehsil: r.tehsil,
      status: r.status,
      advanceAmount: r.advanceAmount,
      advancePaid: r.advancePaid,
      assignedTo: r.seller || null,
      adminNote: r.adminNote,
      completedListingId: r.completedListingId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // Status ke hisaab se message
      statusMessage: getStatusMessage(r.status),
    }))
  })
}

// GET /api/special-requests/:id
// ─────────────────────────────────────────────────────────────────────────────
// Single special request ka poora detail
// ─────────────────────────────────────────────────────────────────────────────
export const getSpecialRequestById = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const request = await prisma.specialRequest.findUnique({
    where: { id },
    include: {
      seller: {
        select: { name: true, badge: true, profession: true, phone: true }
      }
    }
  })

  if (!request || request.userId !== userId) {
    res.status(404).json({ success: false, message: 'Request not found' })
    return
  }

  res.json({
    success: true,
    request: {
      ...request,
      statusMessage: getStatusMessage(request.status),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SELLER SIDE
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/seller/special-requests/available
// ─────────────────────────────────────────────────────────────────────────────
// Seller ko admin ne jo requests assign ki hain woh dekhe
// ─────────────────────────────────────────────────────────────────────────────
export const getAvailableRequests = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id

  const requests = await prisma.specialRequest.findMany({
    where: {
      sellerId,
      status: { in: ['ASSIGNED', 'IN_PROGRESS'] }
    },
    include: {
      user: { select: { name: true, phone: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  res.json({
    success: true,
    total: requests.length,
    requests: requests.map(r => ({
      id: r.id,
      address: r.address,
      city: r.city,
      tehsil: r.tehsil,
      propertyType: r.propertyType,
      questions: r.questions,
      documents: r.documents,
      advanceAmount: r.advanceAmount,
      status: r.status,
      buyerName: r.user.name,
      createdAt: r.createdAt,
      // Deadline — 72 hours se assigned time
      deadline: new Date(new Date(r.createdAt).getTime() + 72 * 60 * 60 * 1000),
    }))
  })
}

// GET /api/seller/special-requests
// ─────────────────────────────────────────────────────────────────────────────
// Seller ki apni special-request history — SAARI statuses (ASSIGNED,
// IN_PROGRESS, COMPLETED, APPROVED, REJECTED, REFUNDED). getAvailableRequests
// (above) sirf ASSIGNED/IN_PROGRESS deta hai — jaise hi seller submit karta
// hai (COMPLETED) woh us list se hamesha ke liye gayab ho jaati hai, aur
// isliye woh history yahan se milti hai instead.
// ─────────────────────────────────────────────────────────────────────────────
export const getMySpecialRequestHistory = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id

  const requests = await prisma.specialRequest.findMany({
    where: { sellerId },
    include: {
      user: { select: { name: true, phone: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  res.json({
    success: true,
    total: requests.length,
    requests: requests.map(r => ({
      id: r.id,
      address: r.address,
      city: r.city,
      tehsil: r.tehsil,
      propertyType: r.propertyType,
      advanceAmount: r.advanceAmount,
      status: r.status,
      buyerName: r.user.name,
      completedListingId: r.completedListingId,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  })
}

// POST /api/seller/special-requests/:id/accept
// ─────────────────────────────────────────────────────────────────────────────
// Seller assigned request accept karta hai
// ─────────────────────────────────────────────────────────────────────────────
export const acceptRequest = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  // Explicit defense-in-depth (QA audit finding) — a request can only ever
  // reach ASSIGNED via assignRequest below, which already refuses to assign
  // to a non-APPROVED Expert, so this is currently unreachable in practice.
  // Checked directly anyway rather than relying solely on that upstream
  // gate, matching the pattern already used in createListing/assignRequest/
  // the verification controller.
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { kycStatus: true } })
  if (seller?.kycStatus !== 'APPROVED') {
    res.status(403).json({ success: false, message: 'Only KYC-approved Experts can accept requests' })
    return
  }

  const request = await prisma.specialRequest.findUnique({ where: { id } })

  if (!request || request.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Request not found' })
    return
  }

  if (request.status !== 'ASSIGNED') {
    res.status(400).json({
      success: false,
      message: 'Only ASSIGNED requests can be accepted'
    })
    return
  }

  await prisma.specialRequest.update({
    where: { id },
    data: { status: 'IN_PROGRESS' }
  })

  res.json({
    success: true,
    message: 'Request accepted. Please complete the research within 72 hours.',
    deadline: new Date(Date.now() + 72 * 60 * 60 * 1000)
  })
}

// POST /api/seller/special-requests/:id/decline
// ─────────────────────────────────────────────────────────────────────────────
// Seller request decline karta hai — admin dobara assign karega
// ─────────────────────────────────────────────────────────────────────────────
export const declineRequest = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string
  const { reason } = req.body

  const request = await prisma.specialRequest.findUnique({ where: { id } })

  if (!request || request.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Request not found' })
    return
  }

  // Seller se unassign karo — admin dobara assign karega
  await prisma.specialRequest.update({
    where: { id },
    data: {
      sellerId: null,
      status: 'PENDING',
      adminNote: `The seller declined. Reason: ${reason || 'Not provided'}. Please reassign.`
    }
  })

  res.json({
    success: true,
    message: 'Request declined. An admin has been notified.'
  })
}

// POST /api/seller/special-requests/:id/submit
// ─────────────────────────────────────────────────────────────────────────────
// Seller research complete karke listing ID submit karta hai
// Admin tab approve karega
// ─────────────────────────────────────────────────────────────────────────────
export const submitRequest = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string
  const { listingId } = req.body // Seller ne jo listing create ki uska ID

  // Explicit defense-in-depth (QA audit finding) — same reasoning as
  // acceptRequest above; currently unreachable in practice since
  // createListing already requires kycStatus APPROVED before a listingId
  // can exist to submit here, but checked directly rather than relying on
  // that alone.
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { kycStatus: true } })
  if (seller?.kycStatus !== 'APPROVED') {
    res.status(403).json({ success: false, message: 'Only KYC-approved Experts can submit reports' })
    return
  }

  if (!listingId) {
    res.status(400).json({
      success: false,
      message: 'listingId is required — create the listing first, then submit it here'
    })
    return
  }

  const request = await prisma.specialRequest.findUnique({ where: { id } })

  if (!request || request.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Request not found' })
    return
  }

  if (request.status !== 'IN_PROGRESS') {
    res.status(400).json({
      success: false,
      message: 'Only IN_PROGRESS requests can be submitted'
    })
    return
  }

  // Listing exist karti hai?
  const listing = await prisma.listing.findUnique({ where: { id: listingId } })
  if (!listing || listing.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Listing not found' })
    return
  }

  await prisma.specialRequest.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      completedListingId: listingId,
    }
  })

  res.json({
    success: true,
    message: 'Research submitted. An admin will review and approve it.',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SIDE
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/special-requests
// ─────────────────────────────────────────────────────────────────────────────
// Saari special requests — filter by status
// ─────────────────────────────────────────────────────────────────────────────
export const getAllSpecialRequests = async (req: Request, res: Response) => {
  const { status, page = '1', limit = '20' } = req.query

  const where: Prisma.SpecialRequestWhereInput = {}
  if (status) where.status = status as SpecialRequestStatus

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)

  const [requests, total] = await Promise.all([
    prisma.specialRequest.findMany({
      where,
      include: {
        user: { select: { name: true, phone: true } },
        seller: { select: { name: true, badge: true, phone: true } }
      },
      orderBy: { createdAt: 'asc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.specialRequest.count({ where })
  ])

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    requests
  })
}

// POST /api/admin/special-requests/:id/assign
// ─────────────────────────────────────────────────────────────────────────────
// Admin request ko seller ko assign karta hai
// ─────────────────────────────────────────────────────────────────────────────
export const assignRequest = async (req: Request, res: Response) => {
  const id = req.params.id as string
  let { sellerId } = req.body as { sellerId?: string }

  const request = await prisma.specialRequest.findUnique({ where: { id } })
  if (!request) {
    res.status(404).json({ success: false, message: 'Request not found' })
    return
  }

  if (!request.advancePaid) {
    res.status(400).json({
      success: false,
      message: 'The advance payment has not been verified yet — this request cannot be assigned'
    })
    return
  }

  // Nearest-qualified-seller-in-tehsil auto-selection (PDF 7.9) — when the
  // admin omits sellerId, pick the best candidate instead of requiring a
  // manual choice. Passing sellerId explicitly keeps the old behavior.
  let autoAssigned = false
  let matchReason: string | null = null
  if (!sellerId) {
    const match = await selectBestSellerForRequest(request)
    if (!match) {
      res.status(400).json({
        success: false,
        message: 'No qualified seller is available — please specify a sellerId manually'
      })
      return
    }
    sellerId = match.sellerId
    matchReason = match.reason
    autoAssigned = true
  }

  // Seller exist karta hai, approved hai, aur expert persona hai? (owner
  // accounts never registered for this professional research work — QA audit
  // 2026-08-03, finding #2)
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } })
  if (!seller || seller.kycStatus !== 'APPROVED' || seller.partnerRole !== 'EXPERT') {
    res.status(400).json({
      success: false,
      message: 'Seller not found, not KYC-approved, or not registered as an expert'
    })
    return
  }

  await prisma.specialRequest.update({
    where: { id },
    data: { sellerId, status: 'ASSIGNED' }
  })

  await recordAudit(req, {
    action: AuditAction.SPECIAL_REQUEST_ASSIGN,
    target: `SpecialRequest:${id}`,
    details: autoAssigned
      ? `Auto-assigned to seller ${sellerId} (${seller.name}) — ${matchReason}`
      : `Assigned to seller ${sellerId} (${seller.name}) — ${request.city}/${request.tehsil}`,
  })

  const delivery = await notifySeller(seller, {
    type: 'request',
    title: 'A new special request has been assigned',
    body: `A special research request has been assigned to you — ${request.address}, ${request.city}. Please accept it within 12 hours.`,
    email: {
      subject: 'New CivilCheck special request assigned to you',
      text:
        `Hi ${seller.name},\n\nA special research request has been assigned to you:\n\n` +
        `${request.address}, ${request.city} (${request.tehsil})\n\n` +
        `Accept it within 12 hours, then complete the research within 72 hours.\n\n— Team CivilCheck`,
      html:
        `<p>Hi ${seller.name},</p><p>A special research request has been assigned to you:</p>` +
        `<p><strong>${request.address}, ${request.city}</strong> (${request.tehsil})</p>` +
        `<p>Accept it within 12 hours, then complete the research within 72 hours.</p>` +
        `<p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: seller.name, status: 'new request assigned' } },
  })

  res.json({
    success: true,
    message: `Request ${seller.name} ko assign ho gayi!`,
    seller: { name: seller.name, phone: seller.phone },
    autoAssigned,
    matchReason,
    notifications: Object.fromEntries(delivery.map((d) => [d.channel, d.status])),
  })
}

// POST /api/admin/special-requests/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
// Admin completed research approve karta hai — buyer ko unlock milta hai
// ─────────────────────────────────────────────────────────────────────────────
export const approveSpecialRequest = async (req: Request, res: Response) => {
  const id = req.params.id as string

  const request = await prisma.specialRequest.findUnique({
    where: { id },
    include: { user: true, seller: true }
  })

  if (!request) {
    res.status(404).json({ success: false, message: 'Request not found' })
    return
  }

  if (request.status !== 'COMPLETED') {
    res.status(400).json({
      success: false,
      message: 'Only COMPLETED requests can be approved'
    })
    return
  }

  // Property Discovery flow (Step 2) — this path approves a Listing
  // directly (bypassing admin.controller.ts's approveListing), so it needs
  // the same map-pin gate: a Listing must never become buyer-visible
  // without latitude/longitude. Checked before the claim below so a request
  // failing this never gets marked APPROVED either.
  const completedListing = request.completedListingId
    ? await prisma.listing.findUnique({
        where: { id: request.completedListingId },
        select: { latitude: true, longitude: true },
      })
    : null

  if (
    request.completedListingId &&
    (!completedListing || completedListing.latitude == null || completedListing.longitude == null)
  ) {
    res.status(400).json({
      success: false,
      message: 'The completed listing has no latitude/longitude on file and cannot be approved until location data is supplied.',
    })
    return
  }

  // Guarded claim — two concurrent approve calls must not both pass the
  // COMPLETED check and both create a payout row for the same request.
  const claim = await prisma.specialRequest.updateMany({
    where: { id, status: 'COMPLETED' },
    data: { status: 'APPROVED' }
  })

  if (claim.count === 0) {
    res.status(400).json({
      success: false,
      message: 'Request already processed'
    })
    return
  }

  // Listing approve karo
  if (request.completedListingId) {
    await prisma.listing.update({
      where: { id: request.completedListingId },
      data: { status: 'APPROVED' }
    })
  }

  await recordAudit(req, {
    action: AuditAction.SPECIAL_REQUEST_APPROVE,
    target: `SpecialRequest:${id}`,
    details: `Approved — listing ${request.completedListingId ?? 'none'} published to buyer ${request.userId}`,
  })

  // Seller's 70% commission ledger row — a COMPLETED request always has an
  // assigned seller (submitRequest requires IN_PROGRESS, which requires an
  // ASSIGNED seller), but the FK is nullable so this is a defensive guard,
  // not an expected path.
  if (request.seller) {
    await createPayoutForApprovedRequest(request, request.seller)
    await recordAudit(req, {
      action: AuditAction.SPECIAL_REQUEST_PAYOUT_CREATED,
      target: `SpecialRequest:${id}`,
      details: `Payout ledger created for seller ${request.seller.id} (${request.seller.name})`,
    })
  } else {
    logger.error(`[special-request] Approved request ${id} has no assigned seller — no payout created`)
  }

  res.json({
    success: true,
    message: 'Special request approved! Buyer ko report unlock ho gayi.',
    listingId: request.completedListingId
  })
}

// POST /api/admin/special-requests/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
// Admin reject karta hai — agar advance paid tha toh buyer ko turant real
// refund (Razorpay). Status REJECTED se hokar REFUNDED tak jaata hai —
// executeRefund khud SpecialRequest.status ko REFUNDED set karta hai jab
// refund succeed hota hai.
// ─────────────────────────────────────────────────────────────────────────────
export const rejectSpecialRequest = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { reason } = req.body

  if (!reason) {
    res.status(400).json({ success: false, message: 'A reason is required' })
    return
  }

  const request = await prisma.specialRequest.findUnique({ where: { id } })
  if (!request) {
    res.status(404).json({ success: false, message: 'Request not found' })
    return
  }

  if (!['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(request.status)) {
    res.status(400).json({
      success: false,
      message: 'Yeh request already reject/refund/approve ho chuki hai'
    })
    return
  }

  // No advance was ever charged — reject outright, nothing to refund.
  if (!request.advancePaid) {
    await prisma.specialRequest.update({
      where: { id },
      data: { status: 'REJECTED', adminNote: reason }
    })

    await recordAudit(req, {
      action: AuditAction.SPECIAL_REQUEST_REJECT,
      target: `SpecialRequest:${id}`,
      details: `Rejected (no advance was ever paid) — reason: ${reason}`,
    })

    res.json({
      success: true,
      message: 'Request rejected. No advance was paid, so no refund is required.',
      refundAmount: 0,
      reason
    })
    return
  }

  const existingRefund = await prisma.refund.findFirst({
    where: { specialRequestId: id, status: { in: ['PENDING', 'PROCESSED'] } }
  })
  if (existingRefund) {
    res.status(409).json({ success: false, message: 'A refund already exists for this request' })
    return
  }

  const refund = await prisma.refund.create({
    data: {
      specialRequestId: id,
      userId: request.userId,
      amount: request.advanceAmount,
      reason,
      status: 'PENDING',
    }
  })

  await prisma.specialRequest.update({
    where: { id },
    data: { status: 'REJECTED', adminNote: reason }
  })

  const result = await executeRefund(refund.id, reason)

  await recordAudit(req, {
    action: AuditAction.SPECIAL_REQUEST_REJECT,
    target: `SpecialRequest:${id}`,
    details: result.ok
      ? `Rejected — Rs. ${request.advanceAmount} refunded to buyer ${request.userId} (refund ${refund.id}). Reason: ${reason}`
      : `Rejected — Rs. ${request.advanceAmount} refund FAILED, left PENDING for retry (refund ${refund.id}). Reason: ${reason}. Error: ${result.message}`,
  })

  res.json({
    success: true,
    message: result.ok
      ? 'Request rejected. The buyer has been refunded.'
      : `Request rejected, but the Razorpay refund failed (${result.message}) — the refund is PENDING and an admin can retry it.`,
    refundId: refund.id,
    refundAmount: request.advanceAmount,
    refunded: result.ok,
    reason
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────
function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    PENDING: '⏳ Request submit ho gayi — Admin review kar raha hai (2 hours)',
    ASSIGNED: '👤 An expert has been assigned — research will begin shortly',
    IN_PROGRESS: '🔍 Expert research kar raha hai (48-72 hours)',
    COMPLETED: '✅ Research complete — Admin final check kar raha hai',
    APPROVED: '🎉 Your report is ready to view.',
    REJECTED: '❌ Request rejected — a refund is being processed',
    REFUNDED: '💰 Refund processed successfully',
  }
  return messages[status] || status
}