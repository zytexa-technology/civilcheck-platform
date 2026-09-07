import client from './client'
import type {
  CheckoutResult,
  CreatePurchaseResponse,
  MyPurchasesResponse,
  ReportFlagResponse,
  ReviewResponse,
  VerifyPurchaseResponse,
} from '../types/api'

/**
 * POST /api/purchases — starts a report unlock.
 *
 * Creates a Razorpay order only; no Purchase row exists until the payment is
 * confirmed. If this buyer already owns the report the API says so instead of
 * minting a second order, so callers must check `alreadyPurchased` first.
 */
export async function unlockReport(listingId: string): Promise<CreatePurchaseResponse> {
  const { data } = await client.post<CreatePurchaseResponse>('/purchases', { listingId })
  return data
}

/**
 * POST /api/purchases/verify — confirms the checkout handshake and unlocks.
 *
 * Required after unlockReport(): the order on its own grants nothing. The body
 * uses Razorpay's snake_case field names because that is exactly what the
 * Checkout SDK emits and what purchaseVerifySchema validates.
 */
export async function verifyPurchase(result: CheckoutResult): Promise<VerifyPurchaseResponse> {
  const { data } = await client.post<VerifyPurchaseResponse>('/purchases/verify', {
    razorpay_order_id: result.orderId,
    razorpay_payment_id: result.paymentId,
    razorpay_signature: result.signature,
  })
  return data
}

/** GET /api/purchases — every report this buyer has unlocked, newest first. */
export async function getMyPurchases(): Promise<MyPurchasesResponse> {
  const { data } = await client.get<MyPurchasesResponse>('/purchases')
  return data
}

/**
 * POST /api/purchases/:id/flag — "this report looks outdated".
 *
 * `reason` must be at least 10 characters (reportFlagCreateSchema) — validate
 * in the form before calling so the buyer gets a field error, not an alert.
 */
export async function flagReport(
  purchaseId: string,
  reason: string,
): Promise<ReportFlagResponse> {
  const { data } = await client.post<ReportFlagResponse>(`/purchases/${purchaseId}/flag`, {
    reason,
  })
  return data
}

/**
 * POST /api/purchases/:id/review — one review per purchase.
 *
 * A second attempt returns 400 ("You have already reviewed this purchase"),
 * which is the only way the client can discover an existing review: there is
 * no endpoint that reads a buyer's own reviews back.
 */
export async function reviewPurchase(
  purchaseId: string,
  input: { rating: number; comment?: string },
): Promise<ReviewResponse> {
  const { data } = await client.post<ReviewResponse>(`/purchases/${purchaseId}/review`, input)
  return data
}

/** Paths for the two authenticated PDF streams. See lib/pdf.ts for fetching. */
export function certificatePath(purchaseId: string): string {
  return `/purchases/${purchaseId}/certificate`
}

export function invoicePath(purchaseId: string): string {
  return `/purchases/${purchaseId}/invoice`
}
