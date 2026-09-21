// Provider-specific HTTP layer for DigiLocker / API Setu. Everything that
// depends on the OFFICIAL API contract lives in this file so it can be
// finalised in one place once approval + documentation arrive.
//
// Only generic OAuth 2.0 authorization-code mechanics are used here
// (response_type/client_id/redirect_uri/state, grant_type=authorization_code).
// Endpoints and scope come from configuration — none are hardcoded.
//
// Tokens are held in memory for the duration of one callback and never
// persisted or logged. Errors never include response bodies or secrets.
import type { DigilockerConfig, DigilockerIdentity } from './digilocker.types.js'
import { DigilockerError } from './digilocker.types.js'

const TIMEOUT_MS = 15_000

export function buildAuthorizationUrl(cfg: DigilockerConfig, state: string): string {
  if (!cfg.authUrl || !cfg.clientId || !cfg.redirectUri) throw new DigilockerError('NOT_CONFIGURED')
  const u = new URL(cfg.authUrl)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', cfg.clientId)
  u.searchParams.set('redirect_uri', cfg.redirectUri)
  u.searchParams.set('state', state)
  // TODO(API Setu): add any additional mandatory authorization parameters
  // (e.g. PKCE code_challenge, consent/flow flags) once the official spec is available.
  if (cfg.scope) u.searchParams.set('scope', cfg.scope)
  return u.toString()
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' })
  } catch {
    throw new DigilockerError('UNAVAILABLE') // network/timeout — underlying error may echo request details
  }
}

// Exchanges the authorization code for an access token (returned to the
// caller only for immediate use; never stored).
export async function exchangeCodeForToken(cfg: DigilockerConfig, code: string): Promise<string> {
  if (!cfg.tokenUrl || !cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) throw new DigilockerError('NOT_CONFIGURED')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    // TODO(API Setu): add code_verifier etc. if the official flow requires it.
  })
  const res = await call(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  if (res.status >= 500) throw new DigilockerError('UNAVAILABLE')
  if (res.status === 400 || res.status === 401) throw new DigilockerError('INVALID_CODE')
  if (!res.ok) throw new DigilockerError('PROVIDER_ERROR')
  const json = (await res.json().catch(() => null)) as { access_token?: unknown } | null
  // TODO(API Setu): confirm the token response field name.
  if (!json || typeof json.access_token !== 'string' || !json.access_token) throw new DigilockerError('MALFORMED_RESPONSE')
  return json.access_token
}

// Fetches the consenting user's basic identity. The response mapping below is
// a PLACEHOLDER — confirm field names against the official documentation.
export async function fetchIdentity(cfg: DigilockerConfig, accessToken: string): Promise<DigilockerIdentity> {
  if (!cfg.apiBaseUrl || !cfg.profilePath) throw new DigilockerError('NOT_CONFIGURED')
  const url = `${cfg.apiBaseUrl.replace(/\/+$/, '')}/${cfg.profilePath.replace(/^\/+/, '')}`
  const res = await call(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } })
  if (res.status >= 500) throw new DigilockerError('UNAVAILABLE')
  if (res.status === 401 || res.status === 403) throw new DigilockerError('INVALID_CODE')
  if (!res.ok) throw new DigilockerError('PROVIDER_ERROR')
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  return mapIdentity(json)
}

// TODO(API Setu): replace with the official response schema. Only a display
// name is read; no Aadhaar number, DOB, address or document data is extracted.
function mapIdentity(json: Record<string, unknown> | null): DigilockerIdentity {
  const name = json && typeof json.name === 'string' ? json.name.trim() : ''
  if (!name) throw new DigilockerError('MALFORMED_RESPONSE')
  const ref = json && typeof json.reference_id === 'string' ? json.reference_id : undefined
  return { name, reference: ref }
}
