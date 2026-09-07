import client from './client'
import type {
  AlertHistoryResponse,
  ApiEnvelope,
  MyAlertsResponse,
  PushPreferenceResponse,
  SubscribeAlertResponse,
} from '../types/api'

/** GET /api/alerts — properties this buyer is actively watching. */
export async function getMyAlerts(): Promise<MyAlertsResponse> {
  const { data } = await client.get<MyAlertsResponse>('/alerts')
  return data
}

/**
 * GET /api/alerts/history — every watch ever created, active or cancelled.
 *
 * Cancelling is a soft delete, so a property the buyer stopped watching still
 * appears here with `active: false`.
 */
export async function getAlertHistory(): Promise<AlertHistoryResponse> {
  const { data } = await client.get<AlertHistoryResponse>('/alerts/history')
  return data
}

/**
 * POST /api/alerts/subscribe — start watching a property.
 *
 * Returns 409 when a watch is already active; a previously cancelled watch is
 * reactivated instead (200, no `property` in the body).
 */
export async function subscribeAlert(listingId: string): Promise<SubscribeAlertResponse> {
  const { data } = await client.post<SubscribeAlertResponse>('/alerts/subscribe', {
    listingId,
  })
  return data
}

/** DELETE /api/alerts/:id — soft-cancels the watch. */
export async function cancelAlert(alertId: string): Promise<ApiEnvelope> {
  const { data } = await client.delete<ApiEnvelope>(`/alerts/${alertId}`)
  return data
}

/**
 * PUT /api/alerts/device-token — register/refresh this device's FCM token.
 *
 * Only worth calling once push is actually configured natively; until then the
 * app has no token to send and alerts fall back to SMS server-side.
 */
export async function registerDeviceToken(fcmToken: string): Promise<ApiEnvelope> {
  const { data } = await client.put<ApiEnvelope>('/alerts/device-token', { fcmToken })
  return data
}

/**
 * PUT /api/alerts/push-preference — push on/off.
 *
 * Turning push off does not silence alerts: the backend falls back to SMS.
 */
export async function setPushPreference(enabled: boolean): Promise<PushPreferenceResponse> {
  const { data } = await client.put<PushPreferenceResponse>('/alerts/push-preference', {
    enabled,
  })
  return data
}
