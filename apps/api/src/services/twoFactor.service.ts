// ─────────────────────────────────────────────────────────────────────────────
// Admin 2FA (PDF 5.1) — TOTP, compatible with Google Authenticator, Authy and
// every other RFC 6238 app.
//
// Enrollment is deliberately two-step:
//   1. /2fa/setup  writes a secret but leaves twoFactorEnabled = false
//   2. /2fa/enable verifies a live code, then flips the flag
// An abandoned step 1 therefore changes nothing about how the admin logs in —
// a half-finished enrollment can never lock anyone out.
//
// The QR code itself is NOT rendered here. The server hands back the standard
// otpauth:// URI and the panel draws it: shipping an image from the API would
// mean a second dependency and a secret travelling as a bitmap through logs
// and proxies that mishandle it.
//
// otplib v13 is a functional API — no `authenticator` singleton, and verify()
// is async because the default crypto plugin has no synchronous HMAC path.
// ─────────────────────────────────────────────────────────────────────────────
import { generateSecret as otpGenerateSecret, generateURI, verify } from 'otplib'
import logger from '../lib/logger.js'

// Accept codes one 30-second step either side of now, covering ordinary clock
// drift between the admin's phone and the server. Widening this materially
// weakens the factor — a stolen code stays usable for longer.
const EPOCH_TOLERANCE_SECONDS = 30

// Shown as the account issuer in the authenticator app.
const ISSUER = process.env.TOTP_ISSUER || 'CivilCheck Admin'

export function generateSecret(): string {
  return otpGenerateSecret()
}

// otpauth://totp/CivilCheck%20Admin:admin@x.in?secret=…&issuer=CivilCheck%20Admin
export function buildOtpAuthUri(accountEmail: string, secret: string): string {
  return generateURI({ strategy: 'totp', issuer: ISSUER, label: accountEmail, secret })
}

export interface TotpCheck {
  valid: boolean
  // The RFC 6238 time step the code matched at — present only on success.
  // Persist it as Admin.lastTotpStep and pass it back as `afterTimeStep` to
  // refuse the same code (and any earlier step) on the next verification.
  timeStep?: number
}

// Never throws — returns { valid: false } for a missing secret/token, an
// undecodable Base32 secret (otplib raises on that), or a replayed code. When
// `afterTimeStep` is supplied, otplib rejects any code whose step is <= it,
// closing the ±30s replay window.
export async function verifyTotp(
  secret: string | null,
  token: string | undefined,
  afterTimeStep?: number | null
): Promise<TotpCheck> {
  if (!secret || !token) return { valid: false }

  try {
    const result = await verify({
      secret,
      token,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
      ...(afterTimeStep != null ? { afterTimeStep } : {}),
    })
    if (!result.valid) return { valid: false }
    // otplib's functional verify() returns a TOTP∪HOTP result union; only the
    // TOTP arm carries timeStep. Our secrets are always TOTP, so it is present.
    return { valid: true, timeStep: 'timeStep' in result ? result.timeStep : undefined }
  } catch (err) {
    // otplib also throws if afterTimeStep is somehow ahead of the current window
    // (e.g. server clock rolled back). Fail closed: reject and let the admin
    // retry on the next period rather than weaken the replay guard.
    logger.warn(`[2fa] token check failed: ${err instanceof Error ? err.message : String(err)}`)
    return { valid: false }
  }
}
