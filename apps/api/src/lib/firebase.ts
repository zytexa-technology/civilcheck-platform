// ─────────────────────────────────────────────────────────────────────────────
// Firebase Admin SDK — pluggable adapter (roadmap "Integration Strategy").
//
// Real mode:  set FIREBASE_SERVICE_ACCOUNT (inline JSON) or
//             FIREBASE_SERVICE_ACCOUNT_PATH (path to the service-account file).
//             Verifies phone-OTP logins and Google/Apple SSO ID tokens.
// Mock mode:  no credentials configured → decodes UNVERIFIED test payloads so
//             local dev and demos work without a Firebase project.
//             Refused in production: verification always fails there.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getMessaging } from 'firebase-admin/messaging'
import logger from './logger.js'

// Normalized identity shared by both adapters
export interface FirebaseIdentity {
  uid: string
  phone: string | null
  email: string | null
  name: string | null
}

function loadServiceAccount(): object | null {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH

  try {
    if (inline) return JSON.parse(inline) as object
    if (path) return JSON.parse(readFileSync(path, 'utf-8')) as object
  } catch (err) {
    logger.error(
      `[firebase] Failed to load service account: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  return null
}

const serviceAccount = loadServiceAccount()
export const isFirebaseConfigured = serviceAccount !== null

let app: App | null = null
if (isFirebaseConfigured && serviceAccount) {
  app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) })
  logger.info('[firebase] Admin SDK initialized (real mode)')
} else {
  logger.warn(
    '[firebase] No service account configured — running in MOCK mode. ' +
      'Tokens are decoded WITHOUT verification (dev/demo only).'
  )
}

// Firebase phone numbers arrive as E.164 (+919829000001); existing DB rows use
// bare 10-digit numbers. Normalize so both flows hit the same user record.
export function normalizePhone(phone: string): string {
  if (/^\+91[6-9]\d{9}$/.test(phone)) return phone.slice(3)
  return phone.replace(/^\+/, '')
}

interface DecodedPayload {
  uid?: string
  user_id?: string
  sub?: string
  phone_number?: string
  email?: string
  name?: string
}

// Mock adapter: accepts a standard JWT (header.payload.signature) or a bare
// base64url-encoded JSON payload, and trusts it without any verification.
function decodeMockToken(idToken: string): FirebaseIdentity | null {
  const candidates = idToken.split('.')
  const rawPayload = candidates.length >= 2 ? candidates[1] : candidates[0]

  try {
    const json = Buffer.from(rawPayload, 'base64url').toString('utf-8')
    const payload = JSON.parse(json) as DecodedPayload
    const uid = payload.uid ?? payload.user_id ?? payload.sub
    if (!uid) return null

    logger.info(`[firebase:mock] Decoded test token for uid=${uid}`)
    return {
      uid,
      phone: payload.phone_number ? normalizePhone(payload.phone_number) : null,
      email: payload.email ?? null,
      name: payload.name ?? null,
    }
  } catch {
    return null
  }
}

// Verify a Firebase ID token (phone OTP login or Google/Apple SSO).
// Returns the normalized identity, or null when the token is invalid.
export async function verifyFirebaseToken(idToken: string): Promise<FirebaseIdentity | null> {
  if (app) {
    try {
      const decoded = await getAuth(app).verifyIdToken(idToken)
      return {
        uid: decoded.uid,
        phone: decoded.phone_number ? normalizePhone(decoded.phone_number) : null,
        email: decoded.email ?? null,
        name: typeof decoded.name === 'string' ? decoded.name : null,
      }
    } catch {
      return null
    }
  }

  // Mock fallback must never authenticate anyone in production
  if (process.env.NODE_ENV === 'production') {
    logger.error('[firebase] Token verification attempted in production without credentials')
    return null
  }

  return decodeMockToken(idToken)
}

// ─────────────────────────────────────────────────────────────────────────────
// FCM PUSH (PDF 12/20) — same pluggable shape as the auth adapter and the
// notification/razorpay adapters:
//   real mode (service account present) → firebase-admin messaging.send()
//   mock mode (no credentials)          → the payload is logged, never sent
// Nothing here throws: an alert dispatch must not roll back the mutation that
// triggered it. An invalid/expired token comes back as `failed` (the caller can
// fall back to SMS), not as an exception.
// ─────────────────────────────────────────────────────────────────────────────
export type PushStatus =
  | 'sent' // FCM accepted it
  | 'logged' // no credentials — payload written to the log instead
  | 'skipped' // no device token to send to
  | 'failed' // FCM rejected the token or the call blew up

export interface PushMessage {
  token: string | null | undefined
  title: string
  body: string
  // FCM data payload — string values only (FCM requirement). e.g. { listingId }
  data?: Record<string, string>
}

export interface PushResult {
  status: PushStatus
  id?: string
  error?: string
}

export async function sendPush(message: PushMessage): Promise<PushResult> {
  const { token, title, body, data } = message

  if (!token) return { status: 'skipped' }

  if (app) {
    try {
      const id = await getMessaging(app).send({
        token,
        notification: { title, body },
        ...(data ? { data } : {}),
      })
      logger.info(`[fcm] push sent (id: ${id})`)
      return { status: 'sent', id }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      logger.error(`[fcm] send failed: ${error}`)
      return { status: 'failed', error }
    }
  }

  logger.info(
    `[fcm:mock] no service account — push not sent:\n` +
      `  token: ${token.slice(0, 12)}…\n  title: ${title}\n  body:  ${body}`
  )
  return { status: 'logged' }
}
