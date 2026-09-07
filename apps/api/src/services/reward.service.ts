// ─────────────────────────────────────────────────────────────────────────────
// Reporter Reward Ledger domain logic (Phase 4A).
//
// One model (RewardTransaction) is the single source of truth for a
// Reporter's point balance — nothing is cached/denormalized onto Seller, so
// there is no derived total that can drift out of sync with the ledger.
// Every wallet number the Reporter/Admin UIs need is a plain aggregate query
// over this table (getRewardSummary below).
//
// Points are never hardcoded here or at any call site — the only per-event
// value (points for an approved property) is read from
// PlatformSetting.reporterRewardPointsPerApprovedProperty and frozen onto the
// transaction at credit time, same pattern verification.service.ts uses for
// VerificationRequest.minFee.
//
// No currency conversion anywhere in this file — redemption is fulfilled
// off-platform by an Admin; this ledger only ever moves points.
// ─────────────────────────────────────────────────────────────────────────────
import type { Prisma, RedeemRequest, RewardTransaction } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { getPlatformSettings } from './platformSettings.service.js'

export class RewardError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RewardError'
    this.status = status
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT — automatic EARNED transaction for an approved event
// ─────────────────────────────────────────────────────────────────────────────
// NOT currently called anywhere (Reporter/Owner architecture split): this
// used to fire from admin.controller.ts's approveProperty for a Reporter's
// Property, but Reporter no longer creates Property rows and publishing a
// ReporterPost is explicitly NOT an automatic reward trigger. Left in place,
// unused, as a ready-made hook for a future explicit reward event, rather
// than deleted — the point-freezing/PENDING-then-approved shape below is
// still the right pattern if one is added. Today the only way a Reporter
// earns points is a SuperAdmin-issued ADMIN_ADJUSTMENT (createAdjustment
// below). Starts PENDING — a second, separate admin action
// (approveRewardTransaction) moves it into the spendable balance. That extra
// step is deliberate: "Admin/Super Admin controls for reward approval" is a
// distinct control from the moderation decision itself, even though in
// practice the same admin will usually do both.
export async function creditEarnedPoints(
  tx: Prisma.TransactionClient,
  sellerId: string,
  propertyId: string
): Promise<RewardTransaction> {
  const settings = await getPlatformSettings()
  const points = settings.reporterRewardPointsPerApprovedProperty

  return tx.rewardTransaction.create({
    data: {
      sellerId,
      type: 'EARNED',
      points,
      status: 'PENDING',
      propertyId,
      reason: 'Property approved by admin',
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// WALLET SUMMARY — every number a Reporter/Admin UI needs, one aggregate pass
// ─────────────────────────────────────────────────────────────────────────────
export interface RewardSummary {
  totalEarned: number // gross EARNED points, any status
  pendingPoints: number // sum of PENDING rows (almost always EARNED)
  approvedPoints: number // sum of positive APPROVED rows (earned credits + positive adjustments)
  redeemedPoints: number // sum of |REDEMPTION| APPROVED rows
  adjustmentPoints: number // net of APPROVED ADMIN_ADJUSTMENT rows (can be negative)
  rejectedPoints: number // sum of REJECTED rows
  availableBalance: number // spendable balance — sum of ALL APPROVED rows (nets redemptions/debits)
}

export async function getRewardSummary(sellerId: string): Promise<RewardSummary> {
  const rows = await prisma.rewardTransaction.findMany({
    where: { sellerId },
    select: { type: true, status: true, points: true },
  })

  let totalEarned = 0
  let pendingPoints = 0
  let approvedPoints = 0
  let redeemedPoints = 0
  let adjustmentPoints = 0
  let rejectedPoints = 0
  let availableBalance = 0

  for (const row of rows) {
    if (row.type === 'EARNED') totalEarned += row.points
    if (row.status === 'PENDING') pendingPoints += row.points
    if (row.status === 'APPROVED') {
      availableBalance += row.points
      if (row.points > 0) approvedPoints += row.points
      if (row.type === 'REDEMPTION') redeemedPoints += Math.abs(row.points)
      if (row.type === 'ADMIN_ADJUSTMENT') adjustmentPoints += row.points
    }
    if (row.status === 'REJECTED') rejectedPoints += row.points
  }

  return {
    totalEarned,
    pendingPoints,
    approvedPoints,
    redeemedPoints,
    adjustmentPoints,
    rejectedPoints,
    availableBalance,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST — reward history (own, for the Reporter; any seller, for Admin)
// ─────────────────────────────────────────────────────────────────────────────
export async function listTransactions(
  where: Prisma.RewardTransactionWhereInput,
  page: number,
  limit: number
) {
  const skip = (page - 1) * limit
  const [transactions, total] = await Promise.all([
    prisma.rewardTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.rewardTransaction.count({ where }),
  ])
  return { transactions, total }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — approve/reject a PENDING EARNED transaction
// ─────────────────────────────────────────────────────────────────────────────
export async function decideEarnedTransaction(
  transactionId: string,
  adminId: string,
  approve: boolean,
  reason?: string
): Promise<RewardTransaction> {
  const { count } = await prisma.rewardTransaction.updateMany({
    where: { id: transactionId, status: 'PENDING' },
    data: {
      status: approve ? 'APPROVED' : 'REJECTED',
      decidedByAdminId: adminId,
      decidedAt: new Date(),
      ...(reason ? { reason } : {}),
    },
  })

  if (count === 0) {
    throw new RewardError('Transaction not found or is no longer pending', 404)
  }

  return prisma.rewardTransaction.findUniqueOrThrow({ where: { id: transactionId } })
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — manual credit/debit adjustment (already APPROVED — the admin
// creating it IS the approval)
// ─────────────────────────────────────────────────────────────────────────────
export async function createAdjustment(
  sellerId: string,
  points: number,
  reason: string,
  adminId: string
): Promise<RewardTransaction> {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { id: true, deletedAt: true } })
  if (!seller || seller.deletedAt) throw new RewardError('Seller not found', 404)

  return prisma.rewardTransaction.create({
    data: {
      sellerId,
      type: 'ADMIN_ADJUSTMENT',
      points,
      status: 'APPROVED',
      reason,
      decidedByAdminId: adminId,
      decidedAt: new Date(),
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// REDEEM REQUESTS
// ─────────────────────────────────────────────────────────────────────────────
export async function createRedeemRequest(
  sellerId: string,
  points: number,
  note?: string
): Promise<RedeemRequest> {
  const summary = await getRewardSummary(sellerId)
  if (points > summary.availableBalance) {
    throw new RewardError(
      `Insufficient balance — you have ${summary.availableBalance} points available`,
      400
    )
  }

  return prisma.redeemRequest.create({
    data: { sellerId, points, note: note ?? null },
  })
}

export async function decideRedeemRequest(
  requestId: string,
  adminId: string,
  approve: boolean,
  adminNote?: string
): Promise<RedeemRequest> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.redeemRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        adminNote: adminNote ?? null,
        resolvedByAdminId: adminId,
        resolvedAt: new Date(),
      },
    })
    if (count === 0) {
      throw new RewardError('Redeem request not found or is no longer pending', 404)
    }

    const request = await tx.redeemRequest.findUniqueOrThrow({ where: { id: requestId } })

    if (approve) {
      // Re-verify balance inside the transaction — the Reporter's approved
      // balance may have moved (further redemptions, admin debits) between
      // the request being filed and an admin acting on it.
      const rows = await tx.rewardTransaction.findMany({
        where: { sellerId: request.sellerId, status: 'APPROVED' },
        select: { points: true },
      })
      const availableBalance = rows.reduce((sum, r) => sum + r.points, 0)
      if (request.points > availableBalance) {
        throw new RewardError(
          `Cannot approve — Reporter's available balance (${availableBalance}) is now below the requested ${request.points} points`,
          409
        )
      }

      await tx.rewardTransaction.create({
        data: {
          sellerId: request.sellerId,
          type: 'REDEMPTION',
          points: -request.points,
          status: 'APPROVED',
          reason: `Redeem request ${request.id} approved`,
          decidedByAdminId: adminId,
          decidedAt: new Date(),
        },
      })
    }

    return request
  })
}

export async function listRedeemRequests(
  where: Prisma.RedeemRequestWhereInput,
  page: number,
  limit: number
) {
  const skip = (page - 1) * limit
  const [requests, total] = await Promise.all([
    prisma.redeemRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.redeemRequest.count({ where }),
  ])
  return { requests, total }
}
