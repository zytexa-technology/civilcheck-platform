// ─────────────────────────────────────────────────────────────────────────
//  firebaseAuth.js — Firebase Phone Authentication (client-side only)
//
//  Firebase handles OTP generation/delivery/verification entirely; this
//  module never sees or stores an OTP itself. Its only output is a Firebase
//  ID token, which the backend verifies (POST /api/auth/admin/firebase and
//  POST /api/admin/link-firebase, reusing apps/api/src/lib/firebase.ts's
//  verifyFirebaseToken). Nothing here decides who the admin is, their role,
//  or SuperAdmin privilege — that is entirely the backend's job, and the
//  backend never even attempts to resolve a SUPER_ADMIN account through
//  this path (see auth.controller.ts's loginAdminFirebase/linkAdminFirebase).
//
//  Lazily initialized so an unconfigured deploy (no VITE_FIREBASE_* env
//  vars) never throws at module load — only when a caller actually tries to
//  use phone-OTP login/linking.
// ─────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

export const isFirebaseConfigured = Boolean(
  FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId
)

let auth = null

function getFirebaseAuth() {
  if (!isFirebaseConfigured) {
    throw new Error('Phone-OTP login is not configured on this deployment yet.')
  }
  if (!auth) {
    const app = initializeApp(FIREBASE_CONFIG)
    auth = getAuth(app)
  }
  return auth
}

// One invisible reCAPTCHA verifier per attempt — Firebase requires this even
// for phone auth (abuse-prevention, not a second OTP).
function createRecaptcha(containerId) {
  return new RecaptchaVerifier(getFirebaseAuth(), containerId, { size: 'invisible' })
}

/**
 * Starts phone-OTP verification. `phoneE164` must be E.164 (e.g.
 * "+919829000001"). Resolves once Firebase has sent the OTP; the returned
 * ConfirmationResult is passed to confirmOtp with what the user typed.
 */
export async function sendOtp(phoneE164, recaptchaContainerId) {
  const verifier = createRecaptcha(recaptchaContainerId)
  try {
    return await signInWithPhoneNumber(getFirebaseAuth(), phoneE164, verifier)
  } finally {
    verifier.clear()
  }
}

/**
 * Confirms the OTP the user typed and returns a Firebase ID token — the
 * ONLY thing this module hands back. The caller sends it to the backend;
 * nothing here is trusted as identity on its own.
 */
export async function confirmOtp(confirmation, code) {
  const credential = await confirmation.confirm(code)
  return credential.user.getIdToken()
}
