// ─────────────────────────────────────────────────────────────────────────────
// Payment service (PDF 6.2 / 8.2) — commission split, Razorpay order creation,
// and the idempotent finalize that turns a captured payment into a Purchase.
//
// The controller stays thin: it validates the request and hands off here. Both
// the checkout-verify handshake and the webhook converge on finalizeReportUnlock
// so a report unlocks exactly once, whichever confirmation arrives first.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  Badge,
  Listing,
  PaymentKind,
  PaymentOrder,
  Purchase,
  Seller,
  SpecialRequest,
  VerificationRequest,
} from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { createOrder } from '../lib/razorpay.js'
import { notifySeller } from './notification.service.js'
import { recordCaptureLedgerEntries, promoteEarningsOnUnlock } from './ledger.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION SPLIT (PDF 6.2 & 8.2)
//
// Platform's SHARE of the gross, by payment kind. Report unlocks reward better
// badges with a smaller platform cut; special-request research is a flat 30%;
// alert subscriptions and featured listings are platform-only (no seller side).
// ─────────────────────────────────────────────────────────────────────────────
const REPORT_UNLOCK_PLATFORM_SHARE: Record<Badge, number> = {
  BRONZE: 0.4,
  SILVER: 0.4,
  GOLD: 0.35,
  PLATINUM: 0.3,
}

// VERIFICATION_ADVANCE/VERIFICATION_FINAL are deliberately excluded — that
// split is a per-request rate (VerificationRequest.platformCommissionRate,
// frozen from PlatformSetting at acceptance time), not a fixed lookup table
// entry, so it's computed directly in createVerificationAdvanceOrder/
// createVerificationFinalOrder below rather than through computeCommission().
const FLAT_PLATFORM_SHARE: Record<
  Exclude<PaymentKind, 'REPORT_UNLOCK' | 'VERIFICATION_ADVANCE' | 'VERIFICATION_FINAL'>,
  number
> = {
  SPECIAL_REQUEST_ADVANCE: 0.3,
  ALERT_SUBSCRIPTION: 1,
  FEATURED_LISTING: 1,
}

export interface CommissionSplit {
  platformCut: number // rupees, 2-decimal
  sellerCut: number // rupees, 2-decimal
}

// round-half-up to paise, kept out of float drift — exported for pdf.service.ts's
// GST/TDS math, which needs the identical rounding rule.
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// The seller cut is derived as (gross − platform) rather than a second rounded
// multiply, so the two halves always sum back to exactly the amount charged.
// VERIFICATION_ADVANCE/VERIFICATION_FINAL are excluded at the type level —
// see FLAT_PLATFORM_SHARE's comment; calling this with a verification kind is
// a compile error, not a runtime surprise.
export function computeCommission(
  kind: Exclude<PaymentKind, 'VERIFICATION_ADVANCE' | 'VERIFICATION_FINAL'>,
  badge: Badge,
  amountRupees: number
): CommissionSplit {
  const platformShare =
    kind === 'REPORT_UNLOCK' ? REPORT_UNLOCK_PLATFORM_SHARE[badge] : FLAT_PLATFORM_SHARE[kind]

  const platformCut = round2(amountRupees * platformShare)
  const sellerCut = round2(amountRupees - platformCut)
  return { platformCut, sellerCut }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER CREATION — report unlock
// ─────────────────────────────────────────────────────────────────────────────

// The listing shape the order/finalize path needs — its seller's badge drives
// the split and the seller's contact drives the post-sale notification.
export type ListingWithSeller = Listing & {
  seller: Pick<Seller, 'id' | 'name' | 'phone' | 'email' | 'badge'>
}

export interface CreatedReportOrder {
  order: { id: string; amount: number; currency: string }
  paymentOrder: PaymentOrder
}

// Creates the Razorpay order and records the pending PaymentOrder. The split and
// the amount are frozen here, server-side, so neither verify nor the webhook has
// to trust a client-supplied listing or amount later.
export async function createReportOrder(
  userId: string,
  listing: ListingWithSeller
): Promise<CreatedReportOrder> {
  const amountPaise = Math.round(listing.price * 100)
  const { platformCut, sellerCut } = computeCommission('REPORT_UNLOCK', listing.seller.badge, listing.price)

  const order = await createOrder({
    amount: amountPaise,
    // Receipt is capped at 40 chars by Razorpay; a uuid alone is 36.
    receipt: `rpt_${listing.id}`.slice(0, 40),
    notes: {
      userId,
      listingId: listing.id,
      sellerId: listing.sellerId,
      kind: 'REPORT_UNLOCK',
    },
  })

  const paymentOrder = await prisma.paymentOrder.create({
    data: {
      id: order.id,
      userId,
      kind: 'REPORT_UNLOCK',
      listingId: listing.id,
      sellerId: listing.sellerId,
      amount: amountPaise,
      currency: order.currency,
      platformCut,
      sellerCut,
    },
  })

  return { order: { id: order.id, amount: order.amount, currency: order.currency }, paymentOrder }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER CREATION — special-request advance
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatedSpecialRequestOrder {
  order: { id: string; amount: number; currency: string }
  paymentOrder: PaymentOrder
}

// Creates the Razorpay order for a special-request advance and records the
// pending PaymentOrder. No seller is assigned yet at request time — admin
// assignment happens only after the advance is paid (see assignRequest's
// advancePaid guard) — so there is nothing to split a seller cut against yet.
// The 70% seller-payout-on-completion ledger for special requests is out of
// scope for Day 6 (PDF flags it, but no mechanism exists to pay it out);
// platformCut is provisionally recorded as the full advance.
export async function createSpecialRequestOrder(
  userId: string,
  specialRequest: SpecialRequest
): Promise<CreatedSpecialRequestOrder> {
  const amountPaise = Math.round(specialRequest.advanceAmount * 100)

  const order = await createOrder({
    amount: amountPaise,
    receipt: `spr_${specialRequest.id}`.slice(0, 40),
    notes: {
      userId,
      specialRequestId: specialRequest.id,
      kind: 'SPECIAL_REQUEST_ADVANCE',
    },
  })

  const paymentOrder = await prisma.paymentOrder.create({
    data: {
      id: order.id,
      userId,
      kind: 'SPECIAL_REQUEST_ADVANCE',
      specialRequestId: specialRequest.id,
      amount: amountPaise,
      currency: order.currency,
      platformCut: specialRequest.advanceAmount,
      sellerCut: 0,
    },
  })

  return { order: { id: order.id, amount: order.amount, currency: order.currency }, paymentOrder }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZE — captured payment → Purchase (idempotent)
// ─────────────────────────────────────────────────────────────────────────────

export interface FinalizeResult {
  purchase: Purchase | null
  // true when this call did not create the Purchase (a prior verify/webhook did,
  // or the order was already resolved) — the caller still answers 200.
  alreadyProcessed: boolean
}

// Claims the order atomically (CREATED → PAID) so exactly one of a racing
// verify/webhook pair does the write, then creates the Purchase. Safe to call
// repeatedly with the same payment id.
export async function finalizeReportUnlock(
  paymentOrder: PaymentOrder,
  paymentId: string
): Promise<FinalizeResult> {
  if (!paymentOrder.listingId) {
    // A REPORT_UNLOCK order without a listing is a data bug, not a runtime path.
    logger.error(`[payment] REPORT_UNLOCK order ${paymentOrder.id} has no listingId — skipping`)
    return { purchase: null, alreadyProcessed: true }
  }

  // Atomic claim: only the CREATED → PAID transition proceeds to write.
  const claim = await prisma.paymentOrder.updateMany({
    where: { id: paymentOrder.id, status: 'CREATED' },
    data: { status: 'PAID', paymentId },
  })

  if (claim.count === 0) {
    // Someone already resolved this order. Return its Purchase if it has one.
    const current = await prisma.paymentOrder.findUnique({ where: { id: paymentOrder.id } })
    const purchase = current?.purchaseId
      ? await prisma.purchase.findUnique({ where: { id: current.purchaseId } })
      : null
    return { purchase, alreadyProcessed: true }
  }

  // A buyer who paid twice for the same listing (two separate orders) must not
  // get a second Purchase row — link the existing one and flag it for a refund.
  const existing = await prisma.purchase.findFirst({
    where: { userId: paymentOrder.userId, listingId: paymentOrder.listingId },
  })

  let purchase: Purchase
  if (existing) {
    purchase = existing
    logger.warn(
      `[payment] duplicate paid unlock for user ${paymentOrder.userId} / listing ` +
        `${paymentOrder.listingId} (order ${paymentOrder.id}) — refund candidate`
    )
  } else {
    purchase = await prisma.purchase.create({
      data: {
        userId: paymentOrder.userId,
        listingId: paymentOrder.listingId,
        amountPaid: paymentOrder.amount / 100,
        platformCut: paymentOrder.platformCut,
        sellerCut: paymentOrder.sellerCut,
        razorpayId: paymentId,
        // Payout is frozen: the seller's cut is owed but not settled until the
        // Day 6 weekly settlement run clears the threshold.
        settled: false,
      },
    })
  }

  await prisma.paymentOrder.update({
    where: { id: paymentOrder.id },
    data: { purchaseId: purchase.id },
  })

  logger.info(
    `[payment] report unlocked — purchase ${purchase.id} (order ${paymentOrder.id}, ` +
      `seller cut ₹${paymentOrder.sellerCut} frozen). Invoice generation pending (Day 6).`
  )

  // Tell the seller their report sold — best-effort, never blocks the unlock.
  // Skipped on a duplicate: the seller was already told on the first sale.
  if (!existing && paymentOrder.sellerId) {
    await notifySaleToSeller(paymentOrder.sellerId, paymentOrder.sellerCut).catch((err) =>
      logger.error(`[payment] sale notification failed for order ${paymentOrder.id}: ${err}`)
    )
  }

  return { purchase, alreadyProcessed: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZE — captured payment → advancePaid (idempotent)
// ─────────────────────────────────────────────────────────────────────────────

export interface FinalizeSpecialRequestResult {
  specialRequest: SpecialRequest | null
  alreadyProcessed: boolean
}

// Same atomic-claim shape as finalizeReportUnlock: only the CREATED → PAID
// transition proceeds, so a racing verify/webhook pair flips advancePaid
// exactly once. There is no Purchase-style dedup here — one order is created
// per special request (in createSpecialRequestOrder), so the same request
// can't have two paid orders in normal operation.
export async function finalizeSpecialRequestAdvance(
  paymentOrder: PaymentOrder,
  paymentId: string
): Promise<FinalizeSpecialRequestResult> {
  if (!paymentOrder.specialRequestId) {
    logger.error(
      `[payment] SPECIAL_REQUEST_ADVANCE order ${paymentOrder.id} has no specialRequestId — skipping`
    )
    return { specialRequest: null, alreadyProcessed: true }
  }

  const claim = await prisma.paymentOrder.updateMany({
    where: { id: paymentOrder.id, status: 'CREATED' },
    data: { status: 'PAID', paymentId },
  })

  if (claim.count === 0) {
    const current = await prisma.specialRequest.findUnique({
      where: { id: paymentOrder.specialRequestId },
    })
    return { specialRequest: current, alreadyProcessed: true }
  }

  const specialRequest = await prisma.specialRequest.update({
    where: { id: paymentOrder.specialRequestId },
    data: { advancePaid: true },
  })

  logger.info(
    `[payment] special request advance paid — request ${specialRequest.id} (order ${paymentOrder.id})`
  )

  return { specialRequest, alreadyProcessed: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION MARKETPLACE (Phase 3) — 50/50 split payment on an accepted
// VerificationRequest. Same order-creation / atomic-claim-finalize shape as
// every other kind above; the only real difference is the commission split
// comes from VerificationRequest.platformCommissionRate (frozen at
// acceptance from PlatformSetting), not a fixed lookup table — see
// computeCommission's comment for why this bypasses that function entirely.
//
// Payout mechanism: PaymentOrder.platformCut/sellerCut are recorded for both
// orders (real numbers, computed server-side, never faked), but — like
// SpecialRequest's advance before Day 6 added SpecialRequestPayout — there is
// deliberately no payout ledger wired up yet for the assigned professional's
// share. That is out of this phase's explicit scope (the brief's payment
// state machine covers the buyer side only) and is a natural next step, not
// an oversight.
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatedVerificationOrder {
  order: { id: string; amount: number; currency: string }
  paymentOrder: PaymentOrder
}

function verificationSplit(
  amountRupees: number,
  platformCommissionRate: number
): CommissionSplit {
  const platformCut = round2(amountRupees * platformCommissionRate)
  const sellerCut = round2(amountRupees - platformCut)
  return { platformCut, sellerCut }
}

// Creates the Razorpay order for the 50% advance and records the pending
// PaymentOrder. Only callable once a quote has been accepted (request.
// advanceAmount/platformCommissionRate are non-null exactly then — see
// verification.service.ts's submitVerificationQuote).
export async function createVerificationAdvanceOrder(
  userId: string,
  request: VerificationRequest
): Promise<CreatedVerificationOrder> {
  if (request.advanceAmount == null || request.platformCommissionRate == null) {
    throw new Error(
      `[payment] createVerificationAdvanceOrder called on request ${request.id} with no agreed fee`
    )
  }
  const amountPaise = Math.round(request.advanceAmount * 100)
  const { platformCut, sellerCut } = verificationSplit(request.advanceAmount, request.platformCommissionRate)

  const order = await createOrder({
    amount: amountPaise,
    receipt: `vadv_${request.id}`.slice(0, 40),
    notes: {
      userId,
      verificationRequestId: request.id,
      kind: 'VERIFICATION_ADVANCE',
    },
  })

  const paymentOrder = await prisma.paymentOrder.create({
    data: {
      id: order.id,
      userId,
      kind: 'VERIFICATION_ADVANCE',
      verificationRequestId: request.id,
      sellerId: request.assignedSellerId,
      amount: amountPaise,
      currency: order.currency,
      platformCut,
      sellerCut,
    },
  })

  await prisma.verificationRequest.update({
    where: { id: request.id },
    data: { status: 'ADVANCE_PAYMENT_PENDING' },
  })

  return { order: { id: order.id, amount: order.amount, currency: order.currency }, paymentOrder }
}

// Creates the Razorpay order for the remaining 50%. Only callable once the
// professional has submitted their findings (status COMPLETED).
export async function createVerificationFinalOrder(
  userId: string,
  request: VerificationRequest
): Promise<CreatedVerificationOrder> {
  if (request.finalAmount == null || request.platformCommissionRate == null) {
    throw new Error(
      `[payment] createVerificationFinalOrder called on request ${request.id} with no agreed fee`
    )
  }
  const amountPaise = Math.round(request.finalAmount * 100)
  const { platformCut, sellerCut } = verificationSplit(request.finalAmount, request.platformCommissionRate)

  const order = await createOrder({
    amount: amountPaise,
    receipt: `vfin_${request.id}`.slice(0, 40),
    notes: {
      userId,
      verificationRequestId: request.id,
      kind: 'VERIFICATION_FINAL',
    },
  })

  const paymentOrder = await prisma.paymentOrder.create({
    data: {
      id: order.id,
      userId,
      kind: 'VERIFICATION_FINAL',
      verificationRequestId: request.id,
      sellerId: request.assignedSellerId,
      amount: amountPaise,
      currency: order.currency,
      platformCut,
      sellerCut,
    },
  })

  await prisma.verificationRequest.update({
    where: { id: request.id },
    data: { status: 'FINAL_PAYMENT_PENDING' },
  })

  return { order: { id: order.id, amount: order.amount, currency: order.currency }, paymentOrder }
}

export interface FinalizeVerificationResult {
  request: VerificationRequest | null
  alreadyProcessed: boolean
}

// A payment landing for a request the buyer cancelled in the meantime (a
// genuine race between "buyer clicks cancel" and "Razorpay confirms a
// payment already in flight") must never be silently dropped — real money
// moved. It's flagged into a PENDING Refund for an admin to process, rather
// than either pretending the payment didn't happen or silently reviving a
// cancelled request.
async function refundStrandedPayment(paymentOrder: PaymentOrder, requestId: string): Promise<void> {
  logger.error(
    `[payment] verification payment ${paymentOrder.id} captured for request ${requestId} ` +
      `after it was cancelled — flagging for admin refund`
  )
  await prisma.refund.create({
    data: {
      verificationRequestId: requestId,
      userId: paymentOrder.userId,
      amount: paymentOrder.amount / 100,
      reason: 'Payment captured after the verification request was cancelled — automatic refund flag',
      status: 'PENDING',
    },
  })
}

export async function finalizeVerificationAdvance(
  paymentOrder: PaymentOrder,
  paymentId: string,
  processingFeePaise?: number | null
): Promise<FinalizeVerificationResult> {
  if (!paymentOrder.verificationRequestId) {
    logger.error(`[payment] VERIFICATION_ADVANCE order ${paymentOrder.id} has no verificationRequestId — skipping`)
    return { request: null, alreadyProcessed: true }
  }

  const claim = await prisma.paymentOrder.updateMany({
    where: { id: paymentOrder.id, status: 'CREATED' },
    data: { status: 'PAID', paymentId },
  })
  if (claim.count === 0) {
    const current = await prisma.verificationRequest.findUnique({
      where: { id: paymentOrder.verificationRequestId },
    })
    return { request: current, alreadyProcessed: true }
  }

  const paidOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: paymentOrder.id } })

  // The status flip and the ledger write happen in the same transaction
  // (Phase 4B) — a request can never end up ADVANCE_PAID without its
  // GROSS_PAYMENT/PLATFORM_COMMISSION/PROFESSIONAL_EARNING ledger entries
  // also existing, or neither, if the transaction rolls back.
  const { stranded, request: settledRequest } = await prisma.$transaction(async (tx) => {
    const updated = await tx.verificationRequest.updateMany({
      where: { id: paymentOrder.verificationRequestId!, status: 'ADVANCE_PAYMENT_PENDING' },
      data: { status: 'ADVANCE_PAID' },
    })
    if (updated.count === 0) {
      return { stranded: true, request: null }
    }
    const request = await tx.verificationRequest.findUniqueOrThrow({
      where: { id: paymentOrder.verificationRequestId! },
    })
    await recordCaptureLedgerEntries(tx, { paymentOrder: paidOrder, verificationRequest: request, processingFeePaise })
    return { stranded: false, request }
  })

  if (stranded) {
    await refundStrandedPayment(paymentOrder, paymentOrder.verificationRequestId)
  }

  const request = settledRequest ?? (await prisma.verificationRequest.findUnique({
    where: { id: paymentOrder.verificationRequestId },
  }))
  logger.info(`[payment] verification advance paid — request ${paymentOrder.verificationRequestId} (order ${paymentOrder.id})`)
  return { request, alreadyProcessed: false }
}

export async function finalizeVerificationFinalPayment(
  paymentOrder: PaymentOrder,
  paymentId: string,
  processingFeePaise?: number | null
): Promise<FinalizeVerificationResult> {
  if (!paymentOrder.verificationRequestId) {
    logger.error(`[payment] VERIFICATION_FINAL order ${paymentOrder.id} has no verificationRequestId — skipping`)
    return { request: null, alreadyProcessed: true }
  }

  const claim = await prisma.paymentOrder.updateMany({
    where: { id: paymentOrder.id, status: 'CREATED' },
    data: { status: 'PAID', paymentId },
  })
  if (claim.count === 0) {
    const current = await prisma.verificationRequest.findUnique({
      where: { id: paymentOrder.verificationRequestId },
    })
    return { request: current, alreadyProcessed: true }
  }

  const paidOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: paymentOrder.id } })

  const { stranded, request: settledRequest } = await prisma.$transaction(async (tx) => {
    const updated = await tx.verificationRequest.updateMany({
      where: { id: paymentOrder.verificationRequestId!, status: 'FINAL_PAYMENT_PENDING' },
      data: { status: 'FULLY_PAID' },
    })
    if (updated.count === 0) {
      return { stranded: true, request: null }
    }

    const requestAfterFinal = await tx.verificationRequest.findUniqueOrThrow({
      where: { id: paymentOrder.verificationRequestId! },
    })
    await recordCaptureLedgerEntries(tx, {
      paymentOrder: paidOrder,
      verificationRequest: requestAfterFinal,
      processingFeePaise,
    })

    // No manual gate between "fully paid" and "unlocked" today — both are
    // real, distinct states in the state machine (kept for a future QC
    // step), but nothing currently holds a fully-paid report back from its
    // buyer. (Unchanged Phase 3 behavior.)
    const unlocked = await tx.verificationRequest.update({
      where: { id: paymentOrder.verificationRequestId! },
      data: { status: 'REPORT_UNLOCKED' },
    })

    // Both legs are now captured and the report is delivered — the
    // professional's earning on both the advance and final payment moves to
    // AVAILABLE_FOR_PAYOUT (Phase 4B; see ledger.service.ts's comment on why
    // no open Claim can exist yet at this exact moment).
    await promoteEarningsOnUnlock(tx, paymentOrder.verificationRequestId!)

    return { stranded: false, request: unlocked }
  })

  if (stranded) {
    await refundStrandedPayment(paymentOrder, paymentOrder.verificationRequestId)
    const request = await prisma.verificationRequest.findUnique({
      where: { id: paymentOrder.verificationRequestId },
    })
    return { request, alreadyProcessed: false }
  }

  logger.info(
    `[payment] verification final payment received — request ${paymentOrder.verificationRequestId} ` +
      `(order ${paymentOrder.id}) — report unlocked`
  )
  return { request: settledRequest, alreadyProcessed: false }
}

async function notifySaleToSeller(sellerId: string, sellerCut: number): Promise<void> {
  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: { id: true, name: true, phone: true, email: true },
  })
  if (!seller) return

  await notifySeller(seller, {
    type: 'sale',
    title: 'Aapki report bik gayi! 🎉',
    body: `A buyer unlocked your report. Your share of ₹${sellerCut} will be added to your next settlement.`,
    email: {
      subject: 'Your CivilCheck report was purchased',
      text:
        `Hi ${seller.name},\n\nA buyer just unlocked one of your reports. ` +
        `Your share of ₹${sellerCut} will be included in your next weekly settlement.\n\n— Team CivilCheck`,
      html:
        `<p>Hi ${seller.name},</p><p>A buyer just unlocked one of your reports.</p>` +
        `<p>Your share of <strong>₹${sellerCut}</strong> will be included in your next weekly settlement.</p>` +
        `<p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: seller.name, status: 'report purchased' } },
  })
}
