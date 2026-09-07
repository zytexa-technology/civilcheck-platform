import { Router } from 'express'
import { PartnerRole } from '@prisma/client'
import { specialRequestCreateSchema, purchaseVerifySchema } from '@civilcheck/shared'
import * as specialRequestController from '../controllers/specialRequest.controller.js'
import * as authMiddleware from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

// ─── BUYER ROUTES ─────────────────────────────────────────────────────────
export const buyerSpecialRequestRouter = Router()

// POST /api/special-requests
// (fix: pehle galti se adminMiddleware laga tha — buyer route hai, buyer token chahiye)
buyerSpecialRequestRouter.post(
  '/',
  authMiddleware.authMiddleware,
  validateBody(specialRequestCreateSchema),
  specialRequestController.createSpecialRequest
)

// GET  /api/special-requests
buyerSpecialRequestRouter.get(
  '/',
  authMiddleware.authMiddleware,
  specialRequestController.getMySpecialRequests
)

// GET  /api/special-requests/:id
buyerSpecialRequestRouter.get(
  '/:id',
  authMiddleware.authMiddleware,
  specialRequestController.getSpecialRequestById
)

// POST /api/special-requests/:id/verify — confirm the advance payment
// checkout handshake (same body shape as POST /api/purchases/verify)
buyerSpecialRequestRouter.post(
  '/:id/verify',
  authMiddleware.authMiddleware,
  validateBody(purchaseVerifySchema),
  specialRequestController.verifySpecialRequestAdvance
)

// POST /api/special-requests/:id/retry — reopen checkout for a PENDING,
// unpaid request (order creation failed after the row was written, or the
// buyer simply abandoned the first checkout)
buyerSpecialRequestRouter.post(
  '/:id/retry',
  authMiddleware.authMiddleware,
  specialRequestController.retrySpecialRequestPayment
)

// ─── SELLER ROUTES ────────────────────────────────────────────────────────
export const sellerSpecialRequestRouter = Router()

// Special requests are the expert persona's paid research work — an 'owner'
// account replaying its JWT here could self-accept/complete work meant for a
// verified expert (QA audit 2026-08-03, finding #2).
const expertOnly = authMiddleware.requireSellerRole(PartnerRole.EXPERT)

// GET  /api/seller/special-requests/available
sellerSpecialRequestRouter.get(
  '/available',
  authMiddleware.sellerMiddleware,
  expertOnly,
  specialRequestController.getAvailableRequests
)

// GET  /api/seller/special-requests — full history, all statuses
sellerSpecialRequestRouter.get(
  '/',
  authMiddleware.sellerMiddleware,
  expertOnly,
  specialRequestController.getMySpecialRequestHistory
)

// POST /api/seller/special-requests/:id/accept
sellerSpecialRequestRouter.post(
  '/:id/accept',
  authMiddleware.sellerMiddleware,
  expertOnly,
  specialRequestController.acceptRequest
)

// POST /api/seller/special-requests/:id/decline
sellerSpecialRequestRouter.post(
  '/:id/decline',
  authMiddleware.sellerMiddleware,
  expertOnly,
  specialRequestController.declineRequest
)

// POST /api/seller/special-requests/:id/submit
sellerSpecialRequestRouter.post(
  '/:id/submit',
  authMiddleware.sellerMiddleware,
  expertOnly,
  specialRequestController.submitRequest
)

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────
export const adminSpecialRequestRouter = Router()

// These four were gated by adminMiddleware alone, which let a VIEWER assign
// work and approve or refund requests — VIEWER is meant to be read-only
// (PDF 5.1). Writes now admit SUPER_ADMIN and SUB_ADMIN, matching the listing
// approval routes; the GET stays open to all three roles.
const specialRequestQC = authMiddleware.requireAdminRole('SUB_ADMIN')

// GET  /api/admin/special-requests
adminSpecialRequestRouter.get(
  '/',
  authMiddleware.adminMiddleware,
  specialRequestController.getAllSpecialRequests
)

// POST /api/admin/special-requests/:id/assign
adminSpecialRequestRouter.post(
  '/:id/assign',
  authMiddleware.adminMiddleware,
  specialRequestQC,
  specialRequestController.assignRequest
)

// POST /api/admin/special-requests/:id/approve
adminSpecialRequestRouter.post(
  '/:id/approve',
  authMiddleware.adminMiddleware,
  specialRequestQC,
  specialRequestController.approveSpecialRequest
)

// POST /api/admin/special-requests/:id/reject
adminSpecialRequestRouter.post(
  '/:id/reject',
  authMiddleware.adminMiddleware,
  specialRequestQC,
  specialRequestController.rejectSpecialRequest
)
