// ─────────────────────────────────────────────────────────────────────────────
// Subscription service (PDF 7.7 / 3.3) — recurring Razorpay subscriptions.
//
//   ALERT_SUBSCRIPTION — buyer, ₹49/mo, account-wide case-update alerts
//   FEATURED_LISTING   — seller, ₹499/mo, one featured listing
//
// Both are 100% platform commission (see FLAT_PLATFORM_SHARE in payment.service).
// The controller stays thin: it authorizes the caller and hands off here.
//
// PRODUCT NOTE (default, flagged for sign-off): the ALERT subscription is an
// account-wide entitlement recorded here but NOT yet used to *gate* the existing
// free per-listing watch (alert.controller). Making alerts paid would break
// current behaviour, so gating is left as a deliberate product switch. The
// FEATURED subscription DOES take effect: it sets Listing.featured, which search
// ordering prefers.
// ─────────────────────────────────────────────────────────────────────────────
import type { Subscription } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import {
  createSubscription as createRazorpaySubscription,
  cancelSubscription as cancelRazorpaySubscription,
  getRazorpayKeyId,
  isRazorpayConfigured,
  RazorpayError,
} from '../lib/razorpay.js'

type SubscriptionKind = 'ALERT_SUBSCRIPTION' | 'FEATURED_LISTING'

// Plan config. The Razorpay plan (with its price) is created once in the
// dashboard; we only reference its id. `amount` mirrors the plan price in paise
// for our own ledger/reporting — Razorpay is the source of truth for what is
// actually charged.
const PLANS: Record<
  SubscriptionKind,
  { envKey: string; mockPlan: string; amount: number; label: string }
> = {
  ALERT_SUBSCRIPTION: {
    envKey: 'RAZORPAY_PLAN_ALERT',
    mockPlan: 'plan_mock_alert',
    amount: 4900, // ₹49
    label: 'Case Update Alerts',
  },
  FEATURED_LISTING: {
    envKey: 'RAZORPAY_PLAN_FEATURED',
    mockPlan: 'plan_mock_featured',
    amount: 49900, // ₹499
    label: 'Featured Listing',
  },
}

// A live Razorpay account needs a real plan id; without one we cannot create a
// real subscription, so fail loudly rather than mint an unusable row. In mock
// mode (no keys) the synthetic plan id is fine.
function resolvePlan(kind: SubscriptionKind): { planId: string; amount: number } {
  const cfg = PLANS[kind]
  const envPlan = process.env[cfg.envKey]
  if (isRazorpayConfigured() && !envPlan) {
    throw new RazorpayError(
      `${cfg.envKey} is not set — cannot create a live ${cfg.label} subscription`,
      500
    )
  }
  return { planId: envPlan || cfg.mockPlan, amount: cfg.amount }
}

export interface CheckoutSubscription {
  subscriptionId: string
  planId: string
  amount: number // paise per cycle
  keyId: string | null // Razorpay publishable key for Checkout (null in mock)
}

// ── Buyer: start a ₹49/mo case-update alert subscription ─────────────────────
export async function createAlertSubscription(userId: string): Promise<CheckoutSubscription> {
  const active = await prisma.subscription.findFirst({
    where: { userId, kind: 'ALERT_SUBSCRIPTION', status: { in: ['CREATED', 'ACTIVE'] } },
  })
  if (active) {
    throw new RazorpayError('You already have an active alert subscription', 409)
  }

  const { planId, amount } = resolvePlan('ALERT_SUBSCRIPTION')
  const sub = await createRazorpaySubscription({
    planId,
    notes: { userId, kind: 'ALERT_SUBSCRIPTION' },
  })

  await prisma.subscription.create({
    data: { id: sub.id, kind: 'ALERT_SUBSCRIPTION', userId, planId, amount },
  })

  return { subscriptionId: sub.id, planId, amount, keyId: getRazorpayKeyId() }
}

// ── Seller: start a ₹499/mo featured-listing subscription ────────────────────
export async function createFeaturedSubscription(
  sellerId: string,
  listingId: string
): Promise<CheckoutSubscription> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true },
  })
  if (!listing || listing.sellerId !== sellerId) {
    throw new RazorpayError('Listing not found or not yours', 404)
  }

  const active = await prisma.subscription.findFirst({
    where: { listingId, kind: 'FEATURED_LISTING', status: { in: ['CREATED', 'ACTIVE'] } },
  })
  if (active) {
    throw new RazorpayError('This listing already has an active featured subscription', 409)
  }

  const { planId, amount } = resolvePlan('FEATURED_LISTING')
  const sub = await createRazorpaySubscription({
    planId,
    notes: { sellerId, listingId, kind: 'FEATURED_LISTING' },
  })

  await prisma.subscription.create({
    data: { id: sub.id, kind: 'FEATURED_LISTING', sellerId, listingId, planId, amount },
  })

  return { subscriptionId: sub.id, planId, amount, keyId: getRazorpayKeyId() }
}

// ── Webhook: subscription.activated / subscription.charged → grant/extend ────
// Idempotent: safe to call for every charge and for a duplicate delivery.
export async function activateOrRenewSubscription(
  subscription: Subscription,
  currentEnd: Date | null
): Promise<void> {
  const paidThrough = currentEnd ?? subscription.currentEnd

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'ACTIVE', currentEnd: paidThrough, cancelledAt: null },
  })

  // Featured listing goes live and stays visible through the paid period.
  if (subscription.kind === 'FEATURED_LISTING' && subscription.listingId) {
    await prisma.listing.update({
      where: { id: subscription.listingId },
      data: { featured: true, featuredUntil: paidThrough },
    })
  }

  logger.info(
    `[subscription] ${subscription.id} active (${subscription.kind}) ` +
      `through ${paidThrough?.toISOString() ?? 'n/a'}`
  )
}

// ── Webhook: subscription cancelled / halted / completed, or owner cancel ────
export async function revokeSubscription(
  subscription: Subscription,
  status: 'CANCELLED' | 'HALTED' | 'COMPLETED'
): Promise<void> {
  await prisma.subscription.update({
    where: { id: subscription.id },
    // cancelledAt marks the END for churn analytics; COMPLETED is a natural term
    // end (ran its full cycle count), not churn, so leave it null there.
    data: { status, ...(status === 'COMPLETED' ? {} : { cancelledAt: new Date() }) },
  })

  // Pull the listing out of featured rotation. featuredUntil is left as the
  // record of what was paid for.
  if (subscription.kind === 'FEATURED_LISTING' && subscription.listingId) {
    await prisma.listing.update({
      where: { id: subscription.listingId },
      data: { featured: false },
    })
  }

  logger.info(`[subscription] ${subscription.id} ${status.toLowerCase()} (${subscription.kind})`)
}

// ── Owner-initiated cancel (buyer or seller) ─────────────────────────────────
export async function cancelOwnedSubscription(
  id: string,
  owner: { userId?: string; sellerId?: string }
): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { id } })
  if (!sub) throw new RazorpayError('Subscription not found', 404)
  if (owner.userId && sub.userId !== owner.userId) throw new RazorpayError('Not your subscription', 403)
  if (owner.sellerId && sub.sellerId !== owner.sellerId) {
    throw new RazorpayError('Not your subscription', 403)
  }

  // Already terminal — nothing to do, and Razorpay would reject a re-cancel.
  if (sub.status === 'CANCELLED' || sub.status === 'COMPLETED') return

  await cancelRazorpaySubscription(id)
  await revokeSubscription(sub, 'CANCELLED')
}

// ── Reads ────────────────────────────────────────────────────────────────────
export function getBuyerSubscriptions(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

export function getSellerSubscriptions(sellerId: string) {
  return prisma.subscription.findMany({
    where: { sellerId },
    orderBy: { createdAt: 'desc' },
    include: { listing: { select: { id: true, address: true, city: true } } },
  })
}

// ── Featured-listing expiry sweep (Day 4 carry-over) ─────────────────────────
// revokeSubscription() only clears `featured` on a cancel/halt/complete
// webhook event. A subscription that simply lapses with no event leaves the
// boolean stale — search ordering is unaffected (it separately checks
// `featuredUntil > now()`), but anything reading `featured` directly is not.
export async function sweepExpiredFeaturedListings(): Promise<void> {
  const { count } = await prisma.listing.updateMany({
    where: { featured: true, featuredUntil: { lt: new Date() } },
    data: { featured: false },
  })
  if (count > 0) {
    logger.info(`[featured-expiry] cleared ${count} lapsed featured listing(s)`)
  }
}
