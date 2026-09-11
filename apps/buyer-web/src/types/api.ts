// ─────────────────────────────────────────────────────────────────────────────
// Response shapes for every buyer-facing endpoint in apps/api.
//
// These mirror what each controller actually passes to res.json() — NOT the
// Prisma models (see formatFreePreview / formatPaidReport in
// property.controller.ts). Enums are imported from @civilcheck/shared (the
// canonical mirror of prisma/schema.prisma) rather than re-declared locally —
// unlike apps/buyer, this is a bundled Vite app with no Metro build-step
// conflict, so importing the workspace package costs nothing.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Badge as SellerBadgeEnum,
  CaseStatus as CaseStatusEnum,
  CaseType as CaseTypeEnum,
  ClaimStatus as ClaimStatusEnum,
  PartnerRole as PartnerRoleEnum,
  Profession as ProfessionEnum,
  PropertyType as PropertyTypeEnum,
  RiskBadge as RiskBadgeEnum,
  SpecialRequestStatus as SpecialRequestStatusEnum,
  SupportMessageSender as SupportMessageSenderEnum,
  SupportTicketCategory as SupportTicketCategoryEnum,
  SupportTicketStatus as SupportTicketStatusEnum,
  VerificationRequestStatus as VerificationRequestStatusEnum,
} from '@civilcheck/shared'

export type PropertyType = PropertyTypeEnum
export type RiskBadge = RiskBadgeEnum
export type CaseType = CaseTypeEnum
export type CaseStatus = CaseStatusEnum
export type SellerBadge = SellerBadgeEnum
export type Profession = ProfessionEnum
export type PartnerRole = PartnerRoleEnum
export type SpecialRequestStatus = SpecialRequestStatusEnum
export type VerificationRequestStatus = VerificationRequestStatusEnum
export type ClaimStatus = ClaimStatusEnum
export type SupportTicketStatus = SupportTicketStatusEnum
export type SupportTicketCategory = SupportTicketCategoryEnum
export type SupportMessageSender = SupportMessageSenderEnum

// Subscription.status has no matching enum in @civilcheck/shared (the
// Prisma field is a plain string, not a Prisma enum) — apps/buyer declares
// this the same way, as a literal union mirroring subscription.service.ts.
export type SubscriptionStatus = 'CREATED' | 'ACTIVE' | 'CANCELLED' | 'HALTED' | 'COMPLETED'

export type BannerSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
export type BannerAudience = 'ALL' | 'BUYERS' | 'SELLERS' | 'ADMINS'
export type FlagStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED'

// ─── ENVELOPE ────────────────────────────────────────────────────────────────

export interface ApiEnvelope {
  success: boolean
  message?: string
}

export interface ApiErrorBody {
  success: false
  message: string
  code?: string
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

export interface LoginResponse extends ApiEnvelope {
  token: string
  user: AuthUser
}

export interface MeResponse extends ApiEnvelope {
  user: AuthUser
}

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

  uploadedBy: PartnerRole
  images: string[]
  videos: string[]
  latitude: number | null
  longitude: number | null
  mapUrl: string | null

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

  views?: never
}

export type ReportProperty = FreePreviewProperty | PaidReportProperty

export interface PropertyDetailResponse extends ApiEnvelope {
  hasPurchased: boolean
  property: ReportProperty
}

export interface PropertySearchResponse extends ApiEnvelope {
  total: number
  page: number
  totalPages: number
  results: FreePreviewProperty[]
}

export interface TrendingResponse extends ApiEnvelope {
  total: number
  results: FreePreviewProperty[]
}

// ─── Home social feed (Buyer Experience redesign) ─────────────────────────
export type FeedSourceFilter = 'EXPERT' | 'OWNER' | 'REPORTER'
export type FeedTargetType = 'LISTING' | 'PROPERTY' | 'REPORTER_POST'

export interface FeedItem {
  id: string
  source: 'EXPERT_REPORT' | 'OWNER_LISTING' | 'REPORTER_POST'
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
  likeCount: number
  saveCount: number
  commentCount: number
  isLiked: boolean
  isSaved: boolean
}

export interface FeedResponse extends ApiEnvelope {
  total: number
  results: FeedItem[]
}

export interface FeedTarget {
  targetType: FeedTargetType
  targetId: string
}

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

export interface SearchHistoryResponse extends ApiEnvelope {
  total: number
  searches: { query: string; searchedAt: string }[]
}

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
// Admin approval gates buyer visibility only — it is not presented to buyers
// as a CivilCheck "Verified" claim. No component here should render a
// verification badge/checkmark.

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

export interface CheckoutOrder {
  id: string
  amount: number
  currency: string
}

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

export interface CreatePurchaseOrderResponse extends ApiEnvelope {
  alreadyPurchased?: false
  order: CheckoutOrder
  razorpayKeyId: string | null
}

export interface AlreadyPurchasedResponse extends ApiEnvelope {
  alreadyPurchased: true
  purchase: Purchase
}

export type CreatePurchaseResponse = CreatePurchaseOrderResponse | AlreadyPurchasedResponse

export interface VerifyPurchaseResponse extends ApiEnvelope {
  alreadyPurchased: boolean
  purchase: Purchase
}

export interface ReportFlagResponse extends ApiEnvelope {
  flag: { id: string; status: FlagStatus; createdAt: string }
}

export interface ReviewResponse extends ApiEnvelope {
  review: {
    id: string
    rating: number
    comment: string | null
    createdAt: string
  }
}

// ─── ALERTS ──────────────────────────────────────────────────────────────────

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
  phone?: string
}

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

export interface Subscription {
  id: string
  kind: string
  userId: string | null
  sellerId: string | null
  listingId: string | null
  planId: string
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

// ─── VERIFICATION MARKETPLACE ─────────────────────────────────────────────────

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
  // Nullable (Phase 4A) — a DISCOVERY request has no target/uploader until
  // an Expert links a Listing; always set for LISTING/PROPERTY, unchanged.
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

  // Property Discovery flow (Step 4A/4E) — the buyer's desired location for
  // a source=DISCOVERY request (nothing exists yet to point listingId/
  // propertyId at). Always null for LISTING/PROPERTY requests.
  desiredAddress?: string | null
  desiredCity?: string | null
  desiredTehsil?: string | null
  desiredPropertyType?: string | null
  desiredKhasraOrSurvey?: string | null

  // Populated once a target exists — a DISCOVERY request gains this after
  // linkDiscoveredProperty sets listingId; LISTING/PROPERTY requests could
  // carry it from creation, once the backend selects it (see
  // verification.controller.ts's getRequestById).
  listing?: { address: string; city: string | null; tehsil: string | null; propertyType: string; latitude: number | null; longitude: number | null } | null
  property?: { title: string; address: string | null; city: string | null; tehsil: string | null; propertyType: string; latitude: number | null; longitude: number | null } | null
}

// Buyer-choice negotiation (Buyer Experience redesign) — a PENDING quote the
// buyer can compare against others on the same request, then accept one.
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
  status: ClaimStatus
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

// Buyer Verification Experience enhancement — the minimum buyer<->assigned-
// professional conversation thread (VerificationMessage, schema.prisma).
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

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────

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

// ─── AI / HUMAN SUPPORT ────────────────────────────────────────────────────

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
