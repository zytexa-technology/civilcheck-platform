// ─────────────────────────────────────────────────────────────────────────────
// Presentation helpers shared across screens.
//
// badgeFor / sellerLabel / formatDate were previously copy-pasted into six
// screens, with the copies already drifting (SearchScreen abbreviated the
// seller labels, ReportUnlockedScreen inlined raw hexes). One definition each.
// ─────────────────────────────────────────────────────────────────────────────
import { colors } from '../theme'
import type {
  RiskBadge,
  SellerBadge,
  SpecialRequestStatus,
  SubscriptionStatus,
  SupportTicketStatus,
  VerificationRequestStatus,
} from '../types/api'

export interface Tone {
  label: string
  color: string
  bg: string
  border: string
}

// ─── RISK ────────────────────────────────────────────────────────────────────

/** Compact risk chip used on cards and list rows. */
export function riskTone(badge: RiskBadge | undefined): Tone {
  switch (badge) {
    case 'RED':
      return {
        label: '🔴 Risk',
        color: colors.red,
        bg: colors.redDim,
        border: colors.redBorder,
      }
    case 'AMBER':
      return {
        label: '🟡 Caution',
        color: colors.amber,
        bg: colors.amberDim,
        border: colors.amberBorder,
      }
    case 'GREEN':
    default:
      return {
        label: '🟢 Clear',
        color: colors.green,
        bg: colors.greenDim,
        border: colors.greenBorder,
      }
  }
}

export interface RiskBannerContent extends Tone {
  icon: string
  description: string
}

/** The full-width banner at the top of a report. */
export function riskBanner(badge: RiskBadge | undefined): RiskBannerContent {
  switch (badge) {
    case 'RED':
      return {
        icon: '🔴',
        label: 'HIGH RISK',
        color: colors.red,
        bg: colors.redDim,
        border: colors.redBorder,
        description:
          'An active civil court case was found on this property. Do not buy without legal clearance.',
      }
    case 'AMBER':
      return {
        icon: '🟡',
        label: 'CAUTION',
        color: colors.amber,
        bg: colors.amberDim,
        border: colors.amberBorder,
        description:
          'Some concerns were found on this property. Review the full report before buying.',
      }
    case 'GREEN':
    default:
      return {
        icon: '🟢',
        label: 'LOW RISK',
        color: colors.green,
        bg: colors.greenDim,
        border: colors.greenBorder,
        description:
          'No active court case found in our records. Still verify independently before buying.',
      }
  }
}

// ─── SELLER ──────────────────────────────────────────────────────────────────

const SELLER_BADGE_LABELS: Record<SellerBadge, string> = {
  PLATINUM: '🏆 Platinum',
  GOLD: '🥇 Gold',
  SILVER: '🥈 Silver',
  BRONZE: '🥉 Bronze',
}

/** Short form for dense card footers — e.g. "🥇 Gold". */
export function sellerBadgeLabel(badge: SellerBadge | undefined): string {
  return badge ? SELLER_BADGE_LABELS[badge] : '✔️ Verified'
}

const SELLER_BADGE_LONG: Record<SellerBadge, string> = {
  PLATINUM: '🏆 Verified Platinum seller',
  GOLD: '🥇 Verified Gold seller',
  SILVER: '🥈 Verified Silver seller',
  BRONZE: '🥉 Verified Bronze seller',
}

/** Long form for report headers — e.g. "🥇 Verified Gold seller". */
export function sellerBadgeLong(badge: SellerBadge | undefined): string {
  return badge ? SELLER_BADGE_LONG[badge] : '✔️ Verified seller'
}

// ─── STATUS ──────────────────────────────────────────────────────────────────

export function specialRequestTone(status: SpecialRequestStatus): Tone {
  switch (status) {
    case 'PENDING':
      return {
        label: 'Pending review',
        color: colors.amber,
        bg: colors.amberDim,
        border: colors.amberBorder,
      }
    case 'ASSIGNED':
      return {
        label: 'Expert assigned',
        color: colors.violet,
        bg: colors.violetDim,
        border: colors.violetBorder,
      }
    case 'IN_PROGRESS':
      return {
        label: 'Research ongoing',
        color: colors.violet,
        bg: colors.violetDim,
        border: colors.violetBorder,
      }
    case 'COMPLETED':
      return {
        label: 'Final check',
        color: colors.blue,
        bg: colors.blueDim,
        border: colors.blueBorder,
      }
    case 'APPROVED':
      return {
        label: 'Report ready 🎉',
        color: colors.green,
        bg: colors.greenDim,
        border: colors.greenBorder,
      }
    case 'REJECTED':
      return {
        label: 'Rejected',
        color: colors.red,
        bg: colors.redDim,
        border: colors.redBorder,
      }
    case 'REFUNDED':
      return {
        label: 'Refunded',
        color: colors.green,
        bg: colors.greenDim,
        border: colors.greenBorder,
      }
  }
}

/**
 * A subscription is CREATED until Razorpay confirms the first authorization —
 * the UI must not call that "active", or a buyer whose mandate never went
 * through would believe they are covered.
 */
export function subscriptionTone(status: SubscriptionStatus): Tone {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Active',
        color: colors.green,
        bg: colors.greenDim,
        border: colors.greenBorder,
      }
    case 'CREATED':
      return {
        label: 'Awaiting authorization',
        color: colors.amber,
        bg: colors.amberDim,
        border: colors.amberBorder,
      }
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        color: colors.muted,
        bg: colors.surface2,
        border: colors.border2,
      }
    case 'HALTED':
      return {
        label: 'Halted — payment failed',
        color: colors.red,
        bg: colors.redDim,
        border: colors.redBorder,
      }
    case 'COMPLETED':
      return {
        label: 'Completed',
        color: colors.muted,
        bg: colors.surface2,
        border: colors.border2,
      }
  }
}

/** Phase 3/4C — the Verification Marketplace's buyer-facing status pill. */
export function verificationRequestTone(status: VerificationRequestStatus): Tone {
  switch (status) {
    case 'OPEN':
      return { label: 'Open for quotes', color: colors.blue, bg: colors.blueDim, border: colors.blueBorder }
    case 'ACCEPTED':
      return { label: 'Professional accepted', color: colors.violet, bg: colors.violetDim, border: colors.violetBorder }
    case 'ADVANCE_PAYMENT_PENDING':
      return { label: 'Advance payment required', color: colors.amber, bg: colors.amberDim, border: colors.amberBorder }
    case 'ADVANCE_PAID':
      return { label: 'Advance paid', color: colors.violet, bg: colors.violetDim, border: colors.violetBorder }
    case 'IN_PROGRESS':
      return { label: 'Verification in progress', color: colors.violet, bg: colors.violetDim, border: colors.violetBorder }
    case 'COMPLETED':
      return { label: 'Findings submitted', color: colors.blue, bg: colors.blueDim, border: colors.blueBorder }
    case 'FINAL_PAYMENT_PENDING':
      return { label: 'Final payment required', color: colors.amber, bg: colors.amberDim, border: colors.amberBorder }
    case 'FULLY_PAID':
      return { label: 'Fully paid', color: colors.blue, bg: colors.blueDim, border: colors.blueBorder }
    case 'REPORT_UNLOCKED':
      return { label: 'Report unlocked 🎉', color: colors.green, bg: colors.greenDim, border: colors.greenBorder }
    case 'CANCELLED':
      return { label: 'Cancelled', color: colors.muted, bg: colors.surface2, border: colors.border2 }
  }
}

/** Phase 4C — AI/human support ticket status pill. */
export function supportTicketTone(status: SupportTicketStatus): Tone {
  switch (status) {
    case 'OPEN':
      return { label: 'Open', color: colors.blue, bg: colors.blueDim, border: colors.blueBorder }
    case 'AI_ASSISTED':
      return { label: 'AI assistant replying', color: colors.violet, bg: colors.violetDim, border: colors.violetBorder }
    case 'ESCALATED':
      return { label: 'Escalated to a human', color: colors.amber, bg: colors.amberDim, border: colors.amberBorder }
    case 'ASSIGNED':
      return { label: 'With support agent', color: colors.amber, bg: colors.amberDim, border: colors.amberBorder }
    case 'IN_PROGRESS':
      return { label: 'In progress', color: colors.violet, bg: colors.violetDim, border: colors.violetBorder }
    case 'RESOLVED':
      return { label: 'Resolved', color: colors.green, bg: colors.greenDim, border: colors.greenBorder }
    case 'CLOSED':
      return { label: 'Closed', color: colors.muted, bg: colors.surface2, border: colors.border2 }
  }
}

// ─── PRIMITIVES ──────────────────────────────────────────────────────────────

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Rupees, grouped Indian-style. Input is already in rupees, not paise. */
export function formatRupees(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/** Subscription.amount and Razorpay orders are in paise. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise == null || Number.isNaN(paise)) return '—'
  return formatRupees(paise / 100)
}

/** "+91 98765 43210" when it looks like a 10-digit Indian mobile. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  return phone
}

/** Turn an enum-ish token into something readable: TITLE_DISPUTE → Title dispute. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  const lower = value.replace(/_/g, ' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** First letter for an avatar tile. */
export function initial(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed.charAt(0).toUpperCase()
  }
  return 'U'
}
