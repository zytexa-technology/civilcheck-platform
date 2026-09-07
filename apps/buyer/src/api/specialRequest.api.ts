import client from './client'
import type {
  CheckoutResult,
  CreateSpecialRequestResponse,
  MySpecialRequestsResponse,
  RetrySpecialRequestResponse,
  SpecialRequestCreateInput,
  SpecialRequestDetailResponse,
  VerifySpecialRequestResponse,
} from '../types/api'

/**
 * POST /api/special-requests — ask an expert to research a property that isn't
 * in the database yet.
 *
 * Writes the request row (PENDING, advancePaid: false) *and* mints a Razorpay
 * order in one call. The request is not actionable until the advance is
 * verified — an admin cannot assign a seller to an unpaid request.
 *
 * `advanceAmount` must be between 999 and 4999 (specialRequestCreateSchema),
 * and `questions` at least 10 characters.
 */
export async function createSpecialRequest(
  input: SpecialRequestCreateInput,
): Promise<CreateSpecialRequestResponse> {
  const { data } = await client.post<CreateSpecialRequestResponse>('/special-requests', input)
  return data
}

/**
 * POST /api/special-requests/:id/verify — confirm the advance payment.
 *
 * Same snake_case body as the report-unlock verify, for the same reason: it
 * mirrors what Razorpay Checkout hands back for any order.
 */
export async function verifySpecialRequestAdvance(
  requestId: string,
  result: CheckoutResult,
): Promise<VerifySpecialRequestResponse> {
  const { data } = await client.post<VerifySpecialRequestResponse>(
    `/special-requests/${requestId}/verify`,
    {
      razorpay_order_id: result.orderId,
      razorpay_payment_id: result.paymentId,
      razorpay_signature: result.signature,
    },
  )
  return data
}

/**
 * POST /api/special-requests/:id/retry — mint a fresh order for a request left
 * PENDING and unpaid, whether the first order failed to create or the buyer
 * simply abandoned checkout. Rejects with 400 once the advance is paid.
 */
export async function retrySpecialRequestPayment(
  requestId: string,
): Promise<RetrySpecialRequestResponse> {
  const { data } = await client.post<RetrySpecialRequestResponse>(
    `/special-requests/${requestId}/retry`,
  )
  return data
}

/** GET /api/special-requests — this buyer's requests, newest first. */
export async function getMySpecialRequests(): Promise<MySpecialRequestsResponse> {
  const { data } = await client.get<MySpecialRequestsResponse>('/special-requests')
  return data
}

/** GET /api/special-requests/:id — the full row, including questions/documents. */
export async function getSpecialRequestById(
  requestId: string,
): Promise<SpecialRequestDetailResponse> {
  const { data } = await client.get<SpecialRequestDetailResponse>(
    `/special-requests/${requestId}`,
  )
  return data
}
