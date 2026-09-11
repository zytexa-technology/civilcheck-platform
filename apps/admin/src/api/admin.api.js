import API from './axios'

// ─── SELLERS ──────────────────────────────────────────────────────────────
export const getSellers = async (params = {}) => {
  const response = await API.get('/admin/sellers', { params })
  return response.data
}

export const getSellerById = async (id) => {
  const response = await API.get(`/admin/sellers/${id}`)
  return response.data
}

// Purpose-built KYC review endpoint — adds digitalSignature/tcAccepted/
// bank-payout-readiness on top of what GET /admin/sellers/:id returns.
export const getKycApplication = async (id) => {
  const response = await API.get(`/admin/kyc/${id}`)
  return response.data
}

// KYC document security hardening — certificate/selfie/identity-document are
// now `type: authenticated` in Cloudinary; mints a fresh, short-lived signed
// URL for review. field: 'certificate' | 'selfie' | 'identity-document'
export const getSellerKycDocumentSignedUrl = async (sellerId, field) => {
  const response = await API.get(`/admin/sellers/${sellerId}/kyc/documents/${field}/signed-url`)
  return response.data
}

export const approveSeller = async (id) => {
  const response = await API.post(`/admin/sellers/${id}/approve`)
  return response.data
}

export const rejectSeller = async (id, reason) => {
  const response = await API.post(`/admin/sellers/${id}/reject`, { reason })
  return response.data
}

export const suspendSeller = async (id, reason) => {
  const response = await API.post(`/admin/sellers/${id}/suspend`, { reason })
  return response.data
}

export const unsuspendSeller = async (id) => {
  const response = await API.post(`/admin/sellers/${id}/unsuspend`)
  return response.data
}

export const updateSellerBadge = async (id, badge) => {
  const response = await API.patch(`/admin/sellers/${id}/badge`, { badge })
  return response.data
}

// Identity document verification (manual review — replaces DigiLocker OAuth)
export const approveIdentityDocument = async (id) => {
  const response = await API.post(`/admin/sellers/${id}/identity-document/approve`)
  return response.data
}

export const rejectIdentityDocument = async (id, reason) => {
  const response = await API.post(`/admin/sellers/${id}/identity-document/reject`, { reason })
  return response.data
}

// ─── LISTINGS ─────────────────────────────────────────────────────────────
export const getListings = async (params = {}) => {
  const response = await API.get('/admin/listings', { params })
  return response.data
}

export const approveListing = async (id) => {
  const response = await API.post(`/admin/listings/${id}/approve`)
  return response.data
}

export const rejectListing = async (id, reason) => {
  const response = await API.post(`/admin/listings/${id}/reject`, { reason })
  return response.data
}

export const spotCheckListing = async (id, result, adminNote) => {
  const response = await API.post(`/admin/listings/${id}/spot-check`, { result, adminNote })
  return response.data
}

// SuperAdmin-only permanent removal (soft delete — status: 'DELETED')
export const deleteListing = async (id) => {
  const response = await API.delete(`/admin/listings/${id}`)
  return response.data
}

// ─── OWNER PROPERTIES (self-verification, separate from Listings) ────────
export const getProperties = async (params = {}) => {
  const response = await API.get('/admin/properties', { params })
  return response.data
}

export const approveProperty = async (id) => {
  const response = await API.post(`/admin/properties/${id}/approve`)
  return response.data
}

export const rejectProperty = async (id, reason) => {
  const response = await API.post(`/admin/properties/${id}/reject`, { reason })
  return response.data
}

export const suspendProperty = async (id, reason) => {
  const response = await API.post(`/admin/properties/${id}/suspend`, { reason })
  return response.data
}

export const unsuspendProperty = async (id) => {
  const response = await API.post(`/admin/properties/${id}/unsuspend`)
  return response.data
}

// SuperAdmin-only permanent removal (soft delete — status: 'DELETED')
export const deleteProperty = async (id) => {
  const response = await API.delete(`/admin/properties/${id}`)
  return response.data
}

// ─── REPORTER POSTS (informational content — no moderation state) ─────────
export const getReporterPosts = async (params = {}) => {
  const response = await API.get('/admin/reporter-posts', { params })
  return response.data
}

// SuperAdmin-only permanent removal (soft delete — status: 'REMOVED')
export const deleteReporterPost = async (id) => {
  const response = await API.delete(`/admin/reporter-posts/${id}`)
  return response.data
}

// ─── Partner account deletion (Phase 4A) ───────────────────────────────────
export const deleteSeller = async (id) => {
  const response = await API.delete(`/admin/sellers/${id}`)
  return response.data
}

// ─── Reporter Reward Ledger (Phase 4A) ─────────────────────────────────────
export const getRewardTransactions = async (params = {}) => {
  const response = await API.get('/admin/reward-transactions', { params })
  return response.data
}

export const approveRewardTransaction = async (id) => {
  const response = await API.post(`/admin/reward-transactions/${id}/approve`)
  return response.data
}

export const rejectRewardTransaction = async (id, reason) => {
  const response = await API.post(`/admin/reward-transactions/${id}/reject`, { reason })
  return response.data
}

export const createRewardAdjustment = async (sellerId, points, reason) => {
  const response = await API.post(`/admin/sellers/${sellerId}/reward-adjustment`, { points, reason })
  return response.data
}

export const getSellerRewardSummary = async (sellerId) => {
  const response = await API.get(`/admin/sellers/${sellerId}/reward-summary`)
  return response.data
}

export const getRedeemRequests = async (params = {}) => {
  const response = await API.get('/admin/redeem-requests', { params })
  return response.data
}

export const approveRedeemRequest = async (id) => {
  const response = await API.post(`/admin/redeem-requests/${id}/approve`)
  return response.data
}

export const rejectRedeemRequest = async (id, adminNote) => {
  const response = await API.post(`/admin/redeem-requests/${id}/reject`, { adminNote })
  return response.data
}

export const getRewardSettings = async () => {
  const response = await API.get('/admin/reward-settings')
  return response.data
}

export const updateRewardSettings = async (data) => {
  const response = await API.patch('/admin/reward-settings', data)
  return response.data
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────
export const getAnalyticsOverview = async () => {
  const response = await API.get('/admin/analytics/overview')
  return response.data
}

export const getConversionFunnel = async () => {
  const response = await API.get('/admin/analytics/funnel')
  return response.data
}

export const getTopSellers = async () => {
  const response = await API.get('/admin/analytics/top-sellers')
  return response.data
}

export const getTopCities = async () => {
  const response = await API.get('/admin/analytics/top-cities')
  return response.data
}

export const getSubscriptionAnalytics = async () => {
  const response = await API.get('/admin/analytics/subscriptions')
  return response.data
}

// ─── SPECIAL REQUESTS ─────────────────────────────────────────────────────
export const getSpecialRequests = async (params = {}) => {
  const response = await API.get('/admin/special-requests', { params })
  return response.data
}

export const assignSpecialRequest = async (id, sellerId) => {
  const response = await API.post(`/admin/special-requests/${id}/assign`, { sellerId })
  return response.data
}

export const approveSpecialRequest = async (id) => {
  const response = await API.post(`/admin/special-requests/${id}/approve`)
  return response.data
}

export const rejectSpecialRequest = async (id, reason) => {
  const response = await API.post(`/admin/special-requests/${id}/reject`, { reason })
  return response.data
}

// ─── Buyer DashBoard ─────────────────────────────────────────────────────

export const getBuyers = async (params = {}) => {
  const response = await API.get('/admin/buyers', { params })
  return response.data
}

// SuperAdmin-only permanent account removal (soft delete — deletedAt)
export const deleteBuyer = async (id) => {
  const response = await API.delete(`/admin/buyers/${id}`)
  return response.data
}

// ─── Report Flags (PDF 7.8) — buyer "report outdated" review queue ───────

export const getReportFlags = async (params = {}) => {
  const response = await API.get('/admin/report-flags', { params })
  return response.data
}

export const resolveReportFlag = async (id, adminNote) => {
  const response = await API.post(`/admin/report-flags/${id}/resolve`, { adminNote })
  return response.data
}

export const dismissReportFlag = async (id, adminNote) => {
  const response = await API.post(`/admin/report-flags/${id}/dismiss`, { adminNote })
  return response.data
}


// ─── Refund.jsx DashBoard ─────────────────────────────────────────────────────

export const getRefunds = async (params = {}) => {
  const response = await API.get('/admin/refunds', { params })
  return response.data
}

export const processRefund = async (id, adminNote) => {
  const response = await API.post(`/admin/refunds/${id}/process`, { adminNote })
  return response.data
}

export const rejectRefund = async (id, adminNote) => {
  const response = await API.post(`/admin/refunds/${id}/reject`, { adminNote })
  return response.data
}

// Manual refund creation (PDF 5.5) — createRefund needs a specific
// purchaseId, so searchPurchases finds one by buyer phone or listing address.
export const searchPurchases = async (params = {}) => {
  const response = await API.get('/admin/purchases', { params })
  return response.data
}

export const createRefund = async (data) => {
  const response = await API.post('/admin/refunds', data)
  return response.data
}

// ─── FINANCIAL LEDGER + PROFESSIONAL PAYOUTS (Phase 4B) ────────────────────
export const getFinancialOverview = async () => {
  const response = await API.get('/admin/finance/overview')
  return response.data
}

export const getFinancialLedger = async (params = {}) => {
  const response = await API.get('/admin/finance/ledger', { params })
  return response.data
}

export const getPayoutRecords = async (params = {}) => {
  const response = await API.get('/admin/payouts', { params })
  return response.data
}

export const processPayoutRecord = async (id) => {
  const response = await API.post(`/admin/payouts/${id}/process`)
  return response.data
}

export const resolveManualReviewPayout = async (id, action, note) => {
  const response = await API.post(`/admin/payouts/${id}/resolve`, { action, note })
  return response.data
}

export const updatePayoutEligibility = async (sellerId, data) => {
  const response = await API.patch(`/admin/sellers/${sellerId}/payout-eligibility`, data)
  return response.data
}

export const runReconciliationSweep = async () => {
  const response = await API.post('/admin/reconciliation/run')
  return response.data
}

export const getReconciliationIssues = async (params = {}) => {
  const response = await API.get('/admin/reconciliation/issues', { params })
  return response.data
}

export const resolveReconciliationIssue = async (id, resolutionNote) => {
  const response = await API.post(`/admin/reconciliation/issues/${id}/resolve`, { resolutionNote })
  return response.data
}

export const getVerificationSettings = async () => {
  const response = await API.get('/admin/verification-settings')
  return response.data
}

export const updateVerificationSettings = async (data) => {
  const response = await API.patch('/admin/verification-settings', data)
  return response.data
}

// ─── VERIFICATION MARKETPLACE — ADMIN AS PARTICIPANT ───────────────────────
// Admin competing for verification work alongside Experts (apps/api's
// adminMarketplaceRouter, /api/admin/verification-marketplace). Distinct
// from admin OVERSIGHT of the marketplace (list-all/force-cancel/claims —
// no frontend for that exists yet either, but it's a separate feature not
// covered here). A quote submitted here is a non-binding PENDING offer —
// only the buyer can accept one.
export const getVerificationMarketplace = async () => {
  const response = await API.get('/admin/verification-marketplace')
  return response.data
}

export const getMyVerificationAssignments = async () => {
  const response = await API.get('/admin/verification-marketplace/my-assignments')
  return response.data
}

export const getVerificationMarketplaceRequest = async (id) => {
  const response = await API.get(`/admin/verification-marketplace/${id}`)
  return response.data
}

export const submitVerificationQuote = async (id, data) => {
  const response = await API.post(`/admin/verification-marketplace/${id}/quote`, data)
  return response.data
}

// Buyer Verification Experience enhancement — start work / submit the
// report once this Admin is the assigned professional on a request.
export const startVerificationJob = async (id) => {
  const response = await API.post(`/admin/verification-marketplace/${id}/start`)
  return response.data
}

export const submitVerificationReport = async (id, data) => {
  const response = await API.post(`/admin/verification-marketplace/${id}/report`, data)
  return response.data
}

// Buyer<->assigned-professional conversation, scoped to one request. 403
// server-side if this Admin isn't the assignee.
export const getVerificationMessages = async (id) => {
  const response = await API.get(`/admin/verification-marketplace/${id}/messages`)
  return response.data
}

export const sendVerificationMessage = async (id, body) => {
  const response = await API.post(`/admin/verification-marketplace/${id}/messages`, { body })
  return response.data
}

// Read-only claims visibility for the assigned professional (resolving a
// claim only ever happens via the SUPER_ADMIN claims oversight page below).
export const getVerificationAssignmentClaims = async (id) => {
  const response = await API.get(`/admin/verification-marketplace/${id}/claims`)
  return response.data
}

// ─── CLAIMS — SUPER ADMIN OVERSIGHT (dispute resolution) ───────────────────
// GET is open to any admin role (server-side); resolve is SUPER_ADMIN only
// (see canResolveClaims in utils/permissions.js).
export const getClaims = async (params = {}) => {
  const response = await API.get('/admin/claims', { params })
  return response.data
}

export const resolveClaim = async (id, data) => {
  const response = await API.post(`/admin/claims/${id}/resolve`, data)
  return response.data
}

// ─── Report.jsx DashBoard ─────────────────────────────────────────────────────

export const getRevenueReport = async (params = {}) => {
  const response = await API.get('/admin/reports/revenue', { params })
  return response.data
}

export const getSettlementReport = async (params = {}) => {
  const response = await API.get('/admin/reports/settlements', { params })
  return response.data
}

export const getQCReport = async (params = {}) => {
  const response = await API.get('/admin/reports/qc', { params })
  return response.data
}

// Altr sub
export const getAlertSubs = async (params = {}) => {
  const response = await API.get('/admin/alert-subs', { params })
  return response.data
}

// audit Logs

export const getAuditLogs = async (params = {}) => {
  const response = await API.get('/admin/audit-logs', { params })
  return response.data
}

export const createAuditLog = async (action, target, details) => {
  const response = await API.post('/admin/audit-logs', { action, target, details })
  return response.data
}

// ─── Day 8 features — had no admin-facing UI at all before this ───────────

export const getSpecialRequestPayouts = async (params = {}) => {
  const response = await API.get('/admin/special-request-payouts', { params })
  return response.data
}

// ─── AI / HUMAN SUPPORT (Phase 4C) ─────────────────────────────────────────
export const getSupportKnowledge = async (params = {}) => {
  const response = await API.get('/admin/content/support-knowledge', { params })
  return response.data
}

export const upsertSupportKnowledge = async (data) => {
  const response = await API.put('/admin/content/support-knowledge', data)
  return response.data
}

export const getSupportTickets = async (params = {}) => {
  const response = await API.get('/admin/support/tickets', { params })
  return response.data
}

export const getSupportTicketDetail = async (id) => {
  const response = await API.get(`/admin/support/tickets/${id}`)
  return response.data
}

export const assignSupportTicket = async (id) => {
  const response = await API.post(`/admin/support/tickets/${id}/assign`)
  return response.data
}

export const replySupportTicket = async (id, body) => {
  const response = await API.post(`/admin/support/tickets/${id}/reply`, { body })
  return response.data
}

export const resolveSupportTicket = async (id) => {
  const response = await API.post(`/admin/support/tickets/${id}/resolve`)
  return response.data
}

export const reopenSupportTicket = async (id) => {
  const response = await API.post(`/admin/support/tickets/${id}/reopen`)
  return response.data
}

export const returnSupportTicketToAi = async (id) => {
  const response = await API.post(`/admin/support/tickets/${id}/return-to-ai`)
  return response.data
}

export const updateSupportTicketPriority = async (id, priority) => {
  const response = await API.patch(`/admin/support/tickets/${id}/priority`, { priority })
  return response.data
}

// ─── ADMIN MANAGEMENT (Super Admin CRUD) ──────────────────────────────────

export const getAdmins = async (params = {}) => {
  const response = await API.get('/admin/admins', { params })
  return response.data
}

export const createAdmin = async (data) => {
  const response = await API.post('/admin/admins', data)
  return response.data
}

export const updateAdmin = async (id, data) => {
  const response = await API.patch(`/admin/admins/${id}`, data)
  return response.data
}

export const blockAdmin = async (id) => {
  const response = await API.post(`/admin/admins/${id}/block`)
  return response.data
}

export const unblockAdmin = async (id) => {
  const response = await API.post(`/admin/admins/${id}/unblock`)
  return response.data
}

export const activateAdmin = async (id) => {
  const response = await API.post(`/admin/admins/${id}/activate`)
  return response.data
}

export const deactivateAdmin = async (id) => {
  const response = await API.post(`/admin/admins/${id}/deactivate`)
  return response.data
}

export const deleteAdmin = async (id) => {
  const response = await API.delete(`/admin/admins/${id}`)
  return response.data
}

// SuperAdmin-assisted 2FA recovery — clears another admin's TOTP enrollment
// after a lost authenticator. Never returns a secret; the target must
// re-enroll from scratch via their own Security page.
export const resetAdminTwoFactor = async (id) => {
  const response = await API.post(`/admin/admins/${id}/2fa/reset`)
  return response.data
}
