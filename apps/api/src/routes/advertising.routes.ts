import { Router } from 'express'
import {
  adCampaignCreateSchema,
  adCampaignRejectSchema,
  adTrackSchema,
  advertiserLoginSchema,
  advertiserRegisterSchema,
} from '@civilcheck/shared'
import * as ctl from '../controllers/advertising.controller.js'
import { advertiserMiddleware } from '../middleware/advertiser.middleware.js'
import { adminMiddleware, requireAdminRole } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'
import { adServeLimiter, adTrackLimiter, advertiserAuthLimiter, advertiserPaymentLimiter } from '../middleware/rateLimiter.js'

// ── /api/advertiser — advertiser account + own campaigns ────────────────────
export const advertiserRouter = Router()
advertiserRouter.get('/config', ctl.config)
advertiserRouter.get('/estimate', ctl.estimate)
advertiserRouter.post('/register', advertiserAuthLimiter, validateBody(advertiserRegisterSchema), ctl.register)
advertiserRouter.post('/login', advertiserAuthLimiter, validateBody(advertiserLoginSchema), ctl.login)
advertiserRouter.get('/upload-signature', advertiserMiddleware, ctl.uploadSignature)
advertiserRouter.get('/campaigns', advertiserMiddleware, ctl.myCampaigns)
advertiserRouter.post('/campaigns', advertiserMiddleware, validateBody(adCampaignCreateSchema), ctl.createCampaign)
advertiserRouter.get('/campaigns/:id', advertiserMiddleware, ctl.myCampaign)
advertiserRouter.post('/campaigns/:id/pay', advertiserMiddleware, advertiserPaymentLimiter, ctl.pay)
advertiserRouter.post('/campaigns/:id/verify-payment', advertiserMiddleware, advertiserPaymentLimiter, ctl.verifyPayment)

// ── /api/ads — public serving + tracking for Buyer Web / Buyer App ──────────
export const adsRouter = Router()
adsRouter.get('/feed', adServeLimiter, ctl.feedAds)
adsRouter.post('/impression', adTrackLimiter, validateBody(adTrackSchema), ctl.impression)
adsRouter.get('/click', adTrackLimiter, ctl.click)

// ── /api/admin/advertising — Superadmin only ────────────────────────────────
export const adminAdvertisingRouter = Router()
const superOnly = requireAdminRole()
adminAdvertisingRouter.get('/summary', adminMiddleware, superOnly, ctl.adminSummary)
adminAdvertisingRouter.get('/campaigns', adminMiddleware, superOnly, ctl.adminList)
adminAdvertisingRouter.post('/campaigns/:id/approve', adminMiddleware, superOnly, ctl.adminApprove)
adminAdvertisingRouter.post('/campaigns/:id/reject', adminMiddleware, superOnly, validateBody(adCampaignRejectSchema), ctl.adminReject)
adminAdvertisingRouter.post('/campaigns/:id/pause', adminMiddleware, superOnly, ctl.adminPause)
adminAdvertisingRouter.post('/campaigns/:id/resume', adminMiddleware, superOnly, ctl.adminResume)
adminAdvertisingRouter.post('/campaigns/:id/refund', adminMiddleware, superOnly, ctl.adminRetryRefund)
adminAdvertisingRouter.post('/campaigns/:id/stop', adminMiddleware, superOnly, ctl.adminStop)
