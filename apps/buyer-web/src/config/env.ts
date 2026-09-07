// ─────────────────────────────────────────────────────────────────────────────
// API base URL resolution — same convention apps/admin and apps/seller use
// (see their src/api/axios.js): VITE_API_URL, no trailing slash, no /api
// suffix, "/api" appended exactly once here.
// ─────────────────────────────────────────────────────────────────────────────

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export const API_BASE_URL = normalize(import.meta.env.VITE_API_URL || 'http://localhost:3000')

/** What the axios client is configured with — e.g. "http://localhost:3000/api". */
export const API_URL = `${API_BASE_URL}/api`

/** Publishable key id only — never a secret. Optional; per-order key wins. */
export const RAZORPAY_KEY_ID_FALLBACK = import.meta.env.VITE_RAZORPAY_KEY_ID || null

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Web config — public/publishable by design (Firebase's own docs:
// this is safe to ship client-side, restricted by Firebase Security Rules and
// API-key HTTP-referrer restrictions on the Firebase Console side, not by
// keeping it secret). Left entirely unset in this environment — no
// credentials invented. Phone-OTP login degrades to "unavailable" (see
// PhoneLogin.tsx) until these are configured.
// ─────────────────────────────────────────────────────────────────────────────
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

export const IS_FIREBASE_CONFIGURED = Boolean(
  FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId
)
