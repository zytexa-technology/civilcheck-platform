// ─────────────────────────────────────────────────────────────────────────────
// Advertising platform service — campaigns, payment, moderation, serving, tracking.
//
// Billing rules (all server-side; no client-supplied money/counts are ever trusted):
//   • CPM only: cpmPaise per 1,000 valid impressions (default 10,000 paise = ₹100).
//   • spentPaise = impressions * cpmPaise / 1000 (integer paise, no floats).
//   • Clicks are analytics only — never billed. effective CPC = spent / clicks.
//   • A campaign that reaches its budget becomes EXHAUSTED and stops being served.
// An impression/click is only counted when the client presents a server-signed ad
// token (issued when the ad was served) whose nonce has not been used before.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { Prisma, type AdCampaign, type AdPlatform, type AdCampaignStatus, type AdvertisingPayment, type AdRefundStatus } from '@prisma/client'
import type { AdCampaignCreateInput, AdvertiserRegisterInput } from '@civilcheck/shared'
import prisma from '../../lib/prisma.js'
import logger from '../../lib/logger.js'
import { JWT_SECRET } from '../../lib/jwt.js'
import { createOrder, fetchPayment, getRazorpayKeyId, isRazorpayConfigured, refundPayment, verifyPaymentSignature } from '../../lib/razorpay.js'
import { sendEmail } from '../notification.service.js'
import { adConfig, estimateImpressions, paiseToRupees, rupeesToPaise } from './advertising.config.js'

export class AdError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// ── serialisation ───────────────────────────────────────────────────────────
export function campaignView(c: AdCampaign) {
  const budget = paiseToRupees(c.budgetPaise)
  const spent = paiseToRupees(c.spentPaise)
  return {
    id: c.id,
    businessName: c.businessName,
    title: c.title,
    description: c.description,
    creativeType: c.creativeType,
    creativeUrl: c.creativeUrl,
    ctaText: c.ctaText,
    destinationUrl: c.destinationUrl,
    platform: c.platform,
    placement: c.placement,
    status: c.status,
    budget,
    spent,
    remaining: paiseToRupees(c.budgetPaise - c.spentPaise),
    cpm: c.cpmPaise / 100,
    impressions: c.impressions,
    clicks: c.clicks,
    // CTR = clicks / impressions * 100 (a rate, not a price).
    ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
    // Effective CPC = spent / clicks — analytics only; clicks are NOT billed.
    effectiveCpc: c.clicks > 0 ? Math.round((spent / c.clicks) * 100) / 100 : null,
    estimatedImpressions: estimateImpressions(c.budgetPaise, c.cpmPaise),
    startDate: c.startDate,
    endDate: c.endDate,
    rejectionReason: c.rejectionReason,
    approvedAt: c.approvedAt,
    createdAt: c.createdAt,
  }
}

async function mail(to: string, subject: string, body: string) {
  try {
    await sendEmail({ to, subject, text: body, html: `<p>${body.replace(/\n/g, '<br/>')}</p>` })
  } catch {
    logger.warn('[ads] notification email failed')
  }
}

// ── advertiser account ──────────────────────────────────────────────────────
export const signAdvertiserToken = (advertiserId: string) =>
  jwt.sign({ advertiserId, purpose: 'advertiser' }, JWT_SECRET, { expiresIn: '7d' })

export async function registerAdvertiser(input: AdvertiserRegisterInput) {
  const existing = await prisma.advertiser.findUnique({ where: { email: input.email } })
  if (existing) throw new AdError(409, 'An advertiser account with this email already exists.')
  const advertiser = await prisma.advertiser.create({
    data: {
      name: input.name,
      companyName: input.companyName,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await bcrypt.hash(input.password, 10),
    },
  })
  return { advertiser: publicAdvertiser(advertiser), token: signAdvertiserToken(advertiser.id) }
}

export async function loginAdvertiser(email: string, password: string) {
  const advertiser = await prisma.advertiser.findUnique({ where: { email } })
  // Same message for unknown email and wrong password.
  if (!advertiser || !(await bcrypt.compare(password, advertiser.passwordHash))) {
    throw new AdError(401, 'Invalid email or password.')
  }
  return { advertiser: publicAdvertiser(advertiser), token: signAdvertiserToken(advertiser.id) }
}

export const publicAdvertiser = (a: { id: string; name: string; companyName: string; email: string; phone: string | null }) => ({
  id: a.id,
  name: a.name,
  companyName: a.companyName,
  email: a.email,
  phone: a.phone,
})

// ── campaigns (advertiser side) ─────────────────────────────────────────────
function assertCloudinaryUrl(url: string) {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new AdError(400, 'The advertisement creative upload is invalid — please upload it again.')
  }
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') {
    throw new AdError(400, 'The advertisement creative must be uploaded through the CivilCheck uploader.')
  }
}

export async function createCampaign(advertiserId: string, input: AdCampaignCreateInput) {
  assertCloudinaryUrl(input.creativeUrl)
  const budgetPaise = rupeesToPaise(input.budget)
  if (budgetPaise < BigInt(adConfig.minBudgetPaise)) throw new AdError(400, 'Minimum campaign budget is ₹100.')
  const campaign = await prisma.adCampaign.create({
    data: {
      advertiserId,
      businessName: input.businessName,
      title: input.title,
      description: input.description,
      creativeType: input.creativeType,
      creativeUrl: input.creativeUrl,
      ctaText: input.ctaText,
      destinationUrl: input.destinationUrl,
      platform: input.platform,
      placement: 'BUYER_FEED',
      status: 'DRAFT', // never ACTIVE from a client request
      budgetPaise,
      cpmPaise: adConfig.cpmPaise,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    },
  })
  return campaign
}

export async function getOwnCampaign(advertiserId: string, id: string) {
  const c = await prisma.adCampaign.findUnique({ where: { id } })
  // Another advertiser's campaign is indistinguishable from a missing one.
  if (!c || c.advertiserId !== advertiserId) throw new AdError(404, 'Campaign not found')
  return c
}

export async function listOwnCampaigns(advertiserId: string) {
  const campaigns = await prisma.adCampaign.findMany({ where: { advertiserId }, orderBy: { createdAt: 'desc' } })
  const payments = await prisma.advertisingPayment.findMany({ where: { campaignId: { in: campaigns.map((c) => c.id) } } })
  const views = campaigns.map((c) => ({ ...campaignView(c), ...paymentSummary(payments.filter((p) => p.campaignId === c.id)) }))
  const paid = new Set(payments.filter((p) => p.status === 'PAID').map((p) => p.campaignId))
  const live = views.filter((c) => paid.has(c.id))
  return {
    campaigns: views,
    totals: {
      campaigns: views.length,
      active: views.filter((c) => c.status === 'ACTIVE').length,
      spend: live.reduce((s, c) => s + c.spent, 0),
      impressions: live.reduce((s, c) => s + c.impressions, 0),
      clicks: live.reduce((s, c) => s + c.clicks, 0),
    },
  }
}

// ── payment ─────────────────────────────────────────────────────────────────
// The advertiser pays exactly the campaign budget — no CPM add-on, no click fee, no hidden fee.
export async function startCampaignPayment(advertiserId: string, campaignId: string) {
  const campaign = await getOwnCampaign(advertiserId, campaignId)
  if (campaign.status !== 'DRAFT' && campaign.status !== 'PAYMENT_PENDING') {
    throw new AdError(409, 'This campaign has already been paid for or can no longer be paid.')
  }
  const order = await createOrder({
    amount: Number(campaign.budgetPaise),
    receipt: `ad_${campaign.id}`.slice(0, 40),
    notes: { kind: 'ADVERTISING', campaignId: campaign.id, advertiserId },
  })
  await prisma.$transaction([
    prisma.advertisingPayment.create({
      data: { campaignId: campaign.id, razorpayOrderId: order.id, amountPaise: campaign.budgetPaise },
    }),
    prisma.adCampaign.update({ where: { id: campaign.id }, data: { status: 'PAYMENT_PENDING' } }),
  ])
  return { order: { id: order.id, amount: order.amount, currency: order.currency }, razorpayKeyId: getRazorpayKeyId() }
}

// Single, idempotent finalisation of an advertising payment — used by BOTH the checkout-verify
// endpoint and the Razorpay webhook. The atomic claim (status CREATED/FAILED -> PAID) means the same
// payment can never be recorded twice, revenue can never double, and the campaign moves to
// PENDING_APPROVAL exactly once. Payment NEVER makes an ad live; a Superadmin must still approve.
export async function finalizeAdvertisingPayment(
  payment: Pick<AdvertisingPayment, 'id' | 'campaignId'>,
  razorpayPaymentId: string,
): Promise<{ newlyPaid: boolean }> {
  const newlyPaid = await prisma.$transaction(async (tx) => {
    const claimed = await tx.advertisingPayment.updateMany({
      // FAILED is claimable too: Razorpay lets a customer retry the same order after a failed attempt.
      where: { id: payment.id, status: { in: ['CREATED', 'FAILED'] } },
      data: { status: 'PAID', razorpayPaymentId, paidAt: new Date() },
    })
    if (claimed.count === 0) return false
    await tx.adCampaign.updateMany({
      where: { id: payment.campaignId, status: { in: ['PAYMENT_PENDING', 'DRAFT'] } },
      data: { status: 'PENDING_APPROVAL' },
    })
    return true
  })
  if (newlyPaid) {
    const c = await prisma.adCampaign.findUnique({ where: { id: payment.campaignId }, include: { advertiser: true } })
    if (c) {
      void mail(
        c.advertiser.email,
        'Your CivilCheck advertisement is submitted',
        `Payment of ₹${paiseToRupees(c.budgetPaise).toLocaleString('en-IN')} received for "${c.title}". Your campaign is now pending approval.`,
      )
    }
  }
  return { newlyPaid }
}

// Checkout return path. The HMAC signature proves the payment came from Razorpay; in live mode the
// payment is additionally fetched from Razorpay and only finalised if it is captured for exactly the
// order amount — otherwise the webhook (the authoritative confirmation) finalises it later.
export async function confirmCampaignPayment(
  advertiserId: string,
  campaignId: string,
  p: { orderId: string; paymentId: string; signature: string },
): Promise<{ campaign: AdCampaign; confirmed: boolean }> {
  const campaign = await getOwnCampaign(advertiserId, campaignId)
  const payment = await prisma.advertisingPayment.findUnique({ where: { razorpayOrderId: p.orderId } })
  if (!payment || payment.campaignId !== campaign.id) throw new AdError(404, 'Payment order not found for this campaign.')
  if (payment.status === 'PAID') return { campaign, confirmed: true } // idempotent
  if (!verifyPaymentSignature({ orderId: p.orderId, paymentId: p.paymentId, signature: p.signature })) {
    throw new AdError(400, 'Payment verification failed.')
  }
  if (isRazorpayConfigured()) {
    const remote = await fetchPayment(p.paymentId)
    const ok = remote && remote.order_id === p.orderId && remote.status === 'captured' && BigInt(remote.amount) === payment.amountPaise
    if (!ok) return { campaign, confirmed: false } // wait for the webhook
  }
  await finalizeAdvertisingPayment(payment, p.paymentId)
  return { campaign: await prisma.adCampaign.findUniqueOrThrow({ where: { id: campaign.id } }), confirmed: true }
}

// ── Razorpay webhook handlers (called from the existing /api/webhooks/razorpay controller, after
// its signature check). Each returns an outcome and is safe to call any number of times.
export type AdWebhookOutcome = 'not_ad' | 'amount_mismatch' | 'already_processed' | 'paid' | 'failed_recorded'

export async function handleAdPaymentCaptured(p: { orderId: string; paymentId: string; amount?: number }): Promise<AdWebhookOutcome> {
  const payment = await prisma.advertisingPayment.findUnique({ where: { razorpayOrderId: p.orderId } })
  if (!payment) return 'not_ad'
  // The charged amount must equal what was frozen at order time (underpayment / tampering signal).
  if (typeof p.amount === 'number' && BigInt(p.amount) !== payment.amountPaise) {
    logger.error(`[ads:webhook] amount mismatch on order ${p.orderId} — NOT finalising`)
    return 'amount_mismatch'
  }
  const { newlyPaid } = await finalizeAdvertisingPayment(payment, p.paymentId)
  return newlyPaid ? 'paid' : 'already_processed'
}

export async function handleAdPaymentFailed(orderId: string): Promise<AdWebhookOutcome> {
  const r = await prisma.advertisingPayment.updateMany({ where: { razorpayOrderId: orderId, status: 'CREATED' }, data: { status: 'FAILED' } })
  if (r.count > 0) return 'failed_recorded'
  return (await prisma.advertisingPayment.findUnique({ where: { razorpayOrderId: orderId }, select: { id: true } })) ? 'already_processed' : 'not_ad'
}

// refund.processed / refund.failed for a refund we initiated.
export async function handleAdRefundEvent(event: 'refund.processed' | 'refund.failed', r: { refundId?: string; paymentId?: string }): Promise<boolean> {
  const where: Prisma.AdvertisingPaymentWhereInput = r.refundId ? { razorpayRefundId: r.refundId } : { razorpayPaymentId: r.paymentId ?? '__none__' }
  const payment = await prisma.advertisingPayment.findFirst({ where })
  if (!payment) return false
  if (event === 'refund.processed') {
    await prisma.advertisingPayment.updateMany({ where: { id: payment.id, refundStatus: { in: ['PROCESSING', 'PENDING'] } }, data: { refundStatus: 'REFUNDED', refundedAt: new Date(), refundError: null } })
  } else {
    await prisma.advertisingPayment.updateMany({ where: { id: payment.id, refundStatus: 'PROCESSING' }, data: { refundStatus: 'FAILED', refundError: 'The payment provider reported the refund as failed.' } })
  }
  return true
}

// ── refunds ─────────────────────────────────────────────────────────────────
// Policy: a campaign that was PAID and then REJECTED before it ever served an impression is refunded
// IN FULL. The amount always comes from the stored payment row — never from a request. Anything that
// already spent budget is not refunded here (and rejection is only possible from PENDING_APPROVAL, so
// it has never been live). Idempotent: an atomic claim moves the payment to PROCESSING, so a second
// call (retry, double click, concurrent request) cannot create a second Razorpay refund.
export async function refundRejectedCampaign(campaignId: string): Promise<{ refundStatus: AdRefundStatus }> {
  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId }, include: { advertiser: true } })
  if (!campaign) throw new AdError(404, 'Campaign not found')
  if (campaign.status !== 'REJECTED' || campaign.impressions > 0 || campaign.spentPaise > 0n) {
    throw new AdError(409, 'Only a rejected campaign that never started serving is eligible for an automatic refund.')
  }
  const payment = await prisma.advertisingPayment.findFirst({ where: { campaignId, status: 'PAID' } })
  if (!payment) return { refundStatus: 'NOT_REQUIRED' } // never paid — nothing to refund

  const claimed = await prisma.advertisingPayment.updateMany({
    where: { id: payment.id, status: 'PAID', refundStatus: { in: ['NOT_REQUIRED', 'PENDING', 'FAILED'] } },
    data: { refundStatus: 'PROCESSING', refundAmountPaise: payment.amountPaise, refundError: null },
  })
  if (claimed.count === 0) return { refundStatus: (await prisma.advertisingPayment.findUniqueOrThrow({ where: { id: payment.id } })).refundStatus }

  const fail = async (message: string) => {
    await prisma.advertisingPayment.update({ where: { id: payment.id }, data: { refundStatus: 'FAILED', refundError: message.slice(0, 200) } })
    logger.error(`[ads:refund] refund failed for campaign ${campaignId}`)
    return { refundStatus: 'FAILED' as AdRefundStatus }
  }
  if (!payment.razorpayPaymentId) return fail('No Razorpay payment id on record.')
  try {
    const refund = await refundPayment({
      paymentId: payment.razorpayPaymentId,
      amount: Number(payment.amountPaise),
      notes: { kind: 'ADVERTISING_REJECTED', campaignId },
    })
    if (refund.status === 'failed') return fail('The payment provider rejected the refund.')
    const done = refund.status === 'processed'
    await prisma.advertisingPayment.update({
      where: { id: payment.id },
      data: { refundStatus: done ? 'REFUNDED' : 'PROCESSING', razorpayRefundId: refund.id, refundAmountPaise: payment.amountPaise, refundedAt: done ? new Date() : null },
    })
    void mail(
      campaign.advertiser.email,
      'Your CivilCheck advertising payment is being refunded',
      `Your campaign "${campaign.title}" was not approved, so your payment of ₹${paiseToRupees(payment.amountPaise).toLocaleString('en-IN')} is being refunded in full to your original payment method.`,
    )
    return { refundStatus: done ? 'REFUNDED' : 'PROCESSING' }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Refund request failed.')
  }
}

// Payment + refund summary for API views (the refund error text is admin-only).
export function paymentSummary(payments: AdvertisingPayment[], forAdmin = false) {
  const paid = payments.find((p) => p.status === 'PAID')
  return {
    paymentStatus: paid ? 'PAID' : payments.some((p) => p.status === 'FAILED') ? 'FAILED' : payments.length ? 'UNPAID' : 'NONE',
    paidAmount: paid ? paiseToRupees(paid.amountPaise) : 0,
    refund: paid
      ? {
          status: paid.refundStatus,
          amount: paid.refundAmountPaise != null ? paiseToRupees(paid.refundAmountPaise) : 0,
          refundedAt: paid.refundedAt,
          ...(forAdmin ? { error: paid.refundError, razorpayRefundId: paid.razorpayRefundId } : {}),
        }
      : null,
  }
}

// ── moderation (Superadmin) ─────────────────────────────────────────────────
async function transition(
  id: string,
  from: AdCampaignStatus[],
  data: Prisma.AdCampaignUpdateManyMutationInput,
  conflict: string,
) {
  const res = await prisma.adCampaign.updateMany({ where: { id, status: { in: from } }, data })
  if (res.count === 0) {
    const exists = await prisma.adCampaign.findUnique({ where: { id }, select: { id: true } })
    throw new AdError(exists ? 409 : 404, exists ? conflict : 'Campaign not found')
  }
  activeCache.clear()
  return prisma.adCampaign.findUniqueOrThrow({ where: { id }, include: { advertiser: true } })
}

export async function approveCampaign(id: string, adminId: string) {
  const current = await prisma.adCampaign.findUnique({ where: { id } })
  if (current?.endDate && current.endDate.getTime() <= Date.now()) {
    throw new AdError(409, 'This campaign\'s end date has already passed.')
  }
  const c = await transition(id, ['PENDING_APPROVAL'], { status: 'ACTIVE', approvedAt: new Date(), approvedByAdminId: adminId, rejectionReason: null }, 'Only a campaign pending approval can be approved.')
  void mail(c.advertiser.email, 'Your CivilCheck advertisement was approved', `"${c.title}" is approved and will start appearing to CivilCheck users.`)
  return c
}

export async function rejectCampaign(id: string, adminId: string, reason: string) {
  const c = await transition(id, ['PENDING_APPROVAL'], { status: 'REJECTED', rejectionReason: reason, approvedByAdminId: adminId }, 'Only a campaign pending approval can be rejected.')
  void mail(c.advertiser.email, 'Your CivilCheck advertisement was not approved', `"${c.title}" was rejected.\nReason: ${reason}`)
  // Paid + never started + rejected => full refund. A refund problem never undoes the rejection: it is
  // recorded as FAILED on the payment and the Superadmin can retry it.
  try {
    await refundRejectedCampaign(id)
  } catch (e) {
    logger.error(`[ads:refund] refund attempt errored for campaign ${id} (${e instanceof Error ? e.name : 'unknown'})`)
  }
  return c
}

export const pauseCampaign = (id: string) => transition(id, ['ACTIVE'], { status: 'PAUSED' }, 'Only an active campaign can be paused.')
export const resumeCampaign = async (id: string) => {
  const current = await prisma.adCampaign.findUnique({ where: { id } })
  if (current && current.spentPaise >= current.budgetPaise) throw new AdError(409, 'This campaign has no budget remaining.')
  if (current?.endDate && current.endDate.getTime() <= Date.now()) throw new AdError(409, 'This campaign has expired.')
  return transition(id, ['PAUSED'], { status: 'ACTIVE' }, 'Only a paused campaign can be resumed.')
}
export const stopCampaign = (id: string) => transition(id, ['ACTIVE', 'PAUSED'], { status: 'COMPLETED' }, 'Only an active or paused campaign can be stopped.')

export async function adminListCampaigns(opts: { status?: string; page: number; limit: number }) {
  const where: Prisma.AdCampaignWhereInput = {}
  if (opts.status) where.status = opts.status as AdCampaignStatus
  const [rows, total] = await Promise.all([
    prisma.adCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      include: { advertiser: { select: { name: true, companyName: true, email: true } }, payments: true },
    }),
    prisma.adCampaign.count({ where }),
  ])
  return {
    total,
    campaigns: rows.map((c) => ({
      ...campaignView(c),
      advertiser: c.advertiser,
      ...paymentSummary(c.payments, true),
    })),
  }
}

export async function adminSummary() {
  const [byStatus, totals, revenue] = await Promise.all([
    prisma.adCampaign.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.adCampaign.aggregate({ _sum: { impressions: true, clicks: true } }),
    prisma.advertisingPayment.aggregate({ where: { status: 'PAID' }, _sum: { amountPaise: true } }), // failed/unpaid never count
  ])
  const count = (s: AdCampaignStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0
  return {
    totalCampaigns: byStatus.reduce((n, b) => n + b._count._all, 0),
    pendingApproval: count('PENDING_APPROVAL'),
    active: count('ACTIVE'),
    paused: count('PAUSED'),
    expired: count('EXPIRED'),
    rejected: count('REJECTED'),
    exhausted: count('EXHAUSTED'),
    totalRevenue: paiseToRupees(revenue._sum.amountPaise ?? 0n),
    totalImpressions: totals._sum.impressions ?? 0,
    totalClicks: totals._sum.clicks ?? 0,
  }
}

// ── serving engine ──────────────────────────────────────────────────────────
type ServedCandidate = Pick<AdCampaign, 'id' | 'businessName' | 'title' | 'description' | 'creativeType' | 'creativeUrl' | 'ctaText' | 'platform' | 'startDate' | 'endDate' | 'budgetPaise' | 'spentPaise'>
// One feed-level lookup per platform, cached briefly (never one query per card).
const activeCache = {
  ttlMs: 15_000,
  store: new Map<string, { at: number; value: ServedCandidate[] }>(),
  get(k: string) {
    const e = this.store.get(k)
    return e && Date.now() - e.at < this.ttlMs ? e.value : undefined
  },
  set(k: string, value: ServedCandidate[]) {
    this.store.set(k, { at: Date.now(), value })
  },
  clear() {
    this.store.clear()
  },
}
let lastExpirySweep = 0

async function sweepExpired() {
  if (Date.now() - lastExpirySweep < 30_000) return
  lastExpirySweep = Date.now()
  const r = await prisma.adCampaign.updateMany({ where: { status: 'ACTIVE', endDate: { lte: new Date() } }, data: { status: 'EXPIRED' } })
  if (r.count) activeCache.clear()
}

async function eligibleCampaigns(platform: 'WEB' | 'MOBILE'): Promise<ServedCandidate[]> {
  await sweepExpired()
  const cached = activeCache.get(platform)
  if (cached) return cached
  const now = new Date()
  const rows = await prisma.adCampaign.findMany({
    where: {
      status: 'ACTIVE',
      // Defence in depth: only a campaign with a confirmed (PAID) payment can ever be served.
      payments: { some: { status: 'PAID' } },
      placement: 'BUYER_FEED',
      platform: { in: [platform as AdPlatform, 'BOTH'] },
      AND: [{ OR: [{ startDate: null }, { startDate: { lte: now } }] }, { OR: [{ endDate: null }, { endDate: { gt: now } }] }],
    },
    select: { id: true, businessName: true, title: true, description: true, creativeType: true, creativeUrl: true, ctaText: true, platform: true, startDate: true, endDate: true, budgetPaise: true, spentPaise: true },
  })
  const eligible = rows.filter((c) => c.spentPaise < c.budgetPaise)
  activeCache.set(platform, eligible)
  return eligible
}

export function issueAdToken(campaignId: string, platform: 'WEB' | 'MOBILE'): string {
  return jwt.sign({ typ: 'ad', c: campaignId, n: crypto.randomBytes(16).toString('hex'), p: platform }, JWT_SECRET, { expiresIn: adConfig.tokenTtlSeconds })
}

// Fair rotation: uniform random among eligible campaigns, without repeats in one response.
export async function getFeedAds(platform: 'WEB' | 'MOBILE', count: number) {
  const eligible = await eligibleCampaigns(platform)
  const pool = [...eligible]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picked = pool.slice(0, Math.max(0, Math.min(count, adConfig.maxAdsPerRequest)))
  return {
    interval: adConfig.insertionInterval,
    ads: picked.map((c) => {
      const token = issueAdToken(c.id, platform)
      return {
        id: c.id,
        token,
        businessName: c.businessName,
        title: c.title,
        description: c.description,
        creativeType: c.creativeType,
        creativeUrl: c.creativeUrl,
        ctaText: c.ctaText,
        // Clicks go through the tracking redirect; the raw destination is never sent to the client.
        clickPath: `/ads/click?t=${encodeURIComponent(token)}`,
      }
    }),
  }
}

// ── tracking ────────────────────────────────────────────────────────────────
function readToken(token: string): { c: string; n: string; p: 'WEB' | 'MOBILE' } {
  try {
    const d = jwt.verify(token, JWT_SECRET) as { typ?: string; c?: string; n?: string; p?: string }
    if (d.typ !== 'ad' || !d.c || !d.n || (d.p !== 'WEB' && d.p !== 'MOBILE')) throw new Error('bad')
    return { c: d.c, n: d.n, p: d.p }
  } catch {
    throw new AdError(400, 'Invalid or expired ad token.')
  }
}

class NotBillable extends Error {}

// Billing for one valid impression, in integer paise, atomically: bump the counter,
// derive spentPaise from it, and flip to EXHAUSTED when the budget is reached. Refuses
// (0 rows) if the campaign is not ACTIVE, is outside its dates, or would exceed budget.
export async function recordImpression(token: string): Promise<{ counted: boolean; duplicate?: boolean }> {
  const t = readToken(token)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.adEvent.create({ data: { campaignId: t.c, type: 'IMPRESSION', nonce: t.n, platform: t.p } })
      const rows = await tx.$executeRaw`
        UPDATE "AdCampaign" SET
          "impressions" = "impressions" + 1,
          "spentPaise" = (("impressions" + 1)::bigint * "cpmPaise"::bigint) / 1000,
          "status" = CASE WHEN ((("impressions" + 1)::bigint * "cpmPaise"::bigint) / 1000) >= "budgetPaise"
                          THEN 'EXHAUSTED'::"AdCampaignStatus" ELSE "status" END,
          "updatedAt" = now()
        WHERE "id" = ${t.c}
          AND "status" = 'ACTIVE'::"AdCampaignStatus"
          AND EXISTS (SELECT 1 FROM "AdvertisingPayment" ap WHERE ap."campaignId" = "AdCampaign"."id" AND ap."status" = 'PAID'::"AdPaymentStatus")
          AND ((("impressions" + 1)::bigint * "cpmPaise"::bigint) / 1000) <= "budgetPaise"
          AND ("startDate" IS NULL OR "startDate" <= now())
          AND ("endDate" IS NULL OR "endDate" > now())`
      if (rows === 0) throw new NotBillable()
    })
  } catch (e) {
    if (e instanceof NotBillable) return { counted: false }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { counted: false, duplicate: true }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw new AdError(404, 'Campaign not found')
    throw e
  }
  const c = await prisma.adCampaign.findUnique({ where: { id: t.c }, include: { advertiser: true } })
  if (c?.status === 'EXHAUSTED') {
    activeCache.clear()
    void mail(c.advertiser.email, 'Your CivilCheck campaign has used its full budget', `"${c.title}" has delivered its full budget and has stopped.`)
  }
  return { counted: true }
}

// Counts a click once per token (analytics only — no billing) and returns the destination.
export async function recordClick(token: string): Promise<string> {
  const t = readToken(token)
  const campaign = await prisma.adCampaign.findUnique({ where: { id: t.c }, select: { destinationUrl: true } })
  if (!campaign) throw new AdError(404, 'Campaign not found')
  try {
    await prisma.$transaction([
      prisma.adEvent.create({ data: { campaignId: t.c, type: 'CLICK', nonce: t.n, platform: t.p } }),
      prisma.adCampaign.update({ where: { id: t.c }, data: { clicks: { increment: 1 } } }),
    ])
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e // repeat click: just redirect
  }
  return campaign.destinationUrl
}
