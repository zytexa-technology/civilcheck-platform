import type { CheckoutOrder, CheckoutResult } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Real Razorpay Checkout.js integration for the web.
//
// apps/buyer (the mobile reference app) never wired this up — it only has a
// dev-only HMAC mock (mockPayment.ts) and refuses to "pay" whenever the API
// reports a live razorpayKeyId, showing "contact support" instead. That gap
// is exactly what this file fills for buyer-web: PaymentModal calls
// openRazorpayCheckout() whenever the order response carries a real
// razorpayKeyId, and falls back to mockCheckout() only when it is null (the
// same signal apps/buyer already uses to detect "backend is in mock mode").
//
// No secret ever lives here — only the publishable key id the backend hands
// back per-order, which is safe to expose client-side by design (that's the
// whole point of a Checkout key id vs. a key secret).
// ─────────────────────────────────────────────────────────────────────────────

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

interface RazorpaySuccessResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', handler: (response: { error: { description: string } }) => void): void
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description?: string
  order_id: string
  prefill?: { name?: string; email?: string; contact?: string }
  theme?: { color?: string }
  modal?: { ondismiss?: () => void }
  handler: (response: RazorpaySuccessResponse) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

let scriptPromise: Promise<void> | null = null

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CHECKOUT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Could not load the Razorpay checkout script. Check your connection and try again.'))
    }
    document.body.appendChild(script)
  })

  return scriptPromise
}

export interface RazorpayCheckoutInput {
  order: CheckoutOrder
  keyId: string
  name?: string
  description?: string
  prefill?: { name?: string; email?: string; contact?: string }
}

/** Opens the real Razorpay Checkout widget. Resolves on success, rejects on failure/dismiss. */
export async function openRazorpayCheckout(input: RazorpayCheckoutInput): Promise<CheckoutResult> {
  await loadCheckoutScript()

  const RazorpayCtor = window.Razorpay
  if (!RazorpayCtor) {
    throw new Error('Razorpay checkout is unavailable right now. Please try again shortly.')
  }

  return new Promise<CheckoutResult>((resolve, reject) => {
    const instance = new RazorpayCtor({
      key: input.keyId,
      amount: input.order.amount,
      currency: input.order.currency,
      name: 'CivilCheck',
      description: input.description ?? input.name ?? 'CivilCheck payment',
      order_id: input.order.id,
      prefill: input.prefill,
      theme: { color: '#f0a500' },
      modal: {
        ondismiss: () => reject(new Error('Payment window closed before completing.')),
      },
      handler: (response) => {
        resolve({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        })
      },
    })

    instance.on('payment.failed', (response) => {
      reject(new Error(response.error?.description || 'Payment failed. Please try again.'))
    })

    instance.open()
  })
}
