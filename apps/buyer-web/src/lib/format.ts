// ─────────────────────────────────────────────────────────────────────────────
// Presentation helpers shared across pages — ported from apps/buyer's
// src/lib/format.ts. Tone objects carry raw hex values (from theme/tokens)
// rather than CSS class names so a single Badge/RiskBanner component can
// apply them via inline style regardless of which status enum produced them.
// ─────────────────────────────────────────────────────────────────────────────
import { colors } from '../theme/tokens'
import type {
  PropertyStatus,
  DisputeType,
  SellerBadge,
  SpecialRequestStatus,
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

// Property listing alert. Derived ONLY from the declared propertyStatus (CLEAR => green,
// DISPUTED => red, with the dispute type). There is no risk badge and no yellow state; a legacy
// listing that was never classified has no status and shows as "Not classified".
const DISPUTE_LABEL: Record<string, string> = { CIVIL: 'Civil', CRIMINAL: 'Criminal', OTHER: 'Other' }
const NOT_CLASSIFIED = {
  color: colors.dim,
  bg: 'rgba(128,128,128,0.12)',
  border: 'rgba(128,128,128,0.3)',
}

export function alertTone(propertyStatus: PropertyStatus | null | undefined, disputeType?: DisputeType | null): Tone {
  if (propertyStatus === 'DISPUTED') {
    return {
      label: `🔴 Disputed${disputeType && DISPUTE_LABEL[disputeType] ? ` · ${DISPUTE_LABEL[disputeType]}` : ''}`,
      color: colors.red,
      bg: colors.redDim,
      border: colors.redBorder,
    }
  }
  if (propertyStatus === 'CLEAR') {
    return { label: '🟢 Clear', color: colors.green, bg: colors.greenDim, border: colors.greenBorder }
  }
  return { label: 'Not classified', ...NOT_CLASSIFIED }
}

export interface AlertBannerContent extends Tone {
  icon: string
  description: string
}

export function alertBanner(propertyStatus: PropertyStatus | null | undefined, disputeType?: DisputeType | null): AlertBannerContent {
  if (propertyStatus === 'DISPUTED') {
    return {
      icon: '🔴',
      label: 'DISPUTED PROPERTY',
      color: colors.red,
      bg: colors.redDim,
      border: colors.redBorder,
      description: disputeType && DISPUTE_LABEL[disputeType]
        ? `Dispute Type: ${DISPUTE_LABEL[disputeType]}. Request the Legal Report to learn exactly what the dispute is.`
        : 'This property has been declared disputed. Request the Legal Report to learn exactly what the dispute is.',
    }
  }
  if (propertyStatus === 'CLEAR') {
    return {
      icon: '🟢',
      label: 'CLEAR PROPERTY',
      color: colors.green,
      bg: colors.greenDim,
      border: colors.greenBorder,
      description: 'Declared clear by the uploader. Still verify independently before buying.',
    }
  }
  return {
    icon: '⚪',
    label: 'NOT CLASSIFIED',
    ...NOT_CLASSIFIED,
    description: 'This property was listed before Clear / Disputed classification. Verify independently before buying.',
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
  PLATINUM: '🏆 Verified Platinum partner',
  GOLD: '🥇 Verified Gold partner',
  SILVER: '🥈 Verified Silver partner',
  BRONZE: '🥉 Verified Bronze partner',
}

export function sellerBadgeLong(badge: SellerBadge | undefined): string {
  return badge ? SELLER_BADGE_LONG[badge] : '✔️ Verified partner'
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
