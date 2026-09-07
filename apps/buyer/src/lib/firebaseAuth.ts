// ─────────────────────────────────────────────────────────────────────────────
// Firebase Phone Authentication (native) — @react-native-firebase/auth, NOT
// the Firebase JS Web SDK used by apps/buyer-web. Firebase handles OTP
// generation/delivery/verification entirely; this module never sees or
// stores an OTP itself. Its only output is a Firebase ID token, which the
// backend verifies (POST /api/auth/buyer/firebase, reusing the existing
// lib/firebase.ts verifyFirebaseToken — same endpoint apps/buyer-web uses).
//
// Why @react-native-firebase/auth over the Web SDK + a reCAPTCHA widget
// (the approach apps/buyer-web uses): on native, phone auth verifies via
// Play Integrity/SafetyNet (Android) or a silent APNs push (iOS) instead of
// a visible/invisible reCAPTCHA challenge — no WebView, no recaptcha
// container element, no extra `react-native-webview` dependency. It is also
// the actively-maintained, officially documented path for Firebase Auth in
// React Native (v26.x, released 2026-09-01), unlike the Web-SDK-in-a-WebView
// approach (`expo-firebase-recaptcha`), which this project does not use.
//
// Requires native configuration this JS module cannot provide on its own:
// `google-services.json` / `GoogleService-Info.plist` at the project root
// (registered in the Firebase Console for this app's bundle id) plus a
// native rebuild (`expo prebuild`) — see the PR notes for what is still
// needed before this can run on a device.
// ─────────────────────────────────────────────────────────────────────────────
// v26's modular API (mirrors the firebase-js-sdk v9+ shape: free functions
// taking an `Auth` instance) — NOT the older namespaced `auth().method()`
// API some older RNFirebase docs/examples still show.
import { getAuth, signInWithPhoneNumber, type ConfirmationResult } from '@react-native-firebase/auth'

export type PhoneConfirmation = ConfirmationResult

/**
 * True when the native Firebase module initialized (i.e. the app was built
 * with valid google-services.json / GoogleService-Info.plist wired in).
 * False in a build that hasn't been rebuilt with the native config yet —
 * callers use this to show a clear "not available on this build" notice
 * instead of an opaque native crash.
 */
export function isFirebaseAuthAvailable(): boolean {
  try {
    // getAuth() throws synchronously if the default native app never initialized.
    getAuth()
    return true
  } catch {
    return false
  }
}

/**
 * Starts phone-OTP sign-in. `phoneE164` must be E.164 (e.g. "+919829000001")
 * — Firebase requires this, it does not infer a country code. No reCAPTCHA
 * verifier to create/pass here (see header comment).
 */
export async function sendOtp(phoneE164: string): Promise<PhoneConfirmation> {
  return signInWithPhoneNumber(getAuth(), phoneE164)
}

/**
 * Confirms the OTP the user typed and returns a Firebase ID token — the
 * ONLY thing this module hands back to the caller. The caller sends it to
 * the backend's exchange endpoint; nothing here is trusted as identity on
 * its own.
 */
export async function confirmOtp(confirmation: PhoneConfirmation, code: string): Promise<string> {
  const credential = await confirmation.confirm(code)
  if (!credential?.user) {
    throw new Error('Verification failed — please try again.')
  }
  return credential.user.getIdToken()
}

/**
 * Firebase's native error codes (auth/invalid-verification-code,
 * auth/invalid-phone-number, auth/too-many-requests, ...) are not
 * human-readable — translate the ones a buyer can actually hit here so
 * every screen shows the same wording for the same failure.
 */
export function firebaseErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'Enter a valid 10-digit Indian mobile number.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a while before trying again.'
    case 'auth/invalid-verification-code':
      return 'Incorrect code. Please check and try again.'
    case 'auth/session-expired':
    case 'auth/code-expired':
      return 'This code has expired. Request a new one.'
    case 'auth/network-request-failed':
      return "Couldn't reach the network. Check your connection and try again."
    default:
      return error instanceof Error && error.message ? error.message : fallback
  }
}
