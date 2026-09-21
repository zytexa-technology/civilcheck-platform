// ─────────────────────────────────────────────────────────────────────────────
// Aadhaar-OTP KYC provider boundary.
//
// Aadhaar OTP verification may only be performed by an authorized UIDAI
// AUA/KUA or a licensed KYC aggregator — this app never "verifies" an OTP
// itself. Everything provider-specific sits behind AadhaarOtpProvider so the
// signup flow is provider-agnostic, and getAadhaarProvider() returns null
// (=> the API answers "KYC service unavailable") whenever no provider is
// configured. There is deliberately NO built-in/dev/mock provider here.
//
// Configuration (env):
//   KYC_PROVIDER              'surepass'   (unset => KYC unavailable; Partner signup fails closed)
//   KYC_PROVIDER_API_KEY      provider bearer token
//   KYC_PROVIDER_BASE_URL     optional override (defaults per provider)
//   KYC_AADHAAR_HASH_SECRET   >=32 chars; HMAC key for the stored Aadhaar hash
//
// Privacy: adapters receive the Aadhaar number only to hand it to the provider
// and must never log it, echo it, or put it in an Error message.
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderFailure =
  | 'INVALID_AADHAAR' // provider says the number is not valid / not linked to a mobile
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'REJECTED' // verification could not be completed
  | 'UNAVAILABLE' // timeout, 5xx, bad credentials, misconfiguration

export type ProviderSendResult = { ok: true; providerRef: string } | { ok: false; failure: ProviderFailure }
export type ProviderVerifyResult = { ok: true } | { ok: false; failure: ProviderFailure }

export interface AadhaarOtpProvider {
  sendOtp(aadhaarNumber: string): Promise<ProviderSendResult>
  verifyOtp(providerRef: string, otp: string): Promise<ProviderVerifyResult>
}

type ProviderFactory = () => AadhaarOtpProvider | null

const factories = new Map<string, ProviderFactory>()

export function registerAadhaarProvider(name: string, factory: ProviderFactory): void {
  factories.set(name, factory)
}

export function getAadhaarProvider(): AadhaarOtpProvider | null {
  const name = process.env.KYC_PROVIDER?.trim().toLowerCase()
  if (!name) return null
  const factory = factories.get(name)
  return factory ? factory() : null
}

// ─── Surepass adapter (Aadhaar v2: generate-otp / submit-otp) ────────────────
// Written to Surepass' documented request shape; it has NOT been exercised
// against a live account (no credentials in this repo). Verify field names
// against the contracted product before go-live.
const REQUEST_TIMEOUT_MS = 15_000

async function surepassCall(path: string, body: Record<string, string>): Promise<{ status: number; json: any } | null> {
  const key = process.env.KYC_PROVIDER_API_KEY
  if (!key) return null
  const base = (process.env.KYC_PROVIDER_BASE_URL || 'https://kyc-api.surepass.io').replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    })
    const json = await res.json().catch(() => null)
    return { status: res.status, json }
  } catch {
    return null // network / timeout — never surface the underlying error (it may echo the request)
  }
}

const surepassProvider: AadhaarOtpProvider = {
  async sendOtp(aadhaarNumber) {
    const r = await surepassCall('/api/v1/aadhaar-v2/generate-otp', { id_number: aadhaarNumber })
    if (!r) return { ok: false, failure: 'UNAVAILABLE' }
    if (r.status === 200 && r.json?.success && typeof r.json?.data?.client_id === 'string') {
      return { ok: true, providerRef: r.json.data.client_id }
    }
    if (r.status === 401 || r.status === 403 || r.status >= 500) return { ok: false, failure: 'UNAVAILABLE' }
    if (r.status === 422 || r.status === 400) return { ok: false, failure: 'INVALID_AADHAAR' }
    return { ok: false, failure: 'REJECTED' }
  },
  async verifyOtp(providerRef, otp) {
    const r = await surepassCall('/api/v1/aadhaar-v2/submit-otp', { client_id: providerRef, otp })
    if (!r) return { ok: false, failure: 'UNAVAILABLE' }
    if (r.status === 200 && r.json?.success && r.json?.data) return { ok: true }
    if (r.status === 401 || r.status === 403 || r.status >= 500) return { ok: false, failure: 'UNAVAILABLE' }
    const msg = String(r.json?.message ?? '').toLowerCase()
    if (msg.includes('expire')) return { ok: false, failure: 'OTP_EXPIRED' }
    return { ok: false, failure: 'OTP_INVALID' }
  },
}

registerAadhaarProvider('surepass', () => (process.env.KYC_PROVIDER_API_KEY ? surepassProvider : null))
