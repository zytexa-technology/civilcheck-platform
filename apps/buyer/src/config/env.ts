import Constants from 'expo-constants'

// ─────────────────────────────────────────────────────────────────────────────
// API base URL resolution.
//
// Replaces the hardcoded LAN IP that used to live in api/client.js, which broke
// the moment the dev machine changed networks. Resolution order:
//
//   1. EXPO_PUBLIC_API_URL — set this in .env (or the shell) to point at a
//      deployed API. EXPO_PUBLIC_* vars are inlined by Metro at bundle time and
//      work in Expo Go and in production builds alike.
//   2. The Metro dev-server host. In development `Constants.expoConfig.hostUri`
//      is "<dev-machine-lan-ip>:8081"; the API normally runs on that same
//      machine, so reusing the host with the API port auto-follows a network
//      change with no edit.
//   3. LOCALHOST_FALLBACK — last resort (simulator / hostUri unavailable).
//
// Only step 1 is meaningful in a release build: there is no Metro host to read,
// so a shipped app MUST have EXPO_PUBLIC_API_URL baked in.
// ─────────────────────────────────────────────────────────────────────────────

// Matches PORT in apps/api/.env and the VITE_API_URL the admin and seller apps
// are configured with. apps/api/src/index.ts falls back to 8000 when PORT is
// unset, so override EXPO_PUBLIC_API_URL if you run it that way.
const API_PORT = 3000
const LOCALHOST_FALLBACK = `http://localhost:${API_PORT}`

/** Strip any trailing slash so callers can always append "/api" cleanly. */
function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/**
 * Derive the API origin from the Metro dev-server host.
 *
 * hostUri looks like "192.168.1.7:8081" (or "192.168.1.7" when the port is
 * implicit). We keep only the host and swap in the API port. Returns null when
 * there is no dev server — i.e. in any production build.
 */
function fromMetroHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri
  if (!hostUri) return null

  const host = hostUri.split(':')[0]
  if (!host) return null

  return `http://${host}:${API_PORT}`
}

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL
  if (fromEnv) return normalize(fromEnv)

  const fromHost = fromMetroHost()
  if (fromHost) return fromHost

  return LOCALHOST_FALLBACK
}

/** Origin only, no path — e.g. "http://192.168.1.7:3000". */
export const API_BASE_URL = resolveBaseUrl()

/** What axios is configured with — e.g. "http://192.168.1.7:3000/api". */
export const API_URL = `${API_BASE_URL}/api`

/** True when the URL was supplied explicitly rather than sniffed from Metro. */
export const API_URL_IS_EXPLICIT = Boolean(process.env.EXPO_PUBLIC_API_URL)

/**
 * True only for a genuine release build shipped with no EXPO_PUBLIC_API_URL
 * baked in — the exact gap from the QA audit (2026-08-03, finding #7): with
 * no Metro dev server to sniff, resolveBaseUrl() falls through to
 * LOCALHOST_FALLBACK, and every screen on a real device silently fails
 * against an address it can never reach.
 *
 * __DEV__ is always true in a local dev session (Expo Go, simulator, or
 * Metro-connected device) regardless of which resolution branch fired, so
 * this can never false-positive during normal development — only an actual
 * release/production JS bundle can trip it.
 */
export const IS_MISCONFIGURED_BUILD = !__DEV__ && !API_URL_IS_EXPLICIT
