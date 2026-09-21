// ─────────────────────────────────────────────────────────────────────────────
// Reporter-post duplicate protection.
//
//   DUPLICATE  =  same NORMALIZED property address
//              +  at least one image with the same CONTENT fingerprint
//                 (on any other active post — any Reporter, own post excluded
//                 when editing).
//
// Neither half alone is enough: similar addresses with different photos, or
// the same photo with a different address, are legitimately different posts.
//
// Media pipeline (inspected before writing this): the browser uploads
// straight to Cloudinary and the API only ever receives the resulting URLs,
// so each upload has a fresh public_id — a filename/URL comparison could never
// catch the same photo uploaded twice. The fingerprint is therefore the
// SHA-256 of the bytes Cloudinary actually serves for that URL, computed
// server-side (never trusted from the client). Only image uploads exist for
// Reporter posts today; there is no video path, so none is invented here.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import logger from '../lib/logger.js'

// ── Address normalization ────────────────────────────────────────────────────

// Common short forms folded to one spelling so "12 MG Rd." and "12 mg road"
// compare equal. Deliberately small and unambiguous — anything looser would
// start merging genuinely different addresses.
const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  rd: 'road',
  st: 'street',
  ln: 'lane',
  nr: 'near',
  opp: 'opposite',
  apt: 'apartment',
  apts: 'apartments',
  blk: 'block',
  bldg: 'building',
  ext: 'extension',
  sec: 'sector',
}

export function normalizeAddress(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    // every non-letter/number (punctuation, symbols, dashes, slashes) → space;
    // \p{L}/\p{N} keep Devanagari and other scripts intact
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => ADDRESS_ABBREVIATIONS[token] ?? token)
    .join(' ')
}

// ── Image fingerprinting ─────────────────────────────────────────────────────

const CLOUDINARY_HOST = 'res.cloudinary.com'
const FETCH_TIMEOUT_MS = 10_000
const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // upload cap is 10MB; headroom only

export class FingerprintError extends Error {
  status = 422
}

function urlFingerprint(url: string): string {
  return `url:${crypto.createHash('sha256').update(url).digest('hex')}`
}

async function contentFingerprint(url: URL): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' })
  } catch (err) {
    logger.warn(`[dedupe] image fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    throw new FingerprintError("We couldn't verify one of the uploaded images. Please re-upload it and try again.")
  }
  if (!response.ok || !response.body) {
    logger.warn(`[dedupe] image fetch returned HTTP ${response.status}`)
    throw new FingerprintError("We couldn't verify one of the uploaded images. Please re-upload it and try again.")
  }

  const hash = crypto.createHash('sha256')
  let total = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel()
      throw new FingerprintError('One of the uploaded images is too large.')
    }
    hash.update(value)
  }
  return `sha256:${hash.digest('hex')}`
}

// Same order as the input. Cloudinary-hosted images get a real content hash.
// The shared "demo" cloud is the dev/mock placeholder (see the partner app's
// cloudinaryUpload.js — nothing real is stored there), and any non-Cloudinary
// URL is never fetched by the server (SSRF) — both fall back to a URL-based
// fingerprint, which still makes an identical URL a duplicate.
export async function fingerprintImages(urls: string[]): Promise<string[]> {
  return Promise.all(
    urls.map(async (raw) => {
      let url: URL
      try {
        url = new URL(raw)
      } catch {
        return urlFingerprint(raw)
      }
      const isDemo = url.pathname.startsWith('/demo/')
      if (url.protocol !== 'https:' || url.hostname !== CLOUDINARY_HOST || isDemo) {
        return urlFingerprint(url.toString())
      }
      return contentFingerprint(url)
    })
  )
}

export const DUPLICATE_POST_MESSAGE =
  'This property has already been reported. A duplicate post cannot be created.'
