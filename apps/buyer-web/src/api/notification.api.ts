import client from './client'
import type { ApiEnvelope, MyNotificationsResponse } from '../types/api'

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
