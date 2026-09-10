import { Router } from 'express'
import { PartnerRole } from '@prisma/client'
import {
  claimCreateSchema,
  linkDiscoveredListingSchema,
  purchaseVerifySchema,
  verificationCancelSchema,
  verificationQuoteCreateSchema,
  verificationReportCreateSchema,
  verificationRequestCreateSchema,
} from '@civilcheck/shared'
import * as verificationController from '../controllers/verification.controller.js'
import * as payoutController from '../controllers/payout.controller.js'
import * as authMiddleware from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

// ─── BUYER ROUTES — mounted at /api/verification-requests ─────────────────
export const buyerVerificationRouter = Router()

buyerVerificationRouter.post(
  '/',
  authMiddleware.authMiddleware,
  validateBody(verificationRequestCreateSchema),
  verificationController.createRequest
)

buyerVerificationRouter.get('/', authMiddleware.authMiddleware, verificationController.getMyRequests)

// Public — no auth. NOTE: mounted before /:id, or "config" would be read as an id.
buyerVerificationRouter.get('/config', verificationController.getMarketplaceConfig)

buyerVerificationRouter.get('/:id', authMiddleware.authMiddleware, verificationController.getRequestById)

buyerVerificationRouter.get('/:id/quotes', authMiddleware.authMiddleware, verificationController.getQuotes)

buyerVerificationRouter.post(
  '/:id/quotes/:quoteId/accept',
  authMiddleware.authMiddleware,
  verificationController.acceptQuote
)

buyerVerificationRouter.post(
  '/:id/advance-order',
  authMiddleware.authMiddleware,
  verificationController.createAdvanceOrder
)

buyerVerificationRouter.post(
  '/:id/advance-verify',
  authMiddleware.authMiddleware,
  validateBody(purchaseVerifySchema),
  verificationController.verifyAdvancePayment
)

buyerVerificationRouter.post(
  '/:id/final-order',
  authMiddleware.authMiddleware,
  verificationController.createFinalOrder
)

buyerVerificationRouter.post(
  '/:id/final-verify',
  authMiddleware.authMiddleware,
  validateBody(purchaseVerifySchema),
  verificationController.verifyFinalPayment
)

buyerVerificationRouter.get('/:id/report', authMiddleware.authMiddleware, verificationController.getReport)

buyerVerificationRouter.post(
  '/:id/cancel',
  authMiddleware.authMiddleware,
  validateBody(verificationCancelSchema),
  verificationController.cancelRequest
)

buyerVerificationRouter.post(
  '/:id/claims',
  authMiddleware.authMiddleware,
  validateBody(claimCreateSchema),
  verificationController.createClaim
)

buyerVerificationRouter.get(
  '/:id/claims',
  authMiddleware.authMiddleware,
  verificationController.getMyClaims
)

// ─── EXPERT ROUTES — mounted at /api/seller/verification-marketplace ──────
export const expertVerificationRouter = Router()

// Only the Expert persona competes in the marketplace — an Owner account
// replaying its JWT here must not be able to quote/accept professional work
// it never registered for (same reasoning as listing.routes.ts's expertOnly).
const expertOnly = authMiddleware.requireSellerRole(PartnerRole.EXPERT)

expertVerificationRouter.get(
  '/',
  authMiddleware.sellerMiddleware,
  expertOnly,
  verificationController.getMarketplaceRequests
)

expertVerificationRouter.get(
  '/my-assignments',
  authMiddleware.sellerMiddleware,
  expertOnly,
  verificationController.getMyAssignments
)

expertVerificationRouter.post(
  '/:id/quote',
  authMiddleware.sellerMiddleware,
  expertOnly,
  validateBody(verificationQuoteCreateSchema),
  verificationController.submitQuote
)

expertVerificationRouter.post(
  '/:id/start',
  authMiddleware.sellerMiddleware,
  expertOnly,
  verificationController.start
)

// Property Discovery flow (Step 4B) — Expert-only, deliberately not mirrored
// on adminMarketplaceRouter: linking a discovered property requires the
// Listing to have been created by the calling Expert themselves via the
// normal New Listing flow, which an Admin account never does.
expertVerificationRouter.post(
  '/:id/discovered-listing',
  authMiddleware.sellerMiddleware,
  expertOnly,
  validateBody(linkDiscoveredListingSchema),
  verificationController.linkListing
)

expertVerificationRouter.post(
  '/:id/report',
  authMiddleware.sellerMiddleware,
  expertOnly,
  validateBody(verificationReportCreateSchema),
  verificationController.submitReport
)

// ─── PROFESSIONAL EARNINGS + PAYOUTS (Phase 4B) ────────────────────────────
// Mounted on the same expertVerificationRouter (/api/seller/verification-
// marketplace) — a professional can only ever read/act on their own
// earnings (req.seller.id), same as every other route on this router.
expertVerificationRouter.get(
  '/earnings/summary',
  authMiddleware.sellerMiddleware,
  expertOnly,
  payoutController.getMyEarningsSummary
)
expertVerificationRouter.get(
  '/earnings/transactions',
  authMiddleware.sellerMiddleware,
  expertOnly,
  payoutController.getMyEarningsTransactions
)
expertVerificationRouter.get(
  '/payout-profile',
  authMiddleware.sellerMiddleware,
  expertOnly,
  payoutController.getMyPayoutProfile
)
expertVerificationRouter.get(
  '/payouts',
  authMiddleware.sellerMiddleware,
  expertOnly,
  payoutController.getMyPayouts
)
expertVerificationRouter.post(
  '/payouts',
  authMiddleware.sellerMiddleware,
  expertOnly,
  payoutController.requestMyPayout
)

// Single-request detail — registered LAST among this router's GETs. `:id` is
// a single-segment wildcard, so it must not be registered before any of the
// literal single-segment paths above it (/my-assignments, /payout-profile,
// /payouts) or it would shadow them (e.g. GET /payout-profile would be read
// as GET /:id with id="payout-profile"). /earnings/summary and
// /earnings/transactions are 2-segment and were never at risk, but this
// still keeps every literal route ahead of the wildcard for the same reason.
expertVerificationRouter.get(
  '/:id',
  authMiddleware.sellerMiddleware,
  expertOnly,
  verificationController.getMarketplaceRequestById
)

// ─── ADMIN MARKETPLACE ROUTES — mounted at /api/admin/verification-marketplace ──
// Admin acting as a PARTICIPANT (competing for verification work), distinct
// from admin OVERSIGHT (admin.controller.ts / admin.routes.ts's
// /api/admin/verification-requests). SUPER_ADMIN + SUB_ADMIN only — VIEWER
// stays read-only, same tier as listing QC.
export const adminMarketplaceRouter = Router()

const marketplaceParticipant = authMiddleware.requireAdminRole('SUB_ADMIN')

adminMarketplaceRouter.get(
  '/',
  authMiddleware.adminMiddleware,
  marketplaceParticipant,
  verificationController.getMarketplaceRequests
)

adminMarketplaceRouter.get(
  '/my-assignments',
  authMiddleware.adminMiddleware,
  marketplaceParticipant,
  verificationController.getMyAssignments
)

adminMarketplaceRouter.get(
  '/:id',
  authMiddleware.adminMiddleware,
  marketplaceParticipant,
  verificationController.getMarketplaceRequestById
)

adminMarketplaceRouter.post(
  '/:id/quote',
  authMiddleware.adminMiddleware,
  marketplaceParticipant,
  validateBody(verificationQuoteCreateSchema),
  verificationController.submitQuote
)

adminMarketplaceRouter.post(
  '/:id/start',
  authMiddleware.adminMiddleware,
  marketplaceParticipant,
  verificationController.start
)

adminMarketplaceRouter.post(
  '/:id/report',
  authMiddleware.adminMiddleware,
  marketplaceParticipant,
  validateBody(verificationReportCreateSchema),
  verificationController.submitReport
)
