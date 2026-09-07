import client from './client'
import type { ApiEnvelope, MyNotificationsResponse } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Buyer in-app notification inbox (Phase 4C) — mounted at /api/notifications.
// Backed by the same Notification model/fan-out the seller app already uses
// (notification.service.ts), now extended to also carry a buyer's rows.
// ─────────────────────────────────────────────────────────────────────────────

export async function getMyNotifications(): Promise<MyNotificationsResponse> {
  const { data } = await client.get<MyNotificationsResponse>('/notifications')
  return data
}

export async function markNotificationRead(id: string): Promise<ApiEnvelope> {
  const { data } = await client.post<ApiEnvelope>(`/notifications/${id}/read`)
  return data
}

export async function markAllNotificationsRead(): Promise<ApiEnvelope> {
  const { data } = await client.post<ApiEnvelope>('/notifications/mark-all-read')
  return data
}
