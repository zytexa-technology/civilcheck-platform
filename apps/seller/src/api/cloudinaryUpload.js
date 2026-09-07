// ─────────────────────────────────────────────────────────────────────────
//  Cloudinary signed direct upload.
//
//  The file goes browser → Cloudinary and never passes through our Express
//  server. The backend signs `allowed_formats`, `folder` and `timestamp`;
//  those exact params must be echoed back or Cloudinary rejects the
//  signature, so this helper does not let callers add or drop any of them.
//  `max_file_size` is NOT a real Cloudinary parameter — it's returned by the
//  signature endpoint for the client-side check in validate() below only,
//  and must never be sent to Cloudinary (audit 2026-09-01: sending it made
//  every real upload fail with "Invalid Signature", since Cloudinary
//  silently drops unrecognized params when recomputing the signature to
//  verify against).
//
//  Mock mode: with no CLOUDINARY_* env vars the API returns a placeholder
//  signature against cloud name "demo". A real POST would just 401, so we do
//  not attempt one — the caller is told it is mock so it can say so in the UI
//  rather than reporting a success that did not happen.
// ─────────────────────────────────────────────────────────────────────────
import { getUploadSignature } from './seller.api'

const MOCK_SIGNATURE = 'mock_signature_dev_only'

export class UploadError extends Error {}

// Mirrors the server's signed constraints so a doomed upload fails here, with
// a useful message, instead of as an opaque 400 from Cloudinary.
const validate = (file, upload) => {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const allowed = upload.allowedFormats.split(',')
  if (!allowed.includes(ext)) {
    throw new UploadError(`Sirf ${upload.allowedFormats} allowed hain — "${ext}" nahi`)
  }
  if (file.size > upload.maxFileSize) {
    const mb = Math.round(upload.maxFileSize / (1024 * 1024))
    throw new UploadError(`File ${mb}MB se chhoti honi chahiye`)
  }
}

/**
 * @returns {Promise<{ url: string, mock: boolean }>}
 */
export async function uploadToCloudinary(file, purpose) {
  const { upload } = await getUploadSignature(purpose)
  validate(file, upload)

  if (upload.signature === MOCK_SIGNATURE) {
    // No real account configured. Hand back a clearly-marked placeholder so the
    // rest of the KYC chain (submit → admin review) can be exercised locally.
    // The `mock` flag is what stops the UI claiming a real upload happened.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    return {
      url: `https://res.cloudinary.com/demo/image/upload/${upload.folder}/MOCK-${Date.now()}-${safeName}`,
      mock: true,
    }
  }

  const form = new FormData()
  form.append('file', file)
  form.append('api_key', upload.apiKey)
  form.append('timestamp', String(upload.timestamp))
  form.append('signature', upload.signature)
  form.append('folder', upload.folder)
  form.append('allowed_formats', upload.allowedFormats)
  // KYC document security hardening — present only for the three KYC
  // purposes (see apps/api's UPLOAD_PURPOSES). Must be echoed exactly as
  // signed, same rule as folder/allowed_formats above; every other purpose
  // has no `type` and this is a no-op for them.
  if (upload.type) form.append('type', upload.type)

  // `auto` so a PDF and a JPEG both work through one endpoint.
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${upload.cloudName}/auto/upload`,
    { method: 'POST', body: form }
  )

  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.secure_url) {
    throw new UploadError(data?.error?.message || 'Cloudinary upload fail ho gaya')
  }

  return { url: data.secure_url, mock: false }
}
