import { Router } from 'express'
import { supportTicketCreateSchema, supportMessageCreateSchema } from '@civilcheck/shared'
import * as supportController from '../controllers/support.controller.js'
import { authMiddleware, sellerMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'
import { supportTicketLimiter } from '../middleware/rateLimiter.js'

// ─── BUYER — mounted at /api/support ───────────────────────────────────────
export const buyerSupportRouter = Router()

// supportTicketLimiter guards CREATION only — every new ticket triggers a
// real Anthropic call (audit 2026-09-02). Reading/replying below is
// deliberately left unlimited by this guard.
buyerSupportRouter.post(
  '/tickets',
  authMiddleware,
  supportTicketLimiter,
  validateBody(supportTicketCreateSchema),
  supportController.createTicket
)
buyerSupportRouter.get('/tickets', authMiddleware, supportController.getMyTickets)
buyerSupportRouter.get('/tickets/:id', authMiddleware, supportController.getMyTicketDetail)
buyerSupportRouter.post(
  '/tickets/:id/messages',
  authMiddleware,
  validateBody(supportMessageCreateSchema),
  supportController.postMessage
)

// ─── PARTNER — mounted at /api/seller/support ──────────────────────────────
// Not role-restricted — Owner/Reporter/Expert can all raise a ticket.
export const partnerSupportRouter = Router()

partnerSupportRouter.post(
  '/tickets',
  sellerMiddleware,
  supportTicketLimiter,
  validateBody(supportTicketCreateSchema),
  supportController.createTicket
)
partnerSupportRouter.get('/tickets', sellerMiddleware, supportController.getMyTickets)
partnerSupportRouter.get('/tickets/:id', sellerMiddleware, supportController.getMyTicketDetail)
partnerSupportRouter.post(
  '/tickets/:id/messages',
  sellerMiddleware,
  validateBody(supportMessageCreateSchema),
  supportController.postMessage
)
