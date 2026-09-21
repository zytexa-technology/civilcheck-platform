// DigiLocker integration — shared types. Nothing here is an official DigiLocker
// contract: field names marked TODO must be confirmed against the API Setu
// documentation supplied with the approved credentials.

// 'live' only when every required credential/endpoint is configured; otherwise
// 'disabled'. There is deliberately no mock/test mode: a DigiLocker verification
// can only come from the real provider.
export type DigilockerMode = 'live' | 'disabled'

export interface DigilockerConfig {
  mode: DigilockerMode
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  authUrl?: string
  tokenUrl?: string
  apiBaseUrl?: string
  // Path (relative to apiBaseUrl) of the endpoint returning the consenting
  // user's basic profile. Official value pending API Setu documentation.
  profilePath?: string
  scope?: string
  // Issuer ID issued with API Setu approval. TODO(API Setu): confirm whether/where
  // the official flow needs it; it is carried as configuration only.
  issuerId?: string
  // Names of the env vars still missing for live mode (never their values).
  missing: string[]
}

export type DigilockerFailure =
  | 'NOT_CONFIGURED' // credentials / endpoints missing
  | 'ACCESS_DENIED' // user cancelled / denied consent
  | 'INVALID_STATE' // unknown, used, expired or mismatched state
  | 'INVALID_CODE' // authorization code rejected / expired
  | 'UNAVAILABLE' // timeout, network, 5xx
  | 'PROVIDER_ERROR' // 4xx other than a bad code, or provider-reported error
  | 'MALFORMED_RESPONSE' // response missing the fields we need
  | 'NAME_MISMATCH' // verified identity does not match the account

export class DigilockerError extends Error {
  constructor(public failure: DigilockerFailure, message?: string) {
    super(message ?? failure)
  }
}

// The only data we ever take from DigiLocker. No token, no document content.
export interface DigilockerIdentity {
  name: string
  // Official reference/request id if the provider supplies one (TODO: confirm).
  reference?: string
}

// Result codes the frontend receives via redirect query (`?digilocker=<code>`).
export type DigilockerResultCode =
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'unavailable'
  | 'session_expired'
