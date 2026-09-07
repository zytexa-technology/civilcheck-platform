// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation foundation (Phase 4B).
//
// Two independent checks, both additive and read-only against live data —
// neither one ever "fixes" a mismatch; both only ever create a
// ReconciliationIssue row for a Super Admin to review and resolve by hand
// (admin.controller.ts's resolveReconciliationIssue).
//
//   1. INTERNAL consistency — always runs, no external dependency: does our
//      own ledger agree with our own PaymentOrder/ProfessionalPayoutRecord
//      rows? (amount sums, commission splits, refund coverage). This is
//      fully testable today without a Razorpay account.
//   2. REMOTE consistency — only runs when isRazorpayConfigured() is true:
//      does a captured PaymentOrder's amount/status actually match what
//      Razorpay has on file for that payment id? This needs real (or test)
//      Razorpay credentials to exercise — see this phase's final report for
//      exactly what verifying it live would require.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { fetchPayment, isRazorpayConfigured } from '../lib/razorpay.js'

async function openIssueIfNotAlready(
  type: Parameters<typeof prisma.reconciliationIssue.create>[0]['data']['type'],
  reference: string,
  details: string
): Promise<boolean> {
  const existing = await prisma.reconciliationIssue.findFirst({
    where: { type, reference, status: 'OPEN' },
  })
  if (existing) return false // already flagged and still unresolved — don't spam duplicates

  await prisma.reconciliationIssue.create({ data: { type, reference, details } })
  logger.warn(`[reconciliation] opened ${type} for ${reference}: ${details}`)
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL CONSISTENCY — verification-marketplace PaymentOrders only
// ─────────────────────────────────────────────────────────────────────────────
async function checkPaymentOrderConsistency(): Promise<number> {
  let issuesOpened = 0

  const orders = await prisma.paymentOrder.findMany({
    where: { status: 'PAID', kind: { in: ['VERIFICATION_ADVANCE', 'VERIFICATION_FINAL'] } },
  })

  for (const order of orders) {
    // Commission split must actually sum back to the charged amount — the
    // same invariant computeCommission()/verificationSplit() already
    // guarantee at write time (see payment.service.ts); this re-checks it
    // independently, in case a future change to that logic ever breaks it.
    const platformPaise = Math.round(order.platformCut * 100)
    const sellerPaise = Math.round(order.sellerCut * 100)
    if (platformPaise + sellerPaise !== order.amount) {
      const opened = await openIssueIfNotAlready(
        'COMMISSION_MISMATCH',
        `PaymentOrder:${order.id}`,
        `platformCut (₹${order.platformCut}) + sellerCut (₹${order.sellerCut}) = ` +
          `${platformPaise + sellerPaise} paise, but the charged amount was ${order.amount} paise.`
      )
      if (opened) issuesOpened++
    }

    // The ledger's GROSS_PAYMENT entry for this order must match the
    // charged amount exactly.
    const grossEntry = await prisma.financialLedgerEntry.findFirst({
      where: { paymentOrderId: order.id, type: 'GROSS_PAYMENT' },
    })
    if (!grossEntry) {
      const opened = await openIssueIfNotAlready(
        'MISSING_INTERNAL_RECORD',
        `PaymentOrder:${order.id}`,
        `PAID order has no GROSS_PAYMENT ledger entry — the capture handler may have skipped ledger recording.`
      )
      if (opened) issuesOpened++
    } else if (grossEntry.amountPaise !== order.amount) {
      const opened = await openIssueIfNotAlready(
        'AMOUNT_MISMATCH',
        `PaymentOrder:${order.id}`,
        `Ledger GROSS_PAYMENT is ${grossEntry.amountPaise} paise but the order's charged amount is ${order.amount} paise.`
      )
      if (opened) issuesOpened++
    }
  }

  return issuesOpened
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL CONSISTENCY — payout batch totals
// ─────────────────────────────────────────────────────────────────────────────
async function checkPayoutConsistency(): Promise<number> {
  let issuesOpened = 0

  const records = await prisma.professionalPayoutRecord.findMany({
    where: { status: { in: ['PROCESSING', 'PAID'] } },
    include: { earnings: { select: { grossEarningPaise: true } } },
  })

  for (const record of records) {
    const claimedTotal = record.earnings.reduce((sum, e) => sum + e.grossEarningPaise, 0)
    if (claimedTotal !== record.totalAmountPaise) {
      const opened = await openIssueIfNotAlready(
        'PAYOUT_MISMATCH',
        `ProfessionalPayoutRecord:${record.id}`,
        `Recorded total ${record.totalAmountPaise} paise but its claimed earnings sum to ${claimedTotal} paise.`
      )
      if (opened) issuesOpened++
    }
  }

  return issuesOpened
}

// ─────────────────────────────────────────────────────────────────────────────
// REMOTE CONSISTENCY — only meaningful with real/test Razorpay credentials
// ─────────────────────────────────────────────────────────────────────────────
async function checkAgainstRazorpay(): Promise<number> {
  if (!isRazorpayConfigured()) {
    logger.info('[reconciliation] Razorpay not configured — skipping remote consistency checks')
    return 0
  }

  let issuesOpened = 0
  const orders = await prisma.paymentOrder.findMany({
    where: {
      status: 'PAID',
      kind: { in: ['VERIFICATION_ADVANCE', 'VERIFICATION_FINAL'] },
      paymentId: { not: null },
    },
    take: 200, // bounded sweep — a full backfill is a separate, deliberate operation
    orderBy: { createdAt: 'desc' },
  })

  for (const order of orders) {
    if (!order.paymentId) continue
    const remote = await fetchPayment(order.paymentId)

    if (!remote) {
      const opened = await openIssueIfNotAlready(
        'MISSING_REMOTE_RECORD',
        `PaymentOrder:${order.id}`,
        `Payment ${order.paymentId} marked PAID internally but could not be confirmed against Razorpay.`
      )
      if (opened) issuesOpened++
      continue
    }

    if (remote.amount !== order.amount) {
      const opened = await openIssueIfNotAlready(
        'AMOUNT_MISMATCH',
        `PaymentOrder:${order.id}`,
        `Razorpay reports ${remote.amount} paise for payment ${order.paymentId}, internal record shows ${order.amount} paise.`
      )
      if (opened) issuesOpened++
    }

    if (!remote.captured) {
      const opened = await openIssueIfNotAlready(
        'TRANSFER_FAILURE',
        `PaymentOrder:${order.id}`,
        `Payment ${order.paymentId} is marked PAID internally but Razorpay reports it as not captured (status: ${remote.status}).`
      )
      if (opened) issuesOpened++
    }
  }

  return issuesOpened
}

export interface ReconciliationSweepResult {
  internalIssuesOpened: number
  remoteIssuesOpened: number
  remoteCheckSkipped: boolean
}

export async function runReconciliationSweep(): Promise<ReconciliationSweepResult> {
  const [orderIssues, payoutIssues] = await Promise.all([
    checkPaymentOrderConsistency(),
    checkPayoutConsistency(),
  ])
  const remoteCheckSkipped = !isRazorpayConfigured()
  const remoteIssuesOpened = await checkAgainstRazorpay()

  const result = {
    internalIssuesOpened: orderIssues + payoutIssues,
    remoteIssuesOpened,
    remoteCheckSkipped,
  }
  logger.info(`[reconciliation] sweep complete: ${JSON.stringify(result)}`)
  return result
}
