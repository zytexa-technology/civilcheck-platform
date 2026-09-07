import client from './client'
import type {
  CreateSupportTicketResponse,
  MySupportTicketsResponse,
  PostSupportMessageResponse,
  SupportTicketCategory,
  SupportTicketDetailResponse,
} from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// AI / Human Customer Support (Phase 4C) — buyer side, mounted at /api/support.
// ─────────────────────────────────────────────────────────────────────────────

export async function createSupportTicket(input: {
  category: SupportTicketCategory
  subject: string
  message: string
  attachments?: string[]
}): Promise<CreateSupportTicketResponse> {
  const { data } = await client.post<CreateSupportTicketResponse>('/support/tickets', input)
  return data
}

export async function getMySupportTickets(): Promise<MySupportTicketsResponse> {
  const { data } = await client.get<MySupportTicketsResponse>('/support/tickets')
  return data
}

export async function getSupportTicketById(id: string): Promise<SupportTicketDetailResponse> {
  const { data } = await client.get<SupportTicketDetailResponse>(`/support/tickets/${id}`)
  return data
}

export async function postSupportMessage(
  id: string,
  body: string,
  attachments: string[] = []
): Promise<PostSupportMessageResponse> {
  const { data } = await client.post<PostSupportMessageResponse>(`/support/tickets/${id}/messages`, {
    body,
    attachments,
  })
  return data
}
