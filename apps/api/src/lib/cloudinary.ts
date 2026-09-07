// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary signed-upload adapter — issues a signature so the seller panel
// uploads KYC/listing documents DIRECTLY to Cloudinary. Files never touch our
// Express server, which matters on Railway's resource limits.
//
// Same shape as razorpay.ts: built on node:crypto, no SDK, credentials read
// PER CALL, never at module load.
//
//   credentials present → real signature against the caller's Cloudinary account
//   credentials absent  → mock signature + payload logged, so the seller-panel
//                          upload flow can be exercised without a Cloudinary
//                          account. Refused in production (same precedent as
//                          firebase.ts / razorpay.ts).
//
// allowed_formats is a SIGNED param, not just documentation — Cloudinary only
// enforces a constraint if it is part of the signed payload, so a client
// cannot take this signature (issued for pdf/jpg/jpeg/png) and upload a
// renamed executable: that upload param would no longer match the signature
// and Cloudinary rejects the request outright.
//
// maxFileSize is NOT signed — Cloudinary has no such upload parameter, so
// signing it (as this file used to) breaks verification for every real
// upload (audit 2026-09-01: "Invalid Signature" on every real-credential
// upload). It's returned to the client purely for client-side pre-upload
// size validation, same as allowedFormats is used for the client-side
// extension check — neither of those client checks are the enforcement
// boundary, the signed params are.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { v2 as cloudinarySdk } from 'cloudinary'
import logger from './logger.js'

// Upload kind determines the signed allowed_formats/max_file_size pair.
// document/image are unchanged from the original single-purpose signer;
// video is new (Phase 2 — property media). Cloudinary's `/auto/upload`
// endpoint (used client-side, see apps/*/api/cloudinaryUpload.js) picks the
// right resource_type from the file itself, so no resource_type needs to be
// part of the signed payload here.
export type UploadKind = 'document' | 'image' | 'video'

const KIND_CONFIG: Record<UploadKind, { allowedFormats: string; maxFileSize: number }> = {
  document: { allowedFormats: 'pdf,jpg,jpeg,png', maxFileSize: 10 * 1024 * 1024 }, // 10 MB
  image: { allowedFormats: 'jpg,jpeg,png,webp', maxFileSize: 10 * 1024 * 1024 }, // 10 MB
  video: { allowedFormats: 'mp4,mov,webm', maxFileSize: 100 * 1024 * 1024 }, // 100 MB
}

function readConfig(): {
  cloudName: string | undefined
  apiKey: string | undefined
  apiSecret: string | undefined
} {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  }
}

export function isCloudinaryConfigured(): boolean {
  const { cloudName, apiKey, apiSecret } = readConfig()
  return Boolean(cloudName && apiKey && apiSecret)
}

export interface UploadSignature {
  timestamp: number
  signature: string
  apiKey: string
  cloudName: string
  folder: string
  allowedFormats: string
  maxFileSize: number
  // Present ONLY for the three KYC purposes (certificate/selfie/identity
  // document) — see generateUploadSignature's `authenticated` param. Must be
  // echoed back as an upload form field by the client, same as
  // allowedFormats/folder, or Cloudinary rejects the signature.
  type?: 'authenticated'
}

export class CloudinaryError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'CloudinaryError'
    this.status = status
  }
}

// Cloudinary's signing rule: alphabetically-sorted `key=value` pairs joined by
// `&`, api_secret appended, SHA-1 hex digest. api_key/file/cloud_name/signature
// are never part of this string — only params actually sent to the upload API.
// https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')

  return createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex')
}

// `folder` scopes where the upload lands, e.g. `civilcheck/kyc/<sellerId>` —
// callers pass an already-validated folder, this function does not sanitize it.
// `kind` picks the signed format/size constraints; defaults to 'document' so
// every pre-Phase-2 caller keeps its exact previous behavior unchanged.
// `authenticated` — KYC document security hardening: true ONLY for the three
// KYC purposes (see seller.controller.ts's UPLOAD_PURPOSES). Every other
// caller (listings, properties, reporter posts) omits it and keeps the
// existing public delivery type — deliberately unchanged.
export function generateUploadSignature(
  folder: string,
  kind: UploadKind = 'document',
  authenticated = false
): UploadSignature {
  const { cloudName, apiKey, apiSecret } = readConfig()
  const timestamp = Math.floor(Date.now() / 1000)
  const { allowedFormats, maxFileSize } = KIND_CONFIG[kind]
  const type = authenticated ? ('authenticated' as const) : undefined

  // ── Real mode ──────────────────────────────────────────────────────────────
  if (cloudName && apiKey && apiSecret) {
    // max_file_size is NOT a real Cloudinary upload parameter — it was being
    // signed here and echoed back by the client, but Cloudinary silently
    // excludes unrecognized params when it recomputes the signature to
    // verify against, so every real upload failed with "Invalid Signature"
    // (audit 2026-09-01). maxFileSize is still returned below for the
    // client's own pre-upload size check — it just must never be part of
    // the signed string or the actual Cloudinary request.
    const signature = signParams(
      { allowed_formats: allowedFormats, folder, timestamp, ...(type ? { type } : {}) },
      apiSecret
    )
    logger.info(`[cloudinary] signature issued for folder=${folder} kind=${kind}${type ? ` type=${type}` : ''}`)
    return {
      timestamp,
      signature,
      apiKey,
      cloudName,
      folder,
      allowedFormats,
      maxFileSize,
      ...(type ? { type } : {}),
    }
  }

  // A production deploy without credentials must not hand out a signature that
  // silently fails against no real account. Fail loudly, same as razorpay.ts.
  if (process.env.NODE_ENV === 'production') {
    logger.error('[cloudinary] generateUploadSignature called in production without CLOUDINARY_* env vars')
    throw new CloudinaryError('Document upload is not configured', 503)
  }

  // ── No credentials (dev) ─────────────────────────────────────────────────
  // Signature won't validate against a real Cloudinary account, but the
  // request/response shape can still be exercised end-to-end in local dev.
  logger.info(`[cloudinary] MOCK signature issued for folder=${folder} kind=${kind} (no CLOUDINARY_* env vars set)`)
  return {
    timestamp,
    signature: 'mock_signature_dev_only',
    apiKey: 'mock_api_key',
    cloudName: 'demo',
    folder,
    allowedFormats,
    maxFileSize,
    ...(type ? { type } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED SIGNED DELIVERY URL (KYC document security hardening)
//
// Uses the OFFICIAL Cloudinary SDK's utils.private_download_url — the
// documented, tested mechanism for exactly this: a genuinely time-limited
// (expires_at, server-verified) signed link to an `authenticated`-type
// asset. Deliberately NOT hand-rolled — unlike the upload-signature flow
// above (a simple, well-understood HMAC this codebase has always
// hand-rolled), a private-delivery signing scheme is easy to get subtly
// wrong, and the official SDK's implementation is what gets tested/maintained
// by Cloudinary itself. Requires no Cloudinary Dashboard configuration —
// this is the Admin/Upload API's authenticated-download endpoint, available
// on every account tier, distinct from (and simpler than) Cloudinary's
// separate "token-based authentication" delivery feature.
//
// Only ever called for the three KYC purposes; every other document/image in
// this codebase stays on public delivery and never calls this.
// ─────────────────────────────────────────────────────────────────────────────
export interface SignedDownloadUrlInput {
  publicId: string
  format: string
  resourceType?: 'image' | 'raw' | 'video'
  // Short-lived by design — the caller (controller) picks the value; kept as
  // a parameter rather than a hardcoded constant so a call site can use a
  // short window for a live test and a normal one (e.g. 5 minutes) for real
  // KYC review traffic, without touching this function.
  expiresInSeconds: number
}

// Returns null in mock mode (no CLOUDINARY_* configured) — callers already
// know how to render "not configured" for the rest of this file's mock
// paths; this mirrors that rather than throwing in dev.
export function generateSignedDownloadUrl(input: SignedDownloadUrlInput): string | null {
  const { cloudName, apiKey, apiSecret } = readConfig()
  if (!cloudName || !apiKey || !apiSecret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[cloudinary] generateSignedDownloadUrl called in production without CLOUDINARY_* env vars')
      throw new CloudinaryError('Document access is not configured', 503)
    }
    logger.info('[cloudinary] generateSignedDownloadUrl skipped — no CLOUDINARY_* env vars set (mock mode)')
    return null
  }

  // Configured per call, never cached at module scope — same "credentials
  // read per call" discipline as the rest of this file (and razorpay.ts).
  cloudinarySdk.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })

  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(input.expiresInSeconds))

  return cloudinarySdk.utils.private_download_url(input.publicId, input.format, {
    resource_type: input.resourceType ?? 'image',
    type: 'authenticated',
    expires_at: expiresAt,
  })
}

// Extracts { publicId, format, resourceType } from a stored Cloudinary
// secure_url. No new DB column was added to hold these separately (schema
// change out of scope for this pass) — the stored URL already encodes
// everything needed. Matches both delivery types (`upload` and
// `authenticated`) so it works for a not-yet-migrated public URL too.
// Returns null for a non-Cloudinary or mock ("MOCK-…") URL — callers treat
// that as "nothing real to sign".
export function parseCloudinaryUrl(
  url: string
): { publicId: string; format: string; resourceType: 'image' | 'raw' | 'video' } | null {
  // `authenticated`-type secure_urls include an extra Cloudinary-generated
  // short-signature segment ("s--XXXXXXXX--/") between the delivery type and
  // the version — confirmed via a real live upload (2026-09-04):
  //   .../image/authenticated/s--gwhj9hJj--/v1788495517/civilcheck/kyc/.../file.pdf
  // `upload`-type URLs normally omit it, so it's optional here to match both.
  const match = url.match(/\/(image|raw|video)\/(?:upload|authenticated)\/(?:s--[\w-]+--\/)?v\d+\/(.+)\.([a-zA-Z0-9]+)(?:\?.*)?$/)
  if (!match) return null
  const [, resourceType, publicId, format] = match
  return { publicId, format, resourceType: resourceType as 'image' | 'raw' | 'video' }
}
