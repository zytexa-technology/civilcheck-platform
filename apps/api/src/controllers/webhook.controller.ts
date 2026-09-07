import { Request, Response } from 'express'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { verifyWebhookSignature } from '../lib/razorpay.js'
import {
  finalizeReportUnlock,
  finalizeSpecialRequestAdvance,
  finalizeVerificationAdvance,
  finalizeVerificationFinalPayment,
} from '../services/payment.service.js'
import {
  activateOrRenewSubscription,
  revokeSubscription,
} from '../services/subscription.service.js'
import { handlePayoutWebhookEvent } from '../services/payout.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/razorpay
// ─────────────────────────────────────────────────────────────────────────────
// The authoritative, server-to-server payment confirmation. Authenticated by
// the X-Razorpay-Signature HMAC over the RAW body — which is why this route is
// mounted with express.raw() ahead of express.json() in index.ts, so req.body
// is the exact bytes Razorpay signed.
//
// Contract: a bad/missing signature → 400 (rejected). Anything else, including a
// duplicate delivery or an event we don't act on, → 200, so Razorpay stops
// retrying. Idempotency lives in finalizeReportUnlock, not here.
// ─────────────────────────────────────────────────────────────────────────────

interface RazorpayPaymentEntity {
  id?: string
  order_id?: string
  amount?: number
  currency?: string
  status?: string
  // Only present on fee-bearing accounts — captured into a PROCESSING_FEE
  // ledger entry (Phase 4B) when Razorpay reports one; never fabricated.
  fee?: number
  tax?: number
}

interface RazorpaySubscriptionEntity {
  id?: string
  status?: string
  current_end?: number // unix seconds — paid-through date for this cycle
}

// RazorpayX Payouts webhook entity (Phase 4B) — a different product from
// Checkout payments, delivered on the same webhook endpoint/secret.
interface RazorpayPayoutEntity {
  id?: string
  status?: string
  failure_reason?: string
}

interface RazorpayWebhookEvent {
  event?: string
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity }
    subscription?: { entity?: RazorpaySubscriptionEntity }
    payout?: { entity?: RazorpayPayoutEntity }
  }
}

export const handleRazorpayWebhook = async (req: Request, res: Response) => {
  // express.raw() leaves req.body a Buffer; be defensive if the parser order
  // ever changes so a misconfiguration fails closed rather than throwing.
  const raw: Buffer = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === 'string' ? req.body : '')

  const header = req.headers['x-razorpay-signature']
  const signature = typeof header === 'string' ? header : undefined

  if (!verifyWebhookSignature(raw, signature)) {
    logger.warn('[webhook] signature verification failed — rejected')
    res.status(400).json({ success: false, message: 'Invalid signature' })
    return
  }

  let event: RazorpayWebhookEvent
  try {
    event = JSON.parse(raw.toString('utf8')) as RazorpayWebhookEvent
  } catch {
    logger.warn('[webhook] signed body was not valid JSON')
    res.status(400).json({ success: false, message: 'Malformed body' })
    return
  }

  // From here on the event is authentic — always acknowledge with 200.
  const ack = () => res.json({ success: true, received: true })

  switch (event.event) {
    case 'payment.captured': {
      const payment = event.payload?.payment?.entity
      if (!payment?.order_id || !payment.id) {
        logger.warn('[webhook] payment.captured missing order_id/id — ignored')
        return ack()
      }

      const paymentOrder = await prisma.paymentOrder.findUnique({
        where: { id: payment.order_id },
      })
      if (!paymentOrder) {
        // An order we never recorded — a stray/foreign event. Ack, don't act.
        logger.warn(`[webhook] payment.captured for unknown order ${payment.order_id} — ignored`)
        return ack()
      }

      // The charged amount must match what we froze at order time; a mismatch is
      // an underpayment or tampering signal — record it and refuse to unlock.
      if (typeof payment.amount === 'number' && payment.amount !== paymentOrder.amount) {
        logger.error(
          `[webhook] amount mismatch on order ${payment.order_id}: paid ${payment.amount}, ` +
            `expected ${paymentOrder.amount} — NOT unlocking`
        )
        return ack()
      }

      if (paymentOrder.kind === 'REPORT_UNLOCK') {
        const { alreadyProcessed } = await finalizeReportUnlock(paymentOrder, payment.id)
        logger.info(
          `[webhook] payment.captured order ${payment.order_id} — ` +
            (alreadyProcessed ? 'already finalized' : 'report unlocked')
        )
      } else if (paymentOrder.kind === 'SPECIAL_REQUEST_ADVANCE') {
        const { alreadyProcessed } = await finalizeSpecialRequestAdvance(paymentOrder, payment.id)
        logger.info(
          `[webhook] payment.captured order ${payment.order_id} — ` +
            (alreadyProcessed ? 'already finalized' : 'special request advance paid')
        )
      } else if (paymentOrder.kind === 'VERIFICATION_ADVANCE') {
        const processingFeePaise =
          typeof payment.fee === 'number' ? payment.fee + (payment.tax ?? 0) : null
        const { alreadyProcessed } = await finalizeVerificationAdvance(paymentOrder, payment.id, processingFeePaise)
        logger.info(
          `[webhook] payment.captured order ${payment.order_id} — ` +
            (alreadyProcessed ? 'already finalized' : 'verification advance paid')
        )
      } else if (paymentOrder.kind === 'VERIFICATION_FINAL') {
        const processingFeePaise =
          typeof payment.fee === 'number' ? payment.fee + (payment.tax ?? 0) : null
        const { alreadyProcessed } = await finalizeVerificationFinalPayment(paymentOrder, payment.id, processingFeePaise)
        logger.info(
          `[webhook] payment.captured order ${payment.order_id} — ` +
            (alreadyProcessed ? 'already finalized' : 'verification final payment received, report unlocked')
        )
      } else {
        // Subscriptions (ALERT_SUBSCRIPTION / FEATURED_LISTING) are recurring
        // and go through subscription.activated/charged instead — this branch
        // should not see them, but ack rather than throw on a surprise kind.
        logger.info(
          `[webhook] payment.captured order ${payment.order_id} kind ${paymentOrder.kind} — ` +
            'no one-time handler for this kind'
        )
      }
      return ack()
    }

    case 'payment.failed': {
      const payment = event.payload?.payment?.entity
      if (payment?.order_id) {
        await prisma.paymentOrder.updateMany({
          where: { id: payment.order_id, status: 'CREATED' },
          data: { status: 'FAILED' },
        })
        logger.info(`[webhook] payment.failed — order ${payment.order_id} marked FAILED`)
      }
      return ack()
    }

    // Subscriptions (PDF 7.7 / 3.3) — activate/renew access on charge, revoke on
    // cancel/halt. All idempotent in subscription.service.
    case 'subscription.activated':
    case 'subscription.charged': {
      const entity = event.payload?.subscription?.entity
      if (!entity?.id) {
        logger.warn(`[webhook] ${event.event} missing subscription id — ignored`)
        return ack()
      }
      const sub = await prisma.subscription.findUnique({ where: { id: entity.id } })
      if (!sub) {
        logger.warn(`[webhook] ${event.event} for unknown subscription ${entity.id} — ignored`)
        return ack()
      }
      const currentEnd =
        typeof entity.current_end === 'number' ? new Date(entity.current_end * 1000) : null
      await activateOrRenewSubscription(sub, currentEnd)
      logger.info(`[webhook] ${event.event} — subscription ${entity.id} active`)
      return ack()
    }

    case 'subscription.cancelled':
    case 'subscription.halted':
    case 'subscription.completed': {
      const entity = event.payload?.subscription?.entity
      if (!entity?.id) {
        logger.warn(`[webhook] ${event.event} missing subscription id — ignored`)
        return ack()
      }
      const sub = await prisma.subscription.findUnique({ where: { id: entity.id } })
      if (!sub) {
        logger.warn(`[webhook] ${event.event} for unknown subscription ${entity.id} — ignored`)
        return ack()
      }
      const revokeStatus =
        event.event === 'subscription.cancelled'
          ? 'CANCELLED'
          : event.event === 'subscription.halted'
            ? 'HALTED'
            : 'COMPLETED'
      await revokeSubscription(sub, revokeStatus)
      logger.info(`[webhook] ${event.event} — subscription ${entity.id} ${revokeStatus.toLowerCase()}`)
      return ack()
    }

    // RazorpayX Payouts (Phase 4B) — the only place a professional payout is
    // ever allowed to become PAID/REVERSED. Delivered on this same webhook
    // endpoint/secret (a separate RazorpayX-specific webhook secret is also
    // possible depending on account setup — see this phase's final report).
    case 'payout.processed':
    case 'payout.failed':
    case 'payout.rejected':
    case 'payout.reversed': {
      const payout = event.payload?.payout?.entity
      if (!payout?.id) {
        logger.warn(`[webhook] ${event.event} missing payout id — ignored`)
        return ack()
      }
      const outcome = await handlePayoutWebhookEvent(
        payout.id,
        event.event as 'payout.processed' | 'payout.failed' | 'payout.rejected' | 'payout.reversed',
        payout.failure_reason
      )
      logger.info(`[webhook] ${event.event} — payout ${payout.id} → ${outcome}`)
      return ack()
    }

    default:
      logger.info(`[webhook] ignored event: ${event.event ?? 'unknown'}`)
      return ack()
  }
}
