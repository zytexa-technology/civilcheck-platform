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
 * POST /api/special-requests — ask an expert to research a property that
 * isn't in the database yet. Writes the request row AND mints a Razorpay
 * order in one call; `advanceAmount` must be 999-4999, `questions` >= 10 chars.
 */
export async function createSpecialRequest(
  input: SpecialRequestCreateInput,
): Promise<CreateSpecialRequestResponse> {
  const { data } = await client.post<CreateSpecialRequestResponse>('/special-requests', input)
  return data
}

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

/** Mint a fresh order for a request left PENDING and unpaid. */
export async function retrySpecialRequestPayment(
  requestId: string,
): Promise<RetrySpecialRequestResponse> {
  const { data } = await client.post<RetrySpecialRequestResponse>(
    `/special-requests/${requestId}/retry`,
  )
  return data
}

export async function getMySpecialRequests(): Promise<MySpecialRequestsResponse> {
  const { data } = await client.get<MySpecialRequestsResponse>('/special-requests')
  return data
}

export async function getSpecialRequestById(requestId: string): Promise<SpecialRequestDetailResponse> {
  const { data } = await client.get<SpecialRequestDetailResponse>(`/special-requests/${requestId}`)
  return data
}
