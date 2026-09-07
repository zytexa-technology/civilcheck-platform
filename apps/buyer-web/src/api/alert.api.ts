import client from './client'
import type {
  AlertHistoryResponse,
  ApiEnvelope,
  MyAlertsResponse,
  SubscribeAlertResponse,
} from '../types/api'

/** GET /api/alerts — properties this buyer is actively watching. */
export async function getMyAlerts(): Promise<MyAlertsResponse> {
  const { data } = await client.get<MyAlertsResponse>('/alerts')
  return data
}

/** GET /api/alerts/history — every watch ever created, active or cancelled. */
export async function getAlertHistory(): Promise<AlertHistoryResponse> {
  const { data } = await client.get<AlertHistoryResponse>('/alerts/history')
  return data
}

/** POST /api/alerts/subscribe — start watching a property. */
export async function subscribeAlert(listingId: string): Promise<SubscribeAlertResponse> {
  const { data } = await client.post<SubscribeAlertResponse>('/alerts/subscribe', { listingId })
  return data
}

/** DELETE /api/alerts/:id — soft-cancels the watch. */
export async function cancelAlert(alertId: string): Promise<ApiEnvelope> {
  const { data } = await client.delete<ApiEnvelope>(`/alerts/${alertId}`)
  return data
}
