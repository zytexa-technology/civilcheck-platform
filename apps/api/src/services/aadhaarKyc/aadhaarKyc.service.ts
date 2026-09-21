// ─────────────────────────────────────────────────────────────────────────────
// Signup Aadhaar KYC for Partners (Reporter / Owner / Expert).
//
// Steps (all pre-account, keyed by an opaque session token — see the
// PartnerKycSession model): start (Aadhaar -> provider OTP) -> verify OTP ->
// upload Aadhaar photo (private Cloudinary) -> VERIFIED. sellerRegister then
// requires a VERIFIED session; the client can never mark itself verified.
//
// Privacy rules kept here: the Aadhaar number lives only in memory for the
// duration of one call; only an HMAC and the last 4 digits are persisted; no
// log line, error message or response contains it; OTPs are never stored.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import prisma from '../../lib/prisma.js'
import logger from '../../lib/logger.js'
import { generateUploadSignature, isCloudinaryConfigured, type UploadSignature } from '../../lib/cloudinary.js'
import { getAadhaarProvider, type ProviderFailure } from './provider.js'

export const DUPLICATE_AADHAAR_MESSAGE = 'This Aadhaar identity is already associated with an account.'
export const KYC_REQUIRED_MESSAGE = 'Aadhaar identity verification is required to complete signup.'

const SESSION_TTL_MS = 60 * 60 * 1000 // whole signup must finish within an hour
const OTP_RESEND_COOLDOWN_MS = 30 * 1000
const MAX_OTP_SENDS_PER_SESSION = 5
const MAX_OTP_ATTEMPTS = 5
const MAX_SESSIONS_PER_AADHAAR_PER_HOUR = 5 // stops using us to SMS-bomb one Aadhaar holder
const AADHAAR_FOLDER = 'kyc-aadhaar'

export class KycError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message)
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')

const unavailable = () =>
  new KycError(503, 'Identity verification is temporarily unavailable. Please try again later.', 'KYC_UNAVAILABLE')

function hashSecret(): string {
  const s = process.env.KYC_AADHAAR_HASH_SECRET
  if (!s || s.length < 32) throw unavailable()
  return s
}

export const hashAadhaar = (aadhaar: string) => crypto.createHmac('sha256', hashSecret()).update(aadhaar).digest('hex')

// Verhoeff checksum — Aadhaar's last digit is a Verhoeff check digit.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
export function isValidAadhaarNumber(v: string): boolean {
  if (!/^[2-9]\d{11}$/.test(v)) return false
  let c = 0
  const digits = v.split('').reverse().map(Number)
  for (let i = 0; i < digits.length; i++) c = D[c][P[i % 8][digits[i]]]
  return c === 0
}

export const normalizeAadhaarInput = (raw: string) => raw.replace(/[\s-]/g, '')

const newToken = () => crypto.randomBytes(32).toString('hex')
const mask = (last4: string) => `XXXX XXXX ${last4}`
const expired = () => new KycError(410, 'Your verification session has expired. Please start again.', 'KYC_SESSION_EXPIRED')
const used = () => new KycError(409, 'This verification has already been used.', 'KYC_SESSION_USED')

async function loadSession(token: unknown) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw expired()
  const session = await prisma.partnerKycSession.findUnique({ where: { tokenHash: sha256(token) } })
  if (!session || session.expiresAt < new Date()) throw expired()
  return session
}

function providerFailure(f: ProviderFailure): KycError {
  switch (f) {
    case 'INVALID_AADHAAR':
      return new KycError(422, 'We could not send an OTP for this Aadhaar number. Please check it and try again.', 'KYC_OTP_NOT_SENT')
    case 'OTP_EXPIRED':
      return new KycError(422, 'The OTP has expired. Please request a new one.', 'KYC_OTP_EXPIRED')
    case 'OTP_INVALID':
      return new KycError(422, 'The OTP you entered is incorrect.', 'KYC_OTP_INVALID')
    case 'REJECTED':
      return new KycError(422, 'Aadhaar verification could not be completed. Please try again.', 'KYC_VERIFICATION_FAILED')
    default:
      return unavailable()
  }
}

// ── 1. start / resend ───────────────────────────────────────────────────────
export async function startAadhaarKyc(rawAadhaar: string, existingToken?: string) {
  const aadhaar = normalizeAadhaarInput(rawAadhaar)
  if (!isValidAadhaarNumber(aadhaar)) {
    throw new KycError(400, 'Please enter a valid 12-digit Aadhaar number.', 'KYC_INVALID_AADHAAR')
  }
  const provider = getAadhaarProvider()
  if (!provider) throw unavailable()
  const aadhaarHash = hashAadhaar(aadhaar)
  const last4 = aadhaar.slice(-4)

  // One identity <-> one Partner account. An abandoned (email-unverified)
  // signup does not hold the identity hostage.
  const holder = await prisma.seller.findUnique({ where: { aadhaarHash }, select: { emailVerified: true } })
  if (holder?.emailVerified) throw new KycError(409, DUPLICATE_AADHAAR_MESSAGE, 'KYC_DUPLICATE_AADHAAR')

  let session = null
  if (existingToken) {
    session = await loadSession(existingToken)
    if (session.consumedAt) throw used()
    if (session.aadhaarHash !== aadhaarHash) session = null // different number => a fresh session
  }

  const now = new Date()
  if (session) {
    if (session.lastOtpAt && now.getTime() - session.lastOtpAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      throw new KycError(429, 'Please wait a few seconds before requesting another OTP.', 'KYC_OTP_COOLDOWN')
    }
    if (session.otpSendCount >= MAX_OTP_SENDS_PER_SESSION) {
      throw new KycError(429, 'Too many OTP requests. Please try again later.', 'KYC_TOO_MANY_OTP')
    }
  } else {
    const recent = await prisma.partnerKycSession.count({
      where: { aadhaarHash, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
    })
    if (recent >= MAX_SESSIONS_PER_AADHAAR_PER_HOUR) {
      throw new KycError(429, 'Too many OTP requests. Please try again later.', 'KYC_TOO_MANY_OTP')
    }
  }

  const sent = await provider.sendOtp(aadhaar)
  if (!sent.ok) {
    logger.warn(`Aadhaar KYC: provider OTP request failed (${sent.failure})`)
    throw providerFailure(sent.failure)
  }

  if (session) {
    await prisma.partnerKycSession.update({
      where: { id: session.id },
      data: { providerRef: sent.providerRef, status: 'OTP_PENDING', otpSendCount: { increment: 1 }, otpAttempts: 0, lastOtpAt: now },
    })
    return { sessionToken: existingToken as string, status: 'OTP_PENDING' as const, maskedAadhaar: mask(last4) }
  }
  const token = newToken()
  await prisma.partnerKycSession.create({
    data: {
      tokenHash: sha256(token), aadhaarHash, aadhaarLast4: last4, providerRef: sent.providerRef,
      otpSendCount: 1, lastOtpAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
  })
  return { sessionToken: token, status: 'OTP_PENDING' as const, maskedAadhaar: mask(last4) }
}

// ── 2. verify OTP ───────────────────────────────────────────────────────────
export async function verifyAadhaarOtp(token: string, otp: string) {
  const session = await loadSession(token)
  if (session.consumedAt) throw used()
  if (session.status === 'FAILED') {
    throw new KycError(429, 'Too many incorrect attempts. Please request a new OTP.', 'KYC_TOO_MANY_ATTEMPTS')
  }
  if (session.status !== 'OTP_PENDING' || !session.providerRef) {
    return { status: session.status, maskedAadhaar: mask(session.aadhaarLast4) } // already past this step — idempotent
  }
  const provider = getAadhaarProvider()
  if (!provider) throw unavailable()

  // Claim an attempt atomically so parallel guesses cannot exceed the cap.
  const claimed = await prisma.partnerKycSession.updateMany({
    where: { id: session.id, status: 'OTP_PENDING', otpAttempts: { lt: MAX_OTP_ATTEMPTS } },
    data: { otpAttempts: { increment: 1 } },
  })
  if (claimed.count === 0) {
    await prisma.partnerKycSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
    throw new KycError(429, 'Too many incorrect attempts. Please request a new OTP.', 'KYC_TOO_MANY_ATTEMPTS')
  }

  const result = await provider.verifyOtp(session.providerRef, otp)
  if (!result.ok) {
    logger.warn(`Aadhaar KYC: provider OTP verification failed (${result.failure})`)
    throw providerFailure(result.failure)
  }

  // Re-check the holder at the moment identity is proven (race with another signup).
  const holder = await prisma.seller.findUnique({ where: { aadhaarHash: session.aadhaarHash }, select: { emailVerified: true } })
  if (holder?.emailVerified) throw new KycError(409, DUPLICATE_AADHAAR_MESSAGE, 'KYC_DUPLICATE_AADHAAR')

  await prisma.partnerKycSession.update({
    where: { id: session.id },
    data: { status: 'OTP_VERIFIED', providerRef: null },
  })
  return { status: 'OTP_VERIFIED' as const, maskedAadhaar: mask(session.aadhaarLast4) }
}

// ── 3. Aadhaar photo (private Cloudinary) ───────────────────────────────────
export async function getAadhaarUploadSignature(token: string): Promise<UploadSignature> {
  const session = await loadSession(token)
  if (session.consumedAt) throw used()
  if (session.status === 'OTP_PENDING' || session.status === 'FAILED') {
    throw new KycError(403, 'Please verify your Aadhaar OTP first.', 'KYC_OTP_REQUIRED')
  }
  if (session.status === 'OTP_VERIFIED') {
    await prisma.partnerKycSession.update({ where: { id: session.id }, data: { status: 'DOCUMENT_PENDING' } })
  }
  return generateUploadSignature(`civilcheck/${AADHAAR_FOLDER}/${session.id}`, 'document', true)
}

function isTrustedAadhaarUrl(url: string, sessionId: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') return false
  if (!u.pathname.includes(`/civilcheck/${AADHAAR_FOLDER}/${sessionId}/`)) return false
  if (isCloudinaryConfigured()) {
    return u.pathname.startsWith(`/${process.env.CLOUDINARY_CLOUD_NAME}/`) && u.pathname.includes('/authenticated/')
  }
  // Cloudinary not configured (local dev) — the client's placeholder "demo" URL.
  return process.env.NODE_ENV !== 'production' && u.pathname.startsWith('/demo/')
}

export async function attachAadhaarDocument(token: string, documentUrl: string) {
  const session = await loadSession(token)
  if (session.consumedAt) throw used()
  if (session.status !== 'DOCUMENT_PENDING' && session.status !== 'VERIFIED') {
    throw new KycError(403, 'Please verify your Aadhaar OTP first.', 'KYC_OTP_REQUIRED')
  }
  if (!isTrustedAadhaarUrl(documentUrl, session.id)) {
    throw new KycError(400, 'The uploaded document could not be accepted. Please upload it again.', 'KYC_DOCUMENT_INVALID')
  }
  await prisma.partnerKycSession.update({
    where: { id: session.id },
    data: { documentUrl, status: 'VERIFIED', verifiedAt: session.verifiedAt ?? new Date() },
  })
  return { status: 'VERIFIED' as const, maskedAadhaar: mask(session.aadhaarLast4) }
}

export async function getAadhaarKycStatus(token: string) {
  const s = await loadSession(token)
  return { status: s.status, maskedAadhaar: mask(s.aadhaarLast4), documentUploaded: !!s.documentUrl }
}

// ── 4. consumed by sellerRegister ───────────────────────────────────────────
// Throws KycError unless the session is genuinely VERIFIED (OTP + photo).
export async function requireVerifiedSession(token: unknown, resumingSellerId?: string) {
  if (typeof token !== 'string' || !token) throw new KycError(403, KYC_REQUIRED_MESSAGE, 'KYC_REQUIRED')
  const s = await loadSession(token)
  if (s.status !== 'VERIFIED' || !s.documentUrl) throw new KycError(403, KYC_REQUIRED_MESSAGE, 'KYC_REQUIRED')
  if (s.consumedAt && s.sellerId !== resumingSellerId) throw used()
  return s
}
