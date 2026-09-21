// DigiLocker verification orchestration (Partner/Seller identity).
//
// Flow: startAuthorization (authenticated seller) -> user consents at
// DigiLocker -> handleCallback (public browser redirect; identity comes from
// the single-use `state`, never from anything else in the URL) -> result code
// redirect to the Partner portal.
//
// A VERIFIED result can only be produced by the real provider round trip —
// there is no mock/test path. It is ADDITIONAL evidence: it records
// digilockerStatus on the Seller and never changes kycStatus /
// identityVerificationStatus; approval stays with the existing admin workflow.
import crypto from 'node:crypto'
import prisma from '../../lib/prisma.js'
import logger from '../../lib/logger.js'
import { getDigilockerConfig } from './digilocker.config.js'
import { buildAuthorizationUrl, exchangeCodeForToken, fetchIdentity } from './digilocker.client.js'
import { DigilockerError, type DigilockerResultCode } from './digilocker.types.js'

const STATE_TTL_MS = 10 * 60 * 1000

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')

// ── name alignment (identity must belong to this account) ───────────────────
const nameTokens = (n: string) =>
  n.normalize('NFKD').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter((t) => t.length > 0)

export function namesAlign(a: string, b: string): boolean {
  const ta = nameTokens(a), tb = nameTokens(b)
  if (ta.length === 0 || tb.length === 0) return false
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return small.every((t) => large.includes(t))
}

// ── 1. start ────────────────────────────────────────────────────────────────
export async function startAuthorization(sellerId: string) {
  const cfg = getDigilockerConfig()
  if (cfg.mode === 'disabled') throw new DigilockerError('NOT_CONFIGURED')

  const state = crypto.randomBytes(32).toString('hex')
  const authorizationUrl = buildAuthorizationUrl(cfg, state) // throws NOT_CONFIGURED before any write

  await prisma.digilockerAuthState.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  await prisma.digilockerAuthState.create({
    data: { stateHash: sha256(state), sellerId, expiresAt: new Date(Date.now() + STATE_TTL_MS) },
  })
  // "Verification pending" — never downgrades an existing VERIFIED.
  await prisma.seller.updateMany({
    where: { id: sellerId, OR: [{ digilockerStatus: null }, { digilockerStatus: 'FAILED' }] },
    data: { digilockerStatus: 'PENDING', digilockerProvider: 'DIGILOCKER' },
  })
  return { authorizationUrl }
}

// Leaves an abandoned/cancelled attempt as "not verified" rather than stuck pending.
const clearPending = (sellerId: string) =>
  prisma.seller.updateMany({ where: { id: sellerId, digilockerStatus: 'PENDING' }, data: { digilockerStatus: null, digilockerProvider: null } })

// ── 2. callback ─────────────────────────────────────────────────────────────
export async function handleCallback(params: { state?: unknown; code?: unknown; error?: unknown }): Promise<DigilockerResultCode> {
  const { state, code, error } = params
  if (typeof state !== 'string' || !/^[0-9a-f]{64}$/.test(state)) return 'session_expired'

  // Atomic single-use consume: a replayed/forged/expired state never matches.
  const now = new Date()
  const hash = sha256(state)
  const consumed = await prisma.digilockerAuthState.updateMany({
    where: { stateHash: hash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })
  if (consumed.count === 0) return 'session_expired'
  const row = await prisma.digilockerAuthState.findUniqueOrThrow({ where: { stateHash: hash } })

  const cfg = getDigilockerConfig()
  if (cfg.mode === 'disabled') return 'unavailable'

  // Provider-reported error (user cancelled / denied consent, or other).
  if (typeof error === 'string' && error) {
    if (error === 'access_denied') {
      await clearPending(row.sellerId)
      return 'cancelled'
    }
    await failAttempt(row.sellerId)
    return 'failed'
  }
  if (typeof code !== 'string' || !code || code.length > 2048) {
    await failAttempt(row.sellerId)
    return 'failed'
  }

  try {
    const token = await exchangeCodeForToken(cfg, code) // in-memory only, never stored/logged
    const identity = await fetchIdentity(cfg, token)

    const seller = await prisma.seller.findUnique({ where: { id: row.sellerId }, select: { name: true } })
    if (!seller) return 'failed'
    if (!namesAlign(identity.name, seller.name)) throw new DigilockerError('NAME_MISMATCH')

    await prisma.seller.update({
      where: { id: row.sellerId },
      data: { digilockerStatus: 'VERIFIED', digilockerProvider: 'DIGILOCKER', digilockerVerifiedAt: new Date() },
    })
    return 'success'
  } catch (e) {
    const failure = e instanceof DigilockerError ? e.failure : 'PROVIDER_ERROR'
    logger.warn(`[digilocker] verification did not complete (${failure})`)
    if (failure === 'UNAVAILABLE' || failure === 'NOT_CONFIGURED') {
      await clearPending(row.sellerId) // nothing was decided; user can simply retry
      return 'unavailable'
    }
    await failAttempt(row.sellerId)
    return 'failed'
  }
}

// Record a failed attempt without downgrading an earlier successful verification.
const failAttempt = (sellerId: string) =>
  prisma.seller.updateMany({
    where: { id: sellerId, OR: [{ digilockerStatus: null }, { digilockerStatus: 'PENDING' }, { digilockerStatus: 'FAILED' }] },
    data: { digilockerStatus: 'FAILED', digilockerProvider: 'DIGILOCKER' },
  })

// ── 3. status ───────────────────────────────────────────────────────────────
export async function getStatus(sellerId: string) {
  const cfg = getDigilockerConfig()
  const s = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: { digilockerStatus: true, digilockerVerifiedAt: true },
  })
  return {
    available: cfg.mode !== 'disabled',
    status: s?.digilockerStatus ?? 'NOT_CONNECTED',
    verifiedAt: s?.digilockerVerifiedAt ?? null,
  }
}
