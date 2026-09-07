import client from './client'
import type { ApiEnvelope, CreateSubscriptionResponse, MySubscriptionsResponse } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// The buyer's ₹49/mo case-update alert subscription. Unlike a report unlock
// this is a Razorpay *subscription*, not an order — it only becomes ACTIVE
// once Razorpay's authorization webhook lands, so the UI must never present a
// freshly-created (CREATED) subscription as live.
// ─────────────────────────────────────────────────────────────────────────────

export async function subscribeToAlerts(): Promise<CreateSubscriptionResponse> {
  const { data } = await client.post<CreateSubscriptionResponse>('/subscriptions/alerts')
  return data
}

export async function getMySubscriptions(): Promise<MySubscriptionsResponse> {
  const { data } = await client.get<MySubscriptionsResponse>('/subscriptions')
  return data
}

export async function cancelSubscription(subscriptionId: string): Promise<ApiEnvelope> {
  const { data } = await client.post<ApiEnvelope>(`/subscriptions/${subscriptionId}/cancel`)
  return data
}
