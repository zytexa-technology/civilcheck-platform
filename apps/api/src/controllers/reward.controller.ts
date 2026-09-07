import { Request, Response } from 'express'
import * as rewardService from '../services/reward.service.js'

// ─────────────────────────────────────────────────────────────────────────────
//  REPORTER-FACING REWARD LEDGER (Phase 4A)
//  Mounted at /api/seller/reporter/rewards, requireSellerRole(REPORTER) —
//  a Reporter can only ever read/act on their own ledger (req.seller.id).
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/seller/reporter/rewards/summary
export const getMySummary = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const summary = await rewardService.getRewardSummary(sellerId)
  res.json({ success: true, summary })
}

// GET /api/seller/reporter/rewards/transactions
export const getMyTransactions = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { page = '1', limit = '20' } = req.query
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20))

  const { transactions, total } = await rewardService.listTransactions(
    { sellerId },
    pageNum,
    limitNum
  )

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    transactions,
  })
}

// POST /api/seller/reporter/rewards/redeem
export const createRedeemRequest = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { points, note } = req.body as { points: number; note?: string }

  try {
    const request = await rewardService.createRedeemRequest(sellerId, points, note)
    res.status(201).json({
      success: true,
      message: 'Redeem request submitted — an admin will review it.',
      request,
    })
  } catch (err) {
    if (err instanceof rewardService.RewardError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// GET /api/seller/reporter/rewards/redeem
export const getMyRedeemRequests = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { page = '1', limit = '20' } = req.query
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20))

  const { requests, total } = await rewardService.listRedeemRequests(
    { sellerId },
    pageNum,
    limitNum
  )

  res.json({
    success: true,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    requests,
  })
}
