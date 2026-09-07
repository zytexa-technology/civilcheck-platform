// ─────────────────────────────────────────────────────────────────────────────
// Razorpay adapter — orders + signature verification, pluggable mock mode.
//
// Same shape as the notification adapter: credentials are read PER CALL, never
// at module load. Dropping RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
// RAZORPAY_WEBHOOK_SECRET into .env therefore needs a process restart and
// nothing else — no code change, no flag to flip, no mock to delete later.
//
//   keys present → real HTTP against the Razorpay REST API
//   keys absent  → realistic mock orders (order_mock_…) and dev-secret
//                  signatures, so the whole checkout + webhook flow runs
//                  end-to-end without a Razorpay account
//
// Two deliberate differences from the notification adapter:
//
//   1. createOrder() THROWS on failure. A notification is fire-and-forget after
//      the transaction commits; an order sits on the request's critical path,
//      so a silent failure would let a Purchase row be written while no money
//      moved. Callers catch RazorpayError and surface it.
//   2. Production without keys is a hard error, not a fallback. In production
//      createOrder() and every signature check refuse rather than trust the
//      mock path — a misconfigured deploy must fail loudly, not silently mint
//      mock orders. (Same precedent as firebase.ts refusing mock auth in prod.)
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import logger from './logger.js'

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1'

// Bounds the buyer's wait: order creation is inline in the checkout request.
const PROVIDER_TIMEOUT_MS = 10_000

// Dev-only secret used to sign and verify test payloads when no real secret is
// configured. It lets signWebhookPayload() and verifyWebhookSignature() agree
// end-to-end in local dev — and it is NEVER used in production (see the
// resolve* helpers, which return null there instead).
const MOCK_SECRET = 'razorpay_mock_secret_dev_only'

// Razorpay ids look like `order_ABC123…`; a hex suffix reads realistically and
// the `_mock` marker makes it obvious in logs and the database that no real
// payment sits behind this row.
function mockId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('hex')}`
}

function readKeys(): {
  keyId: string | undefined
  keySecret: string | undefined
  webhookSecret: string | undefined
} {
  return {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  }
}

// True when live order creation is possible (key id + secret both present).
export function isRazorpayConfigured(): boolean {
  const { keyId, keySecret } = readKeys()
  return Boolean(keyId && keySecret)
}

// The publishable key id the browser SDK needs to open Checkout. Safe to expose
// (it is the public half of the pair); null in mock mode, where the frontend
// runs its own mock checkout instead of loading Razorpay.
export function getRazorpayKeyId(): string | null {
  return readKeys().keyId ?? null
}

// Thrown for anything that must abort the request: a rejected order, a network
// failure, or a production misconfiguration. `status` is the HTTP code the
// controller should return.
export class RazorpayError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'RazorpayError'
    this.status = status
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS — POST /v1/orders (https://razorpay.com/docs/api/orders/create/)
// ─────────────────────────────────────────────────────────────────────────────
export interface RazorpayOrderInput {
  amount: number // integer, in paise (₹1 = 100)
  currency?: string // default INR
  receipt?: string // your reference, ≤ 40 chars
  notes?: Record<string, string>
}

export interface RazorpayOrder {
  id: string
  entity: 'order'
  amount: number
  amount_paid: number
  amount_due: number
  currency: string
  receipt: string | null
  status: string // 'created' on a fresh order
  attempts: number
  notes: Record<string, string>
  created_at: number // unix seconds
}

export async function createOrder(input: RazorpayOrderInput): Promise<RazorpayOrder> {
  const amount = Math.round(input.amount)
  // Razorpay works in integer paise; a rupee float or a non-positive amount is
  // a caller bug, caught here rather than as an opaque provider rejection.
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RazorpayError('Order amount must be a positive integer in paise', 400)
  }
  const currency = input.currency ?? 'INR'
  const { keyId, keySecret } = readKeys()

  // ── Real mode ──────────────────────────────────────────────────────────────
  if (keyId && keySecret) {
    try {
      const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          currency,
          ...(input.receipt ? { receipt: input.receipt } : {}),
          notes: input.notes ?? {},
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      })

      const payload = (await response.json().catch(() => null)) as
        | (RazorpayOrder & { error?: { description?: string } })
        | null

      if (!response.ok || !payload?.id) {
        const error = payload?.error?.description || `HTTP ${response.status}`
        logger.error(`[razorpay] order creation rejected: ${error}`)
        throw new RazorpayError(`Razorpay rejected the order: ${error}`, 502)
      }

      logger.info(`[razorpay] order created ${payload.id} (${amount} ${currency})`)
      return payload
    } catch (err) {
      if (err instanceof RazorpayError) throw err
      const error = err instanceof Error ? err.message : String(err)
      logger.error(`[razorpay] order call failed: ${error}`)
      throw new RazorpayError(`Razorpay order call failed: ${error}`, 502)
    }
  }

  // ── No keys ──────────────────────────────────────────────────────────────
  // A production deploy without credentials must NOT mint a mock order — that
  // would write a Purchase row while no money ever moved. Fail loudly.
  if (process.env.NODE_ENV === 'production') {
    logger.error('[razorpay] createOrder called in production without RAZORPAY_KEY_ID/SECRET')
    throw new RazorpayError('Missing credentials in production', 500)
  }

  // ── Mock mode ────────────────────────────────────────────────────────────
  const order: RazorpayOrder = {
    id: mockId('order_mock'),
    entity: 'order',
    amount,
    amount_paid: 0,
    amount_due: amount,
    currency,
    receipt: input.receipt ?? null,
    status: 'created',
    attempts: 0,
    notes: input.notes ?? {},
    created_at: Math.floor(Date.now() / 1000),
  }
  logger.info(`[razorpay:mock] order created ${order.id} (${amount} ${currency})`)
  return order
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTIONS — POST /v1/subscriptions (PDF 7.7 / 3.3)
// (https://razorpay.com/docs/api/payments/subscriptions/)
//
// The plan (₹49 / ₹499) is created once in the Razorpay dashboard; here we only
// create a subscription against a plan id and hand the subscription id back to
// the client to authorize via Checkout. Same mock/prod policy as createOrder.
// ─────────────────────────────────────────────────────────────────────────────
export interface RazorpaySubscriptionInput {
  planId: string
  totalCount?: number // billing cycles; default 12 (a year of monthly)
  notes?: Record<string, string>
}

export interface RazorpaySubscription {
  id: string
  entity: 'subscription'
  plan_id: string
  status: string // 'created' on a fresh subscription
  total_count: number
  notes: Record<string, string>
  short_url: string | null
  created_at: number
}

export async function createSubscription(
  input: RazorpaySubscriptionInput
): Promise<RazorpaySubscription> {
  const totalCount = input.totalCount ?? 12
  const { keyId, keySecret } = readKeys()

  // ── Real mode ──────────────────────────────────────────────────────────────
  if (keyId && keySecret) {
    try {
      const response = await fetch(`${RAZORPAY_API_BASE}/subscriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: input.planId,
          total_count: totalCount,
          customer_notify: 1,
          notes: input.notes ?? {},
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      })

      const payload = (await response.json().catch(() => null)) as
        | (RazorpaySubscription & { error?: { description?: string } })
        | null

      if (!response.ok || !payload?.id) {
        const error = payload?.error?.description || `HTTP ${response.status}`
        logger.error(`[razorpay] subscription creation rejected: ${error}`)
        throw new RazorpayError(`Razorpay rejected the subscription: ${error}`, 502)
      }

      logger.info(`[razorpay] subscription created ${payload.id} (plan ${input.planId})`)
      return payload
    } catch (err) {
      if (err instanceof RazorpayError) throw err
      const error = err instanceof Error ? err.message : String(err)
      logger.error(`[razorpay] subscription call failed: ${error}`)
      throw new RazorpayError(`Razorpay subscription call failed: ${error}`, 502)
    }
  }

  // ── No keys ──────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    logger.error('[razorpay] createSubscription called in production without keys')
    throw new RazorpayError('Missing credentials in production', 500)
  }

  // ── Mock mode ────────────────────────────────────────────────────────────
  const sub: RazorpaySubscription = {
    id: mockId('sub_mock'),
    entity: 'subscription',
    plan_id: input.planId,
    status: 'created',
    total_count: totalCount,
    notes: input.notes ?? {},
    short_url: null,
    created_at: Math.floor(Date.now() / 1000),
  }
  logger.info(`[razorpay:mock] subscription created ${sub.id} (plan ${input.planId})`)
  return sub
}

// Cancel immediately (cancel_at_cycle_end: 0). Razorpay also emits a
// subscription.cancelled webhook, which the handler treats idempotently.
export async function cancelSubscription(
  subscriptionId: string
): Promise<{ id: string; status: string }> {
  const { keyId, keySecret } = readKeys()

  if (keyId && keySecret) {
    try {
      const response = await fetch(
        `${RAZORPAY_API_BASE}/subscriptions/${subscriptionId}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cancel_at_cycle_end: 0 }),
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        }
      )

      const payload = (await response.json().catch(() => null)) as
        | { id?: string; status?: string; error?: { description?: string } }
        | null

      if (!response.ok || !payload?.id) {
        const error = payload?.error?.description || `HTTP ${response.status}`
        logger.error(`[razorpay] subscription cancel rejected: ${error}`)
        throw new RazorpayError(`Razorpay rejected the cancellation: ${error}`, 502)
      }
      return { id: payload.id, status: payload.status ?? 'cancelled' }
    } catch (err) {
      if (err instanceof RazorpayError) throw err
      const error = err instanceof Error ? err.message : String(err)
      logger.error(`[razorpay] subscription cancel call failed: ${error}`)
      throw new RazorpayError(`Razorpay cancel call failed: ${error}`, 502)
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new RazorpayError('Missing credentials in production', 500)
  }

  logger.info(`[razorpay:mock] subscription cancelled ${subscriptionId}`)
  return { id: subscriptionId, status: 'cancelled' }
}

// ─────────────────────────────────────────────────────────────────────────────
// REFUNDS — POST /v1/payments/:id/refund
// (https://razorpay.com/docs/api/refunds/create/)
//
// Same mock/real/prod-guard shape as createOrder(). A refund reverses money
// that already moved, so — like createOrder — it throws on failure rather
// than degrading silently, and it refuses to mock in production.
// ─────────────────────────────────────────────────────────────────────────────
export interface RazorpayRefundInput {
  paymentId: string // razorpay_payment_id (pay_…), NOT the order id
  amount: number // integer, in paise — partial refund if less than the payment
  notes?: Record<string, string>
}

export interface RazorpayRefund {
  id: string
  entity: 'refund'
  amount: number
  currency: string
  payment_id: string
  status: string // 'processed' | 'pending' | 'failed'
  notes: Record<string, string>
  created_at: number
}

export async function refundPayment(input: RazorpayRefundInput): Promise<RazorpayRefund> {
  const amount = Math.round(input.amount)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RazorpayError('Refund amount must be a positive integer in paise', 400)
  }
  const { keyId, keySecret } = readKeys()

  // ── Real mode ──────────────────────────────────────────────────────────────
  if (keyId && keySecret) {
    try {
      const response = await fetch(`${RAZORPAY_API_BASE}/payments/${input.paymentId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          notes: input.notes ?? {},
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      })

      const payload = (await response.json().catch(() => null)) as
        | (RazorpayRefund & { error?: { description?: string } })
        | null

      if (!response.ok || !payload?.id) {
        const error = payload?.error?.description || `HTTP ${response.status}`
        logger.error(`[razorpay] refund rejected for payment ${input.paymentId}: ${error}`)
        throw new RazorpayError(`Razorpay rejected the refund: ${error}`, 502)
      }

      logger.info(`[razorpay] refund ${payload.id} issued for payment ${input.paymentId} (${amount})`)
      return payload
    } catch (err) {
      if (err instanceof RazorpayError) throw err
      const error = err instanceof Error ? err.message : String(err)
      logger.error(`[razorpay] refund call failed: ${error}`)
      throw new RazorpayError(`Razorpay refund call failed: ${error}`, 502)
    }
  }

  // ── No keys ──────────────────────────────────────────────────────────────
  // A production deploy without credentials must NOT mock-succeed a refund —
  // the buyer would be told their money is coming back when it never moved.
  if (process.env.NODE_ENV === 'production') {
    logger.error('[razorpay] refundPayment called in production without RAZORPAY_KEY_ID/SECRET')
    throw new RazorpayError('Missing credentials in production', 500)
  }

  // ── Mock mode ────────────────────────────────────────────────────────────
  const refund: RazorpayRefund = {
    id: mockId('rfnd_mock'),
    entity: 'refund',
    amount,
    currency: 'INR',
    payment_id: input.paymentId,
    status: 'processed',
    notes: input.notes ?? {},
    created_at: Math.floor(Date.now() / 1000),
  }
  logger.info(`[razorpay:mock] refund issued ${refund.id} for payment ${input.paymentId} (${amount})`)
  return refund
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH PAYMENT — GET /v1/payments/:id (https://razorpay.com/docs/api/payments/fetch-a-payment/)
//
// Used only by reconciliation.service.ts (Phase 4B) to compare our internal
// PaymentOrder record against what Razorpay actually has on file. Returns
// null rather than throwing on a not-found/misconfigured lookup — a missing
// remote payment is itself a reconciliation finding, not an application
// error, and the caller decides what a null means in context.
// ─────────────────────────────────────────────────────────────────────────────
export interface RazorpayPaymentEntityFull {
  id: string
  amount: number
  currency: string
  status: string // 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  order_id: string | null
  fee: number | null // paise — only present on fee-bearing accounts
  tax: number | null
  captured: boolean
}

export async function fetchPayment(paymentId: string): Promise<RazorpayPaymentEntityFull | null> {
  const { keyId, keySecret } = readKeys()
  if (!keyId || !keySecret) {
    logger.warn('[razorpay] fetchPayment called without credentials — cannot reconcile against Razorpay')
    return null
  }

  try {
    const response = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
    if (response.status === 404) return null
    if (!response.ok) {
      logger.error(`[razorpay] fetchPayment ${paymentId} failed: HTTP ${response.status}`)
      return null
    }
    return (await response.json()) as RazorpayPaymentEntityFull
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error(`[razorpay] fetchPayment ${paymentId} call failed: ${error}`)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATURE PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

// Constant-time compare of two hex digests. crypto.timingSafeEqual throws on a
// length mismatch, so guard that first — a differing length is already a
// non-match and reveals nothing useful. A signature that is not valid hex
// decodes to a different length and is rejected here.
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length === 0 || bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Real webhook secret when set; the dev secret otherwise so signing and
// verification agree in local dev. Returns null in production without a secret,
// so a forged event is rejected rather than trusted against the dev secret.
function resolveWebhookSecret(): string | null {
  const { webhookSecret } = readKeys()
  if (webhookSecret) return webhookSecret
  if (process.env.NODE_ENV === 'production') {
    logger.error('[razorpay] webhook signature op in production without RAZORPAY_WEBHOOK_SECRET')
    return null
  }
  return MOCK_SECRET
}

// Same policy for the checkout handshake, keyed on the API secret in real mode.
function resolvePaymentSecret(): string | null {
  const { keySecret } = readKeys()
  if (keySecret) return keySecret
  if (process.env.NODE_ENV === 'production') {
    logger.error('[razorpay] payment signature op in production without RAZORPAY_KEY_SECRET')
    return null
  }
  return MOCK_SECRET
}

// Webhook signature: HMAC-SHA256 of the RAW request body, keyed with the
// webhook secret, sent by Razorpay in the `X-Razorpay-Signature` header. The
// raw bytes matter — re-serialized JSON would not match — which is why the
// route is mounted with express.raw() ahead of express.json() (see index.ts).
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined
): boolean {
  if (!signature) return false
  const secret = resolveWebhookSecret()
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return timingSafeEqualHex(expected, signature)
}

// Checkout handshake: Razorpay Checkout returns razorpay_order_id,
// razorpay_payment_id and razorpay_signature after a successful payment. The
// signature is HMAC-SHA256(order_id + '|' + payment_id) keyed with the API
// secret. (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/build-integration/#16-verify-payment-signature)
export function verifyPaymentSignature(params: {
  orderId: string
  paymentId: string
  signature: string | undefined
}): boolean {
  const { orderId, paymentId, signature } = params
  if (!signature) return false
  const secret = resolvePaymentSecret()
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
  return timingSafeEqualHex(expected, signature)
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST / DEV HELPERS
//
// These let the webhook and checkout paths be exercised end-to-end without a
// Razorpay account: build a realistic signed payload and POST it at the server.
// They sign with whatever secret verify*() will check against (real if set,
// dev secret otherwise) and refuse to run in production without a real secret.
// ─────────────────────────────────────────────────────────────────────────────

// Produce the `X-Razorpay-Signature` value for a raw webhook body.
export function signWebhookPayload(rawBody: string | Buffer): string {
  const secret = resolveWebhookSecret()
  if (!secret) {
    throw new RazorpayError('Cannot sign a webhook payload in production without a secret', 500)
  }
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

// Produce a valid checkout `razorpay_signature` for a mock order/payment pair.
export function signMockPaymentResponse(orderId: string, paymentId: string): string {
  const secret = resolvePaymentSecret()
  if (!secret) {
    throw new RazorpayError('Cannot sign a payment response in production without a secret', 500)
  }
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
}

export interface MockWebhookEvent {
  // The exact bytes to POST (Content-Type: application/json) — sign covers these.
  rawBody: string
  // Drop into the `X-Razorpay-Signature` header.
  signature: string
  // The parsed event, handy for assertions.
  event: Record<string, unknown>
}

// Build a realistic Razorpay event envelope (default: payment.captured) with
// mock payment/order ids, already signed. Feed rawBody + signature straight to
// the webhook route to drive the whole verification → handler path.
export function buildMockWebhookEvent(
  eventType: string,
  payment: { orderId?: string; amount: number; currency?: string; notes?: Record<string, string> }
): MockWebhookEvent {
  const event = {
    entity: 'event',
    event: eventType,
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          id: mockId('pay_mock'),
          entity: 'payment',
          amount: Math.round(payment.amount),
          currency: payment.currency ?? 'INR',
          status: 'captured',
          order_id: payment.orderId ?? mockId('order_mock'),
          method: 'upi',
          captured: true,
          notes: payment.notes ?? {},
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  }
  const rawBody = JSON.stringify(event)
  return { rawBody, signature: signWebhookPayload(rawBody), event }
}

// Build a realistic Razorpay subscription event envelope, already signed. Feed
// rawBody + signature straight to the webhook route to drive the subscription
// lifecycle (activated / charged / cancelled / halted) without a Razorpay account.
export function buildMockSubscriptionEvent(
  eventType: string,
  sub: { subscriptionId: string; status?: string; currentEnd?: number; notes?: Record<string, string> }
): MockWebhookEvent {
  const now = Math.floor(Date.now() / 1000)
  const event = {
    entity: 'event',
    event: eventType,
    contains: ['subscription'],
    payload: {
      subscription: {
        entity: {
          id: sub.subscriptionId,
          entity: 'subscription',
          status: sub.status ?? 'active',
          current_start: now,
          current_end: sub.currentEnd ?? now + 30 * 24 * 3600,
          notes: sub.notes ?? {},
        },
      },
    },
    created_at: now,
  }
  const rawBody = JSON.stringify(event)
  return { rawBody, signature: signWebhookPayload(rawBody), event }
}
