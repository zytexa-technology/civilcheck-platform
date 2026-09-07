import { Request, Response } from 'express'
import * as supportService from '../services/support.service.js'
import type { TicketActor } from '../services/support.service.js'

// ─────────────────────────────────────────────────────────────────────────────
//  BUYER + PARTNER SUPPORT (Phase 4C)
//  Mounted at /api/support (buyer, authMiddleware) and
//  /api/seller/support (partner, sellerMiddleware — any partnerRole, support
//  is not role-restricted). One controller for both: the service layer
//  already takes a generic TicketActor, so the only thing that differs here
//  is which authenticated principal the actor comes from.
// ─────────────────────────────────────────────────────────────────────────────

function resolveActor(req: Request): TicketActor {
  if (req.user) return { userId: req.user.id }
  return { sellerId: req.seller!.id }
}

// POST /tickets
export const createTicket = async (req: Request, res: Response) => {
  const actor = resolveActor(req)
  const { category, subject, message, attachments } = req.body as {
    category: string
    subject: string
    message: string
    attachments: string[]
  }

  const ticket = await supportService.createTicket(actor, {
    category: category as never,
    subject,
    message,
    attachments,
  })
  res.status(201).json({ success: true, message: 'Support ticket created', ticket: hideAiSummary(ticket) })
}

// aiSummary is admin-only context for a human agent skimming a ticket on
// takeover — never shown to the buyer/partner who owns it (schema comment
// on SupportTicket.aiSummary).
function hideAiSummary<T extends { aiSummary?: string | null }>(ticket: T) {
  const { aiSummary: _aiSummary, ...rest } = ticket
  return rest
}

// GET /tickets
export const getMyTickets = async (req: Request, res: Response) => {
  const actor = resolveActor(req)
  const tickets = await supportService.getMyTickets(actor)
  res.json({ success: true, total: tickets.length, tickets: tickets.map(hideAiSummary) })
}

// GET /tickets/:id
export const getMyTicketDetail = async (req: Request, res: Response) => {
  const actor = resolveActor(req)
  const id = req.params.id as string
  try {
    const { ticket, messages } = await supportService.getMyTicketDetail(id, actor)
    res.json({ success: true, ticket: hideAiSummary(ticket), messages })
  } catch (err) {
    if (err instanceof supportService.SupportError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /tickets/:id/messages
export const postMessage = async (req: Request, res: Response) => {
  const actor = resolveActor(req)
  const id = req.params.id as string
  const { body, attachments } = req.body as { body: string; attachments: string[] }

  try {
    const ticket = await supportService.postUserMessage(id, actor, body, attachments)
    res.status(201).json({ success: true, message: 'Message sent', ticket: hideAiSummary(ticket) })
  } catch (err) {
    if (err instanceof supportService.SupportError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}
