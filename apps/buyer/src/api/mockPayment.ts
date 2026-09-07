import CryptoJS from 'crypto-js'
import type { CheckoutResult } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only stand-in for Razorpay Checkout.
//
// MOCK_SECRET must match apps/api/src/lib/razorpay.ts's MOCK_SECRET — the
// fallback the backend signs and verifies against when no real Razorpay keys
// are configured. A real deploy verifies against the actual key secret, which
// this client never holds, so a signature produced here can only ever satisfy a
// mock order. That is the intended safety property: this cannot be used to
// forge a real payment.
//
// The UI must refuse to "pay" whenever the API reports a live key id — see
// PaymentSheet. Silently mock-paying against a real key would tell a buyer
// their report was purchased when no money moved.
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SECRET = 'razorpay_mock_secret_dev_only'

function generateMockPaymentId(): string {
  return `pay_mock_${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

function signMockPayment(orderId: string, paymentId: string): string {
  return CryptoJS.HmacSHA256(`${orderId}|${paymentId}`, MOCK_SECRET).toString(CryptoJS.enc.Hex)
}

/**
 * Produce the same triple a real Checkout success callback would hand back,
 * signed so the backend's mock verifier accepts it.
 */
export function mockCheckout(orderId: string): CheckoutResult {
  const paymentId = generateMockPaymentId()
  return {
    orderId,
    paymentId,
    signature: signMockPayment(orderId, paymentId),
  }
}
