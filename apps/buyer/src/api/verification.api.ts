import client from './client'
import type {
  AcceptQuoteResponse,
  CreateClaimResponse,
  CreateVerificationRequestResponse,
  MyClaimsResponse,
  MyVerificationRequestsResponse,
  SendVerificationMessageResponse,
  VerificationCancelResponse,
  VerificationMarketplaceConfigResponse,
  VerificationMessagesResponse,
  VerificationOrderResponse,
  VerificationQuotesResponse,
  VerificationReportResponse,
  VerificationRequestDetailResponse,
  VerificationVerifyResponse,
  CheckoutResult,
} from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Property Verification Marketplace (Phase 3 backend) — buyer side.
// Same order → PaymentSheet → verify handshake as purchase.api.ts /
// specialRequest.api.ts, just against the verification-requests endpoints.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/verification-requests/config — public, no auth. The ONE place
 * the minimum verification fee is read from; never hardcode ₹10,000
 * anywhere else in this app.
 */
export async function getVerificationConfig(): Promise<VerificationMarketplaceConfigResponse> {
  const { data } = await client.get<VerificationMarketplaceConfigResponse>('/verification-requests/config')
  return data
}

export async function createVerificationRequest(input: {
  source: 'LISTING' | 'PROPERTY' | 'DISCOVERY'
  listingId?: string
  propertyId?: string
  /** The buyer's own initial offer/budget — never a payment; nothing is charged here. */
  initialOfferAmount: number
  // Property Discovery flow — only meaningful when source is DISCOVERY; the
  // backend rejects them if listingId/propertyId is also set.
  desiredAddress?: string
  desiredCity?: string
  desiredTehsil?: string
  desiredPropertyType?: string
  desiredKhasraOrSurvey?: string
}): Promise<CreateVerificationRequestResponse> {
  const { data } = await client.post<CreateVerificationRequestResponse>('/verification-requests', input)
  return data
}

export async function getMyVerificationRequests(): Promise<MyVerificationRequestsResponse> {
  const { data } = await client.get<MyVerificationRequestsResponse>('/verification-requests')
  return data
}

export async function getVerificationRequestById(id: string): Promise<VerificationRequestDetailResponse> {
  const { data } = await client.get<VerificationRequestDetailResponse>(`/verification-requests/${id}`)
  return data
}

/** GET /api/verification-requests/:id/quotes — the comparison list, cheapest first. */
export async function getVerificationQuotes(id: string): Promise<VerificationQuotesResponse> {
  const { data } = await client.get<VerificationQuotesResponse>(`/verification-requests/${id}/quotes`)
  return data
}

/**
 * POST /api/verification-requests/:id/quotes/:quoteId/accept — the buyer's
 * choice. The backend atomically locks the request to this quote server-side
 * (first accept call wins); a losing concurrent accept gets a 409.
 */
export async function acceptVerificationQuote(id: string, quoteId: string): Promise<AcceptQuoteResponse> {
  const { data } = await client.post<AcceptQuoteResponse>(`/verification-requests/${id}/quotes/${quoteId}/accept`)
  return data
}

export async function createAdvanceOrder(id: string): Promise<VerificationOrderResponse> {
  const { data } = await client.post<VerificationOrderResponse>(`/verification-requests/${id}/advance-order`)
  return data
}

export async function verifyAdvancePayment(
  id: string,
  result: CheckoutResult
): Promise<VerificationVerifyResponse> {
  const { data } = await client.post<VerificationVerifyResponse>(`/verification-requests/${id}/advance-verify`, {
    razorpay_order_id: result.orderId,
    razorpay_payment_id: result.paymentId,
    razorpay_signature: result.signature,
  })
  return data
}

export async function createFinalOrder(id: string): Promise<VerificationOrderResponse> {
  const { data } = await client.post<VerificationOrderResponse>(`/verification-requests/${id}/final-order`)
  return data
}

export async function verifyFinalPayment(
  id: string,
  result: CheckoutResult
): Promise<VerificationVerifyResponse> {
  const { data } = await client.post<VerificationVerifyResponse>(`/verification-requests/${id}/final-verify`, {
    razorpay_order_id: result.orderId,
    razorpay_payment_id: result.paymentId,
    razorpay_signature: result.signature,
  })
  return data
}

export async function getVerificationReport(id: string): Promise<VerificationReportResponse> {
  const { data } = await client.get<VerificationReportResponse>(`/verification-requests/${id}/report`)
  return data
}

/**
 * POST /api/verification-requests/:id/cancel
 *
 * The backend computes the cancellation fee and refund amount — this call
 * only submits the reason; never calculate the final refund on the client.
 */
export async function cancelVerificationRequest(
  id: string,
  reason: string
): Promise<VerificationCancelResponse> {
  const { data } = await client.post<VerificationCancelResponse>(`/verification-requests/${id}/cancel`, { reason })
  return data
}

export async function createClaim(
  id: string,
  input: { reason: string; description: string; evidence: string[] }
): Promise<CreateClaimResponse> {
  const { data } = await client.post<CreateClaimResponse>(`/verification-requests/${id}/claims`, input)
  return data
}

export async function getMyClaims(id: string): Promise<MyClaimsResponse> {
  const { data } = await client.get<MyClaimsResponse>(`/verification-requests/${id}/claims`)
  return data
}

// Buyer<->assigned-professional conversation — the minimum capability
// described in the brief. Only opens once a professional is assigned; the
// backend enforces that, not this client.
export async function getVerificationMessages(id: string): Promise<VerificationMessagesResponse> {
  const { data } = await client.get<VerificationMessagesResponse>(`/verification-requests/${id}/messages`)
  return data
}

export async function sendVerificationMessage(
  id: string,
  body: string
): Promise<SendVerificationMessageResponse> {
  const { data } = await client.post<SendVerificationMessageResponse>(`/verification-requests/${id}/messages`, {
    body,
  })
  return data
}
