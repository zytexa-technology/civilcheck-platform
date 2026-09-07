import client from './client'
import type {
  ApiEnvelope,
  CreateSubscriptionResponse,
  MySubscriptionsResponse,
} from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// The buyer's ₹49/mo case-update alert subscription.
//
// Unlike a report unlock, this is a Razorpay *subscription*, not an order — it
// has no order id and therefore cannot be completed by the mock-signature path
// the rest of the app uses. createAlertSubscription() records the row as
// CREATED and it only becomes ACTIVE when Razorpay sends the authorization
// webhook. Until that happens the UI must show it as pending, never as live.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/subscriptions/alerts
 *
 * Rejects with 409 when a CREATED or ACTIVE subscription already exists, so
 * check the current list before offering this.
 */
export async function subscribeToAlerts(): Promise<CreateSubscriptionResponse> {
  const { data } = await client.post<CreateSubscriptionResponse>('/subscriptions/alerts')
  return data
}

/** GET /api/subscriptions — every subscription this buyer has had. */
export async function getMySubscriptions(): Promise<MySubscriptionsResponse> {
  const { data } = await client.get<MySubscriptionsResponse>('/subscriptions')
  return data
}

/** POST /api/subscriptions/:id/cancel */
export async function cancelSubscription(subscriptionId: string): Promise<ApiEnvelope> {
  const { data } = await client.post<ApiEnvelope>(`/subscriptions/${subscriptionId}/cancel`)
  return data
}
