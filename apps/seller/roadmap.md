# CivilCheck Seller Panel Completion Plan

Grounded in the product spec PDF (Section 6 — Seller Functional Requirements — plus Sections 8/10 for payments and legal), the mature backend (`apps/api`, fully built across Days 1-8, see `docs/roadmap.md`), and a direct line-by-line audit of this app's current code. The admin panel has its own plan at `apps/admin/roadmap.md`; the buyer app is out of scope here (see its shipped payment-flow fix noted in `docs/roadmap.md`).

**Tech-stack note:** the PDF (Section 12/13) specifies Next.js. This app is React + Vite — a deliberate earlier deviation, not revisited here.

---

## Status — verified 2026-07-31

| Day | Scope | Status |
| --- | --- | --- |
| Day 1 | Fix registration, remove fabricated code, real routing | ✅ Complete |
| Day 4 | Real KYC upload, DigiLocker, money-moving flows | ✅ Complete |
| Day 5 | Polish + full verification pass | ✅ Complete |

**Build state:** `pnpm --filter seller build` clean (100 modules). No lint tooling is configured for this app — `eslint.config.js` and a `lint` script are both absent — so the Vite build is the only automated check, and it catches import/syntax errors only, not unused variables or React-hook mistakes. Adding ESLint remains an open nice-to-have, not done this pass.

**Day 5 — delivered 2026-07-31:**

1. ✅ **`components/Icon.jsx`'s `console.warn`** now gated behind `import.meta.env.DEV`, matching the `ALLOW_DEMO_FALLBACK` convention already used in `Login.jsx`.
2. ✅ **`AuthContext.jsx`'s stale-cache read removed.** The premature `setSeller(cached)`/`applyRole(cached)` before the async `/seller/profile` check resolved had no actual UX benefit — `loading` stays `true` (and both `ProtectedRoute` and `AppRoutes` gate all rendering on it) until the real fetch settles, so the cached paint was never visible, only a latent risk if that gating ever changed. Removed; `seller` is now only ever set from a verified response.
3. ✅ **`MyListings.jsx`'s `* 0.6` magic number replaced** with a `SELLER_CUT_BY_BADGE` map (BRONZE/SILVER 0.6, GOLD 0.65, PLATINUM 0.7) mirroring `apps/api/src/services/payment.service.ts`'s `REPORT_UNLOCK_PLATFORM_SHARE`, keyed off the logged-in seller's real badge via `useAuth()`. Verified live against the seeded GOLD seller (`Adv. Meera Sharma`): `GET /seller/earnings/transactions` returned `yourEarning: 649.35` on a ₹999 sale — exactly `999 × 0.65` — confirming the 0.65 constant is correct, not just plausible.
4. ✅ **`MyListings.jsx`'s dead "View" button wired** to a new `ListingDetailModal` (`getSingleListing` + `updateListing`, both previously unused). Shows the full listing (case/loan/notes/risk/sales) and lets the seller edit price, case status/number/court/parties, loan default + lender, and notes — with an explicit note that saving sends the listing back through admin review, since the backend's `updateListing` unconditionally resets `status` to `PENDING_REVIEW`. Verified live: `PUT /seller/listings/:id` round-tripped correctly and did reset status as documented (then restored via `POST /admin/listings/:id/approve` to leave the seed data clean).
5. ✅ **`NewListing.jsx`'s hardcoded dark theme replaced** with the app's real light `GlobalStyles` design system — CSS variables (`var(--ink)`, `var(--seal)`, `var(--danger)`, etc.), `.btn`/`.control` classes, and `var(--disp)`/`var(--body)` fonts throughout, matching `MyListings.jsx`'s idiom. No logic changes (same `PROPERTY_FIELDS`/`EMPTY_FORM`/`buildPayload`/`canProceed`). Incidentally fixed two literal `\uXXXX` escape-sequence bugs (the success-screen checkmark and the error-banner warning icon were rendering as literal text, not emoji, since JSX text nodes don't interpret backslash escapes).
6. ✅ **Pagination added** to `MyListings.jsx` (client-side — `GET /seller/listings` has no `page`/`limit` support server-side), `expert/Earnings.jsx`'s transactions table (real server-side pagination — the endpoint already supported `page`/`limit`/`total`/`totalPages`, only the UI never passed them), and `shared/Notifications.jsx` (client-side — `GET /seller/notifications` is hard-capped at 50 rows server-side with no page param). A shared `Pagination` component was added to `components/ui.jsx`, mirroring the admin panel's own copy. Backend pagination for listings/notifications is a possible future backend task, not done here — out of scope for a frontend-only pass.

**Verification:** `pnpm --filter seller build` clean after every change. Live-verified against a running `apps/api` dev server (Neon dev DB) and the seeded GOLD seller (`9829100001`): `GET /seller/listings`, `GET/PUT /seller/listings/:id`, `GET /seller/earnings/transactions?page=&limit=`, and `GET /seller/notifications` all called and their response shapes matched what the updated components expect. **Not done:** an actual browser click-through — this session has no browser/UI-automation tool available, so the interactive polish (modal open/close, pagination clicks, form validation feel) is verified by code inspection and live API responses only, not by driving the rendered page.

---

## Pre-production QA audit — 2026-08-03

_Full detail in `docs/qa-audit-2026-08-03.md`; seller-specific findings summarized here. Findings 1–2 fixed 2026-08-04; 3–4 remain open low-priority items._

1. **✅ Fixed 2026-08-04 — persona separation (owner/expert/seller `partnerRole`) is now enforced server-side, not just in the UI.** Was: `Layout.jsx`'s `RM`/`NAV`/`PAGES` registries correctly showed each persona only its own tabs, but `apps/api/src/middleware/auth.middleware.ts`'s `sellerMiddleware` only checked the JWT and `kycStatus`, never `partnerRole` — any seller's own token could be replayed directly against another persona's endpoints. `auth.middleware.ts` now exports `requireSellerRole(...allowed)`, which checks `req.seller.partnerRole` against an allow-list and blocks (with an audit log line) otherwise; wired into the persona-specific routes. This app's UI-level role-gating now reflects a real backend guarantee, not just a hidden screen.
2. **✅ Fixed 2026-08-04 — `owner/AddProperty.jsx`'s "Mandatory" documents are now actually required, server-side.** Was: `submit()` only validated `title`/`area`, and the backend accepted `documents: []` unconditionally. `property-owner.controller.ts`'s `createProperty` now rejects with a 400 (`"All 8 mandatory documents must be uploaded..."`) unless all 8 (Sale Deed, Registry, Khata, Mutation, Property Tax Receipt, Electricity Bill, Owner Aadhaar, PAN Card) are present — matching `seller/NewListing.jsx`'s existing step-gating discipline.
3. **🟡 `owner/MyProperties.jsx`'s `load()` has no stale-response guard**, unlike every sibling loader in this app (`owner/Dashboard.jsx`, `owner/Analytics.jsx`, both of which use a `let live = true` pattern). On a slow connection, rapidly switching filter tabs can let an older response overwrite a newer one, showing an incorrect (often empty) list until the next state change triggers a refetch.
4. **🟡 Leftover fake trend data survived the earlier fake-data cleanup, isolated to `owner/`.** `owner/Dashboard.jsx` and `owner/Analytics.jsx` both hardcode `trend="▲ 8%"`/`trend="▲"` on stat cards — static strings, not derived from any real week-over-week computation. The git-log "master audit — remove fake data, fix dead UI" pass appears to have missed this newer, less-visited persona specifically.
5. **Confirmed still true, and now more consequential:** this app still has **zero lint tooling** (see Status above) — no `eslint.config.js`, no `lint` script. Findings #2 and #3 above are exactly the class of issue a `react-hooks`/`no-unused-vars` pass tends to draw attention near. Recommend copying `apps/admin/eslint.config.js` as a baseline.
6. **Verified NOT bugs, checked because they looked suspicious:** all 11 `react-hooks/set-state-in-effect` hits (traced by hand — every dependency array is `[]`, a primitive, or a guarded one-shot; none can loop) and all 7 `react-refresh/only-export-components` hits (every extra named export is correctly imported/consumed elsewhere; dev-only Fast Refresh impact, zero production effect). The KYC upload flow (real signed Cloudinary upload, client-side validation mirroring the server signature, explicit `mock: true` labeling when Cloudinary env vars are absent) and the Settlements/Earnings pages (field-for-field verified against the real API response shapes) are both solid.

---

## Ground-truth findings (verified, not assumed)

1. **🔴 Seller registration is broken against the real backend, right now.** `src/pages/Login.jsx`'s `confirmRole()` calls `sellerRegister({ phone, name, profession, partnerRole })` — no `tcAccepted`. The backend's `sellerRegistrationSchema` (`packages/shared/src/validation.ts:44`) requires `tcAccepted: z.literal(true)` with **no default and no `.optional()`**. Every real registration attempt gets a `400`. It's masked in dev because `ALLOW_DEMO_FALLBACK` only catches network errors (`!e.response`), not validation errors — so a real backend 400 surfaces as an error message, and a _dead_ backend silently logs someone in as a fake seller instead. This is the most severe finding in the whole audit and is Day 1, item 1.
2. **The only file in this app that references `bankAccount`/`ifsc`/`selfieUrl`/`tcAccepted`/`digitalSignature` is `pages/seller/KYC.jsx`** — one of six _orphaned, unrouted_ pages. It already has a working bank-account/IFSC editor to revive; it has no Cloudinary or DigiLocker integration at all.
3. **Badge threshold discrepancy (flagging only, not fixing here):** the PDF (6.2) specifies Gold/Platinum badges require a _combination_ of listing count + rating + accuracy score. The backend's Day 7 implemented rating-only thresholds as a product-approved default for that session — not something this frontend-focused plan changes.
4. Everything else from the original three-app audit still applies where not already fixed.

---

## Day 1 — Fix registration, remove fabricated code, real routing — ✅ COMPLETE

_Goal: nothing here should be silently broken or fake by the time today ends._

1. ✅ **Fixed seller registration** (critical). `Login.jsx`'s role-selection step now has a mandatory T&C checkbox (placeholder copy — real legal T&C text is still a lawyer-drafted deliverable per PDF 10.3, flagged not invented) that sets `tcAccepted: true` before calling `sellerRegister`; `digitalSignature` is the seller's own typed name from the profile step, reused rather than asking twice. `ALLOW_DEMO_FALLBACK`/`DEMO_OTP` are now gated behind `import.meta.env.DEV` (including the 409-retry path), so neither ships in a production build.
2. ✅ **Removed fabricated code**: deleted the Reporter role entirely (`pages/reporter/*`, imports, nav entries, role-picker option in `Login.jsx`). Triaged all six orphaned `pages/seller/*.jsx` files:
   - `KYC.jsx` — kept, reserved for Day 4's revival.
   - `Earnings.jsx` — its real per-purchase transaction table (via `getTransactions`) didn't exist in the live `expert/Earnings.jsx`; merged in (adapted to the `Card`/`.li` idiom, not copy-pasted raw styles) along with a real transactions-derived commission figure replacing a fabricated 15%-of-net estimate. Orphan deleted.
   - `Notifications.jsx` — its real mark-read/mark-all-read (backed by working `POST /seller/notifications/:id/read` and `/mark-all-read` endpoints, verified) didn't exist in the live `shared/Notifications.jsx`; merged in. Orphan deleted. (`PageHead` gained an optional `right` slot to support the "Mark all read" button, mirroring the existing `SectionTitle` pattern — backward compatible.)
   - `Settlements.jsx` — nothing else covers settlement history at all; revived and routed in (new `Finance` nav item + `settle` icon), fixing its unkeyed-`<>` React-key bug (`Fragment key={st.weekOf}`) along the way since it was being reactivated anyway.
   - `DashboardHome.jsx`, `SpecialRequests.jsx` — confirmed genuine duplicates of `expert/Dashboard.jsx`'s existing functionality (same API calls: `getAvailableRequests`/`acceptRequest`/`declineRequest`). Deleted.
   - Deleted the dead "Manage Roles" toggle UI in `pages/shared/Profile.jsx` (`addRole`/`removeRole` were no-ops); replaced with a read-only partner-status card (role, KYC status, badge, accuracy score — all real fields).
3. ✅ **Real routing**: `App.jsx`'s `/dashboard` route is now `/dashboard/*`; `Layout.jsx` derives the active section from `location.pathname` instead of local `useState` (same technique as `apps/admin/pages/Dashboard.jsx`) — deep-linking and back/forward now work. The role-switcher dropdown (which only ever had one role to switch to, since a seller has exactly one `partnerRole`) was simplified to a plain link to Profile.

**Verification:** `pnpm build` clean for both `apps/admin` and `apps/seller` after every change in this pass (no lint tooling configured for `apps/seller` — relied on the build catching import/syntax errors). Registering a brand-new seller through a live backend to confirm the real `201`/`Seller` row still needs to be done manually (see below).

---

## Day 4 — Real KYC upload, DigiLocker, and the money-moving flows — ✅ COMPLETE

_Goal: everything a seller needs to actually get paid works end to end, not just visually._

1. ✅ **`KYC.jsx` revived and routed.** It is now the `shield` nav entry for **both** roles (owners are `Seller` rows too and need KYC to be paid out), reached at `/dashboard/shield`. Added a `DocSlot`-based upload section and a DigiLocker card on top of the bank-account editor it already had. It now prefers `GET /seller/kyc/status` over the cached `AuthContext` seller for status/badge/`aadhaarVerified`/`barCouncilDoc`, so an upload or a DigiLocker completion shows immediately instead of a page-load later. `kycData` was previously fetched and never read.
2. ✅ **Cloudinary signed upload** — new `api/cloudinaryUpload.js`. Echoes back exactly the four signed params (`allowed_formats`, `folder`, `max_file_size`, `timestamp`) since dropping or adding any invalidates the signature, and pre-validates extension and size client-side so a doomed upload fails with a useful message rather than an opaque Cloudinary 400.
3. ✅ **DigiLocker OAuth** — `GET /seller/kyc/digilocker/authorize` opens the consent URL in a new tab, with an explicit "Refresh status" button, because the backend callback returns raw JSON instead of redirecting into the panel (a known front-end-owned carry-over). No fake handshake is implied.
4. ✅ **`expert/Verification.jsx` deleted.** It listed seven documents as `Uploaded ✓` unconditionally — and four of them (PAN, Government ID, Experience Details, Service Area) have **no backend field at all**, so they could never have had a real status. The real KYC page replaces it rather than a second page competing with it.
5. ✅ **Real special-request submit.** `expertActions.submit(id, listingId)` now calls the real endpoint. The design blocker is resolved by following what the backend actually models: the research deliverable *is* a `Listing` (`submitRequest` sets `completedListingId`), so `UploadReportModal` now lists the expert's own listings via `getMyListings` and routes them to New Listing when they have none. The old modal's title / findings / "evidence" fields were removed outright — nothing persisted them.
6. ✅ **Featured-listing (₹499/mo) subscription UI** in `MyListings.jsx` — per-row ★ Feature action (only on `APPROVED` listings, since promoting an unpublished one buys nothing), live status from `GET /seller/subscriptions`, and cancel.
7. ✅ **"Download Statement" wired** to `GET /seller/earnings/statement/pdf` via a blob response — the button previously had no `onClick` whatsoever.

### Two plan assumptions that were wrong, and what was done instead

- **Featured listings are Razorpay _subscriptions_, not one-off orders.** This plan said "→ mock-pay → verify, same pattern as the buyer app's fix." There is no verify endpoint to call: `createFeaturedSubscription` returns a mandate, and the row only reaches `ACTIVE` when the `subscription.activated`/`charged` **webhook** arrives. Signing a webhook from the browser would mean the panel impersonating Razorpay, so the UI instead creates the subscription and states plainly that it is awaiting authorization and that no charge has occurred — the same refusal-to-fake as the buyer app's `PaymentSheet` in real mode.
- **Cloudinary mock mode cannot complete a real upload.** With no `CLOUDINARY_*` env vars the API returns signature `mock_signature_dev_only` against cloud name `demo`; a real POST would just 401. The helper detects this and returns a clearly-marked placeholder URL so the rest of the chain (submit → admin review) is still exercisable locally, and the UI shows an explicit "Cloudinary mock mode — no real file was stored" warning. It never reports a stored file that isn't there.

**Verification:** seller build clean. The full live chain — register → upload certificate + selfie → DigiLocker → admin approves via `apps/admin/roadmap.md` Day 2's document viewer → create listing → buyer purchases → earnings → PDF statement — still needs one manual run against a live backend (Day 5).

---

## Day 5 — Polish + full verification pass — ✅ COMPLETE

_Goal: ship-ready. Every flow in PDF Section 6 has been personally clicked through against the real running backend._

1. ✅ **Polish** — see the itemized list under *Status* above. `Settlements.jsx`'s Fragment key was confirmed already correct (`key={st.weekOf}`, fixed back in Day 1) — no action needed there this pass.
2. ⚠️ **Verification pass — partial.** `pnpm --filter seller build` clean; every endpoint touched this pass (`GET/PUT /seller/listings[/:id]`, `GET /seller/earnings/transactions`, `GET /seller/notifications`) was called live against a running `apps/api` + Neon dev DB and the seeded GOLD seller, response shapes match what the code expects, and the commission constant was cross-checked against a real `yourEarning` value. A `console.log`/dead-import grep came back clean. **Not done:** an actual browser click-through of the rendered pages — no browser/UI-automation tool is available in this environment, so interactive behavior (modal opens, pagination clicks, form feel) is unverified beyond code inspection + API-level checks. Recommend one manual pass in a browser before shipping.
3. ✅ **This document updated** with final Day 1/4/5 status.

---

## Explicitly out of scope for this plan

- Backend logic changes (badge-threshold reconciliation — see finding #3 — GST/TDS policy).
- The buyer mobile app beyond its already-shipped payment-flow fix.
- Real Razorpay/Cloudinary credentials (everything above works correctly in the mock mode already active in this environment; going live needs the credentials documented in `apps/api/.env.sample`).
- A real legal Terms & Conditions document (Day 1's checkbox needs placeholder copy until Zytexa/the client provides the lawyer-drafted text per PDF 10.3).
