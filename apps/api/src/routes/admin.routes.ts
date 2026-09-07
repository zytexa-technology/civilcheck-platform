import { Router } from 'express'
import {
  adminCreateSchema,
  adminUpdateSchema,
  bannerCreateSchema,
  bannerUpdateSchema,
  claimResolutionSchema,
  disclaimerUpsertSchema,
  firebaseIdTokenSchema,
  kycDecisionReasonSchema,
  payoutEligibilityUpdateSchema,
  payoutResolveSchema,
  platformSettingUpdateSchema,
  propertyCategoryCreateSchema,
  propertyCategoryUpdateSchema,
  reconciliationIssueResolveSchema,
  redeemRequestDecisionSchema,
  redeemRequestRejectSchema,
  reportFlagDecisionSchema,
  rewardAdjustmentCreateSchema,
  rewardTransactionDecisionSchema,
  serviceAreaCreateSchema,
  serviceAreaUpdateSchema,
  supportAdminReplySchema,
  supportKnowledgeUpsertSchema,
  supportTicketPriorityUpdateSchema,
  twoFactorDisableSchema,
  twoFactorEnableSchema,
  verificationCancelSchema,
} from '@civilcheck/shared'
import * as adminController from '../controllers/admin.controller.js'
import * as authController from '../controllers/auth.controller.js'
import * as contentController from '../controllers/content.controller.js'
import * as twoFactorController from '../controllers/twoFactor.controller.js'
import { adminMiddleware, requireAdminRole } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'
import { twoFactorLimiter, adminTwoFactorResetLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Saare admin routes ke liye adminMiddleware zaroori hai
// Normal buyer ya seller in routes ko access nahi kar sakta
//
// RBAC (PDF 5.1): GET routes teeno roles ke liye open hain (VIEWER read-only).
// Write routes gated hain:
//   - KYC decisions / suspensions / badges / refunds → SUPER_ADMIN only
//   - Listing approvals + manual QC (spot-check)     → SUPER_ADMIN + SUB_ADMIN
const superOnly = requireAdminRole() // sirf SUPER_ADMIN pass hota hai
const listingQC = requireAdminRole('SUB_ADMIN')

// ─── ADMIN 2FA (PDF 5.1) ──────────────────────────────────────────────────
//
// Deliberately NOT role-gated: every admin manages the second factor on their
// own account, VIEWER included. requireAdminRole would be wrong here — a
// read-only admin still has to be able to secure their own login.
router.get('/2fa/status', adminMiddleware, twoFactorController.getTwoFactorStatus)

router.post('/2fa/setup', adminMiddleware, twoFactorLimiter, twoFactorController.setupTwoFactor)

router.post(
  '/2fa/enable',
  adminMiddleware,
  twoFactorLimiter,
  validateBody(twoFactorEnableSchema),
  twoFactorController.enableTwoFactor
)

router.post(
  '/2fa/disable',
  adminMiddleware,
  twoFactorLimiter,
  validateBody(twoFactorDisableSchema),
  twoFactorController.disableTwoFactor
)

// ─── ADMIN FIREBASE PHONE-OTP LINKING ─────────────────────────────────────
//
// Deliberately NOT role-gated, same reasoning as 2FA above — every admin
// manages their own login methods, VIEWER included. The controller itself
// refuses to link a SUPER_ADMIN row, so this can never touch that account
// regardless of who calls it.
router.post(
  '/link-firebase',
  adminMiddleware,
  validateBody(firebaseIdTokenSchema),
  authController.linkAdminFirebase
)

// ─── KYC APPROVAL PIPELINE (PDF 5.2) ──────────────────────────────────────

// GET /api/admin/kyc/pending   → review queue with documents exposed
router.get('/kyc/pending', adminMiddleware, adminController.getPendingKycApplications)

// GET /api/admin/kyc/:id       → one application in full
router.get('/kyc/:id', adminMiddleware, adminController.getKycApplication)

// KYC document security hardening — fresh short-lived signed URL for one
// seller's certificate/selfie/identity-document during review.
// GET /api/admin/sellers/:id/kyc/documents/:field/signed-url
router.get('/sellers/:id/kyc/documents/:field/signed-url', adminMiddleware, adminController.getSellerKycDocumentSignedUrl)

// ─── SELLER MANAGEMENT ────────────────────────────────────────────────────

// GET  /api/admin/sellers              → Saare sellers list
router.get('/sellers', adminMiddleware, adminController.getAllSellers)

// GET  /api/admin/sellers/:id          → Single seller detail
router.get('/sellers/:id', adminMiddleware, adminController.getSellerById)

// POST /api/admin/sellers/:id/approve  → KYC approve karo
router.post('/sellers/:id/approve', adminMiddleware, superOnly, adminController.approveSeller)

// POST /api/admin/sellers/:id/reject   → KYC reject karo
router.post(
  '/sellers/:id/reject',
  adminMiddleware,
  superOnly,
  validateBody(kycDecisionReasonSchema),
  adminController.rejectSeller
)

// Identity document verification (manual review — replaces DigiLocker OAuth)
// POST /api/admin/sellers/:id/identity-document/approve
router.post(
  '/sellers/:id/identity-document/approve',
  adminMiddleware,
  superOnly,
  adminController.approveIdentityDocument
)

// POST /api/admin/sellers/:id/identity-document/reject
router.post(
  '/sellers/:id/identity-document/reject',
  adminMiddleware,
  superOnly,
  validateBody(kycDecisionReasonSchema),
  adminController.rejectIdentityDocument
)

// POST /api/admin/sellers/:id/suspend  → Seller suspend karo
router.post(
  '/sellers/:id/suspend',
  adminMiddleware,
  superOnly,
  validateBody(kycDecisionReasonSchema),
  adminController.suspendSeller
)

// POST /api/admin/sellers/:id/unsuspend → Suspension hataao
router.post('/sellers/:id/unsuspend', adminMiddleware, superOnly, adminController.unsuspendSeller)

// PATCH /api/admin/sellers/:id/badge   → Badge update karo
router.patch('/sellers/:id/badge', adminMiddleware, superOnly, adminController.updateSellerBadge)

// DELETE /api/admin/sellers/:id        → Partner account delete karo (soft, Phase 4A)
router.delete('/sellers/:id', adminMiddleware, superOnly, adminController.deleteSeller)

// ─── LISTINGS MANAGEMENT ──────────────────────────────────────────────────

// GET  /api/admin/listings             → Saari listings (default: pending)
router.get('/listings', adminMiddleware, adminController.getAllListings)

// POST /api/admin/listings/:id/approve → Listing approve karo
router.post('/listings/:id/approve', adminMiddleware, listingQC, adminController.approveListing)

// POST /api/admin/listings/:id/reject  → Listing reject karo
router.post('/listings/:id/reject', adminMiddleware, listingQC, adminController.rejectListing)

// POST /api/admin/listings/:id/spot-check → Quality check karo
router.post('/listings/:id/spot-check', adminMiddleware, listingQC, adminController.spotCheckListing)

// DELETE /api/admin/listings/:id → SuperAdmin-only permanent removal (soft
// delete — status: 'DELETED', same convention as properties below).
router.delete('/listings/:id', adminMiddleware, superOnly, adminController.deleteListing)

// ─── OWNER PROPERTIES (self-verification, separate from Listings) ────────
//
// Property Owner ki apni property — koi risk/case data nahi, sirf
// submit → review → approve/reject. Same RBAC tier as listing QC.

// GET  /api/admin/properties             → Saari properties (default: pending)
router.get('/properties', adminMiddleware, adminController.getAllProperties)

// POST /api/admin/properties/:id/approve → Property approve karo
router.post('/properties/:id/approve', adminMiddleware, listingQC, adminController.approveProperty)

// POST /api/admin/properties/:id/reject  → Property reject karo
router.post('/properties/:id/reject', adminMiddleware, listingQC, adminController.rejectProperty)

// POST /api/admin/properties/:id/suspend   → Property suspend karo (Phase 4A)
router.post('/properties/:id/suspend', adminMiddleware, listingQC, adminController.suspendProperty)

// POST /api/admin/properties/:id/unsuspend → Suspension hataao (Phase 4A)
router.post('/properties/:id/unsuspend', adminMiddleware, listingQC, adminController.unsuspendProperty)

// DELETE /api/admin/properties/:id → SuperAdmin-only permanent removal
// (status: 'DELETED' — reuses the exact value/pattern property-owner.
// controller.ts already uses for a seller's own self-delete; this endpoint
// lets a SuperAdmin do it for any property, regardless of owner).
router.delete('/properties/:id', adminMiddleware, superOnly, adminController.deleteProperty)

// ─── REPORTER POSTS (informational content — no moderation state) ────────
//
// Reads open to all three admin roles, same tier as every other admin list.
// No approve/reject/suspend routes exist — ReporterPost has no admin-gate at
// all (see schema.prisma). The only mutating action is SuperAdmin-only removal.
router.get('/reporter-posts', adminMiddleware, adminController.getAllReporterPosts)
router.delete('/reporter-posts/:id', adminMiddleware, superOnly, adminController.deleteReporterPost)

// ─── BUYER "REPORT OUTDATED" FLAGS (PDF 7.8) ──────────────────────────────
//
// Same RBAC tier as listing QC — reviewing a buyer's flag is a manual QC
// judgment call, not a money/identity decision.
router.get('/report-flags', adminMiddleware, listingQC, adminController.getReportFlags)
router.post(
  '/report-flags/:id/resolve',
  adminMiddleware,
  listingQC,
  validateBody(reportFlagDecisionSchema),
  adminController.resolveReportFlag
)
router.post(
  '/report-flags/:id/dismiss',
  adminMiddleware,
  listingQC,
  validateBody(reportFlagDecisionSchema),
  adminController.dismissReportFlag
)

// ─── ANALYTICS ────────────────────────────────────────────────────────────

// GET /api/admin/analytics/overview    → Platform overview stats
router.get('/analytics/overview', adminMiddleware, adminController.getAnalyticsOverview)

// GET /api/admin/analytics/funnel      → Conversion funnel
router.get('/analytics/funnel', adminMiddleware, adminController.getConversionFunnel)

// GET /api/admin/analytics/top-sellers → Top earning sellers
router.get('/analytics/top-sellers', adminMiddleware, adminController.getTopSellers)

// GET /api/admin/analytics/top-cities  → Most active cities
router.get('/analytics/top-cities', adminMiddleware, adminController.getTopCities)

// Analytics routes ke section mein add karo:
router.get('/analytics/monthly-revenue', adminMiddleware, adminController.getMonthlyRevenue)
router.get('/analytics/risk-breakdown', adminMiddleware, adminController.getRiskBreakdown)

// GET /api/admin/analytics/subscriptions → alert subscription dashboard (PDF 5.6)
router.get('/analytics/subscriptions', adminMiddleware, adminController.getSubscriptionAnalytics)

// ─── CONTENT CONTROL (PDF 5.4) ────────────────────────────────────────────
//
// Reads open to all three roles; every write is SUPER_ADMIN only — content
// changes are platform-wide and instantly visible to buyers and sellers.
// DELETE is a soft delete (active = false), never a row removal.

// Property categories
router.get('/content/categories', adminMiddleware, contentController.listCategories)
router.post(
  '/content/categories',
  adminMiddleware,
  superOnly,
  validateBody(propertyCategoryCreateSchema),
  contentController.createCategory
)
router.patch(
  '/content/categories/:id',
  adminMiddleware,
  superOnly,
  validateBody(propertyCategoryUpdateSchema),
  contentController.updateCategory
)
router.delete('/content/categories/:id', adminMiddleware, superOnly, contentController.deleteCategory)

// Cities / tehsils
router.get('/content/service-areas', adminMiddleware, contentController.listServiceAreas)
router.post(
  '/content/service-areas',
  adminMiddleware,
  superOnly,
  validateBody(serviceAreaCreateSchema),
  contentController.createServiceArea
)
router.patch(
  '/content/service-areas/:id',
  adminMiddleware,
  superOnly,
  validateBody(serviceAreaUpdateSchema),
  contentController.updateServiceArea
)
router.delete(
  '/content/service-areas/:id',
  adminMiddleware,
  superOnly,
  contentController.deleteServiceArea
)

// Global disclaimer text — PUT upserts by key
router.get('/content/disclaimers', adminMiddleware, contentController.listDisclaimers)
router.put(
  '/content/disclaimers',
  adminMiddleware,
  superOnly,
  validateBody(disclaimerUpsertSchema),
  contentController.upsertDisclaimer
)

// AI support knowledge base (Phase 4C) — the only source the AI assistant
// may ground answers in. PUT upserts by key, same as disclaimers.
router.get('/content/support-knowledge', adminMiddleware, contentController.listSupportKnowledge)
router.put(
  '/content/support-knowledge',
  adminMiddleware,
  superOnly,
  validateBody(supportKnowledgeUpsertSchema),
  contentController.upsertSupportKnowledge
)

// In-app banner announcements
router.get('/content/banners', adminMiddleware, contentController.listBanners)
router.post(
  '/content/banners',
  adminMiddleware,
  superOnly,
  validateBody(bannerCreateSchema),
  contentController.createBanner
)
router.patch(
  '/content/banners/:id',
  adminMiddleware,
  superOnly,
  validateBody(bannerUpdateSchema),
  contentController.updateBanner
)
router.delete('/content/banners/:id', adminMiddleware, superOnly, contentController.deleteBanner)

// Buyer Analytic Ruoutes ke section mein add karo

router.get('/buyers', adminMiddleware, adminController.getAllBuyers)

// DELETE /api/admin/buyers/:id → SuperAdmin-only permanent account removal
// (soft delete — deletedAt, same convention as Seller.deletedAt/deleteSeller).
router.delete('/buyers/:id', adminMiddleware, superOnly, adminController.deleteBuyer)

// Refund routes
router.get('/refunds', adminMiddleware, adminController.getAllRefunds)
// Purchase lookup for the manual refund flow — read-only, all three roles.
router.get('/purchases', adminMiddleware, adminController.searchPurchases)
router.post('/refunds', adminMiddleware, superOnly, adminController.createRefund)
router.post('/refunds/:id/process', adminMiddleware, superOnly, adminController.processRefund)
router.post('/refunds/:id/reject', adminMiddleware, superOnly, adminController.rejectRefund)

// System Report routes

router.get('/reports/revenue', adminMiddleware, adminController.getRevenueReport)
router.get('/reports/settlements', adminMiddleware, adminController.getSettlementReport)
router.get('/reports/qc', adminMiddleware, adminController.getQCReport)

//System altr sub

router.get('/alert-subs', adminMiddleware, adminController.getAllAlertSubs)

// ─── AUDIT TRAIL (PDF 5.1) ────────────────────────────────────────────────
//
// These handlers existed but were never mounted, so the panel's Audit Log page
// was hitting a 404. Reads are open to all three roles (compliance review is a
// read-only job); the manual write is limited to the roles that can actually
// mutate anything, so a VIEWER cannot inject entries into the trail.
router.get('/audit-logs', adminMiddleware, adminController.getAuditLogs)
router.post('/audit-logs', adminMiddleware, listingQC, adminController.createAuditLog)

router.get('/special-request-payouts', adminMiddleware, adminController.getSpecialRequestPayouts)

// ─── ADMIN MANAGEMENT (Super Admin CRUD) ─────────────────────────────────
//
// Every route SUPER_ADMIN only — creating, editing, blocking or deleting an
// admin is a top-level platform-control action, not something a SUB_ADMIN or
// VIEWER can delegate to themselves. role is capped at SUB_ADMIN/VIEWER by
// adminCreateSchema/adminUpdateSchema, and every target admin is checked
// against being SUPER_ADMIN inside the controller — this API structurally
// cannot touch the protected top-level account.
router.get('/admins', adminMiddleware, superOnly, adminController.listAdmins)
router.get('/admins/:id', adminMiddleware, superOnly, adminController.getAdminById)
router.post(
  '/admins',
  adminMiddleware,
  superOnly,
  validateBody(adminCreateSchema),
  adminController.createAdmin
)
router.patch(
  '/admins/:id',
  adminMiddleware,
  superOnly,
  validateBody(adminUpdateSchema),
  adminController.updateAdmin
)
router.post('/admins/:id/block', adminMiddleware, superOnly, adminController.blockAdmin)
router.post('/admins/:id/unblock', adminMiddleware, superOnly, adminController.unblockAdmin)
router.post('/admins/:id/activate', adminMiddleware, superOnly, adminController.activateAdmin)
router.post('/admins/:id/deactivate', adminMiddleware, superOnly, adminController.deactivateAdmin)
// SuperAdmin-assisted 2FA recovery (lost authenticator) — see
// adminController.resetAdminTwoFactor for the full guard rationale.
router.post(
  '/admins/:id/2fa/reset',
  adminMiddleware,
  superOnly,
  adminTwoFactorResetLimiter,
  adminController.resetAdminTwoFactor
)
router.delete('/admins/:id', adminMiddleware, superOnly, adminController.deleteAdmin)

// ─── VERIFICATION MARKETPLACE — SUPER ADMIN OVERSIGHT (Phase 3) ──────────
//
// Admin acting as a marketplace PARTICIPANT (quoting/accepting work) is
// mounted separately at /api/admin/verification-marketplace (see app.ts) —
// this section is oversight only. Reads open to all three roles (VIEWER
// included, same as every other admin list/detail endpoint); force-cancel,
// claim resolution and platform-rule changes are money-adjacent decisions,
// same tier as refunds/KYC — SUPER_ADMIN only.
router.get('/verification-requests', adminMiddleware, adminController.getAllVerificationRequests)
router.get('/verification-requests/:id', adminMiddleware, adminController.getVerificationRequestDetail)
router.post(
  '/verification-requests/:id/force-cancel',
  adminMiddleware,
  superOnly,
  validateBody(verificationCancelSchema),
  adminController.forceCancelVerificationRequest
)

router.get('/claims', adminMiddleware, adminController.getAllClaims)
router.post(
  '/claims/:id/resolve',
  adminMiddleware,
  superOnly,
  validateBody(claimResolutionSchema),
  adminController.resolveClaim
)

router.get('/verification-settings', adminMiddleware, adminController.getVerificationSettings)
router.patch(
  '/verification-settings',
  adminMiddleware,
  superOnly,
  validateBody(platformSettingUpdateSchema),
  adminController.updateVerificationSettings
)

// ─── REPORTER REWARD LEDGER — ADMIN/SUPER ADMIN CONTROLS (Phase 4A) ──────
//
// Reads open to all three roles; every decision that moves points or
// changes the reward rate is SUPER_ADMIN only — same tier as refunds/KYC.
router.get('/reward-transactions', adminMiddleware, adminController.getAllRewardTransactions)
router.post(
  '/reward-transactions/:id/approve',
  adminMiddleware,
  superOnly,
  validateBody(rewardTransactionDecisionSchema),
  adminController.approveRewardTransaction
)
router.post(
  '/reward-transactions/:id/reject',
  adminMiddleware,
  superOnly,
  validateBody(rewardTransactionDecisionSchema),
  adminController.rejectRewardTransaction
)

router.get('/sellers/:id/reward-summary', adminMiddleware, adminController.getSellerRewardSummary)
router.post(
  '/sellers/:id/reward-adjustment',
  adminMiddleware,
  superOnly,
  validateBody(rewardAdjustmentCreateSchema),
  adminController.createRewardAdjustment
)

router.get('/redeem-requests', adminMiddleware, adminController.getAllRedeemRequests)
router.post(
  '/redeem-requests/:id/approve',
  adminMiddleware,
  superOnly,
  validateBody(redeemRequestDecisionSchema),
  adminController.approveRedeemRequest
)
router.post(
  '/redeem-requests/:id/reject',
  adminMiddleware,
  superOnly,
  validateBody(redeemRequestRejectSchema),
  adminController.rejectRedeemRequest
)

router.get('/reward-settings', adminMiddleware, adminController.getRewardSettings)
router.patch(
  '/reward-settings',
  adminMiddleware,
  superOnly,
  validateBody(platformSettingUpdateSchema),
  adminController.updateRewardSettings
)

// ─── FINANCIAL LEDGER + PROFESSIONAL PAYOUTS (Phase 4B) ──────────────────
//
// Reads open to all three admin roles (VIEWER included, same tier as every
// other admin overview/list/detail endpoint). Every action that moves
// money, triggers a payout attempt, or changes payout eligibility is
// SUPER_ADMIN only — a SUB_ADMIN cannot change the commission rate, mark a
// payout paid (no endpoint anywhere does that — only a webhook can),
// trigger/retry/write-off a payout, or resolve a reconciliation issue.
router.get('/finance/overview', adminMiddleware, adminController.getFinancialOverview)
router.get('/finance/ledger', adminMiddleware, adminController.getFinancialLedger)

router.get('/payouts', adminMiddleware, adminController.getAllPayoutRecords)
router.post('/payouts/:id/process', adminMiddleware, superOnly, adminController.processPayoutRecord)
router.post(
  '/payouts/:id/resolve',
  adminMiddleware,
  superOnly,
  validateBody(payoutResolveSchema),
  adminController.resolveManualReviewPayout
)

router.patch(
  '/sellers/:id/payout-eligibility',
  adminMiddleware,
  superOnly,
  validateBody(payoutEligibilityUpdateSchema),
  adminController.updatePayoutEligibility
)

router.post('/reconciliation/run', adminMiddleware, superOnly, adminController.runReconciliation)
router.get('/reconciliation/issues', adminMiddleware, adminController.getReconciliationIssues)
router.post(
  '/reconciliation/issues/:id/resolve',
  adminMiddleware,
  superOnly,
  validateBody(reconciliationIssueResolveSchema),
  adminController.resolveReconciliationIssue
)

// ─── AI / HUMAN CUSTOMER SUPPORT (Phase 4C) ───────────────────────────────
//
// Reads open to all three roles. Assign/reply/reopen/return-to-AI are
// SUB_ADMIN+ (day-to-day support work, same tier as report-flags/listing
// QC); resolving a PAYMENT/CANCELLATION/CLAIM ticket is checked inside the
// controller (depends on the ticket's own category, not just the route).
router.get('/support/tickets', adminMiddleware, adminController.getAllSupportTickets)
router.get('/support/tickets/:id', adminMiddleware, adminController.getSupportTicketDetail)
router.post('/support/tickets/:id/assign', adminMiddleware, listingQC, adminController.assignSupportTicket)
router.post(
  '/support/tickets/:id/reply',
  adminMiddleware,
  listingQC,
  validateBody(supportAdminReplySchema),
  adminController.replySupportTicket
)
router.post('/support/tickets/:id/resolve', adminMiddleware, listingQC, adminController.resolveSupportTicket)
router.post('/support/tickets/:id/reopen', adminMiddleware, listingQC, adminController.reopenSupportTicket)
router.post(
  '/support/tickets/:id/return-to-ai',
  adminMiddleware,
  listingQC,
  adminController.returnSupportTicketToAi
)
router.patch(
  '/support/tickets/:id/priority',
  adminMiddleware,
  listingQC,
  validateBody(supportTicketPriorityUpdateSchema),
  adminController.updateSupportTicketPriority
)

export default router
