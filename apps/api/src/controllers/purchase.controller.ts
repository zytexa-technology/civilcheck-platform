import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import type {
  PurchaseCreateInput,
  PurchaseVerifyInput,
  ReportFlagCreateInput,
  ReviewCreateInput,
} from '@civilcheck/shared'
import prisma from '../lib/prisma.js'
import { getRazorpayKeyId, RazorpayError, verifyPaymentSignature } from '../lib/razorpay.js'
import { createReportOrder, finalizeReportUnlock } from '../services/payment.service.js'
import { generateInvoice, generateReportCertificate } from '../services/pdf.service.js'
import { recalculateSellerRating } from '../services/review.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/purchases → buyer starts a report unlock
// ─────────────────────────────────────────────────────────────────────────────
// Creates a Razorpay order and returns the checkout params. NO Purchase row is
// written here — the report stays locked until the payment is confirmed, either
// by POST /verify (checkout handshake) or by the webhook. Both write the
// Purchase exactly once. Body is validated by purchaseCreateSchema.
// ─────────────────────────────────────────────────────────────────────────────
export const createPurchase = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { listingId } = req.body as PurchaseCreateInput

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      seller: { select: { id: true, name: true, phone: true, email: true, badge: true } },
    },
  })

  if (!listing || listing.status !== 'APPROVED') {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }

  // Already unlocked? → tell the client, don't create another order.
  const existing = await prisma.purchase.findFirst({ where: { userId, listingId } })
  if (existing) {
    res.json({
      success: true,
      alreadyPurchased: true,
      message: 'Report pehle se unlocked hai',
      purchase: existing,
    })
    return
  }

  try {
    const { order } = await createReportOrder(userId, listing)

    res.status(201).json({
      success: true,
      message: 'Order created — please complete the payment',
      order: {
        id: order.id,
        amount: order.amount, // paise, what Checkout expects
        currency: order.currency,
      },
      // null in mock mode; the frontend runs its mock checkout then calls /verify.
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/purchases/verify → confirm the checkout handshake, unlock the report
// ─────────────────────────────────────────────────────────────────────────────
// Razorpay Checkout returns { razorpay_order_id, razorpay_payment_id,
// razorpay_signature } on success; the panel forwards them here for an immediate
// unlock. The signature proves the payment belongs to the order; the order's
// listing/amount/split were frozen server-side at creation, so nothing here is
// client-trusted. The webhook is the safety net if the client never calls this.
// Body is validated + normalized by purchaseVerifySchema.
// ─────────────────────────────────────────────────────────────────────────────
export const verifyPurchase = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { orderId, paymentId, signature } = req.body as PurchaseVerifyInput

  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    res.status(400).json({ success: false, message: 'Payment signature invalid' })
    return
  }

  const paymentOrder = await prisma.paymentOrder.findUnique({ where: { id: orderId } })

  // The order must exist and belong to the caller — a valid signature for
  // someone else's order must not unlock anything for this buyer.
  if (!paymentOrder || paymentOrder.userId !== userId) {
    res.status(404).json({ success: false, message: 'Order not found' })
    return
  }

  if (paymentOrder.kind !== 'REPORT_UNLOCK') {
    res.status(400).json({ success: false, message: 'This order is not for a report unlock' })
    return
  }

  const { purchase, alreadyProcessed } = await finalizeReportUnlock(paymentOrder, paymentId)

  res.json({
    success: true,
    message: alreadyProcessed ? 'Report pehle se unlocked hai' : 'Report unlocked successfully',
    alreadyPurchased: alreadyProcessed,
    purchase,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/purchases → buyer ki saari unlocked reports
// ─────────────────────────────────────────────────────────────────────────────
export const getMyPurchases = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const purchases = await prisma.purchase.findMany({
    where: { userId },
    include: {
      listing: {
        select: {
          id: true, address: true, city: true, tehsil: true,
          propertyType: true, riskBadge: true, caseExists: true,
          loanDefault: true, price: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ success: true, total: purchases.length, purchases })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/purchases/:id/certificate → watermarked report certificate PDF
// ─────────────────────────────────────────────────────────────────────────────
export const getReportCertificate = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { listing: true, user: true },
  })

  if (!purchase || purchase.userId !== userId) {
    res.status(404).json({ success: false, message: 'Purchase not found' })
    return
  }

  const bytes = await generateReportCertificate({
    purchase: { id: purchase.id, createdAt: purchase.createdAt },
    listing: purchase.listing,
    buyerName: purchase.user.name || 'CivilCheck Buyer',
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="certificate-${purchase.id}.pdf"`)
  res.send(Buffer.from(bytes))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/purchases/:id/invoice → GST invoice PDF for the platform fee
// ─────────────────────────────────────────────────────────────────────────────
export const getPurchaseInvoice = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { listing: true, user: true },
  })

  if (!purchase || purchase.userId !== userId) {
    res.status(404).json({ success: false, message: 'Purchase not found' })
    return
  }

  const bytes = await generateInvoice({
    purchase: { id: purchase.id, platformCut: purchase.platformCut, createdAt: purchase.createdAt },
    listing: purchase.listing,
    buyerName: purchase.user.name || 'CivilCheck Buyer',
    buyerPhone: purchase.user.phone,
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="invoice-${purchase.id}.pdf"`)
  res.send(Buffer.from(bytes))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/purchases/:id/flag → buyer flags an unlocked report as outdated
// ─────────────────────────────────────────────────────────────────────────────
// Ownership-gated on Purchase, not Listing — only a buyer who actually
// unlocked the report (proved by owning the Purchase row) can flag it. Body is
// validated by reportFlagCreateSchema.
// ─────────────────────────────────────────────────────────────────────────────
export const flagReport = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string
  const { reason } = req.body as ReportFlagCreateInput

  const purchase = await prisma.purchase.findUnique({ where: { id } })

  if (!purchase || purchase.userId !== userId) {
    res.status(404).json({ success: false, message: 'Purchase not found' })
    return
  }

  const flag = await prisma.reportFlag.create({
    data: {
      userId,
      listingId: purchase.listingId,
      reason,
    },
  })

  res.status(201).json({
    success: true,
    message: 'Report flagged — an admin will review it.',
    flag: { id: flag.id, status: flag.status, createdAt: flag.createdAt },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/purchases/:id/review → buyer rates the unlocked report (1-5 stars)
// ─────────────────────────────────────────────────────────────────────────────
// One review per purchase (unique constraint on Review.purchaseId). Every
// insert recalculates the seller's avgRating and auto-writes their Badge
// (review.service.ts). Body is validated by reviewCreateSchema.
// ─────────────────────────────────────────────────────────────────────────────
export const reviewPurchase = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string
  const { rating, comment } = req.body as ReviewCreateInput

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { listing: { select: { id: true, sellerId: true } } },
  })

  if (!purchase || purchase.userId !== userId) {
    res.status(404).json({ success: false, message: 'Purchase not found' })
    return
  }

  let review
  try {
    review = await prisma.review.create({
      data: {
        purchaseId: purchase.id,
        userId,
        sellerId: purchase.listing.sellerId,
        listingId: purchase.listing.id,
        rating,
        comment: comment || null,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({ success: false, message: 'You have already reviewed this purchase' })
      return
    }
    throw err
  }

  await recalculateSellerRating(purchase.listing.sellerId)

  res.status(201).json({
    success: true,
    message: 'Review submitted — thank you!',
    review: { id: review.id, rating: review.rating, comment: review.comment, createdAt: review.createdAt },
  })
}
