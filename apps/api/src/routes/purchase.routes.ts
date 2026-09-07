import { Router } from 'express'
import {
  purchaseCreateSchema,
  purchaseVerifySchema,
  reportFlagCreateSchema,
  reviewCreateSchema,
} from '@civilcheck/shared'
import * as purchaseController from '../controllers/purchase.controller.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'
import { paymentLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Sabhi routes login-protected hain (buyer token chahiye).
// paymentLimiter order-creation par — order-flooding se guard (auth ke baad,
// taaki limiter per-user key use kar sake).
router.post(
  '/',
  authMiddleware,
  paymentLimiter,
  validateBody(purchaseCreateSchema),
  purchaseController.createPurchase
)

// Checkout handshake — signature verify hone par report unlock.
router.post(
  '/verify',
  authMiddleware,
  validateBody(purchaseVerifySchema),
  purchaseController.verifyPurchase
)

router.get('/', authMiddleware, purchaseController.getMyPurchases)

// Watermarked report certificate + GST invoice, both PDF.
router.get('/:id/certificate', authMiddleware, purchaseController.getReportCertificate)
router.get('/:id/invoice', authMiddleware, purchaseController.getPurchaseInvoice)

// Buyer "report outdated" flag (PDF 7.8).
router.post(
  '/:id/flag',
  authMiddleware,
  validateBody(reportFlagCreateSchema),
  purchaseController.flagReport
)

// Buyer review + rating (PDF 7.8 / 16) — one per purchase.
router.post(
  '/:id/review',
  authMiddleware,
  validateBody(reviewCreateSchema),
  purchaseController.reviewPurchase
)

export default router
