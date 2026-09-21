import { Request, Response } from 'express'
import logger from '../lib/logger.js'
import prisma from '../lib/prisma.js'
import { generateUploadSignature } from '../lib/cloudinary.js'
import { recordAudit, AuditAction } from '../services/audit.service.js'
type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction]
import { adConfig, estimateImpressions } from '../services/advertising/advertising.config.js'
import * as ads from '../services/advertising/advertising.service.js'

// One place that turns service errors into HTTP — unknown errors are logged and hidden.
function fail(res: Response, e: unknown) {
  if (e instanceof ads.AdError) {
    res.status(e.status).json({ success: false, message: e.message })
    return
  }
  logger.error(`[ads] unexpected error (${e instanceof Error ? e.name : 'unknown'})`)
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' })
}
const id = (req: Request) => req.params.id as string

// ─── ADVERTISER (own account / own campaigns) ───────────────────────────────
export const config = (_req: Request, res: Response) => {
  res.json({
    success: true,
    minBudget: adConfig.minBudgetPaise / 100,
    cpm: adConfig.cpmPaise / 100, // ₹ per 1,000 impressions
    referenceCpc: adConfig.referenceCpcPaise / 100,
  })
}

export const register = async (req: Request, res: Response) => {
  try { res.status(201).json({ success: true, ...(await ads.registerAdvertiser(req.body)) }) } catch (e) { fail(res, e) }
}
export const login = async (req: Request, res: Response) => {
  try { res.json({ success: true, ...(await ads.loginAdvertiser(req.body.email, req.body.password)) }) } catch (e) { fail(res, e) }
}

// Signed direct-to-Cloudinary upload for an ad creative (existing Cloudinary infrastructure).
export const uploadSignature = (req: Request, res: Response) => {
  const kind = req.query.type === 'video' ? 'video' : 'image'
  res.json({ success: true, upload: generateUploadSignature(`civilcheck/ads/${req.advertiser!.id}`, kind) })
}

export const createCampaign = async (req: Request, res: Response) => {
  try {
    const c = await ads.createCampaign(req.advertiser!.id, req.body)
    res.status(201).json({ success: true, campaign: ads.campaignView(c) })
  } catch (e) { fail(res, e) }
}
export const myCampaigns = async (req: Request, res: Response) => {
  try { res.json({ success: true, ...(await ads.listOwnCampaigns(req.advertiser!.id)) }) } catch (e) { fail(res, e) }
}
export const myCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await ads.getOwnCampaign(req.advertiser!.id, id(req))
    const payments = await prisma.advertisingPayment.findMany({ where: { campaignId: campaign.id } })
    res.json({ success: true, campaign: { ...ads.campaignView(campaign), ...ads.paymentSummary(payments) } })
  } catch (e) { fail(res, e) }
}
export const pay = async (req: Request, res: Response) => {
  try { res.status(201).json({ success: true, ...(await ads.startCampaignPayment(req.advertiser!.id, id(req))) }) } catch (e) { fail(res, e) }
}
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const b = req.body as { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }
    if (!b.razorpay_order_id || !b.razorpay_payment_id || !b.razorpay_signature) {
      res.status(400).json({ success: false, message: 'Payment details are missing.' })
      return
    }
    const { campaign, confirmed } = await ads.confirmCampaignPayment(req.advertiser!.id, id(req), {
      orderId: b.razorpay_order_id, paymentId: b.razorpay_payment_id, signature: b.razorpay_signature,
    })
    // confirmed=false: Razorpay has not captured the payment yet — the webhook will finalise it.
    res.status(confirmed ? 200 : 202).json({ success: true, confirmed, campaign: ads.campaignView(campaign) })
  } catch (e) { fail(res, e) }
}
export const estimate = (req: Request, res: Response) => {
  const budget = Number(req.query.budget)
  if (!Number.isFinite(budget) || budget <= 0) {
    res.status(400).json({ success: false, message: 'Enter a budget.' })
    return
  }
  res.json({ success: true, estimatedImpressions: estimateImpressions(BigInt(Math.round(budget * 100)), adConfig.cpmPaise) })
}

// ─── PUBLIC serving + tracking (Buyer Web / Buyer App) ──────────────────────
export const feedAds = async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform === 'MOBILE' ? 'MOBILE' : 'WEB'
    const count = Math.max(0, Math.min(parseInt(String(req.query.count ?? '3'), 10) || 0, adConfig.maxAdsPerRequest))
    res.json({ success: true, ...(await ads.getFeedAds(platform, count)) })
  } catch (e) { fail(res, e) }
}
export const impression = async (req: Request, res: Response) => {
  try { res.json({ success: true, ...(await ads.recordImpression(req.body.token)) }) } catch (e) { fail(res, e) }
}
// GET /api/ads/click?t=<token> — counts the click once, then redirects to the destination stored
// on the campaign (never a client-supplied URL, so this cannot be used as an open redirect).
export const click = async (req: Request, res: Response) => {
  try {
    const dest = await ads.recordClick(String(req.query.t ?? ''))
    res.redirect(302, dest)
  } catch (e) { fail(res, e) }
}

// ─── ADMIN (Superadmin) ─────────────────────────────────────────────────────
export const adminSummary = async (_req: Request, res: Response) => {
  try { res.json({ success: true, summary: await ads.adminSummary() }) } catch (e) { fail(res, e) }
}
export const adminList = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20))
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined
    res.json({ success: true, page, ...(await ads.adminListCampaigns({ status, page, limit })) })
  } catch (e) { fail(res, e) }
}
async function adminAct(req: Request, res: Response, action: AuditActionValue, run: () => Promise<{ id: string; title: string; status: string }>) {
  try {
    const c = await run()
    await recordAudit(req, { action, target: `AdCampaign:${c.id}`, details: `${action} — "${c.title}" → ${c.status}` })
    res.json({ success: true, id: c.id, status: c.status })
  } catch (e) { fail(res, e) }
}
export const adminApprove = (req: Request, res: Response) => adminAct(req, res, AuditAction.AD_APPROVE, () => ads.approveCampaign(id(req), req.admin!.id))
export const adminReject = (req: Request, res: Response) => adminAct(req, res, AuditAction.AD_REJECT, () => ads.rejectCampaign(id(req), req.admin!.id, req.body.reason))
export const adminPause = (req: Request, res: Response) => adminAct(req, res, AuditAction.AD_PAUSE, () => ads.pauseCampaign(id(req)))
export const adminResume = (req: Request, res: Response) => adminAct(req, res, AuditAction.AD_RESUME, () => ads.resumeCampaign(id(req)))
export const adminRetryRefund = (req: Request, res: Response) =>
  adminRefund(req, res)
async function adminRefund(req: Request, res: Response) {
  try {
    const r = await ads.refundRejectedCampaign(id(req))
    await recordAudit(req, { action: AuditAction.AD_REFUND, target: `AdCampaign:${id(req)}`, details: `Refund attempt → ${r.refundStatus}` })
    res.json({ success: true, refundStatus: r.refundStatus })
  } catch (e) { fail(res, e) }
}
export const adminStop = (req: Request, res: Response) => adminAct(req, res, AuditAction.AD_STOP, () => ads.stopCampaign(id(req)))
