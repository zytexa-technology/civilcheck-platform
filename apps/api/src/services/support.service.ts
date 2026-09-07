// ─────────────────────────────────────────────────────────────────────────────
// AI / Human Customer Support (Phase 4C).
//
// Flow: BUYER/PARTNER → AI SUPPORT → confident? → answer (stay AI_ASSISTED) :
// escalate (ESCALATED) → an admin ASSIGNS it (AI silenced from here) →
// ADMIN replies (IN_PROGRESS) → RESOLVED/CLOSED, or explicitly returned to AI.
//
// The AI never mutates anything outside SupportTicket/SupportMessage — see
// lib/aiSupport.ts's header for the safety boundary this relies on. Every
// account-specific fact shown in a ticket (e.g. "your request status is X")
// is written here as a SYSTEM message from a direct Prisma read, never
// phrased by the AI itself.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupportTicket, SupportTicketCategory } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { generateAiAnswer, type KnowledgeEntryForAi } from '../lib/aiSupport.js'
import { notifyBuyerAlert, notifySeller } from './notification.service.js'

export class SupportError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SupportError'
    this.status = status
  }
}

// Categories where a wrong or overconfident AI answer would be the most
// damaging — the AI is never even attempted here, so it structurally cannot
// "approve a refund" or "confirm a payment": those categories always go
// straight to a human.
const SENSITIVE_CATEGORIES: SupportTicketCategory[] = ['PAYMENT', 'CANCELLATION', 'CLAIM']

// Operational safety cap, not a business/financial number — how many AI
// replies a ticket gets before "repeated unresolved question" escalates it.
const MAX_AI_REPLIES_BEFORE_ESCALATION = 3

export type TicketActor = { userId: string; sellerId?: undefined } | { sellerId: string; userId?: undefined }

function actorWhere(actor: TicketActor) {
  return actor.userId ? { userId: actor.userId } : { sellerId: actor.sellerId }
}

async function assertOwnership(ticketId: string, actor: TicketActor): Promise<SupportTicket> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new SupportError('Support ticket not found', 404)
  const owns = actor.userId ? ticket.userId === actor.userId : ticket.sellerId === actor.sellerId
  if (!owns) throw new SupportError('Support ticket not found', 404) // 404, not 403 — don't confirm existence to a non-owner
  return ticket
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE — only active rows, filtered to the ticket's category where a
// direct topic match exists, otherwise the general pool. The AI never sees
// anything outside this set.
// ─────────────────────────────────────────────────────────────────────────────
async function loadKnowledge(category: SupportTicketCategory): Promise<KnowledgeEntryForAi[]> {
  const rows = await prisma.supportKnowledgeEntry.findMany({
    where: { active: true },
    select: { key: true, topic: true, question: true, answer: true },
  })
  // Prefer entries tagged for this category's topic, but fall back to the
  // full active set — a buyer's phrasing doesn't always match the category
  // they picked, and the knowledge base is small enough that this is cheap.
  const matching = rows.filter((r) => r.topic.toUpperCase() === category)
  return matching.length ? matching : rows
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCE — decide what happens next for a ticket that just received a new
// USER message (or was just created). This is the ONLY place that invokes
// the AI or performs the sensitive-category / repeated-question escalation
// checks, so there is exactly one escalation policy, not one per call site.
// ─────────────────────────────────────────────────────────────────────────────
async function advanceTicket(ticket: SupportTicket): Promise<void> {
  // A human already owns this ticket — AI must not reply until it's
  // explicitly returned (see returnToAi below). This is the structural
  // enforcement of "AI must stop replying after human takeover," not a
  // policy the AI is asked to remember.
  if (ticket.status === 'ASSIGNED' || ticket.status === 'IN_PROGRESS' || ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
    return
  }

  if (SENSITIVE_CATEGORIES.includes(ticket.category)) {
    await escalate(ticket, `${ticket.category} tickets always go to a human — configured sensitive topic.`)
    return
  }

  if (ticket.aiReplyCount >= MAX_AI_REPLIES_BEFORE_ESCALATION) {
    await escalate(ticket, 'Repeated exchange without resolution — escalated to a human.')
    return
  }

  const recentMessages = await prisma.supportMessage.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { sender: true, body: true },
  })
  const lastUserMessage = recentMessages.find((m) => m.sender === 'USER')
  if (!lastUserMessage) return // nothing to answer yet

  const knowledge = await loadKnowledge(ticket.category)
  const result = await generateAiAnswer({
    userMessage: lastUserMessage.body,
    category: ticket.category,
    knowledge,
    recentMessages: recentMessages.reverse(),
  })

  await prisma.supportMessage.create({
    data: { ticketId: ticket.id, sender: 'AI', body: result.answer },
  })

  const nextAiReplyCount = ticket.aiReplyCount + 1
  const nextStatus = result.shouldEscalate ? 'ESCALATED' : 'AI_ASSISTED'

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: nextStatus,
      aiReplyCount: nextAiReplyCount,
      aiSummary: buildSummary(ticket.subject, recentMessages.length + 1, ticket.category),
    },
  })

  if (result.shouldEscalate) {
    await writeSystemMessage(ticket.id, result.escalationReason ?? 'Escalated to a human.')
    await notifyOwnerEscalated(ticket)
  }
}

async function escalate(ticket: SupportTicket, reason: string): Promise<void> {
  if (ticket.status === 'ESCALATED') return // already there — don't spam a second system message
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'ESCALATED' } })
  await writeSystemMessage(ticket.id, reason)
  await notifyOwnerEscalated(ticket)
}

async function writeSystemMessage(ticketId: string, body: string): Promise<void> {
  await prisma.supportMessage.create({ data: { ticketId, sender: 'SYSTEM', body } })
}

// Deterministic in mock mode (no AI configured) — a real deployment's
// generateAiAnswer could be extended to also return a summary, but a
// placeholder here is honest about what it is rather than pretending to be
// an AI-written summary when none was generated.
function buildSummary(subject: string, messageCount: number, category: string): string {
  return `[${category}] ${subject} — ${messageCount} message(s) so far.`
}

async function notifyOwnerEscalated(ticket: SupportTicket): Promise<void> {
  try {
    if (ticket.userId) {
      const user = await prisma.user.findUnique({ where: { id: ticket.userId } })
      if (!user) return
      await notifyBuyerAlert(
        { id: user.id, phone: user.phone, email: user.email, fcmToken: user.fcmToken, pushEnabled: user.pushEnabled },
        {
          type: 'support',
          title: 'Your support request was escalated',
          body: `"${ticket.subject}" has been passed to a member of our support team.`,
          data: { supportTicketId: ticket.id },
        }
      )
    } else if (ticket.sellerId) {
      const seller = await prisma.seller.findUnique({
        where: { id: ticket.sellerId },
        select: { id: true, name: true, phone: true, email: true },
      })
      if (!seller) return
      await notifySeller(seller, {
        type: 'support',
        title: 'Your support request was escalated',
        body: `"${ticket.subject}" has been passed to a member of our support team.`,
      })
    }
  } catch (err) {
    logger.error(`[support] escalation notification failed for ticket ${ticket.id}: ${err}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTicketInput {
  category: SupportTicketCategory
  subject: string
  message: string
  attachments?: string[]
}

export async function createTicket(actor: TicketActor, input: CreateTicketInput): Promise<SupportTicket> {
  const ticket = await prisma.supportTicket.create({
    data: {
      ...actorWhere(actor),
      category: input.category,
      subject: input.subject,
    },
  })
  await prisma.supportMessage.create({
    data: { ticketId: ticket.id, sender: 'USER', body: input.message, attachments: input.attachments ?? [] },
  })

  await advanceTicket(ticket)
  return prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })
}

export async function postUserMessage(
  ticketId: string,
  actor: TicketActor,
  body: string,
  attachments: string[] = []
): Promise<SupportTicket> {
  const ticket = await assertOwnership(ticketId, actor)
  if (ticket.status === 'CLOSED') {
    throw new SupportError('This ticket is closed — start a new ticket for further help', 400)
  }

  await prisma.supportMessage.create({
    data: { ticketId, sender: 'USER', body, attachments },
  })

  // A user replying to a RESOLVED ticket reopens it — to the human if one is
  // already assigned (their context is more relevant), otherwise back to AI.
  const workingTicket =
    ticket.status === 'RESOLVED'
      ? await prisma.supportTicket.update({
          where: { id: ticketId },
          data: { status: ticket.assignedAdminId ? 'IN_PROGRESS' : 'OPEN', resolvedAt: null },
        })
      : ticket

  await advanceTicket(workingTicket)
  return prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })
}

export async function getMyTickets(actor: TicketActor) {
  return prisma.supportTicket.findMany({
    where: actorWhere(actor),
    orderBy: { updatedAt: 'desc' },
  })
}

export async function getMyTicketDetail(ticketId: string, actor: TicketActor) {
  const ticket = await assertOwnership(ticketId, actor)
  const messages = await prisma.supportMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
  })
  return { ticket, messages }
}

// ─── ADMIN-SIDE ────────────────────────────────────────────────────────────

export async function assignTicket(ticketId: string, adminId: string): Promise<SupportTicket> {
  const { count } = await prisma.supportTicket.updateMany({
    where: { id: ticketId, status: { in: ['OPEN', 'AI_ASSISTED', 'ESCALATED'] } },
    data: { status: 'ASSIGNED', assignedAdminId: adminId },
  })
  if (count === 0) throw new SupportError('Ticket not found or already assigned/closed', 400)
  await writeSystemMessage(ticketId, 'A support agent has taken over this conversation.')
  return prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })
}

export async function postAdminReply(ticketId: string, adminId: string, body: string): Promise<SupportTicket> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new SupportError('Support ticket not found', 404)
  if (ticket.status !== 'ASSIGNED' && ticket.status !== 'IN_PROGRESS') {
    throw new SupportError('Assign this ticket to yourself before replying', 400)
  }

  await prisma.supportMessage.create({
    data: { ticketId, sender: 'ADMIN', senderAdminId: adminId, body },
  })
  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: 'IN_PROGRESS' },
  })

  try {
    if (updated.userId) {
      const user = await prisma.user.findUnique({ where: { id: updated.userId } })
      if (user) {
        await notifyBuyerAlert(
          { id: user.id, phone: user.phone, email: user.email, fcmToken: user.fcmToken, pushEnabled: user.pushEnabled },
          {
            type: 'support',
            title: 'New reply on your support ticket',
            body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
            data: { supportTicketId: ticketId },
          }
        )
      }
    } else if (updated.sellerId) {
      const seller = await prisma.seller.findUnique({
        where: { id: updated.sellerId },
        select: { id: true, name: true, phone: true, email: true },
      })
      if (seller) {
        await notifySeller(seller, {
          type: 'support',
          title: 'New reply on your support ticket',
          body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
        })
      }
    }
  } catch (err) {
    logger.error(`[support] reply notification failed for ticket ${ticketId}: ${err}`)
  }

  return updated
}

export async function resolveTicket(ticketId: string): Promise<SupportTicket> {
  const { count } = await prisma.supportTicket.updateMany({
    where: { id: ticketId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  })
  if (count === 0) throw new SupportError('Ticket not found or already resolved/closed', 400)
  await writeSystemMessage(ticketId, 'This ticket was marked resolved.')
  return prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })
}

export async function reopenTicket(ticketId: string): Promise<SupportTicket> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new SupportError('Support ticket not found', 404)
  if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
    throw new SupportError('Only a resolved or closed ticket can be reopened', 400)
  }
  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: ticket.assignedAdminId ? 'IN_PROGRESS' : 'OPEN', resolvedAt: null },
  })
  await writeSystemMessage(ticketId, 'This ticket was reopened.')
  return updated
}

export async function closeTicket(ticketId: string): Promise<SupportTicket> {
  const { count } = await prisma.supportTicket.updateMany({
    where: { id: ticketId, status: { not: 'CLOSED' } },
    data: { status: 'CLOSED' },
  })
  if (count === 0) throw new SupportError('Ticket not found or already closed', 400)
  return prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })
}

// Hands a ticket back to the AI — e.g. an admin resolves a side question and
// wants routine follow-ups to go back through the assistant. Keeps
// assignedAdminId (they can always reclaim it), just un-silences the AI.
export async function returnToAi(ticketId: string): Promise<SupportTicket> {
  const { count } = await prisma.supportTicket.updateMany({
    where: { id: ticketId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'] } },
    data: { status: 'AI_ASSISTED' },
  })
  if (count === 0) throw new SupportError('Ticket not found or not currently with a human', 400)
  await writeSystemMessage(ticketId, 'This ticket was returned to the AI assistant.')
  return prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })
}
