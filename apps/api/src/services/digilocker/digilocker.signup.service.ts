// ─────────────────────────────────────────────────────────────────────────────
// DigiLocker verification for Partner SIGNUP (pre-account).
//
// The existing digilocker.service.ts handles a LOGGED-IN partner: it keys
// everything off a sellerId and writes the result onto the Seller row. During
// signup no Seller exists yet, so this module carries the same OAuth flow on a
// DigilockerSignupSession instead. The provider plumbing itself
// (config/client/types) is reused as-is — there is no second DigiLocker
// implementation and no mock: a VERIFIED result can still only come from a
// real provider round trip.
//
// Flow:
//   startSignupAuthorization()  -> { signupToken, authorizationUrl }
//   (browser consents at DigiLocker)
//   handleSignupCallback()      -> result code, session marked VERIFIED/FAILED
//   getSignupSessionStatus()    -> what the signup UI polls/reads on return
//   consumeVerifiedSignupSession() -> called by sellerRegister, single use
//
// Security: the browser only ever holds an opaque random token; only its
// SHA-256 is stored. The OAuth `state` is likewise stored hashed and is
// single-use (atomic claim), so a replayed, forged or expired state cannot
// verify anything. Access tokens are used in memory during the callback and
// never persisted or logged; authorization codes are never logged.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import prisma from '../../lib/prisma.js'
import logger from '../../lib/logger.js'
import { getDigilockerConfig } from './digilocker.config.js'
import { buildAuthorizationUrl, exchangeCodeForToken, fetchIdentity } from './digilocker.client.js'
import { DigilockerError, type DigilockerResultCode } from './digilocker.types.js'
import { namesAlign } from './digilocker.service.js'

const STATE_TTL_MS = 10 * 60 * 1000 // one authorization round trip
const SESSION_TTL_MS = 60 * 60 * 1000 // whole signup must finish within an hour

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')
const isOpaqueToken = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)

/** Housekeeping — drop sessions that expired over a day ago. */
async function pruneExpired(): Promise<void> {
  await prisma.digilockerSignupSession.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
}

// ── 1. start ────────────────────────────────────────────────────────────────
/**
 * Begins a pre-account verification. Returns the opaque token the signup UI
 * must keep, plus the DigiLocker URL to send the browser to. Throws
 * NOT_CONFIGURED when credentials are absent — nothing is written in that case.
 */
export async function startSignupAuthorization(existingSignupToken?: unknown) {
  const cfg = getDigilockerConfig()
  if (cfg.mode === 'disabled') throw new DigilockerError('NOT_CONFIGURED')

  const state = crypto.randomBytes(32).toString('hex')
  const authorizationUrl = buildAuthorizationUrl(cfg, state) // throws before any write
  await pruneExpired()

  // Re-use the caller's session when it is still live, so pressing "Verify"
  // twice does not strand the first session.
  const existing = isOpaqueToken(existingSignupToken)
    ? await prisma.digilockerSignupSession.findFirst({
        where: { tokenHash: sha256(existingSignupToken), consumedAt: null, expiresAt: { gt: new Date() } },
      })
    : null

  if (existing) {
    await prisma.digilockerSignupSession.update({
      where: { id: existing.id },
      // A fresh attempt supersedes an earlier failure, but never downgrades a
      // session that is already VERIFIED.
      data: {
        stateHash: sha256(state),
        ...(existing.status === 'VERIFIED' ? {} : { status: 'PENDING', failureReason: null }),
      },
    })
    return { signupToken: existingSignupToken as string, authorizationUrl }
  }

  const signupToken = crypto.randomBytes(32).toString('hex')
  await prisma.digilockerSignupSession.create({
    data: {
      tokenHash: sha256(signupToken),
      stateHash: sha256(state),
      status: 'PENDING',
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  return { signupToken, authorizationUrl }
}

/**
 * Does this OAuth `state` belong to a signup (pre-account) session?
 *
 * Both flows share the single registered DIGILOCKER_REDIRECT_URI — API Setu
 * registers one callback, and OAuth requires the redirect_uri used at
 * authorization to match the one used at token exchange. The callback
 * therefore dispatches on who owns the state. Read-only: it must not consume
 * anything, or the real handler would find nothing left.
 */
export async function isSignupState(state: unknown): Promise<boolean> {
  if (!isOpaqueToken(state)) return false
  const row = await prisma.digilockerSignupSession.findFirst({
    where: { stateHash: sha256(state) },
    select: { id: true },
  })
  return row !== null
}

// ── 2. callback ─────────────────────────────────────────────────────────────
/**
 * Public browser redirect back from DigiLocker. The session is resolved ONLY
 * from the single-use `state`; nothing else in the URL is trusted.
 */
export async function handleSignupCallback(params: {
  state?: unknown
  code?: unknown
  error?: unknown
}): Promise<DigilockerResultCode> {
  const { state, code, error } = params
  if (!isOpaqueToken(state)) return 'session_expired'

  // Resolve the session from the state (stateHash is unique), then claim that
  // exact row atomically — clearing stateHash makes the state single-use, so a
  // replayed, forged or expired state resolves to nothing on a second attempt.
  const now = new Date()
  const stateHash = sha256(state)
  const session = await prisma.digilockerSignupSession.findFirst({
    where: { stateHash, consumedAt: null, expiresAt: { gt: now } },
  })
  if (!session) return 'session_expired'

  const claimed = await prisma.digilockerSignupSession.updateMany({
    where: { id: session.id, stateHash, consumedAt: null, expiresAt: { gt: now } },
    data: { stateHash: null },
  })
  if (claimed.count === 0) return 'session_expired' // concurrent replay lost the race

  const cfg = getDigilockerConfig()
  if (cfg.mode === 'disabled') return 'unavailable'

  // Provider-reported error (user cancelled / denied consent).
  if (typeof error === 'string' && error) {
    if (error === 'access_denied') {
      await markNotVerified(session.id, null) // cancelled — retryable, not a failure
      return 'cancelled'
    }
    await markNotVerified(session.id, 'PROVIDER_ERROR')
    return 'failed'
  }
  if (typeof code !== 'string' || !code || code.length > 2048) {
    await markNotVerified(session.id, 'INVALID_CALLBACK')
    return 'failed'
  }

  try {
    const token = await exchangeCodeForToken(cfg, code) // in memory only — never stored or logged
    const identity = await fetchIdentity(cfg, token)
    if (!identity?.name) throw new DigilockerError('PROVIDER_ERROR')

    await prisma.digilockerSignupSession.update({
      where: { id: session.id },
      data: { status: 'VERIFIED', verifiedName: identity.name, verifiedAt: new Date(), failureReason: null },
    })
    return 'success'
  } catch (e) {
    const failure = e instanceof DigilockerError ? e.failure : 'PROVIDER_ERROR'
    logger.warn(`[digilocker:signup] verification did not complete (${failure})`) // code/token never logged
    if (failure === 'UNAVAILABLE' || failure === 'NOT_CONFIGURED') {
      await markNotVerified(session.id, null) // nothing decided — user can retry
      return 'unavailable'
    }
    await markNotVerified(session.id, failure)
    return 'failed'
  }
}

/** Never downgrades an already-VERIFIED session. */
const markNotVerified = (id: string, failureReason: string | null) =>
  prisma.digilockerSignupSession.updateMany({
    where: { id, status: { not: 'VERIFIED' } },
    data: { status: failureReason ? 'FAILED' : 'PENDING', failureReason },
  })

// ── 3. status ───────────────────────────────────────────────────────────────
/** What the signup UI reads when the browser returns from DigiLocker. */
export async function getSignupSessionStatus(signupToken: unknown) {
  const cfg = getDigilockerConfig()
  const available = cfg.mode !== 'disabled'
  if (!isOpaqueToken(signupToken)) return { available, status: 'NOT_CONNECTED' as const, verifiedAt: null }

  const session = await prisma.digilockerSignupSession.findFirst({
    where: { tokenHash: sha256(signupToken), consumedAt: null, expiresAt: { gt: new Date() } },
    select: { status: true, verifiedAt: true },
  })
  return {
    available,
    status: session?.status ?? ('NOT_CONNECTED' as const),
    verifiedAt: session?.verifiedAt ?? null,
  }
}

// ── 4. consume (registration) ───────────────────────────────────────────────
/**
 * Called by sellerRegister when DigiLocker is mandatory. Atomically consumes a
 * VERIFIED session so one verification can create exactly one account. Returns
 * null when there is no usable verified session (missing/expired/reused/not
 * verified) — the caller then refuses the signup.
 */
export async function consumeVerifiedSignupSession(
  signupToken: unknown,
  signupName: string
): Promise<{ verifiedName: string | null } | null> {
  if (!isOpaqueToken(signupToken)) return null

  const now = new Date()
  const tokenHash = sha256(signupToken)
  const session = await prisma.digilockerSignupSession.findFirst({
    where: { tokenHash, status: 'VERIFIED', consumedAt: null, expiresAt: { gt: now } },
  })
  if (!session) return null

  // The verified identity must actually be the person signing up.
  if (session.verifiedName && !namesAlign(session.verifiedName, signupName)) {
    logger.warn('[digilocker:signup] verified identity does not match the signup name — refusing')
    return null
  }

  const claimed = await prisma.digilockerSignupSession.updateMany({
    where: { id: session.id, consumedAt: null },
    data: { consumedAt: now },
  })
  if (claimed.count === 0) return null // lost a race — treated as not verified

  return { verifiedName: session.verifiedName }
}
