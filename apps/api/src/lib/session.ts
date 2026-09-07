// ─────────────────────────────────────────────────────────────────────────────
// Admin session policy (PDF 5.1) — 30-minute inactivity timeout.
//
// Admin JWTs live for 7 days, so the token alone cannot express "idle too
// long". We track lastActivityAt per admin in Postgres and reject requests
// once the idle gap exceeds the timeout. Logout clears the stamp, which kills
// the session server-side even though the JWT is still cryptographically valid.
// ─────────────────────────────────────────────────────────────────────────────
import logger from './logger.js'

const DEFAULT_TIMEOUT_MINUTES = 30

function readTimeoutMinutes(): number {
  const raw = process.env.ADMIN_SESSION_TIMEOUT_MINUTES
  if (!raw) return DEFAULT_TIMEOUT_MINUTES

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(
      `[session] Invalid ADMIN_SESSION_TIMEOUT_MINUTES="${raw}" — using ${DEFAULT_TIMEOUT_MINUTES} minutes`
    )
    return DEFAULT_TIMEOUT_MINUTES
  }
  return parsed
}

export const ADMIN_IDLE_TIMEOUT_MS = readTimeoutMinutes() * 60 * 1000

// Postgres write on EVERY admin request would be wasteful (Neon serverless),
// so the stamp is refreshed at most once a minute. Trade-off: the effective
// timeout is accurate to within one minute.
export const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000

// null → no active session (never logged in, logged out, or expired earlier)
export function isAdminSessionExpired(lastActivityAt: Date | null, now: number = Date.now()): boolean {
  if (lastActivityAt === null) return true
  return now - lastActivityAt.getTime() > ADMIN_IDLE_TIMEOUT_MS
}

// null yahan tak pahunchta hi nahi (expired check use pehle reject kar deta
// hai) — par signature null-tolerant rakhna caller ko narrowing se bachata hai.
export function shouldRefreshActivity(
  lastActivityAt: Date | null,
  now: number = Date.now()
): boolean {
  if (lastActivityAt === null) return false
  return now - lastActivityAt.getTime() > ACTIVITY_WRITE_THROTTLE_MS
}

// ─────────────────────────────────────────────────────────────────────────────
// 2FA enrollment grace period (Day 2 carry-over #4) — default OFF.
//
// The three seeded demo admins (and the Jest suite's loginAdmin fixture) all
// rely on non-2FA-enrolled admin login working today, and are already long
// past any reasonable grace window. Enforcing this unconditionally would lock
// them out and break the integration suite the moment it ships — so it's
// gated behind ADMIN_2FA_ENFORCE_GRACE_PERIOD, same "unconfigured = no-op"
// shape as every other optional adapter in this codebase. Flip it on once
// real admins exist and 2FA rollout is a deliberate choice.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_2FA_GRACE_PERIOD_DAYS = 7

function readGracePeriodDays(): number {
  const raw = process.env.ADMIN_2FA_GRACE_PERIOD_DAYS
  if (!raw) return DEFAULT_2FA_GRACE_PERIOD_DAYS

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(
      `[session] Invalid ADMIN_2FA_GRACE_PERIOD_DAYS="${raw}" — using ${DEFAULT_2FA_GRACE_PERIOD_DAYS} days`
    )
    return DEFAULT_2FA_GRACE_PERIOD_DAYS
  }
  return parsed
}

export const TWO_FACTOR_GRACE_PERIOD_MS = readGracePeriodDays() * 24 * 60 * 60 * 1000

export function isTwoFactorEnrollmentOverdue(
  admin: { twoFactorEnabled: boolean; createdAt: Date },
  now: number = Date.now()
): boolean {
  if (process.env.ADMIN_2FA_ENFORCE_GRACE_PERIOD !== 'true') return false
  if (admin.twoFactorEnabled) return false
  return now - admin.createdAt.getTime() > TWO_FACTOR_GRACE_PERIOD_MS
}
