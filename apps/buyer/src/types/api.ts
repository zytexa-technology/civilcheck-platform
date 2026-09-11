// ─────────────────────────────────────────────────────────────────────────────
// Response shapes for every buyer-facing endpoint in apps/api.
//
// These mirror what each controller actually passes to res.json() — NOT the
// Prisma models. Several endpoints reshape rows before sending them (see
// formatFreePreview / formatPaidReport in property.controller.ts, or the
// per-item map in alert.controller.ts), so the wire shape and the DB shape
// differ on purpose.
//
// The enums below are re-declared rather than imported from
// @civilcheck/shared: that package is not installed into apps/buyer, and
// adding it would put a build step (shared must be compiled to dist/ before
// Metro can resolve it) in front of every `expo start`. They are type-only
// literal unions mirroring packages/shared/src/enums.ts, so they cost nothing
// at runtime. If one drifts from prisma/schema.prisma, fix it here.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export type PropertyType = 'RESIDENTIAL' | 'COMMERCIAL' | 'AGRICULTURAL' | 'PLOT'
export type RiskBadge = 'GREEN' | 'AMBER' | 'RED'
export type CaseType = 'PARTITION' | 'TITLE_DISPUTE' | 'LOAN_DEFAULT' | 'OTHER'
export type CaseStatus = 'ACTIVE' | 'DISPOSED' | 'STAYED'
export type SellerBadge = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'
export type Profession =
  | 'LAWYER'
  | 'CIVIL_ENGINEER'
  | 'TEHSIL_EXPERT'
  | 'PROPERTY_CONSULTANT'
/** Property System (Phase 2) — "Uploaded by: Owner / Reporter / Expert". */
export type PartnerRole = 'OWNER' | 'REPORTER' | 'EXPERT'

export type SpecialRequestStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REFUNDED'

export type SubscriptionStatus =
  | 'CREATED'
  | 'ACTIVE'
  | 'CANCELLED'
  | 'HALTED'
  | 'COMPLETED'

export type BannerSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
export type BannerAudience = 'ALL' | 'BUYERS' | 'SELLERS' | 'ADMINS'
export type FlagStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED'

// ─── ENVELOPE ────────────────────────────────────────────────────────────────

/** Every endpoint wraps its payload in this. Errors carry `message`. */
export interface ApiEnvelope {
  success: boolean
  message?: string
}

/** Shape of an error body. The global handler in app.ts always sends this. */
export interface ApiErrorBody {
  success: false
  message: string
  /** Present on a few auth paths — e.g. 'SESSION_EXPIRED', 'TOTP_REQUIRED', 'EMAIL_NOT_VERIFIED'. */
  code?: string
  /** Only on EMAIL_NOT_VERIFIED (loginBuyer) — lets the caller route to Verify Email without re-typing. */
  email?: string
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  phone: string
  name: string | null
  email?: string | null
  city?: string | null
  state?: string | null
  profileComplete?: boolean
}

/** POST /api/auth/login */
export interface LoginResponse extends ApiEnvelope {
  token: string
  user: AuthUser
}

/** GET /api/auth/me */
export interface MeResponse extends ApiEnvelope {
  user: AuthUser
}

/** POST /api/auth/register — email + password + mandatory phone. Logs the
 *  buyer straight in, same shape as LoginResponse. */
// Signup Email Verification — registration no longer logs the buyer straight
// in; POST /api/auth/verify-email (EmailVerifyResponse below, same shape as
// LoginResponse) is what actually issues a session, once the emailed OTP is
// confirmed.
export interface RegisterResponse extends ApiEnvelope {
  requiresVerification: true
  email: string
}

export interface EmailVerifyResponse extends ApiEnvelope {
  token: string
  user: AuthUser
}

// ─── PROPERTIES (paid listings) ──────────────────────────────────────────────

/**
 * What a buyer sees before paying — formatFreePreview() in
 * property.controller.ts. The locked fields are present but always null/empty,
 * which is what lets the UI render a redacted row rather than hide it.
 */
export interface FreePreviewProperty {
  id: string
  address: string
  city: string
  tehsil: string
  propertyType: PropertyType
  caseExists: boolean
  riskBadge: RiskBadge
  loanDefault: boolean
  price: number
  views: number
  researchDate: string
  sellerBadge?: SellerBadge
  isPaid: false

  // Property System (Phase 2) — free/public tier, same as the fields above.
  uploadedBy: PartnerRole
  images: string[]
  videos: string[]
  latitude: number | null
  longitude: number | null
  mapUrl: string | null

  // Always null/empty in this shape — unlocked by a Purchase.
  caseNumber: null
  caseType: null
  caseStatus: null
  courtName: null
  partiesInvolved: null
  lenderName: null
  documents: []
  sellerNotes: null
  sellerContact: null
}

/** The unlocked report — formatPaidReport() in property.controller.ts. */
export interface PaidReportProperty {
  id: string
  address: string
  city: string
  tehsil: string
  propertyType: PropertyType
  caseExists: boolean
  riskBadge: RiskBadge
  loanDefault: boolean
  price: number
  researchDate: string
  isPaid: true

  // Property System (Phase 2)
  uploadedBy: PartnerRole
  images: string[]
  videos: string[]
  latitude: number | null
  longitude: number | null
  mapUrl: string | null

  caseNumber: string | null
  caseType: CaseType | null
  caseStatus: CaseStatus | null
  courtName: string | null
  partiesInvolved: string | null
  lenderName: string | null
  documents: string[]
  sellerNotes: string | null
  sellerContact: string | null
  sellerName?: string
  sellerBadge?: SellerBadge
  sellerAccuracyScore?: number

  // Absent from the paid shape (formatPaidReport omits it) — declared so the
  // union stays discriminable on `isPaid` without callers reaching for `views`.
  views?: never
}

/**
 * GET /api/properties/:id returns one or the other depending on whether this
 * buyer owns a Purchase. Narrow on `hasPurchased` (or on `property.isPaid`).
 */
export type ReportProperty = FreePreviewProperty | PaidReportProperty

export interface PropertyDetailResponse extends ApiEnvelope {
  hasPurchased: boolean
  property: ReportProperty
}

/** GET /api/properties/search */
export interface PropertySearchResponse extends ApiEnvelope {
  total: number
  page: number
  totalPages: number
  results: FreePreviewProperty[]
}

/** GET /api/properties/trending — no pagination on this one. */
export interface TrendingResponse extends ApiEnvelope {
  total: number
  results: FreePreviewProperty[]
}

/** GET /api/properties/searches */
export interface SearchHistoryResponse extends ApiEnvelope {
  total: number
  searches: { query: string; searchedAt: string }[]
}

/** GET /api/properties/check — the free "case hai ya nahi" hook. */
export interface FreeCheckNotFound extends ApiEnvelope {
  found: false
  disclaimer: string
  cta: string
  cacheHit: boolean
}

export interface FreeCheckFound extends ApiEnvelope {
  found: true
  listingId: string
  caseExists: boolean
  riskBadge: RiskBadge
  loanDefault: boolean
  address: string
  city: string
  lastUpdated: string
  unlockPrice: number
  cta: string
  cacheHit: boolean
}

export type FreeCheckResponse = FreeCheckFound | FreeCheckNotFound

// ─── OWNER PROPERTIES (free, owner self-published listings) ──────────────────

/** formatOwnerProperty() in ownerProperty.controller.ts. No price — this
 *  surface is free by product decision, and owner documents are never
 *  exposed. Admin approval gates buyer visibility only — it is never
 *  presented as a CivilCheck "Verified" claim; no UI here renders a badge. */
export interface OwnerProperty {
  id: string
  title: string
  area: string
  age: string | null
  city: string | null
  tehsil: string | null
  address: string | null
  propertyType: PropertyType
  health: number
  views: number
  listedSince: string
  ownerName?: string
  ownerBadge?: SellerBadge

  // Property System (Phase 2)
  uploadedBy: PartnerRole
  images: string[]
  videos: string[]
  latitude: number | null
  longitude: number | null
  mapUrl: string | null
}

export interface OwnerPropertySearchResponse extends ApiEnvelope {
  total: number
  page: number
  totalPages: number
  results: OwnerProperty[]
}

export interface OwnerPropertyTrendingResponse extends ApiEnvelope {
  total: number
  results: OwnerProperty[]
}

export interface OwnerPropertyDetailResponse extends ApiEnvelope {
  property: OwnerProperty
}

// ─── REPORTER POSTS (property-information/news content, not a listing) ───────
// Purely informational — never carries a "Verified" badge or moderation
// status. No admin gate: published the instant the Reporter posts it.

export interface ReporterPost {
  id: string
  title: string | null
  description: string | null
  images: string[]
  sourceName: string | null
  sourceDate: string | null
  city: string | null
  tehsil: string | null
  postedAt: string
  reportedBy: string
}

export interface ReporterPostFeedResponse extends ApiEnvelope {
  total: number
  page: number
  totalPages: number
  posts: ReporterPost[]
}

export interface ReporterPostDetailResponse extends ApiEnvelope {
  post: ReporterPost
}

// ─── PAYMENTS ────────────────────────────────────────────────────────────────

/** A Razorpay order as the API hands it back. `amount` is in paise. */
export interface CheckoutOrder {
  id: string
  amount: number
  currency: string
}

/**
 * The credentials Razorpay Checkout returns on success. The API expects these
 * under their snake_case names (purchaseVerifySchema accepts the SDK's own
 * field names verbatim); api/purchase.api.ts does that renaming at the edge.
 */
export interface CheckoutResult {
  orderId: string
  paymentId: string
  signature: string
}

// ─── PURCHASES ───────────────────────────────────────────────────────────────

export interface Purchase {
  id: string
  userId: string
  listingId: string
  amountPaid: number
  platformCut: number
  sellerCut: number
  razorpayId: string
  settled: boolean
  settledAt: string | null
  createdAt: string
}

/** The trimmed listing GET /api/purchases embeds in each row. */
export interface PurchaseListing {
  id: string
  address: string
  city: string
  tehsil: string
  propertyType: PropertyType
  riskBadge: RiskBadge
  caseExists: boolean
  loanDefault: boolean
  price: number
}

export interface PurchaseWithListing extends Purchase {
  listing: PurchaseListing
}

export interface MyPurchasesResponse extends ApiEnvelope {
  total: number
  purchases: PurchaseWithListing[]
}

/**
 * POST /api/purchases. Two outcomes: an order to pay, or a report this buyer
 * already owns. Narrow on `alreadyPurchased`.
 */
export interface CreatePurchaseOrderResponse extends ApiEnvelope {
  alreadyPurchased?: false
  order: CheckoutOrder
  /** null when the API runs in mock mode — see lib/razorpay.ts. */
  razorpayKeyId: string | null
}

export interface AlreadyPurchasedResponse extends ApiEnvelope {
  alreadyPurchased: true
  purchase: Purchase
}

export type CreatePurchaseResponse =
  | CreatePurchaseOrderResponse
  | AlreadyPurchasedResponse

export interface VerifyPurchaseResponse extends ApiEnvelope {
  alreadyPurchased: boolean
  purchase: Purchase
}

/** POST /api/purchases/:id/flag */
export interface ReportFlagResponse extends ApiEnvelope {
  flag: { id: string; status: FlagStatus; createdAt: string }
}

/** POST /api/purchases/:id/review */
export interface ReviewResponse extends ApiEnvelope {
  review: {
    id: string
    rating: number
    comment: string | null
    createdAt: string
  }
}

// ─── ALERTS ──────────────────────────────────────────────────────────────────

/** The listing slice GET /api/alerts embeds. */
export interface AlertProperty {
  id: string
  address: string
  city: string
  tehsil: string
  riskBadge: RiskBadge
  caseExists: boolean
  caseStatus: CaseStatus | null
  loanDefault: boolean
  status: string
  researchDate: string
}

/** GET /api/alerts/history embeds a narrower slice — no tehsil/loanDefault. */
export interface AlertHistoryProperty {
  id: string
  address: string
  city: string
  riskBadge: RiskBadge
  caseExists: boolean
  caseStatus: CaseStatus | null
  status: string
}

export interface MyAlertsResponse extends ApiEnvelope {
  total: number
  alerts: {
    alertId: string
    subscribedAt: string
    property: AlertProperty
  }[]
}

export interface AlertHistoryResponse extends ApiEnvelope {
  total: number
  alerts: {
    alertId: string
    active: boolean
    subscribedAt: string
    property: AlertHistoryProperty
  }[]
}

export interface SubscribeAlertResponse extends ApiEnvelope {
  alertId: string
  /** Only present when a new alert is created, not on reactivation. */
  property?: { address: string; city: string; riskBadge: RiskBadge }
}

export interface PushPreferenceResponse extends ApiEnvelope {
  pushEnabled: boolean
}

// ─── SPECIAL REQUESTS ────────────────────────────────────────────────────────

export interface SpecialRequestSeller {
  name: string
  badge: SellerBadge
  profession: Profession
  /** Only included by GET /api/special-requests/:id, not the list endpoint. */
  phone?: string
}

/** A row from GET /api/special-requests (the list endpoint reshapes it). */
export interface SpecialRequestSummary {
  id: string
  address: string
  city: string
  tehsil: string
  status: SpecialRequestStatus
  advanceAmount: number
  advancePaid: boolean
  assignedTo: SpecialRequestSeller | null
  adminNote: string | null
  completedListingId: string | null
  createdAt: string
  updatedAt: string
  statusMessage: string
}

/** GET /api/special-requests/:id spreads the whole row plus statusMessage. */
export interface SpecialRequestDetail {
  id: string
  userId: string
  sellerId: string | null
  seller: SpecialRequestSeller | null
  address: string
  city: string
  tehsil: string
  propertyType: PropertyType
  questions: string
  documents: string[]
  advanceAmount: number
  advancePaid: boolean
  status: SpecialRequestStatus
  adminNote: string | null
  completedListingId: string | null
  createdAt: string
  updatedAt: string
  statusMessage: string
}

export interface MySpecialRequestsResponse extends ApiEnvelope {
  total: number
  requests: SpecialRequestSummary[]
}

export interface SpecialRequestDetailResponse extends ApiEnvelope {
  request: SpecialRequestDetail
}

export interface CreateSpecialRequestResponse extends ApiEnvelope {
  requestId: string
  order: CheckoutOrder
  razorpayKeyId: string | null
  expectedDelivery: string
  request: {
    id: string
    address: string
    city: string
    status: SpecialRequestStatus
    advanceAmount: number
    advancePaid: boolean
    createdAt: string
  }
}

export interface RetrySpecialRequestResponse extends ApiEnvelope {
  requestId: string
  order: CheckoutOrder
  razorpayKeyId: string | null
}

export interface VerifySpecialRequestResponse extends ApiEnvelope {
  alreadyProcessed: boolean
  request: SpecialRequestDetail
}

export interface SpecialRequestCreateInput {
  address: string
  city: string
  tehsil: string
  propertyType: PropertyType
  questions: string
  documents: string[]
  advanceAmount: number
}

// ─── SUBSCRIPTIONS (buyer ₹49/mo case-update alerts) ─────────────────────────

/**
 * A Subscription row as GET /api/subscriptions returns it (raw Prisma model).
 *
 * Note `status`: a freshly created subscription is CREATED, not ACTIVE. It only
 * becomes ACTIVE when Razorpay sends the authorization/charge webhook, so the
 * UI must not present a just-created subscription as live.
 */
export interface Subscription {
  id: string
  kind: string
  userId: string | null
  sellerId: string | null
  listingId: string | null
  planId: string
  /** Paise per billing cycle. */
  amount: number
  status: SubscriptionStatus
  currentEnd: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MySubscriptionsResponse extends ApiEnvelope {
  total: number
  subscriptions: Subscription[]
}

/** POST /api/subscriptions/alerts — what the client needs to authorize it. */
export interface CreateSubscriptionResponse extends ApiEnvelope {
  subscription: {
    subscriptionId: string
    planId: string
    amount: number
    keyId: string | null
  }
}

// ─── CONTENT CONTROL (public reads) ──────────────────────────────────────────

export interface ContentCategory {
  slug: string
  label: string
  description: string | null
  propertyType: PropertyType | null
}

export interface CategoriesResponse extends ApiEnvelope {
  categories: ContentCategory[]
}

export interface CoverageArea {
  state: string
  city: string
  tehsils: string[]
}

export interface CoverageResponse extends ApiEnvelope {
  total: number
  coverage: CoverageArea[]
}

export interface Banner {
  id: string
  title: string
  body: string
  severity: BannerSeverity
  audience: BannerAudience
  startsAt: string | null
  endsAt: string | null
}

export interface BannersResponse extends ApiEnvelope {
  total: number
  banners: Banner[]
}

export interface Disclaimer {
  key: string
  title: string
  body: string
  version: number
  updatedAt: string
}

export interface DisclaimerResponse extends ApiEnvelope {
  disclaimer: Disclaimer
}

// ─── PROPERTY FEED (Phase 2 backend, Phase 4C buyer UI) ──────────────────────
// Buyer Mobile Phase 2 — this type previously predated the backend's
// REPORTER_POST source (getPropertyFeed, property.controller.ts) and was
// never corrected since nothing on mobile called the endpoint. Fixed to
// match the real, already-live contract Buyer Web consumes (same endpoint):
// REPORTER_POST added, and propertyType is genuinely nullable — a Reporter
// Post has no propertyType column at all, the backend always sends null
// for one.

/** Query param the buyer sends to opt into a source; the response's own
 * per-item `source` values are the longer FeedSource tags below. */
export type FeedSourceFilter = 'EXPERT' | 'OWNER' | 'REPORTER'

export type FeedSource = 'EXPERT_REPORT' | 'OWNER_LISTING' | 'REPORTER_POST'

export interface FeedItem {
  id: string
  source: FeedSource
  title: string
  city: string | null
  tehsil: string | null
  address: string | null
  propertyType: PropertyType | null
  uploadedBy: PartnerRole
  riskBadge: RiskBadge | null
  price: number | null
  isFree: boolean
  images: string[]
  videos: string[]
  latitude: number | null
  longitude: number | null
  mapUrl: string | null
  sellerBadge: SellerBadge
  views: number
  createdAt: string
  // Buyer Mobile Phase 3 — Social Engagement. Deliberately not added in
  // Phase 2 (that phase was explicitly scoped to feed content, not
  // engagement). Matches Buyer Web's identical FeedItem fields exactly
  // (apps/buyer-web/src/types/api.ts) — always present on every item,
  // isLiked/isSaved are false for a viewer who hasn't acted on it yet.
  likeCount: number
  saveCount: number
  commentCount: number
  isLiked: boolean
  isSaved: boolean
}

// ─── SOCIAL ENGAGEMENT (Buyer Mobile Phase 3) ─────────────────────────────────
// Engagement (like/save/comment) exists ONLY on the merged Home feed
// (FeedItem/`GET /properties/feed`) in both the backend and Buyer Web — the
// dedicated Reporter Feed (`GET /reporter-posts`, ReporterPost type) and the
// Expert/Owner search+detail types (FreePreviewProperty/OwnerProperty) carry
// no engagement fields and Web's own UI never calls toggleLike/toggleSave
// from those screens either. Confirmed by reading Web's source directly
// before writing this — not assumed.
//
// FeedTargetType is a DIFFERENT union from FeedItem.source above: the
// engagement endpoints key on the underlying table name, not the feed's
// display-oriented source tag. Mapping: EXPERT_REPORT -> LISTING,
// OWNER_LISTING -> PROPERTY, REPORTER_POST -> REPORTER_POST (unchanged).
export type FeedTargetType = 'LISTING' | 'PROPERTY' | 'REPORTER_POST'

export interface LikeToggleResponse extends ApiEnvelope {
  liked: boolean
  likeCount: number
}

export interface SaveToggleResponse extends ApiEnvelope {
  saved: boolean
  saveCount: number
}

export interface FeedComment {
  id: string
  body: string
  createdAt: string
  userId: string
  userName: string
}

export interface FeedCommentsResponse extends ApiEnvelope {
  total: number
  page: number
  totalPages: number
  comments: FeedComment[]
}

export interface PostCommentResponse extends ApiEnvelope {
  comment: { id: string; body: string; createdAt: string; userId: string }
}

export interface PropertyFeedResponse extends ApiEnvelope {
  total: number
  results: FeedItem[]
}

// ─── VERIFICATION MARKETPLACE (Phase 3 backend, Phase 4C buyer UI) ───────────

export type VerificationRequestStatus =
  | 'OPEN'
  | 'ACCEPTED'
  | 'ADVANCE_PAYMENT_PENDING'
  | 'ADVANCE_PAID'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FINAL_PAYMENT_PENDING'
  | 'FULLY_PAID'
  | 'REPORT_UNLOCKED'
  | 'CANCELLED'

export interface VerificationAssignedSeller {
  name: string
  badge: SellerBadge
  profession: Profession
  accuracyScore?: number
}

export interface VerificationRequest {
  id: string
  userId: string
  source: 'LISTING' | 'PROPERTY' | 'DISCOVERY'
  listingId: string | null
  propertyId: string | null
  // Nullable (Property Discovery flow) — a DISCOVERY request has no
  // target/uploader until an Expert links a Listing; always set for
  // LISTING/PROPERTY, unchanged.
  uploaderRole: PartnerRole | null
  minFee: number
  /** The buyer's own initial offer/budget — never a payment. See createVerificationRequest. */
  buyerInitialOfferAmount: number
  status: VerificationRequestStatus
  agreedFee: number | null
  platformCommissionRate: number | null
  advanceAmount: number | null
  finalAmount: number | null
  cancelledAt: string | null
  cancellationReason: string | null
  cancellationFee: number | null
  cancellationRefund: number | null
  createdAt: string
  updatedAt: string
  acceptedQuote?: { id: string; proposedFee: number; message: string | null } | null
  assignedSeller?: VerificationAssignedSeller | null
  reportAvailable?: boolean
  report?: VerificationReport | null
  /** Only present on the list endpoint — count of PENDING quotes while OPEN. */
  pendingQuoteCount?: number

  // Property Discovery flow — the buyer's desired location for a
  // source=DISCOVERY request (nothing exists yet to point listingId/
  // propertyId at). Always null for LISTING/PROPERTY requests.
  desiredAddress?: string | null
  desiredCity?: string | null
  desiredTehsil?: string | null
  desiredPropertyType?: string | null
  desiredKhasraOrSurvey?: string | null

  // Populated once a target exists — a DISCOVERY request gains this after an
  // Expert links a real Listing.
  listing?: { address: string; city: string | null; tehsil: string | null; propertyType: string; latitude: number | null; longitude: number | null } | null
  property?: { title: string; address: string | null; city: string | null; tehsil: string | null; propertyType: string; latitude: number | null; longitude: number | null } | null
}

// Buyer-choice negotiation — a PENDING quote the buyer can compare against
// others on the same request, then accept one.
export interface VerificationQuote {
  id: string
  requestId: string
  proposedFee: number
  message: string | null
  status: 'PENDING' | 'ACCEPTED' | 'CLOSED'
  createdAt: string
  quotedBySeller: { name: string; badge: SellerBadge; profession: Profession } | null
}

export interface VerificationQuotesResponse extends ApiEnvelope {
  total: number
  quotes: VerificationQuote[]
}

export interface AcceptQuoteResponse extends ApiEnvelope {
  request: VerificationRequest
  quote: VerificationQuote
}

export interface VerificationReport {
  id: string
  findings: string
  riskAssessment: RiskBadge | null
  documents: string[]
  images: string[]
  videos: string[]
  submittedAt: string
}

export interface VerificationMarketplaceConfigResponse extends ApiEnvelope {
  minVerificationFee: number
}

export interface CreateVerificationRequestResponse extends ApiEnvelope {
  request: VerificationRequest
}

export interface MyVerificationRequestsResponse extends ApiEnvelope {
  total: number
  requests: VerificationRequest[]
}

export interface VerificationRequestDetailResponse extends ApiEnvelope {
  request: VerificationRequest
}

export interface VerificationOrderResponse extends ApiEnvelope {
  order: CheckoutOrder
  razorpayKeyId: string | null
}

export interface VerificationVerifyResponse extends ApiEnvelope {
  alreadyProcessed: boolean
  request: VerificationRequest
}

export interface VerificationReportResponse extends ApiEnvelope {
  report: VerificationReport
}

export interface VerificationCancelResponse extends ApiEnvelope {
  request: VerificationRequest
  paidAmount: number
  cancellationFee: number
  refundAmount: number
}

export interface Claim {
  id: string
  verificationRequestId: string
  userId: string
  reason: string
  description: string
  evidence: string[]
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED' | 'REFUND_APPROVED' | 'REFUND_PROCESSED'
  resolutionNote: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateClaimResponse extends ApiEnvelope {
  claim: Claim
}

export interface MyClaimsResponse extends ApiEnvelope {
  total: number
  claims: Claim[]
}

// Buyer<->assigned-professional conversation thread (VerificationMessage,
// schema.prisma) — the minimum conversation capability, scoped to one
// VerificationRequest, opened only once assignedSeller is set.
export interface VerificationMessage {
  id: string
  verificationRequestId: string
  senderRole: 'BUYER' | 'PROFESSIONAL'
  senderUserId: string | null
  senderSellerId: string | null
  senderAdminId: string | null
  body: string
  createdAt: string
}

export interface VerificationMessagesResponse extends ApiEnvelope {
  total: number
  messages: VerificationMessage[]
}

// Not extending ApiEnvelope: its optional `message?: string` (the general
// error-message field every envelope carries) would collide with this
// endpoint's own `message: VerificationMessage` field.
export interface SendVerificationMessageResponse {
  success: boolean
  message: VerificationMessage
}

// ─── NOTIFICATIONS (Phase 4C) ─────────────────────────────────────────────────

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export interface MyNotificationsResponse extends ApiEnvelope {
  notifications: AppNotification[]
  unreadCount: number
}

// ─── AI / HUMAN SUPPORT (Phase 4C) ────────────────────────────────────────────

export type SupportTicketStatus =
  | 'OPEN'
  | 'AI_ASSISTED'
  | 'ESCALATED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'

export type SupportTicketCategory =
  | 'ACCOUNT'
  | 'PROPERTY'
  | 'VERIFICATION'
  | 'PAYMENT'
  | 'CANCELLATION'
  | 'CLAIM'
  | 'PLATFORM'
  | 'OTHER'

export type SupportMessageSender = 'USER' | 'AI' | 'ADMIN' | 'SYSTEM'

export interface SupportTicket {
  id: string
  category: SupportTicketCategory
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  status: SupportTicketStatus
  subject: string
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface SupportMessage {
  id: string
  ticketId: string
  sender: SupportMessageSender
  body: string
  attachments: string[]
  createdAt: string
}

export interface CreateSupportTicketResponse extends ApiEnvelope {
  ticket: SupportTicket
}

export interface MySupportTicketsResponse extends ApiEnvelope {
  total: number
  tickets: SupportTicket[]
}

export interface SupportTicketDetailResponse extends ApiEnvelope {
  ticket: SupportTicket
  messages: SupportMessage[]
}

export interface PostSupportMessageResponse extends ApiEnvelope {
  ticket: SupportTicket
}
