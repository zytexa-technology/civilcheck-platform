// DigiLocker configuration, read from the environment on every call (so adding
// credentials + restarting is the only step needed). Secrets are never
// logged or returned; `describeDigilockerConfig` exposes names/status only.
import type { DigilockerConfig, DigilockerMode } from './digilocker.types.js'

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined)

// Endpoints/scope are deliberately env-configurable: the official values are
// issued with API Setu approval and are NOT hardcoded here.
const LIVE_REQUIRED = [
  'DIGILOCKER_CLIENT_ID',
  'DIGILOCKER_CLIENT_SECRET',
  'DIGILOCKER_REDIRECT_URI',
  'DIGILOCKER_AUTH_URL',
  'DIGILOCKER_TOKEN_URL',
  'DIGILOCKER_API_BASE_URL',
  'DIGILOCKER_PROFILE_PATH',
] as const

const isProduction = () => process.env.NODE_ENV === 'production'

export function getDigilockerConfig(): DigilockerConfig {
  const env = process.env
  const values: Record<(typeof LIVE_REQUIRED)[number], string | undefined> = {
    DIGILOCKER_CLIENT_ID: clean(env.DIGILOCKER_CLIENT_ID),
    DIGILOCKER_CLIENT_SECRET: clean(env.DIGILOCKER_CLIENT_SECRET),
    DIGILOCKER_REDIRECT_URI: clean(env.DIGILOCKER_REDIRECT_URI),
    DIGILOCKER_AUTH_URL: clean(env.DIGILOCKER_AUTH_URL),
    DIGILOCKER_TOKEN_URL: clean(env.DIGILOCKER_TOKEN_URL),
    DIGILOCKER_API_BASE_URL: clean(env.DIGILOCKER_API_BASE_URL),
    DIGILOCKER_PROFILE_PATH: clean(env.DIGILOCKER_PROFILE_PATH),
  }
  const missing = LIVE_REQUIRED.filter((k) => !values[k])

  // Production must use https endpoints and an https redirect URI.
  const insecure =
    isProduction() &&
    [values.DIGILOCKER_REDIRECT_URI, values.DIGILOCKER_AUTH_URL, values.DIGILOCKER_TOKEN_URL, values.DIGILOCKER_API_BASE_URL]
      .some((u) => u && !u.startsWith('https://'))
  const problems = insecure ? [...missing, 'HTTPS_REQUIRED_IN_PRODUCTION'] : [...missing]

  const mode: DigilockerMode = problems.length === 0 ? 'live' : 'disabled'

  return {
    mode,
    clientId: values.DIGILOCKER_CLIENT_ID,
    clientSecret: values.DIGILOCKER_CLIENT_SECRET,
    redirectUri: values.DIGILOCKER_REDIRECT_URI,
    authUrl: values.DIGILOCKER_AUTH_URL,
    tokenUrl: values.DIGILOCKER_TOKEN_URL,
    apiBaseUrl: values.DIGILOCKER_API_BASE_URL,
    profilePath: values.DIGILOCKER_PROFILE_PATH,
    scope: clean(env.DIGILOCKER_SCOPE),
    issuerId: clean(env.DIGILOCKER_ISSUER_ID),
    missing: problems,
  }
}

// Safe-to-log/expose summary — never contains a secret value.
export function describeDigilockerConfig(): { status: 'CONFIGURED' | 'NOT CONFIGURED'; missing: string[] } {
  const c = getDigilockerConfig()
  return {
    status: c.mode === 'live' ? 'CONFIGURED' : 'NOT CONFIGURED',
    missing: c.missing,
  }
}
