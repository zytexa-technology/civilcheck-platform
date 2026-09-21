# DigiLocker integration (API Setu — Requestor API & SSO)

**Status: built and tested up to the credential boundary. Live verification is NOT working yet — it is waiting for API Setu approval.** Do not describe it as working until the live test in "After approval" passes.

## 1. What it does
A Partner (Owner / Reporter / Expert) can click **Verify with DigiLocker** on the Partner portal KYC page (`/dashboard/kyc`). The backend runs the OAuth authorization-code flow with DigiLocker and records the result on the Partner (`Seller.digilockerStatus`, `digilockerProvider`, `digilockerVerifiedAt`).

DigiLocker verification is **extra evidence**. It does not change `kycStatus` or `identityVerificationStatus` — the existing admin approval / manual identity-document review is unchanged. Admins see the DigiLocker status in the partner details modal.

## 2. Implemented
| Area | Where |
|---|---|
| Config + validation (never exposes secrets) | `apps/api/src/services/digilocker/digilocker.config.ts` |
| Provider HTTP layer (all official-API-specific code isolated here) | `.../digilocker.client.ts` |
| Orchestration: state, callback, name check, persistence | `.../digilocker.service.ts` |
| Routes/controller | `apps/api/src/controllers/digilocker.controller.ts`, `seller.routes.ts` |
| Single-use OAuth state table + result columns | Prisma `DigilockerAuthState`, `Seller.digilocker*` (migrations `20260922000000_digilocker_integration`, `20260923000000_digilocker_pending_status`, additive) |
| UI card with all states | `apps/seller/src/components/DigilockerVerify.jsx` (used in `pages/seller/KYC.jsx`) |
| Startup config status log | `apps/api/src/index.ts` → `DigiLocker integration: NOT CONFIGURED / CONFIGURED` |

**There is no mock or test mode.** A "DigiLocker Verified" status can only be produced by the real provider round trip. Until credentials are configured the feature reports NOT CONFIGURED, the endpoint answers 503, and the UI says DigiLocker is not available yet (the existing manual identity-document upload remains the way to verify).

Statuses (`Seller.digilockerStatus`): none = **Not Verified**, `PENDING` = **Verification Pending** (started, not completed), `VERIFIED` = **DigiLocker Verified**, `FAILED` = **Verification Failed**. A cancelled or provider-unavailable attempt returns to Not Verified so the user can retry; `VERIFIED` is never downgraded by a later failed attempt. Admins see the same four labels in the partner details modal — no Aadhaar/DigiLocker data is exposed or stored (only status, provider, timestamp). Access tokens are used once in memory during the callback; no access/refresh token is stored.

Routes (under `/api/seller`, following the existing convention):
- `POST /digilocker/auth` (login required) → `{ authorizationUrl }`; the browser navigates there. (POST, not a GET redirect, because the JWT travels in the `Authorization` header, which a plain redirect cannot carry.)
- `GET /digilocker/callback` (public browser redirect) → 302 to `${SELLER_APP_URL}/dashboard/kyc?digilocker=<code>`
- `GET /digilocker/status` (login required)

Result codes on the redirect: `success | failed | cancelled | unavailable | session_expired`. Nothing else (no token, code or user data) is ever placed in a URL, and the redirect base is server-configured (no open redirect).

Security: 256-bit random `state`, stored only as a hash, bound to the Partner, 10-minute expiry, consumed atomically (replay impossible); client secret only in the backend; access token held in memory for one callback and never stored or logged; 15 s timeouts; no redirects followed to the provider; rate-limited; production requires https for redirect/auth/token/API URLs.

## 3. Pending because of API Setu approval
The exact official values are not in the repo and were deliberately **not invented**. They are env-configured or marked `TODO(API Setu)` in `digilocker.client.ts`:
- authorization endpoint, token endpoint, API base URL, profile endpoint path, scope
- any extra mandatory authorization/token parameters (e.g. PKCE)
- token-response field name, profile-response field names (currently a placeholder reads `access_token`, `name`, optional `reference_id`)
- whether the verified name should also auto-approve identity review (currently it does not)

## 4. Environment variables (placeholders — no real values in Git)
```
DIGILOCKER_CLIENT_ID=
DIGILOCKER_CLIENT_SECRET=
DIGILOCKER_REDIRECT_URI=
DIGILOCKER_AUTH_URL=
DIGILOCKER_TOKEN_URL=
DIGILOCKER_API_BASE_URL=
DIGILOCKER_PROFILE_PATH=
# optional: DIGILOCKER_SCOPE=
# issued with approval: DIGILOCKER_ISSUER_ID=   (TODO: confirm usage from official docs)
```
`DIGILOCKER_REDIRECT_URI` must be the public URL of `GET /api/seller/digilocker/callback` on the backend, and must be registered with API Setu. `SELLER_APP_URL` (already used elsewhere) is where users land afterwards. Never put these in frontend env files.

## 5. After approval
1. Put the issued values in the backend environment (Railway variables; `apps/api/.env` locally).
2. Fill in the official endpoints/scope/profile path, and adjust `mapIdentity` / token parsing / extra parameters in `digilocker.client.ts` to the official spec.
3. Restart/redeploy the backend; the startup log should read `DigiLocker integration: CONFIGURED`.
4. Live test: log in as a Partner → KYC page → **Verify with DigiLocker** → consent at DigiLocker → returns with the success banner and `digilockerStatus = VERIFIED`, `digilockerProvider = DIGILOCKER`.
5. Also test cancel, denied consent, and a name mismatch.

## 6. Testing
- Before approval: type-check/build only, plus tests against a local stand-in HTTP server for the client logic (no real DigiLocker call is ever made). With no credentials the button shows the "not available yet" state.
- After approval: run the live test from section 5 with the real credentials, in a staging/production-like environment with an https redirect URI.

## 7. Callback URL requirement
`DIGILOCKER_REDIRECT_URI` = `https://<backend-domain>/api/seller/digilocker/callback`, registered exactly with API Setu. Confirm from the approval documentation whether additional URLs (e.g. post-logout) must be registered.

## 8. Tokens and refresh tokens
The access token is used once, in memory, inside the callback, and is neither stored, logged nor returned to the browser. No refresh token is requested or stored: verification is a one-time identity check, so nothing needs to outlive the callback. **TODO(API Setu):** if the approved flow requires a refresh/long-lived token for later document retrieval, add it in `digilocker.client.ts` and store it encrypted with the existing `lib/encryption.ts` pattern — do not store it in plaintext.

## 9. Unit tests
`apps/api/tests/digilocker.test.ts` (run: `cd apps/api && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js tests/digilocker.test.ts`). It covers missing configuration, malformed/forged/expired/replayed state, cancellation, the OAuth flow structure, identity mismatch and provider/network errors. The provider's HTTP layer (`fetch`) is stubbed at test level only; no real DigiLocker call is made.

## 10. Local testing once credentials arrive
Put the real values in `apps/api/.env`, set `SELLER_APP_URL=http://localhost:5173`, and register the exact redirect URI API Setu allows for localhost (if it does not allow one, test on a staging https domain). Start the API and seller app, log in as a Partner, open KYC → Verify with DigiLocker.
