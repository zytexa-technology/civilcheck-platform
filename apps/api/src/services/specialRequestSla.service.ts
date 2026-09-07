// ─────────────────────────────────────────────────────────────────────────────
// Special-request SLA sweep (Day 6) — two independent timers on the
// research pipeline, both measured from `updatedAt` (the timestamp of the
// status transition that started the clock: admin assign → ASSIGNED, seller
// accept → IN_PROGRESS):
//
//   ASSIGNED   12h  → seller never accepted   → auto-unassign, back to PENDING
//   IN_PROGRESS 72h → seller never completed  → auto-refund the buyer
//
// This is a system actor, not an admin — recordAudit() requires an
// authenticated req.admin and deliberately refuses to write without one, so
// these actions are logged via `logger` instead, same as the webhook path.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { executeRefund } from './refund.service.js'

const ASSIGNMENT_SLA_MS = 12 * 60 * 60 * 1000
const COMPLETION_SLA_MS = 72 * 60 * 60 * 1000

export async function autoDeclineOverdueAssignments(): Promise<void> {
  const cutoff = new Date(Date.now() - ASSIGNMENT_SLA_MS)
  const overdue = await prisma.specialRequest.findMany({
    where: { status: 'ASSIGNED', updatedAt: { lt: cutoff } },
    select: { id: true },
  })

  for (const { id } of overdue) {
    // Guarded update — only flips a row that is still ASSIGNED and still
    // overdue, so a seller accepting between the findMany and here wins.
    const result = await prisma.specialRequest.updateMany({
      where: { id, status: 'ASSIGNED', updatedAt: { lt: cutoff } },
      data: {
        sellerId: null,
        status: 'PENDING',
        adminNote: 'The seller did not accept within 12 hours — auto-unassigned (SLA).',
      },
    })
    if (result.count > 0) {
      logger.info(`[sla] request ${id} auto-unassigned — seller missed the 12h accept window`)
    }
  }
}

export async function autoRefundOverdueCompletions(): Promise<void> {
  const cutoff = new Date(Date.now() - COMPLETION_SLA_MS)
  const overdue = await prisma.specialRequest.findMany({
    where: { status: 'IN_PROGRESS', updatedAt: { lt: cutoff } },
    select: { id: true, userId: true, advanceAmount: true, advancePaid: true },
  })

  for (const request of overdue) {
    // Guarded claim — same shape as rejectSpecialRequest, so this sweep and
    // an admin action racing on the same row can't both process it.
    const claim = await prisma.specialRequest.updateMany({
      where: { id: request.id, status: 'IN_PROGRESS', updatedAt: { lt: cutoff } },
      data: {
        status: 'REJECTED',
        adminNote: 'The seller did not complete the research within 72 hours — auto-refunded (SLA).',
      },
    })
    if (claim.count === 0) continue

    if (!request.advancePaid) {
      // IN_PROGRESS requires an assignment, which requires advancePaid — this
      // would only happen from a data bug, not a normal runtime path.
      logger.error(`[sla] request ${request.id} was IN_PROGRESS with advancePaid=false — no refund issued`)
      continue
    }

    const refund = await prisma.refund.create({
      data: {
        specialRequestId: request.id,
        userId: request.userId,
        amount: request.advanceAmount,
        reason: 'Auto-refund: seller missed the 72-hour completion SLA',
        status: 'PENDING',
      },
    })

    const result = await executeRefund(refund.id, 'Auto-refund: 72-hour completion SLA missed')
    if (result.ok) {
      logger.info(`[sla] request ${request.id} auto-refunded — Rs. ${request.advanceAmount} (refund ${refund.id})`)
    } else {
      logger.error(
        `[sla] request ${request.id} auto-refund FAILED, refund ${refund.id} left PENDING: ${result.message}`
      )
    }
  }
}

export async function runSpecialRequestSlaSweep(): Promise<void> {
  await autoDeclineOverdueAssignments()
  await autoRefundOverdueCompletions()
}
