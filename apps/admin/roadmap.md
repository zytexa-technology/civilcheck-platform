# CivilCheck Admin Panel Completion Plan

Grounded in the product spec PDF (Section 5 — Super Admin Functional Requirements — plus Sections 8/10 for payments and legal), the mature backend (`apps/api`, fully built across Days 1-8, see `docs/roadmap.md`), and a direct line-by-line audit of this app's current code. The seller panel has its own plan at `apps/seller/roadmap.md`; the buyer app is out of scope here (see its shipped payment-flow fix noted in `docs/roadmap.md`).

**Tech-stack note:** the PDF (Section 12/13) specifies Next.js. This app is React + Vite — a deliberate earlier deviation, not revisited here.

---

## Status — verified 2026-07-31

| Day | Scope | Status |
| --- | --- | --- |
| Day 1 | Finish RBAC coverage | ✅ Complete |
| Day 2 | KYC doc review, Content Control, manual refunds, Day 8 feature UI | ✅ Complete |
| Day 3 | 2FA + full polish pass | ✅ Complete |
| Day 4 | Report Flags + KYC review pipeline | ✅ Complete |

**Build state:** `pnpm --filter admin build` clean (678 modules; the >500 kB chunk warning is Vite's default advisory — no code-splitting work planned in this pass). `pnpm --filter api build` (`tsc`) clean, backend Jest suite 23/23 across 6 suites (no backend code changed on Day 3 — run as a regression check).

**Lint state:** `pnpm --filter admin lint` still fails, but it failed *before* this work too. Day 3 took it from **32 errors → 25** and added none. What remains is one pre-existing house pattern — `useEffect(() => { loadX() }, [])` declared above the function it calls ("Cannot access variable before it is declared") plus the matching `exhaustive-deps` warnings — across roughly a dozen pages, most of which this plan never touched. Clearing it is a mechanical repo-wide reorder, deliberately out of scope here rather than mixed into a feature pass.

---

## Pre-production QA audit — 2026-08-03

_Full detail in `docs/qa-audit-2026-08-03.md`; admin-specific findings summarized here._

1. **✅ Fixed 2026-08-04 — "Sign Out" now calls the backend logout endpoint.** Was: `AuthContext.jsx`'s `logoutAdmin` and `Dashboard.jsx`'s `handleLogout` only cleared `localStorage` and redirected, so a copied admin JWT stayed valid after sign-out and the audit log never recorded it. `Dashboard.jsx`'s `handleLogout` now awaits `logout()` (`api/auth.api.js`, `POST /auth/logout`) before `logoutAdmin()` clears local state — server session ends, `ADMIN_LOGOUT` is audit-logged, confirmed working in the browser (`docs/qa-fixes-status-2026-08-04.md`). Was the one launch-blocking finding in this app; no longer open.
2. **Lint state note:** the number this doc and prior sessions cited (32 → 25 errors, Day 3) was measured against a different ESLint version than the one `apps/admin` actually pins. The monorepo has two installs — a hoisted root copy (v9.39.5) and this app's own local copy (v10.7.0, matching `package.json`). Running the correct one (`node_modules/.bin/eslint`, what `pnpm --filter @civilcheck/admin lint` invokes) gives **40 problems** today (27 errors, 13 warnings) — 19 `react-hooks/immutability` (the same pre-existing "declared below where it's called" pattern noted in Day 3, confirmed still cosmetic, not a runtime bug), 13 `exhaustive-deps`, 5 `set-state-in-effect`, 2 harmless `no-unused-vars` (dead `Legend` import, unused `catch (err)`), 1 `react-refresh` (dev-only). Worth deduping the two ESLint installs so a future session/CI run can't get misled the way this audit initially was.
3. **Minor dead code, not a bug:** `api/admin.api.js`'s `createAuditLog()` wrapper is defined but never called anywhere — the backend writes its own audit entries server-side on relevant actions, so this looks like a leftover, possibly copy-pasted, unused export.
4. **Architectural note, not a live bug:** admin JWT is stored in plain `localStorage` (`AuthContext.jsx`, `api/axios.js`). No XSS vector was found in this app (`dangerouslySetInnerHTML`/`eval` grep empty), so nothing is exploitable today, but any future XSS would be a full session takeover. Worth considering for later hardening, not blocking.
5. **Everything else checked out clean:** route guarding (`ProtectedRoute` correctly gates on `loading` before checking `admin`, no UI flash pre-redirect), RBAC UI gating (`utils/permissions.js` matches the backend's role matrix exactly, hides rather than just disables ungranted actions), and full API-endpoint alignment (every `admin.api.js`/`auth.api.js`/`content.api.js` call has a matching backend route with the correct verb) — no dead-endpoint buttons found.

---

## Ground-truth findings (verified, not assumed)

1. **No manual "create refund" flow exists**, despite the backend already having `POST /admin/refunds` (`createRefund`, needs `{purchaseId, reason, amount?}`) and the PDF (5.5) explicitly calling for "issue partial or full refunds." Today this panel can only process/reject refunds that were auto-created elsewhere (strikes, SLA sweeps, special-request rejection).
2. **`flaggedForSpotCheck` (PDF 5.3's "10% auto-flag") has zero UI** — no filter, no visual marker, anywhere in `Listings.jsx`, even though `GET /api/admin/listings?flaggedForSpotCheck=true` already works server-side.
3. **Content Control (PDF 5.4) has zero UI** — categories, service areas, disclaimers, banners are all built and working server-side (Day 2) with no admin page at all.
4. **Three Day 8 backend features have zero UI**: the SMS delivery log, the special-request seller payout ledger (which also has no _admin-facing read endpoint yet_ — needs one small backend addition), and `subscriberChurnRate`/`monthlyRenewalRate` (present in the API response, never rendered in `Analytics.jsx`).
5. **KYC document review is not real.** `Sellers.jsx`'s modal shows `certificateUploaded ? 'Uploaded ✓' : ...` instead of the actual Cloudinary URLs — an admin approves KYC without ever being able to look at the documents (PDF 5.2 explicitly requires reviewing Aadhaar/Bar Council/CE certificate/selfie).
6. Everything else from the original three-app audit still applies where not already fixed — see "Already shipped" below.

## Already shipped

Fixed the `admin.phone`/"undefined" login-card bug, dead phone-OTP API functions, the `VITE_API_URL` silent-failure bug, orphaned `App.css`; converted the whole dashboard from tab-state to real `react-router-dom` routes (deep-linking, back/forward, and `AuditLog.jsx` — previously built but unreachable — now wired in); built `src/utils/permissions.js` mirroring the backend's exact RBAC matrix and applied it to Sellers/Listings/SpecialRequests/Refunds (including a previously-dead `updateSellerBadge` import, now a real control, and a new admin auto-assign UI for the Day 8 nearest-seller-match feature).

---

## Day 1 — Finish RBAC coverage — ✅ COMPLETE

_Goal: nothing admin-side is silently unenforced._

- RBAC already applied across Sellers/Listings/SpecialRequests/Refunds (done in the pass that produced `utils/permissions.js`) — no further gaps found this pass.
- Confirmed no page was missed — `Buyers`/`AlertSubs`/`Reports`/`Settings` are read-only-by-nature and need no gating.
- Content-Control write surfaces will use the same `canManageContent` helper once built (Day 2) — nothing to do here yet since the page doesn't exist.
- Cross-reference: `apps/seller/roadmap.md`'s Day 1 fixed a critical seller-registration bug — not this app's fix, but worth knowing why the seller list might have looked sparse during testing before that landed.

**Verification:** `pnpm build` clean. Full click-through as each of SUPER_ADMIN/SUB_ADMIN/VIEWER confirming the RBAC matrix in `docs/roadmap.md`'s Day 2 section holds true in the UI is still pending manual verification (see Day 3, which repeats this after 2FA lands).

---

## Day 2 — KYC document review, Content Control, manual refunds, Day 8 feature UI — ✅ COMPLETE

_Goal: everything in PDF Section 5.2/5.4/5.5 that has a backend but no UI gets one._

1. ✅ **Real KYC document review** — `Sellers.jsx`'s modal now fetches the full seller record (`getSellerById`, previously imported but never called) on open and renders the actual `barCouncilDoc`/`selfieUrl` Cloudinary URLs via a new `KycDocLink` component (image preview when the URL looks like one, always a "View document" link) instead of a bare "Uploaded ✓" boolean.
2. ✅ **`flaggedForSpotCheck` filter** in `Listings.jsx` — a checkbox against the existing backend filter support, plus a "🔍 QC" badge on flagged rows.
3. ✅ **Content Control page** (`ContentControl.jsx`) — four tabs (categories / service areas / disclaimers / banners), full CRUD via a new `api/content.api.js`; reads open to all roles, writes gated `canManageContent` (SUPER_ADMIN only). Soft-delete is exposed as "Deactivate" with a "Reactivate" path (matches the backend's revive-on-recreate behavior).
4. ✅ **Manual refund creation** — new backend `GET /api/admin/purchases` (`searchPurchases`, by buyer phone or listing address — `createRefund` needs a specific `purchaseId` and there was no way to find one) + `createRefund`/`searchPurchases` in `admin.api.js` + a `NewRefundModal` in `Refunds.jsx` (search → pick → reason/optional partial amount), gated `canManageRefunds`.
5. ✅ **Day 8 feature UI**: new backend `GET /api/admin/special-request-payouts` (mirrors `getSmsDeliveryLogs`'s pagination shape) + new `PayoutLedger.jsx` page; new `SmsDeliveryLog.jsx` page against the endpoint that already existed; `subscriberChurnRate`/`monthlyRenewalRate` now rendered in `Analytics.jsx`'s new "Alert Subscriptions" section (renewal-rate legitimately still shows "—", not faked).
6. ✅ **Payments / Settlements nav items** — were pointing at the identical `Reports` component (a CSV-export/compliance tool); replaced with two new live, browsable pages (`Payments.jsx`, `Settlements.jsx`) built on the same `getRevenueReport`/`getSettlementReport` endpoints Reports.jsx already uses, giving day-to-day operational visibility that CSV export doesn't.

**Verification:** `pnpm build` (admin) and `pnpm build:api` both clean; backend Jest suite 23/23 after the two new endpoints. Manually approving a seller after viewing real documents, flag-filtering a listing, editing a content category, and issuing a partial refund all still need a live click-through (see Day 3).

---

## Day 3 — 2FA and full polish pass — ✅ COMPLETE

_Goal: admin panel is feature-complete against PDF Section 5 and internally consistent._

1. ✅ **2FA login + enrollment.** `Login.jsx` now sends an optional `totp`, reveals a 6-digit field only when the backend answers `401 {code:'TOTP_REQUIRED'}` (the panel cannot know in advance whether an admin is enrolled), clears the field on `TOTP_INVALID` since codes are single-use, and routes a successful unenrolled login to the new page via `twoFactor.enrollmentRequired`. New `Security.jsx` drives all four existing endpoints — status → setup (QR through `qrcode.react`, plus the manual-entry secret for admins whose camera can't read it) → enable → disable (which correctly costs both password and a live code).
2. ✅ **Pagination** on Sellers / Listings / SpecialRequests / Refunds. All four backend endpoints already accepted `page`/`limit` and returned `total` — only the frontend was never passing them, so an admin could physically not see past the first 20 rows.
3. ✅ **Shared components.** New `src/components/ui.jsx` holds `Pagination`, a now-dismissible `Toast`, and `Badge`. Five copy-pasted local `Toast` definitions are gone; `Buyers.jsx`'s was dead anyway (`setToast` was never called).
4. ✅ **`Reports.jsx` `YEARS`** computed from the current year instead of the hardcoded `[2024, 2025, 2026]`.
5. ✅ **`Settings.jsx` is now read-only.** It was a full form whose `handleSave` ran a `setTimeout` and then claimed "✅ Settings saved successfully!" — nothing was persisted, and the Danger Zone buttons had no `onClick` at all. It now displays the real constants (commission split per badge including the SILVER tier the form omitted, ₹49/₹499 plan prices, ₹500 settlement floor, ₹99–₹4,999 listing bounds, 10% spot-check rate, 3-strike ban) each annotated with the source file, plus the env vars that genuinely are deploy-time configurable.

**Found and fixed beyond the plan** (all the same class of defect — the UI asserting something the backend never said):

- **Stat cards were counting the loaded page, not the platform.** Paging would have made this badly wrong, but `Listings.jsx` was already broken before it: its default status filter is `PENDING_REVIEW`, so the "Approved" and "Rejected" cards were permanently pinned at 0. Sellers/Listings now read real totals from `getAnalyticsOverview` + `getRiskBreakdown`; SpecialRequests has no counts endpoint, so each card is a cheap `limit: 1` query read for its `total`. All refresh after an action moves a row between buckets.
- **`DashboardHome.jsx` charted a hardcoded 7-month revenue array** (`MOCK_CHART_DATA`, ₹42k→₹159,850) while `GET /admin/analytics/monthly-revenue` — already wired up in `auth.api.js` — went unused. Now real.
- **Seller search implied a global search** but only ever filtered the loaded array; the backend seller list has no search param, so the placeholder now says it filters this page.

**Verification:** admin build clean; lint errors 32 → 25 with none added. Still needs a live click-through: enrol a real admin in 2FA and confirm the next login actually demands the code, then walk the panel once as each of SUPER_ADMIN / SUB_ADMIN / VIEWER.

---

## Day 4 — Report Flags + the KYC review pipeline — ✅ COMPLETE

_Found by auditing every backend admin endpoint against every frontend call after Day 3 closed. These were not in the original three-day plan; the earlier audit's "features with no UI" list (SMS log, payout ledger, churn rate) missed them._

1. ✅ **Report Flags (PDF 7.8) UI built.** New `ReportFlags.jsx` (+ `api/admin.api.js`'s `getReportFlags`/`resolveReportFlag`/`dismissReportFlag`) — a status-filtered, paginated queue (`PENDING`/`RESOLVED`/`DISMISSED`) showing the reporting buyer, the flagged listing, and the reason, with a review modal (adminNote + Resolve/Dismiss) gated `canQcListings`, mirroring `Refunds.jsx`'s existing action-modal pattern. New nav entry under Management, routed at `/dashboard/report-flags`.
2. ✅ **KYC review pipeline wired in.** `Sellers.jsx`'s `SellerModal` now calls the purpose-built `GET /admin/kyc/:id` (new `getKycApplication` in `admin.api.js`) instead of `GET /admin/sellers/:id`, and renders the extra fields it carries: T&C acceptance, digital signature, masked bank account (last 4) + IFSC, and PAN-on-file — none of which the plain seller record exposed. Both endpoints share identical RBAC (`adminMiddleware` only, no extra role gate), so this is not a permissions regression for any role.

**Verification:** `pnpm --filter admin build` clean (665 modules) after both changes. Both new endpoints called live against a running `apps/api` + Neon dev DB: `GET /admin/kyc/:id` for the seeded GOLD seller returned the full nested `application` shape (`documents`/`compliance`/`banking`) exactly as the modal expects; `GET /admin/report-flags?status=PENDING` returned the correct empty-state shape (`total: 0, flags: []`) since no flags exist in the seed data. `resolveReportFlag`/`dismissReportFlag` were verified by direct code review (both guard `status: 'PENDING'` via `updateMany`, audit-logged) rather than a live round trip — creating a throwaway flag against the shared dev DB to test them was intentionally not done this pass. **Not done:** an actual browser click-through — no browser/UI-automation tool is available in this environment.

---

## Flagged, not fixed here

**Badge threshold discrepancy:** the PDF (6.2) specifies Gold/Platinum badges require a _combination_ of listing count + rating + accuracy score. Day 7 of the backend roadmap implemented rating-only thresholds as a product-approved default. This is a backend business-logic question, out of scope for a UI-completion plan — Sellers.jsx's badge control should stay honest that it's driving (and being driven by) the rating-only rule that's actually live today.
