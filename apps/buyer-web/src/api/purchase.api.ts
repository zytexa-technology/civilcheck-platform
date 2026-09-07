import client from './client'
import type {
  CheckoutResult,
  CreatePurchaseResponse,
  MyPurchasesResponse,
  ReportFlagResponse,
  ReviewResponse,
  VerifyPurchaseResponse,
} from '../types/api'

/** POST /api/purchases — starts a report unlock (mints a Razorpay order only). */
export async function unlockReport(listingId: string): Promise<CreatePurchaseResponse> {
  const { data } = await client.post<CreatePurchaseResponse>('/purchases', { listingId })
  return data
}

/**
 * POST /api/purchases/verify — confirms the checkout handshake and unlocks.
 * Snake_case body because that is exactly what Razorpay Checkout emits and
 * what purchaseVerifySchema validates.
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

/** POST /api/purchases/:id/flag — "this report looks outdated". */
export async function flagReport(purchaseId: string, reason: string): Promise<ReportFlagResponse> {
  const { data } = await client.post<ReportFlagResponse>(`/purchases/${purchaseId}/flag`, { reason })
  return data
}

/** POST /api/purchases/:id/review — one review per purchase. */
export async function reviewPurchase(
  purchaseId: string,
  input: { rating: number; comment?: string },
): Promise<ReviewResponse> {
  const { data } = await client.post<ReviewResponse>(`/purchases/${purchaseId}/review`, input)
  return data
}

export function certificatePath(purchaseId: string): string {
  return `/purchases/${purchaseId}/certificate`
}

export function invoicePath(purchaseId: string): string {
  return `/purchases/${purchaseId}/invoice`
}
