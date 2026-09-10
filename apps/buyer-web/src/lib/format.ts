// ─────────────────────────────────────────────────────────────────────────────
// Presentation helpers shared across pages — ported from apps/buyer's
// src/lib/format.ts. Tone objects carry raw hex values (from theme/tokens)
// rather than CSS class names so a single Badge/RiskBanner component can
// apply them via inline style regardless of which status enum produced them.
// ─────────────────────────────────────────────────────────────────────────────
import { colors } from '../theme/tokens'
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

export function riskTone(badge: RiskBadge | undefined): Tone {
  switch (badge) {
    case 'RED':
      return { label: '🔴 Risk', color: colors.red, bg: colors.redDim, border: colors.redBorder }
    case 'AMBER':
      return { label: '🟡 Caution', color: colors.amber, bg: colors.amberDim, border: colors.amberBorder }
    case 'GREEN':
    default:
      return { label: '🟢 Clear', color: colors.green, bg: colors.greenDim, border: colors.greenBorder }
  }
}

export interface RiskBannerContent extends Tone {
  icon: string
  description: string
}

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
        description: 'Some concerns were found on this property. Review the full report before buying.',
      }
    case 'GREEN':
    default:
      return {
        icon: '🟢',
        label: 'LOW RISK',
        color: colors.green,
        bg: colors.greenDim,
        border: colors.greenBorder,
        description: 'No active court case found in our records. Still verify independently before buying.',
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

export function sellerBadgeLabel(badge: SellerBadge | undefined): string {
  return badge ? SELLER_BADGE_LABELS[badge] : '✔️ Verified'
}

const SELLER_BADGE_LONG: Record<SellerBadge, string> = {
  PLATINUM: '🏆 Verified Platinum seller',
  GOLD: '🥇 Verified Gold seller',
  SILVER: '🥈 Verified Silver seller',
  BRONZE: '🥉 Verified Bronze seller',
}

export function sellerBadgeLong(badge: SellerBadge | undefined): string {
  return badge ? SELLER_BADGE_LONG[badge] : '✔️ Verified seller'
}

// ─── STATUS ──────────────────────────────────────────────────────────────────

export function specialRequestTone(status: SpecialRequestStatus): Tone {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending review', color: colors.amber, bg: colors.amberDim, border: colors.amberBorder }
    case 'ASSIGNED':
      return { label: 'Expert assigned', color: colors.violet, bg: colors.violetDim, border: colors.violetBorder }
    case 'IN_PROGRESS':
      return { label: 'Research ongoing', color: colors.violet, bg: colors.violetDim, border: colors.violetBorder }
    case 'COMPLETED':
      return { label: 'Final check', color: colors.blue, bg: colors.blueDim, border: colors.blueBorder }
    case 'APPROVED':
      return { label: 'Report ready 🎉', color: colors.green, bg: colors.greenDim, border: colors.greenBorder }
    case 'REJECTED':
      return { label: 'Rejected', color: colors.red, bg: colors.redDim, border: colors.redBorder }
    case 'REFUNDED':
      return { label: 'Refunded', color: colors.green, bg: colors.greenDim, border: colors.greenBorder }
  }
}

export function subscriptionTone(status: SubscriptionStatus): Tone {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', color: colors.green, bg: colors.greenDim, border: colors.greenBorder }
    case 'CREATED':
      return { label: 'Awaiting authorization', color: colors.amber, bg: colors.amberDim, border: colors.amberBorder }
    case 'CANCELLED':
      return { label: 'Cancelled', color: colors.muted, bg: colors.surface2, border: colors.border2 }
    case 'HALTED':
      return { label: 'Halted — payment failed', color: colors.red, bg: colors.redDim, border: colors.redBorder }
    case 'COMPLETED':
      return { label: 'Completed', color: colors.muted, bg: colors.surface2, border: colors.border2 }
  }
}

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

// ─── LOCATION ────────────────────────────────────────────────────────────────

/**
 * Google Maps search deep link — the free `maps/search` URL API, no API key
 * or paid SDK involved. Prefers exact coordinates when the property has them
 * (most accurate pin); otherwise falls back to the fullest text location on
 * record, since a property's own address/city/tehsil is always specific to
 * that property (never hardcoded here).
 */
export function buildGoogleMapsUrl(location: {
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  city?: string | null
  tehsil?: string | null
}): string | null {
  const query =
    location.latitude != null && location.longitude != null
      ? `${location.latitude},${location.longitude}`
      : location.address || [location.tehsil, location.city].filter(Boolean).join(', ') || null
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Straight-line (haversine) distance in kilometres between two coordinate
 * pairs — an approximation of actual road/travel distance, never a claim of
 * it. Returns null for any missing/invalid/out-of-range coordinate rather
 * than throwing, since both sides may come from buyer geolocation (which can
 * fail) or a property record (whose location fields are optional).
 */
export function haversineDistanceKm(
  buyerLatitude: number | null | undefined,
  buyerLongitude: number | null | undefined,
  propertyLatitude: number | null | undefined,
  propertyLongitude: number | null | undefined,
): number | null {
  if (!isValidLatLng(buyerLatitude, buyerLongitude) || !isValidLatLng(propertyLatitude, propertyLongitude)) {
    return null
  }
  // isValidLatLng is a plain runtime check (not a type predicate covering
  // all four params), so assert the now-verified values explicitly.
  const lat1 = buyerLatitude as number
  const lng1 = buyerLongitude as number
  const lat2 = propertyLatitude as number
  const lng2 = propertyLongitude as number

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

/** "650 m away" under 1 km, otherwise "4.8 km away" (whole km once ≥ 10 km). */
export function formatDistance(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null
  if (km < 1) return `${Math.round(km * 1000)} m away`
  const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km)
  return `${rounded} km away`
}

/**
 * Google Maps Directions deep link — free `maps/dir` URL API, no key. Origin
 * is included only when the buyer's own coordinates are known; otherwise
 * Google Maps itself prompts for a starting point. Destination requires real
 * coordinates (this is the "get me there" action, distinct from
 * buildGoogleMapsUrl's address-text search-pin fallback above).
 */
export function buildDirectionsUrl(
  destination: { latitude: number | null | undefined; longitude: number | null | undefined },
  origin?: { latitude: number | null | undefined; longitude: number | null | undefined } | null,
): string | null {
  if (!isValidLatLng(destination.latitude, destination.longitude)) return null
  const dest = encodeURIComponent(`${destination.latitude},${destination.longitude}`)
  if (origin && isValidLatLng(origin.latitude, origin.longitude)) {
    const orig = encodeURIComponent(`${origin.latitude},${origin.longitude}`)
    return `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}`
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`
}

// ─── PRIMITIVES ──────────────────────────────────────────────────────────────

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  return phone
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  const lower = value.replace(/_/g, ' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function initial(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed.charAt(0).toUpperCase()
  }
  return 'U'
}
