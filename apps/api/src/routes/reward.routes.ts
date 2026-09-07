import { Router } from 'express'
import { PartnerRole } from '@prisma/client'
import { redeemRequestCreateSchema } from '@civilcheck/shared'
import * as rewardController from '../controllers/reward.controller.js'
import { sellerMiddleware, requireSellerRole } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

const router = Router()

// requireSellerRole(REPORTER) — a Reporter can only ever read/act on their
// own ledger (req.seller.id); an Owner/Expert replaying their JWT here gets
// the same 403 as any other cross-persona route in this codebase.
const reporterOnly = requireSellerRole(PartnerRole.REPORTER)

router.get('/summary', sellerMiddleware, reporterOnly, rewardController.getMySummary)
router.get('/transactions', sellerMiddleware, reporterOnly, rewardController.getMyTransactions)
router.get('/redeem', sellerMiddleware, reporterOnly, rewardController.getMyRedeemRequests)
router.post(
  '/redeem',
  sellerMiddleware,
  reporterOnly,
  validateBody(redeemRequestCreateSchema),
  rewardController.createRedeemRequest
)

export default router
