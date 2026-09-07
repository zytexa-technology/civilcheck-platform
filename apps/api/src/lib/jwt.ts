// ─────────────────────────────────────────────────────────────────────────────
// Central JWT secret — sirf yahi se import karo, har controller/middleware me
// alag se JWT_SECRET define mat karo.
//
// Purpose: agar .env me JWT_SECRET set nahi hai to app turant fail ho jaaye,
// warna insecure hardcoded fallback use ho jaata tha jo publicly known
// hai (kyunki ye code GitHub jaise jagah pe rehta hai).
// ─────────────────────────────────────────────────────────────────────────────
import type { SignOptions } from 'jsonwebtoken'
import logger from './logger.js'

const secret = process.env.JWT_SECRET

if (!secret) {
  throw new Error(
    'JWT_SECRET is not set in .env — app cannot start without it. ' +
    'Generate one (e.g. `openssl rand -hex 64`) and add it to your .env file.'
  )
}

export const JWT_SECRET = secret

// ─────────────────────────────────────────────────────────────────────────────
// Access-token expiry — sirf yahi se import karo, har jwt.sign() call me
// hardcoded '7d' mat likho.
//
// Unlike JWT_SECRET, this is not a startup-fail case: an unset/invalid value
// falls back to the existing '7d' default so local behavior never changes
// unexpectedly (same "unconfigured = safe default, with a warning" shape as
// ADMIN_SESSION_TIMEOUT_MINUTES in lib/session.ts).
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_ACCESS_TOKEN_EXPIRY = '7d'

// jsonwebtoken's `expiresIn` accepts a bare number of seconds, or a duration
// string like '7d' / '12h' / '30m' / '45s' — the same shapes documented for
// every other duration env var in this codebase.
const EXPIRY_STRING_PATTERN = /^\d+(\.\d+)?\s?(ms|s|m|h|d|w|y)$/i

// Pure resolver (no process.env read inside) so it's directly unit-testable
// without reloading this module under a different environment.
export function resolveAccessTokenExpiry(raw: string | undefined): SignOptions['expiresIn'] {
  if (!raw) return DEFAULT_ACCESS_TOKEN_EXPIRY

  if (/^\d+$/.test(raw)) return Number(raw)
  if (EXPIRY_STRING_PATTERN.test(raw)) return raw as SignOptions['expiresIn']

  logger.warn(
    `[jwt] Invalid ACCESS_TOKEN_EXPIRY="${raw}" — using default ${DEFAULT_ACCESS_TOKEN_EXPIRY}`
  )
  return DEFAULT_ACCESS_TOKEN_EXPIRY
}

export const ACCESS_TOKEN_EXPIRY = resolveAccessTokenExpiry(process.env.ACCESS_TOKEN_EXPIRY)