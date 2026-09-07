// Mirrors the backend RBAC matrix exactly (docs/roadmap.md, Day 2 section —
// "Admin RBAC matrix (verified, not inferred)"). The backend is the actual
// enforcement point (every write route checks this server-side); these
// mirror it in the UI so a role that can't perform an action never sees a
// button that would just 403.
export const ADMIN_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SUB_ADMIN: 'SUB_ADMIN',
  VIEWER: 'VIEWER',
}

// Seller KYC approve/reject/suspend/unsuspend/badge — SUPER_ADMIN only.
export function canManageSellerKyc(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}

// Listing approve/reject/spot-check — SUPER_ADMIN + SUB_ADMIN.
export function canQcListings(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN || role === ADMIN_ROLES.SUB_ADMIN
}

// Special request assign/approve/reject — SUPER_ADMIN + SUB_ADMIN.
export function canManageSpecialRequests(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN || role === ADMIN_ROLES.SUB_ADMIN
}

// Refund create/process/reject — SUPER_ADMIN only.
export function canManageRefunds(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}

// Content Control writes (categories/service-areas/disclaimers/banners) —
// SUPER_ADMIN only.
export function canManageContent(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}

// Admin management (create/edit/block/unblock/activate/deactivate/delete
// other admins) — SUPER_ADMIN only. Enforced server-side too (superOnly on
// every /admin/admins route); this just keeps the UI from offering an action
// that would 403.
export function canManageAdmins(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}

// Reporter Reward Ledger (Phase 4A) — approve/reject earn transactions,
// manual adjustments, redeem request decisions, reward rate — SUPER_ADMIN
// only, same tier as refunds/KYC.
export function canManageRewards(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}

// Financial Ledger + Professional Payouts (Phase 4B) — commission rate,
// triggering/retrying/writing-off a payout, resolving a reconciliation
// issue — SUPER_ADMIN only, enforced server-side too (superOnly on every
// mutating /admin/finance, /admin/payouts and /admin/reconciliation route).
export function canManageFinance(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}

// AI / Human Support tickets (Phase 4C) — assign/reply/resolve/reopen/
// return-to-AI/priority are SUB_ADMIN+, same tier as listing QC. Resolving a
// PAYMENT/CANCELLATION/CLAIM ticket is SUPER_ADMIN only — the server checks
// this per-ticket by category (admin.controller.ts's resolveSupportTicket),
// not by route, so canResolveSensitiveTicket exists separately.
const SENSITIVE_SUPPORT_CATEGORIES = ['PAYMENT', 'CANCELLATION', 'CLAIM']
export function canManageSupport(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN || role === ADMIN_ROLES.SUB_ADMIN
}
export function canResolveSupportTicket(role, category) {
  if (SENSITIVE_SUPPORT_CATEGORIES.includes(category)) return role === ADMIN_ROLES.SUPER_ADMIN
  return canManageSupport(role)
}

// SuperAdmin-only destructive deletes — buyer accounts, listings, properties.
// Enforced server-side too (superOnly on every /admin/buyers/:id,
// /admin/listings/:id, /admin/properties/:id DELETE route); this only keeps
// normal Admin/SUB_ADMIN/VIEWER from ever seeing the control.
export function canDeleteUsers(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}
export function canDeleteListings(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}
export function canDeleteProperties(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}
export function canDeleteReporterPosts(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}

// Verification Marketplace — Admin acting as a PARTICIPANT (browsing open
// requests, submitting a quote) — SUPER_ADMIN + SUB_ADMIN, same tier as
// listing QC / special requests. Mirrors the backend's
// requireAdminRole('SUB_ADMIN') on adminMarketplaceRouter — VIEWER stays
// read-only.
export function canParticipateInVerificationMarketplace(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN || role === ADMIN_ROLES.SUB_ADMIN
}

export function roleLabel(role) {
  return (
    { SUPER_ADMIN: 'Super Admin', SUB_ADMIN: 'Sub Admin', VIEWER: 'Viewer' }[role] || role
  )
}
