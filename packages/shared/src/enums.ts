// Shared enums for CivilCheck — mirrors prisma/schema.prisma (apps/api).
// Pure TypeScript: safe to import from the API, Next.js panels, and the React Native app.

export const AdminRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SUB_ADMIN: 'SUB_ADMIN',
  VIEWER: 'VIEWER',
} as const
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole]

export const PartnerRole = {
  OWNER: 'OWNER',
  REPORTER: 'REPORTER',
  EXPERT: 'EXPERT',
} as const
export type PartnerRole = (typeof PartnerRole)[keyof typeof PartnerRole]

export const Profession = {
  LAWYER: 'LAWYER',
  CIVIL_ENGINEER: 'CIVIL_ENGINEER',
  TEHSIL_EXPERT: 'TEHSIL_EXPERT',
  PROPERTY_CONSULTANT: 'PROPERTY_CONSULTANT',
} as const
export type Profession = (typeof Profession)[keyof typeof Profession]

export const Badge = {
  BRONZE: 'BRONZE',
  SILVER: 'SILVER',
  GOLD: 'GOLD',
  PLATINUM: 'PLATINUM',
} as const
export type Badge = (typeof Badge)[keyof typeof Badge]

export const KycStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus]

// Manual identity-document review (replaces DigiLocker OAuth) — independent
// of KycStatus above. See schema.prisma's Seller.identityVerificationStatus.
export const IdentityVerificationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const
export type IdentityVerificationStatus =
  (typeof IdentityVerificationStatus)[keyof typeof IdentityVerificationStatus]

export const PropertyType = {
  RESIDENTIAL: 'RESIDENTIAL',
  COMMERCIAL: 'COMMERCIAL',
  AGRICULTURAL: 'AGRICULTURAL',
  PLOT: 'PLOT',
} as const
export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType]

export const CaseType = {
  PARTITION: 'PARTITION',
  TITLE_DISPUTE: 'TITLE_DISPUTE',
  LOAN_DEFAULT: 'LOAN_DEFAULT',
  OTHER: 'OTHER',
} as const
export type CaseType = (typeof CaseType)[keyof typeof CaseType]

export const CaseStatus = {
  ACTIVE: 'ACTIVE',
  DISPOSED: 'DISPOSED',
  STAYED: 'STAYED',
} as const
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus]

export const RiskBadge = {
  GREEN: 'GREEN',
  AMBER: 'AMBER',
  RED: 'RED',
} as const
export type RiskBadge = (typeof RiskBadge)[keyof typeof RiskBadge]

export const ListingStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  UNPUBLISHED: 'UNPUBLISHED',
} as const
export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus]

export const SpotCheckResult = {
  PASS: 'PASS',
  FAIL: 'FAIL',
} as const
export type SpotCheckResult = (typeof SpotCheckResult)[keyof typeof SpotCheckResult]

export const SpecialRequestStatus = {
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
} as const
export type SpecialRequestStatus = (typeof SpecialRequestStatus)[keyof typeof SpecialRequestStatus]

export const RefundStatus = {
  PENDING: 'PENDING',
  PROCESSED: 'PROCESSED',
  REJECTED: 'REJECTED',
} as const
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus]

export const FlagStatus = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const
export type FlagStatus = (typeof FlagStatus)[keyof typeof FlagStatus]

export const BannerAudience = {
  ALL: 'ALL',
  BUYERS: 'BUYERS',
  SELLERS: 'SELLERS',
  ADMINS: 'ADMINS',
} as const
export type BannerAudience = (typeof BannerAudience)[keyof typeof BannerAudience]

export const BannerSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const
export type BannerSeverity = (typeof BannerSeverity)[keyof typeof BannerSeverity]

export const PropertyStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DELETED: 'DELETED',
  // Reporter moderation (Phase 4A) — see schema.prisma's PropertyStatus comment.
  SUSPENDED: 'SUSPENDED',
} as const
export type PropertyStatus = (typeof PropertyStatus)[keyof typeof PropertyStatus]

// ─── VERIFICATION MARKETPLACE (Phase 3) ──────────────────────────────────────

export const VerificationSource = {
  LISTING: 'LISTING',
  PROPERTY: 'PROPERTY',
  // Property Discovery flow (Step 4A/4B) — the buyer wants a property that
  // does not exist on CivilCheck yet. See schema.prisma's VerificationRequest
  // comment for the full design.
  DISCOVERY: 'DISCOVERY',
} as const
export type VerificationSource = (typeof VerificationSource)[keyof typeof VerificationSource]

export const VerificationRequestStatus = {
  OPEN: 'OPEN',
  ACCEPTED: 'ACCEPTED',
  ADVANCE_PAYMENT_PENDING: 'ADVANCE_PAYMENT_PENDING',
  ADVANCE_PAID: 'ADVANCE_PAID',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FINAL_PAYMENT_PENDING: 'FINAL_PAYMENT_PENDING',
  FULLY_PAID: 'FULLY_PAID',
  REPORT_UNLOCKED: 'REPORT_UNLOCKED',
  CANCELLED: 'CANCELLED',
} as const
export type VerificationRequestStatus =
  (typeof VerificationRequestStatus)[keyof typeof VerificationRequestStatus]

export const VerificationQuoteStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  CLOSED: 'CLOSED',
} as const
export type VerificationQuoteStatus = (typeof VerificationQuoteStatus)[keyof typeof VerificationQuoteStatus]

export const ClaimStatus = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED',
  REFUND_APPROVED: 'REFUND_APPROVED',
  REFUND_PROCESSED: 'REFUND_PROCESSED',
} as const
export type ClaimStatus = (typeof ClaimStatus)[keyof typeof ClaimStatus]

// ─── REPORTER REWARD LEDGER (Phase 4A) ───────────────────────────────────────

export const RewardTransactionType = {
  EARNED: 'EARNED',
  ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
  REDEMPTION: 'REDEMPTION',
} as const
export type RewardTransactionType = (typeof RewardTransactionType)[keyof typeof RewardTransactionType]

export const RewardTransactionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const
export type RewardTransactionStatus =
  (typeof RewardTransactionStatus)[keyof typeof RewardTransactionStatus]

export const RedeemRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const
export type RedeemRequestStatus = (typeof RedeemRequestStatus)[keyof typeof RedeemRequestStatus]

// ─── FINANCIAL LEDGER + PROFESSIONAL PAYOUTS (Phase 4B) ──────────────────────

export const PayoutEligibilityStatus = {
  PENDING_ONBOARDING: 'PENDING_ONBOARDING',
  ELIGIBLE: 'ELIGIBLE',
  INELIGIBLE: 'INELIGIBLE',
  SUSPENDED: 'SUSPENDED',
} as const
export type PayoutEligibilityStatus = (typeof PayoutEligibilityStatus)[keyof typeof PayoutEligibilityStatus]

export const ProfessionalEarningStatus = {
  EARNED: 'EARNED',
  PENDING_SETTLEMENT: 'PENDING_SETTLEMENT',
  AVAILABLE_FOR_PAYOUT: 'AVAILABLE_FOR_PAYOUT',
  PAYOUT_REQUESTED: 'PAYOUT_REQUESTED',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  RETRYABLE: 'RETRYABLE',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  REVERSED: 'REVERSED',
} as const
export type ProfessionalEarningStatus =
  (typeof ProfessionalEarningStatus)[keyof typeof ProfessionalEarningStatus]

export const PayoutRecordStatus = {
  PAYOUT_REQUESTED: 'PAYOUT_REQUESTED',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  RETRYABLE: 'RETRYABLE',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  REVERSED: 'REVERSED',
} as const
export type PayoutRecordStatus = (typeof PayoutRecordStatus)[keyof typeof PayoutRecordStatus]

export const LedgerEntryType = {
  GROSS_PAYMENT: 'GROSS_PAYMENT',
  PLATFORM_COMMISSION: 'PLATFORM_COMMISSION',
  PROFESSIONAL_EARNING: 'PROFESSIONAL_EARNING',
  PROCESSING_FEE: 'PROCESSING_FEE',
  CANCELLATION_FEE: 'CANCELLATION_FEE',
  REFUND: 'REFUND',
  REVERSAL_COMMISSION: 'REVERSAL_COMMISSION',
  REVERSAL_EARNING: 'REVERSAL_EARNING',
} as const
export type LedgerEntryType = (typeof LedgerEntryType)[keyof typeof LedgerEntryType]

export const ReconciliationIssueStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
} as const
export type ReconciliationIssueStatus =
  (typeof ReconciliationIssueStatus)[keyof typeof ReconciliationIssueStatus]

// ─── AI / HUMAN CUSTOMER SUPPORT (Phase 4C) ──────────────────────────────────

export const SupportTicketStatus = {
  OPEN: 'OPEN',
  AI_ASSISTED: 'AI_ASSISTED',
  ESCALATED: 'ESCALATED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const
export type SupportTicketStatus = (typeof SupportTicketStatus)[keyof typeof SupportTicketStatus]

export const SupportTicketPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const
export type SupportTicketPriority = (typeof SupportTicketPriority)[keyof typeof SupportTicketPriority]

export const SupportTicketCategory = {
  ACCOUNT: 'ACCOUNT',
  PROPERTY: 'PROPERTY',
  VERIFICATION: 'VERIFICATION',
  PAYMENT: 'PAYMENT',
  CANCELLATION: 'CANCELLATION',
  CLAIM: 'CLAIM',
  PLATFORM: 'PLATFORM',
  OTHER: 'OTHER',
} as const
export type SupportTicketCategory = (typeof SupportTicketCategory)[keyof typeof SupportTicketCategory]

export const SupportMessageSender = {
  USER: 'USER',
  AI: 'AI',
  ADMIN: 'ADMIN',
  SYSTEM: 'SYSTEM',
} as const
export type SupportMessageSender = (typeof SupportMessageSender)[keyof typeof SupportMessageSender]
