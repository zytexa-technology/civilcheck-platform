import CryptoJS from 'crypto-js'
import type { CheckoutResult } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only stand-in for Razorpay Checkout, used only when the backend reports
// no live key configured (razorpayKeyId === null). MOCK_SECRET must match
// apps/api/src/lib/razorpay.ts's MOCK_SECRET — the fallback the backend signs
// and verifies against in that case. A signature produced here can only ever
// satisfy a mock order, never a real one.
//
// PaymentModal (src/components/PaymentModal.tsx) only ever reaches this path
// when razorpayKeyId is null; a real key always goes through the actual
// Razorpay Checkout.js widget (src/api/razorpay.ts).
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SECRET = 'razorpay_mock_secret_dev_only'

function generateMockPaymentId(): string {
  return `pay_mock_${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

function signMockPayment(orderId: string, paymentId: string): string {
  return CryptoJS.HmacSHA256(`${orderId}|${paymentId}`, MOCK_SECRET).toString(CryptoJS.enc.Hex)
}

export function mockCheckout(orderId: string): CheckoutResult {
  const paymentId = generateMockPaymentId()
  return {
    orderId,
    paymentId,
    signature: signMockPayment(orderId, paymentId),
  }
}
