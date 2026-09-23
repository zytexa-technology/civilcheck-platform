// ─────────────────────────────────────────────────────────────────────────────
// Partner/Seller signup identity verification — SINGLE source of truth.
//
// This is the one place that decides whether DigiLocker verification can be
// skipped during Partner signup. It applies identically to all three roles
// (Property Owner / Reporter / Expert). Nothing else hardcodes the decision:
// the signup UI reads it from GET /api/seller/signup/identity-config and
// sellerRegister enforces it server-side, so the flag governs both at once and
// hiding the button in React is never the only thing standing in the way.
//
// DIGILOCKER_SIGNUP_SKIP_ENABLED=true   (current, while approval is pending)
//   → "Skip for now" is shown
//   → signup may complete WITHOUT DigiLocker; the account is recorded as
//     NOT verified (no digilocker* field is written)
//
// DIGILOCKER_SIGNUP_SKIP_ENABLED=false  (intended production behaviour)
//   → "Skip for now" is hidden
//   → sellerRegister REFUSES to create an account unless it can consume a
//     VERIFIED DigilockerSignupSession whose verified name matches the signup
//     name. A cancelled/failed/expired verification cannot get through.
//
// Default is `true` only because DigiLocker credentials are not issued yet
// (API Setu approval pending — see docs/digilocker-integration.md). Flip it to
// false the moment credentials are configured; see the go-live steps in that
// doc / the final report.
// ─────────────────────────────────────────────────────────────────────────────

/** Default while DigiLocker approval/credentials are pending. */
const SKIP_ENABLED_DEFAULT = true

/**
 * Whether a Partner may skip DigiLocker verification during signup.
 * Read per call (never cached at module load) so a deployment can flip it with
 * a restart — the same discipline razorpay.ts / notification.service.ts use.
 */
export function isDigilockerSignupSkipEnabled(): boolean {
  const raw = process.env.DIGILOCKER_SIGNUP_SKIP_ENABLED?.trim().toLowerCase()
  if (raw === 'true') return true
  if (raw === 'false') return false
  return SKIP_ENABLED_DEFAULT
}
