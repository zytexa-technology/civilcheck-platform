// ─────────────────────────────────────────────────────────────────────────────
// Firebase Phone Authentication (client-side only) — Firebase handles OTP
// generation/delivery/verification entirely; this module never sees or
// stores an OTP itself. Its only output is a Firebase ID token, which the
// backend verifies (POST /api/auth/buyer/firebase, reusing the existing
// lib/firebase.ts's verifyFirebaseToken — see auth.controller.ts). Nothing
// here decides who the user is or what they can do; that is entirely the
// backend's job once it has verified the token.
//
// Lazily initialized so an unconfigured deploy (no VITE_FIREBASE_* env vars)
// never throws at module load — only when a caller actually tries to use
// phone-OTP login, which the UI already gates behind IS_FIREBASE_CONFIGURED.
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type Auth,
  type ConfirmationResult,
} from 'firebase/auth'
import { FIREBASE_CONFIG, IS_FIREBASE_CONFIGURED } from '../config/env'

let app: FirebaseApp | null = null
let auth: Auth | null = null

function getFirebaseAuth(): Auth {
  if (!IS_FIREBASE_CONFIGURED) {
    throw new Error('Phone-OTP login is not configured on this deployment yet.')
  }
  if (!auth) {
    app = initializeApp(FIREBASE_CONFIG)
    auth = getAuth(app)
  }
  return auth
}

// Invisible reCAPTCHA verifier — Firebase requires this even for phone auth
// (it's the abuse-prevention step, not a second OTP). `containerId` must be
// an element already mounted in the DOM.
//
// Ownership/lifecycle is the CALLER's responsibility, not this module's:
// calling `new RecaptchaVerifier(...)` a second time against a container
// that already has a live (un-cleared) widget rendered into it is exactly
// what produces Firebase's "reCAPTCHA has already been rendered in this
// element" error. Create at most one per mounted container — see
// PhoneOtpForm's useRef-held instance — and `.clear()` it (via
// `disposeRecaptchaVerifier`) before ever creating another one on the same
// element.
export function createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(getFirebaseAuth(), containerId, { size: 'invisible' })
}

// Tears down a verifier's rendered widget so its container can safely host a
// new one. Safe to call on an already-cleared/never-rendered verifier.
export function disposeRecaptchaVerifier(verifier: RecaptchaVerifier): void {
  verifier.clear()
}

/**
 * Starts phone-OTP sign-in against an ALREADY-CREATED verifier (see
 * createRecaptchaVerifier). Does not create or dispose the verifier itself —
 * the caller decides whether a failed attempt reuses it (network hiccup) or
 * disposes and recreates it (per PhoneOtpForm's error handling). `phoneE164`
 * must be in E.164 format (e.g. "+919829000001") — Firebase requires this,
 * it does not infer a country code.
 */
export async function sendOtp(phoneE164: string, verifier: RecaptchaVerifier): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(getFirebaseAuth(), phoneE164, verifier)
}

/**
 * Confirms the OTP the user typed and returns a Firebase ID token — the
 * ONLY thing this module hands back to the caller. The caller sends it to
 * the backend's exchange endpoint; nothing here is trusted as identity on
 * its own.
 */
export async function confirmOtp(confirmation: ConfirmationResult, code: string): Promise<string> {
  const credential = await confirmation.confirm(code)
  return credential.user.getIdToken()
}
