import { Router } from 'express'
import { PartnerRole } from '@prisma/client'
import * as earningsController from '../controllers/earnings.controller.js'
import { sellerMiddleware, requireSellerRole } from '../middleware/auth.middleware.js'

const router = Router()

// Saare earnings routes ke liye seller login zaroori hai
//
// Earnings/settlements only exist for the expert persona's paid listing
// sales and special-request payouts — the owner persona has no earnings
// surface in the frontend at all.
const expertOnly = requireSellerRole(PartnerRole.EXPERT)

// GET /api/seller/earnings                    → Overview (lifetime, month, week)
router.get('/', sellerMiddleware, expertOnly, earningsController.getEarningsOverview)

// GET /api/seller/earnings/transactions       → Per listing breakdown
// GET /api/seller/earnings/transactions?settled=true  → Sirf settled
// GET /api/seller/earnings/transactions?settled=false → Sirf pending
router.get('/transactions', sellerMiddleware, expertOnly, earningsController.getTransactions)

// GET /api/seller/earnings/statement          → Income tax statement
// GET /api/seller/earnings/statement?from=2025-04-01&to=2026-03-31
router.get('/statement', sellerMiddleware, expertOnly, earningsController.getEarningsStatement)

// GET /api/seller/earnings/statement/pdf       → Same statement, as a PDF
router.get('/statement/pdf', sellerMiddleware, expertOnly, earningsController.getEarningsStatementPdf)

// GET /api/seller/settlements                 → Settlement history by week
router.get('/settlements', sellerMiddleware, expertOnly, earningsController.getSettlements)

// GET /api/seller/settlements/pending         → Next payout detail
router.get('/settlements/pending', sellerMiddleware, expertOnly, earningsController.getPendingSettlement)

export default router
