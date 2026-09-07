import { Request, Response } from 'express'
import type { FeaturedSubscriptionInput } from '@civilcheck/shared'
import { RazorpayError } from '../lib/razorpay.js'
import {
  createAlertSubscription,
  createFeaturedSubscription,
  cancelOwnedSubscription,
  getBuyerSubscriptions,
  getSellerSubscriptions,
} from '../services/subscription.service.js'

// Translate a RazorpayError (which carries the HTTP status the client should
// see) into the response; anything unexpected re-throws to the global handler.
// Same shape purchase.controller uses.
function fail(res: Response, err: unknown): void {
  if (err instanceof RazorpayError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  throw err
}

// ─────────────────────────────────────────────────────────────────────────────
// BUYER — ₹49/mo case-update alert subscription (PDF 7.7)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/subscriptions/alerts
export const subscribeAlerts = async (req: Request, res: Response) => {
  try {
    const subscription = await createAlertSubscription(req.user!.id)
    res.status(201).json({
      success: true,
      message: 'Alert subscription ready — authorize the payment to activate.',
      subscription,
    })
  } catch (err) {
    fail(res, err)
  }
}

// GET /api/subscriptions
export const getMySubscriptions = async (req: Request, res: Response) => {
  const subscriptions = await getBuyerSubscriptions(req.user!.id)
  res.json({ success: true, total: subscriptions.length, subscriptions })
}

// POST /api/subscriptions/:id/cancel
export const cancelMySubscription = async (req: Request, res: Response) => {
  try {
    await cancelOwnedSubscription(String(req.params.id), { userId: req.user!.id })
    res.json({ success: true, message: 'Subscription cancelled.' })
  } catch (err) {
    fail(res, err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SELLER — ₹499/mo featured listing subscription (PDF 3.3)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/seller/subscriptions/featured
export const featureListing = async (req: Request, res: Response) => {
  try {
    const { listingId } = req.body as FeaturedSubscriptionInput
    const subscription = await createFeaturedSubscription(req.seller!.id, listingId)
    res.status(201).json({
      success: true,
      message: 'Featured subscription ready — authorize the payment to activate.',
      subscription,
    })
  } catch (err) {
    fail(res, err)
  }
}

// GET /api/seller/subscriptions
export const getMySellerSubscriptions = async (req: Request, res: Response) => {
  const subscriptions = await getSellerSubscriptions(req.seller!.id)
  res.json({ success: true, total: subscriptions.length, subscriptions })
}

// POST /api/seller/subscriptions/:id/cancel
export const cancelSellerSubscription = async (req: Request, res: Response) => {
  try {
    await cancelOwnedSubscription(String(req.params.id), { sellerId: req.seller!.id })
    res.json({ success: true, message: 'Subscription cancelled.' })
  } catch (err) {
    fail(res, err)
  }
}
