import API from './axios'

// ─── PROFILE & KYC ────────────────────────────────────────────────────────
export const getSellerProfile = async () => {
  const response = await API.get('/seller/profile')
  return response.data
}

export const updateSellerProfile = async (data) => {
  const response = await API.patch('/seller/profile', data)
  return response.data
}

export const getMyReviews = async (params = {}) => {
  const response = await API.get('/seller/reviews', { params })
  return response.data
}

export const getKycStatus = async () => {
  const response = await API.get('/seller/kyc/status')
  return response.data
}

// selfieUrl is optional in kycUploadSchema — send it only when we have one,
// since an empty string would fail the z.url() check.
export const uploadCertificate = async (certificateUrl, selfieUrl) => {
  const body = { certificateUrl }
  if (selfieUrl) body.selfieUrl = selfieUrl
  const response = await API.post('/seller/kyc/certificate', body)
  return response.data
}

// Cloudinary signed direct upload — the file goes browser → Cloudinary and
// never touches our API. purpose only picks the folder; allowed formats and
// max size are baked into the signature server-side.
export const getUploadSignature = async (purpose) => {
  const response = await API.get('/seller/uploads/signature', { params: { purpose } })
  return response.data
}

// Identity document upload — manual admin review. Status is always set to
// PENDING server-side; there is no way to pass a status from here.
export const uploadIdentityDocument = async (documentUrl) => {
  const response = await API.post('/seller/kyc/identity-document', { documentUrl })
  return response.data
}

// KYC document security hardening — certificate/selfie/identity-document are
// now `type: authenticated` in Cloudinary; the raw stored URL 401s on its
// own. Call this to mint a fresh, short-lived signed URL right before
// opening it. field: 'certificate' | 'selfie' | 'identity-document'
export const getKycDocumentSignedUrl = async (field) => {
  const response = await API.get(`/seller/kyc/documents/${field}/signed-url`)
  return response.data
}

// ─── FEATURED-LISTING SUBSCRIPTION (₹499/mo) ──────────────────────────────
// Razorpay *subscriptions*, not one-off orders: creation returns a mandate to
// authorize, and the row only goes ACTIVE when Razorpay's webhook confirms the
// charge. There is deliberately no client-side "verify" call to make here.
export const createFeaturedSubscription = async (listingId) => {
  const response = await API.post('/seller/subscriptions/featured', { listingId })
  return response.data
}

export const getMySubscriptions = async () => {
  const response = await API.get('/seller/subscriptions')
  return response.data
}

export const cancelSubscription = async (id) => {
  const response = await API.post(`/seller/subscriptions/${id}/cancel`)
  return response.data
}

// ─── LISTINGS ─────────────────────────────────────────────────────────────
export const getMyListings = async (params = {}) => {
  const response = await API.get('/seller/listings', { params })
  return response.data
}

export const getSingleListing = async (id) => {
  const response = await API.get(`/seller/listings/${id}`)
  return response.data
}

export const createListing = async (data) => {
  const response = await API.post('/seller/listings', data)
  return response.data
}

export const updateListing = async (id, data) => {
  const response = await API.put(`/seller/listings/${id}`, data)
  return response.data
}

export const deleteListing = async (id) => {
  const response = await API.delete(`/seller/listings/${id}`)
  return response.data
}

// ─── OWNER PROPERTIES (naya) ──────────────────────────────────────────────
export const getMyProperties = async (params = {}) => {
  const response = await API.get('/seller/properties', { params })
  return response.data
}

export const getSingleProperty = async (id) => {
  const response = await API.get(`/seller/properties/${id}`)
  return response.data
}

export const createProperty = async (data) => {
  const response = await API.post('/seller/properties', data)
  return response.data
}

export const updateProperty = async (id, data) => {
  const response = await API.put(`/seller/properties/${id}`, data)
  return response.data
}

export const deleteProperty = async (id) => {
  const response = await API.delete(`/seller/properties/${id}`)
  return response.data
}

// ─── REPORTER POSTS (property-information/news content, not a listing) ───
export const getMyReporterPosts = async (params = {}) => {
  const response = await API.get('/seller/reporter-posts', { params })
  return response.data
}

export const getSingleReporterPost = async (id) => {
  const response = await API.get(`/seller/reporter-posts/${id}`)
  return response.data
}

export const createReporterPost = async (data) => {
  const response = await API.post('/seller/reporter-posts', data)
  return response.data
}

export const updateReporterPost = async (id, data) => {
  const response = await API.patch(`/seller/reporter-posts/${id}`, data)
  return response.data
}

export const deleteReporterPost = async (id) => {
  const response = await API.delete(`/seller/reporter-posts/${id}`)
  return response.data
}

// ─── REPORTER REWARD LEDGER (Phase 4A) ────────────────────────────────────
export const getRewardSummary = async () => {
  const response = await API.get('/seller/reporter/rewards/summary')
  return response.data
}

export const getRewardTransactions = async (params = {}) => {
  const response = await API.get('/seller/reporter/rewards/transactions', { params })
  return response.data
}

export const getMyRedeemRequests = async (params = {}) => {
  const response = await API.get('/seller/reporter/rewards/redeem', { params })
  return response.data
}

export const createRedeemRequest = async (data) => {
  const response = await API.post('/seller/reporter/rewards/redeem', data)
  return response.data
}

// ─── VERIFICATION MARKETPLACE — REQUESTS (browse/quote/report) ────────────
// The Expert's professional-participant side of the Property Verification
// Marketplace (apps/api's verification.routes.ts expertVerificationRouter).
// A quote submitted here is a non-binding PENDING offer — the buyer alone
// picks a winner (Buyer Web); nothing here can accept/lock a request.
export const getVerificationMarketplace = async () => {
  const response = await API.get('/seller/verification-marketplace')
  return response.data
}

export const getMyVerificationAssignments = async () => {
  const response = await API.get('/seller/verification-marketplace/my-assignments')
  return response.data
}

export const getVerificationMarketplaceRequest = async (id) => {
  const response = await API.get(`/seller/verification-marketplace/${id}`)
  return response.data
}

export const submitVerificationQuote = async (id, data) => {
  const response = await API.post(`/seller/verification-marketplace/${id}/quote`, data)
  return response.data
}

export const startVerificationJob = async (id) => {
  const response = await API.post(`/seller/verification-marketplace/${id}/start`)
  return response.data
}

// Property Discovery flow (Phase 4B/4C) — links a Listing the Expert already
// created (via the existing createListing flow) onto their accepted
// source=DISCOVERY request. Expert-only; the assignment/role/KYC/ownership/
// location/request-state checks all live server-side in
// verification.service.ts's linkDiscoveredProperty — this is a thin client
// call, same shape as every other function in this file.
export const linkDiscoveredListing = async (id, listingId) => {
  const response = await API.post(`/seller/verification-marketplace/${id}/discovered-listing`, { listingId })
  return response.data
}

export const submitVerificationReport = async (id, data) => {
  const response = await API.post(`/seller/verification-marketplace/${id}/report`, data)
  return response.data
}

// ─── VERIFICATION MARKETPLACE EARNINGS + PAYOUTS (Phase 4B) ───────────────
// Distinct from the Report-Unlock earnings below — a different money system
// (Verification Marketplace, Phase 3) with its own financial ledger.
export const getVerificationEarningsSummary = async () => {
  const response = await API.get('/seller/verification-marketplace/earnings/summary')
  return response.data
}

export const getVerificationEarningsTransactions = async (params = {}) => {
  const response = await API.get('/seller/verification-marketplace/earnings/transactions', { params })
  return response.data
}

export const getVerificationPayoutProfile = async () => {
  const response = await API.get('/seller/verification-marketplace/payout-profile')
  return response.data
}

export const getMyVerificationPayouts = async () => {
  const response = await API.get('/seller/verification-marketplace/payouts')
  return response.data
}

export const requestVerificationPayout = async () => {
  const response = await API.post('/seller/verification-marketplace/payouts')
  return response.data
}

// ─── EARNINGS ─────────────────────────────────────────────────────────────
export const getEarningsOverview = async () => {
  const response = await API.get('/seller/earnings')
  return response.data
}

export const getTransactions = async (params = {}) => {
  const response = await API.get('/seller/earnings/transactions', { params })
  return response.data
}

export const getEarningsStatement = async (params = {}) => {
  const response = await API.get('/seller/earnings/statement', { params })
  return response.data
}

// The PDF route streams a real application/pdf body, so it needs a blob
// response — the default JSON transform would corrupt it. Returns an object
// URL the caller is responsible for revoking.
export const downloadEarningsStatementPdf = async (params = {}) => {
  const response = await API.get('/seller/earnings/statement/pdf', {
    params,
    responseType: 'blob',
  })
  return response.data
}

// ─── SETTLEMENTS ──────────────────────────────────────────────────────────
export const getSettlements = async () => {
  const response = await API.get('/seller/earnings/settlements')
  return response.data
}

export const getPendingSettlement = async () => {
  const response = await API.get('/seller/earnings/settlements/pending')
  return response.data
}

// ─── SPECIAL REQUESTS ─────────────────────────────────────────────────────
export const getAvailableRequests = async () => {
  const response = await API.get('/seller/special-requests/available')
  return response.data
}

// Full history — all statuses (ASSIGNED/IN_PROGRESS/COMPLETED/APPROVED/
// REJECTED/REFUNDED), unlike getAvailableRequests above which only ever
// returns ASSIGNED/IN_PROGRESS.
export const getMySpecialRequests = async () => {
  const response = await API.get('/seller/special-requests')
  return response.data
}

export const acceptRequest = async (id) => {
  const response = await API.post(`/seller/special-requests/${id}/accept`)
  return response.data
}

export const declineRequest = async (id, reason) => {
  const response = await API.post(`/seller/special-requests/${id}/decline`, { reason })
  return response.data
}

export const submitRequest = async (id, listingId) => {
  const response = await API.post(`/seller/special-requests/${id}/submit`, { listingId })
  return response.data
}

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────
export const getNotifications = async () => {
  const response = await API.get('/seller/notifications')
  return response.data
}

export const markNotificationRead = async (id) => {
  const response = await API.post(`/seller/notifications/${id}/read`)
  return response.data
}

export const markAllNotificationsRead = async () => {
  const response = await API.post('/seller/notifications/mark-all-read')
  return response.data
}