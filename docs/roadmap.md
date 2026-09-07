# CivilCheck Backend Completion Plan (Consolidated 7-Day Roadmap)

This implementation plan details a 7-day schedule to complete the CivilCheck backend, incorporating all features, business rules, and technical specifications outlined in the product proposal.

---

## Build Status

*Last updated: 6 August 2026 — all ten pre-production QA audit findings fixed (see below); Day 8 carry-over remains the last feature-code milestone. Newest open item is scope, not a defect: a 2026-08-05 gap analysis (`docs/changes-required-2026-08-05.md`) proposes a much larger "CivilCheck Partner" role/auth rework, not yet started.*

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 0 — Workspace setup | ✅ Complete | Not in the original plan; see below |
| Day 1 | ✅ Complete | One item carried into Day 3 (Razorpay webhook mount) — now done |
| Day 2 | ✅ Complete | All four blockers resolved — see *Day 2 decisions* |
| Day 3 | ✅ Complete | Razorpay report-unlock orders, webhook, dynamic commissions, both side-tasks. See *Day 3 decisions*. |
| Day 4 | ✅ Complete | Postgres FTS + search logging, multi-channel/FCM buyer alerts, Razorpay subscriptions. See *Day 4 decisions*. |
| Day 5 | ✅ Complete | Cloudinary signed uploads, DigiLocker Aadhaar OAuth, free-check cache. Risk badge auto-calc turned out to already exist — see *Day 5 decisions*. |
| Day 6 | ✅ Complete | Seller dashboard, real Razorpay refunds, special-request advance payment + SLA auto-refund, PDF certificates/invoices/statements, weekly settlement cron. Case-update alert hook turned out to already exist — see *Day 6 decisions*. |
| Day 7 | ✅ Complete | 10% spot-check auto-flagging, false-info 3-strike penalty system, buyer report-outdated flags + admin dashboard, reviews with Badge auto-recalculation, GitHub Actions CI/CD, Jest/supertest integration suite. Cascading seller-suspension unpublish turned out to already exist — see *Day 7 decisions*. |
| Day 8 | ✅ Complete | Carry-over cleanup pass — seller payout ledger for special requests, retry/reopen-checkout endpoint, nearest-qualified-seller-in-tehsil auto-match, `subscriberChurnRate` wiring, featured-listing expiry sweep, Msg91 delivery webhook, default-off 2FA enrollment grace period. See *Day 8 decisions*. |
| QA audit (2026-08-03) | ✅ Findings documented, ✅ all 10 fixed (2026-08-04) | Full pre-production audit across all four apps. Found one auth-bypass-level issue and two authorization/session gaps — see `docs/qa-audit-2026-08-03.md` for findings and `docs/qa-fixes-status-2026-08-04.md` for fix status. Two of the ten are code-complete but still need an out-of-band check (real release build; real Firebase credentials) rather than more code. |
| CI/CD | 🔴 Disabled | `.github/workflows/deploy.yml` is entirely commented out (done deliberately, "for clarity") — no build/test/deploy runs on push or PR despite the Day 7 row above. Confirmed 2026-08-06. |
| Partner Module gap analysis (2026-08-05) | 📋 Documented, not started | `docs/changes-required-2026-08-05.md` compares the current build against a new role/auth model (docx) + Master UX Spec — multi-role identity, a third partner type, RBAC/ABAC, a wallet ledger, a possible domain-model shift. `Seller.partnerRole` is still a single string field, unchanged as of 2026-08-06. |
| Auth cutover + Admin CRUD + PartnerRole enum (2026-08-20) | ✅ Complete | Phase 1 of a new client requirements pass (separate from, but overlapping, the 2026-08-05 gap analysis above): buyer/partner login switched from phone-OTP (Msg91) to email+password; MSG91 removed platform-wide; Super Admin can now create/list/edit/block/unblock/activate/deactivate/delete Admin accounts (SUB_ADMIN/VIEWER only — SUPER_ADMIN is structurally unmanageable through this API); `Seller.partnerRole` converted from a free-text string to a real `OWNER \| REPORTER \| EXPERT` enum (REPORTER not yet offered at signup — no feature module behind it). See *Auth cutover + Admin CRUD decisions* below. |
| Property System foundation (2026-08-20) | ✅ Complete | Phase 2 of the same requirements pass: `Listing`/`Property` both gained `uploaderRole` (attribution snapshot), `images`/`videos`; `Property` gained `address`/`tehsil`/`latitude`/`longitude` (parity with `Listing`). New `GET /api/properties/feed` unifies both into one buyer-facing read, tagged `EXPERT_REPORT`/`OWNER_LISTING`. Cloudinary upload signing gained an image/video kind (video: mp4/mov/webm, 100MB — new). `lib/maps.ts` gives every property a real Google Maps deep link with no API key. Seller-app forms gained real media upload + GPS capture; buyer-app detail screens show attribution/map/media. Git repo initialized this same day (see below) — nothing before the Phase 1 commit has history. See *Property System foundation decisions* below. |
| Verification Marketplace foundation (2026-08-20) | ✅ Complete | Phase 3, backend/domain only (no frontend, per explicit scope this round): 5 new models (`PlatformSetting`, `VerificationRequest`, `VerificationQuote`, `VerificationReport`, `Claim`) for a buyer-requested paid professional verification of an existing Listing/Property. First-acceptance-wins is one atomic conditional `updateMany` — a professional's quote IS their acceptance attempt, no separate buyer-select step. 50/50 split payment via two new `PaymentKind`s reusing the existing Razorpay adapter unchanged. Cancellation fee and platform commission are both configurable (`PlatformSetting`), never hardcoded. Claims are foundation-only — no automatic refund. See *Property Verification Marketplace decisions* below. |
| Reporter Module (Phase 4A) (2026-08-21) | ✅ Complete | Phase 4A of the same requirements pass: Reporter is now a real, selectable `partnerRole` at signup (instant-approve, same as Owner — only Expert stays KYC-gated). New `property-reporter.routes.ts`/`.controller.ts` (mounted `/api/seller/reporter/properties`) reuse the existing `Property` model/schemas — Reporter submissions always start `PENDING`, never auto-approved. `PropertyStatus` gained one additive enum value, `SUSPENDED`, so Admin can pull an approved Reporter property back out of every buyer-facing read path without touching those read paths at all (they already gate on `status === 'APPROVED'`). New Reporter Reward Ledger: `RewardTransaction` + `RedeemRequest` models, a `PlatformSetting.reporterRewardPointsPerApprovedProperty` config field (never hardcoded), Admin approve/reject/adjust/redeem endpoints, and seller-facing wallet endpoints at `/api/seller/reporter/rewards`. `Seller` gained a soft-delete `deletedAt` field — partner accounts cannot be hard-deleted like Admin (every child table has a required FK to `Seller`). Reporter disclaimer reuses the existing `Disclaimer` Content Control model (seeded, admin-editable, publicly readable). Light frontend wiring in the seller app (Reporter signup/dashboard/property-source/rewards pages), admin app (Reporter moderation + Reward Ledger page), and buyer app (Reporter attribution tag + disclaimer banner). See *Reporter Module decisions* below. |
| Financial Ledger + Professional Payouts (Phase 4B) (2026-08-21) | ✅ Complete | Phase 4B, extending the Verification Marketplace (Phase 3) payment flow, not rewriting it. Four new models — `FinancialLedgerEntry` (append-only, integer paise), `ProfessionalEarning` (mutable payout-state tracker mirroring one ledger entry), `ProfessionalPayoutRecord` (a batch payout attempt), `ReconciliationIssue` — plus `Seller.payoutEligibilityStatus`/`razorpayLinkedAccountId`. Every `VERIFICATION_ADVANCE`/`VERIFICATION_FINAL` capture now also writes `GROSS_PAYMENT`/`PLATFORM_COMMISSION`/`PROFESSIONAL_EARNING` ledger rows inside the same transaction as the existing status flip. Payouts execute via the already-integrated RazorpayX Payouts adapter (`lib/razorpayPayouts.ts`, previously only used by the weekly settlement) — a payout only ever reaches PAID on a webhook-confirmed `payout.processed` event, never the synchronous API response. Razorpay Route (marketplace Linked Accounts) is not configured for this account; `lib/razorpayRoute.ts` is a documented, unusable-until-configured adapter interface, exactly per this phase's explicit fallback instruction. Fixed one real pre-existing bug found via live testing: `refund.service.ts`'s `resolveRazorpayPaymentId` never had a `verificationRequestId` branch, so a verification-marketplace refund could be created but never actually processed. Also fixed an unrelated masking gap in `admin.controller.ts`'s `getSellerById`, which returned every scalar field including `passwordHash` and a seller's full bank account number to any admin role. See *Financial Ledger decisions* below. |
| Buyer Marketplace + AI/Human Support (Phase 4C) (2026-08-21) | ✅ Complete | Phase 4C: buyer-facing property feed + Verification Marketplace UX (request/quote/pay/cancel/claim), an AI-first customer-support system with mandatory human escalation, and buyer in-app notifications, extending — not duplicating — Phase 3's marketplace, the existing seller `Notification` model, and the existing Razorpay/`PaymentSheet` flow. `Notification` extended to carry buyer rows (`sellerId`/`userId` XOR, raw-SQL CHECK constraint) instead of a second notification model. New `SupportTicket`/`SupportMessage`/`SupportKnowledgeEntry` models back the AI/human support system: `lib/aiSupport.ts` answers only from the admin-curated knowledge base and never sees account-specific facts (payment status, refund state) — any such fact shown to a user comes from a separate, non-AI-authored system message. `PAYMENT`/`CANCELLATION`/`CLAIM` tickets skip the AI entirely and escalate immediately; a ticket assigned to a human admin structurally cannot receive another AI reply (`advanceTicket()` no-ops once a ticket is `ASSIGNED`/`IN_PROGRESS`/`RESOLVED`/`CLOSED`). Found and fixed two real bugs left over from an interrupted prior session (`sendInApp`'s signature change had broken its two existing seller-facing call sites) and one new one this session: `createAdvanceOrder`/`createFinalOrder` rejected a retry once the buyer had abandoned a checkout sheet, since the precondition checked only the pre-order status (`ACCEPTED`/`COMPLETED`), not the post-order pending status the request had already moved to — buyers could get permanently stuck mid-payment. See *Buyer Marketplace + Support decisions* below. |

> **▶️ Resuming (next session, updated 2026-08-06):** All 7 planned days plus
> the Day 8 carry-over pass are complete. The 2026-08-03 pre-production QA
> audit's three blocking findings were fixed 2026-08-04 and confirmed:
> (1) buyer/seller login OTP is now a real bcrypt-hashed random code with a
> 5-minute expiry and a hard production guard (`apps/api/src/lib/otp.ts`);
> (2) seller `partnerRole` is now enforced server-side, not just in the
> `apps/seller` UI; (3) admin "Sign Out" now calls the backend logout
> endpoint and clears the session. All seven remaining audit findings are
> also fixed — see `docs/qa-fixes-status-2026-08-04.md` for the full
> per-item writeup. Two items (buyer-app release-build config guard; FCM
> push notification delivery) are code-complete but still need an
> out-of-band check outside plain code review (a real release build; a real
> Firebase project + iOS push cert) rather than more code.
>
> **New finding, 2026-08-06 repo check:** the GitHub Actions workflow
> (`.github/workflows/deploy.yml`) is currently **entirely commented out** —
> nothing builds, tests, or deploys on push/PR right now, which contradicts
> the "GitHub Actions CI/CD" complete status recorded against Day 7 above.
> No decision has been made yet on whether/when to re-enable it.
>
> One migration landed in Day 8 (`20260728040411_day8_payout_sms_log`),
> applied to the Neon dev DB — no new migrations since. `pnpm build:api` is
> clean (zero `any`) as of 2026-08-06. `pnpm --filter @civilcheck/api test`:
> the last **trustworthy** clean run is still Day 8's 26/26 across 7 suites;
> a 2026-08-06 re-run from a lower-bandwidth sandbox environment logged 15
> passed / 11 failed / 2 suites failed, but every single failure was a Jest
> 20-second hook/test timeout on DB-heavy Day 8 carry-over and QC-penalty
> tests (plus one cascading `undefined` from a timed-out `beforeAll`) — not
> an assertion failure — consistent with slow round trips to the Neon dev DB
> from that environment rather than a real regression. Re-run from a
> normal-latency environment (or once CI/CD is re-enabled) to get a number
> worth trusting.
>
> Most of what's left is genuinely external now — credentials and product
> policy sign-offs, not backend code:
>
> * **Credentials needed before go-live — true drop-in-and-connect pattern,
>   confirmed by the 2026-08-03 audit and still true 2026-08-06:** blank env
>   vars → mock mode → real credentials in `.env` → live, with **no code
>   change required**, for
>   Cloudinary (`CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET`), Razorpay/RazorpayX
>   (`RAZORPAY_KEY_ID`/`KEY_SECRET`, `RAZORPAYX_KEY_ID`/`KEY_SECRET`/`ACCOUNT_NUMBER`),
>   and Firebase Auth — each of these three adapters reads its env vars at
>   call time and correctly refuses to run its mock path when
>   `NODE_ENV=production`, so filling in real credentials is genuinely the
>   only remaining step. Railway/Vercel deploy secrets are the same story
>   operationally, but moot until CI/CD is re-enabled (see above) —
>   `.github/workflows/deploy.yml`'s deploy job has never been run against a
>   real account. `MSG91_WEBHOOK_SECRET` (Day 8) is safe to skip in dev — the
>   delivery webhook accepts unverified and logs a warning.
> * **Product policy sign-offs still open:** the GST-invoice GST-exclusive
>   reading vs. inclusive, and the two disagreeing TDS rules
>   (`settlement.service.ts`'s flat 10%-per-payout vs.
>   `getEarningsStatement`'s annual ">Rs. 30,000" threshold) — both flagged in
>   *Day 6 carry-over* and explicitly left unresolved again in Day 8 at the
>   user's direction. The Day 7 strike-escalation and badge-auto-recalculation
>   defaults are still product-approved-but-unconfirmed policy, same as
>   before.
> * **Front-end follow-ups** (not backend scope): admin panel needs a TOTP
>   field + QR renderer; seller panel should explain post-unsuspend
>   re-review and collect email at registration — unchanged from Day 2. (The
>   DigiLocker-callback-redirect item from Day 5 no longer applies —
>   DigiLocker was removed and replaced with manual identity-document upload
>   + SUPER_ADMIN review.)
> * **Known, accepted limitations, not bugs:** badge-gaming via a single
>   5-star review still has no minimum-review-count gate (Day 7, deliberately
>   not built); the Rs. 500 strike fine is still a bare `totalEarnings`
>   decrement rather than a ledger row (the special-request payout half of
>   this — Day 6 carry-over #2 — now *does* have a real ledger,
>   `SpecialRequestPayout`, added in Day 8); the nearest-qualified-seller
>   auto-match (Day 8) ranks purely by a seller's past `Listing.tehsil`/`city`
>   history since `Seller` has no declared service-area field — a brand-new
>   specialist with zero prior listings can never be "nearest" for anything;
>   the integration suite still runs against the shared Neon dev DB rather
>   than an isolated test database.
> * **Low-priority, non-blocking QA findings, still open** (from
>   `docs/qa-fixes-status-2026-08-04.md`, "not urgent" bucket): `apps/seller`
>   still has no lint/CI tooling, unlike the other three apps; admin sessions
>   are stored in a way that's fine today but would matter more alongside a
>   future bug; SSO buyers (Google/Apple) aren't recognized as "already paid"
>   on one report screen; a filter-switch race condition on one property list
>   screen under slow connections; two admin dashboard "trend" arrows are
>   still hardcoded placeholders; some dead code (unused import, a couple of
>   no-op functions); buyer app has no KYC flow at all — likely intentional
>   but never explicitly confirmed.
> * **`docs/ts_refactoring_plan.md` is now fully complete** — verified
>   2026-08-06: `prisma.ts` uses a pooled `pg.Pool`, `Express.Request` has
>   typed `user`/`seller`/`admin` actors, `apps/api/src` has zero `: any`,
>   `admin.controller.ts` uses atomic `{ decrement }` mutations and gates
>   duplicate refunds, winston structured logging and `express-rate-limit`
>   are both wired up. Nothing left to action from that document.
>
> Run Prisma with `apps/api` as the working directory (see *Tooling note*) —
> use `migrate deploy` rather than `migrate dev` where possible; the recurring
> `searchVector` phantom-drift line (see *Day 6 decisions*) recurred again in
> the Day 8 migration and was stripped by hand the same way.
>
> One test artifact is still outstanding from Day 4 — a
> `SearchQuery("mansarovar")` row left on seed user *Rahul Verma* from HTTP
> testing; delete it if a clean seed matters (unverified 2026-08-06 — DB
> connectivity from this session was too intermittent to confirm either way).

> **Tooling note:** Prisma is a **root** dependency, and `apps/api` has a stale
> local `.bin/prisma` shim, so `pnpm --filter @civilcheck/api exec prisma …`
> fails. Run Prisma with `apps/api` as the working directory (so `prisma.config.ts`
> and `.env` load) against the hoisted binary — e.g.
> `cd apps/api && node ../../node_modules/prisma/build/index.js migrate deploy`.

> **Repo layout note:** the project is now a pnpm monorepo. Every `src/…`,
> `prisma/…` and `tests/…` path referenced below now lives under **`apps/api/`**.
> Shared enums, constants and Zod schemas live in **`packages/shared`**
> (`@civilcheck/shared`) and are imported by the API — never duplicated inside it.

## Auth cutover + Admin CRUD decisions — 2026-08-20

A new client requirements pass (separate document, not `docs/changes-required-2026-08-05.md`) asked for: MSG91 removed, buyer/partner login switched from phone OTP to email+password (phone stays mandatory, stored, not a login credential), and Super Admin CRUD over Admin accounts. Scoped as Phase 1 of that larger brief — deliberately just these two pieces, not the verification-marketplace/claims/support/reward-ledger items also in the brief, to keep a first pass on a live production DB small and reversible.

**Live DB check before touching anything:** the Neon `neondb` database (same one `apps/api/.env`'s `DATABASE_URL` points at — there is no separate dev DB) had exactly one row total outside `Admin`: the existing SuperAdmin account. Zero `User` rows, zero `Seller` rows. This meant the `email` unique-constraint migration and the auth cutover carried effectively no data-migration risk.

**Migration was additive-only, by policy, not by luck.** `prisma migrate diff` also generated `DROP TABLE "OtpCode"`/`DROP TABLE "SmsDeliveryLog"` (both were empty) — the harness's own auto-mode classifier flagged those as destructive and blocked the write. Rather than force it through, `OtpCode`/`SmsDeliveryLog`/`OtpRole` were kept in `schema.prisma`, unused, with a comment explaining why — a live production table doesn't get dropped in the same pass that stops using it, even an empty one. The actual applied migration (`20260820000000_auth_cutover_admin_crud`) is four `ADD COLUMN`s (`User.passwordHash`, `Seller.passwordHash`, `Admin.active`, `Admin.blocked`) and two `CREATE UNIQUE INDEX`es (`User.email`, `Seller.email`). The generated `ALTER TABLE "Listing" ALTER COLUMN "searchVector" DROP DEFAULT` line was stripped by hand again — the same recurring tsvector-generated-column false positive documented in the Day 6 section below.

**MSG91 removal was "deactivate cleanly," not "touch everything that mentions SMS."** `notification.service.ts`'s `sendSms()` is now a no-op stub (always returns `{status:'skipped'}`) rather than deleted — `notifySeller()`/`notifyBuyerAlert()` still call it internally, but ~15 call sites across `kyc.service.ts`, `penalty.service.ts`, `refund.service.ts`, `specialRequestSla`/`specialRequestPayout`, `alert.controller.ts` etc. that pass an `sms:` option were deliberately left untouched — editing 15 unrelated business-logic files in an auth-cutover pass would have been out of scope per this repo's own CLAUDE.md ("only modify files needed for the requested task"). What *was* fully removed: `lib/otp.ts`, `routes/msg91Webhook.routes.ts`, `webhook.controller.ts`'s `handleMsg91DeliveryWebhook`, the `/api/admin/sms-delivery-logs` route + `getSmsDeliveryLogs` controller fn, and the admin panel's `SmsDeliveryLog.jsx` page + nav entry.

**Auth surface:** `POST /api/auth/register` and `POST /api/auth/login` (buyer, email+password, phone mandatory); `POST /api/auth/seller/login` (partner login — `POST /api/seller/register` already existed, just gained `password`+required `email` fields); `adminLogin`/`adminMiddleware`/`getMe` all gained `blocked`/`active` checks — checked on **every** authenticated request, not just at login, since a 7-day admin JWT survives a block/deactivate that happens mid-session. Old buyer/seller OTP routes (`send-otp`, `verify-otp`, `seller/send-otp`, `seller/verify-otp`) are gone — nothing falls back to them.

**Admin CRUD (`/api/admin/admins/*`, all `superOnly`) has one structural invariant, not just a UI convention:** `role` is capped to `SUB_ADMIN`/`VIEWER` at the Zod layer (`adminCreateSchema`/`adminUpdateSchema` in `packages/shared`), and every mutating handler refuses a target whose `role === SUPER_ADMIN` — including self-targeting. Verified live: attempting to block/edit/delete the real Super Admin via a second (throwaway, since-deleted) `SUPER_ADMIN` test account returned 403 on all three. A Super Admin also cannot block/deactivate/delete their own account (separate self-targeting guard, distinct from the SUPER_ADMIN-role guard).

**Verification method:** the Jest suite could not run in this session's sandbox — `firebase-admin`'s ESM dependency chain (`jose` → `jwks-rsa`) needs Node ≥24.9 for Jest's `require(ESM)` synchronous path, and the sandbox has Node 22.20. This is a pre-existing environment limitation, not something this change broke. Instead: `tsc --noEmit` clean on `apps/api` and `apps/buyer`; `vite build` clean on `apps/admin` and `apps/seller`; the real dev server was started against the live Neon DB and every new endpoint was curled directly (buyer register/login, partner register/login, validation-rejection on missing password, admin create/list/block/unblock/delete, the two self-targeting guards, the three SUPER_ADMIN-protection guards) — all rows created during that manual pass were deleted afterward and the DB was re-verified back to its exact pre-test state (0 `User`, 0 `Seller`, 1 `Admin`). `tests/helpers.ts`, `tests/auth.test.ts`, and `tests/day8-carryover.test.ts` were updated to register/login via the new email+password endpoints instead of OTP (so the suite will pass once it can run in an environment with a newer Node), but that update itself is unverified by an actual Jest run this session.

**Follow-up in the same session:** `Seller.partnerRole` was converted from a free-text `String?` to a real `PartnerRole` enum (`OWNER | REPORTER | EXPERT`) — migration `20260820010000_partner_role_enum`, written as an in-place `ALTER COLUMN ... TYPE ... USING` cast rather than `prisma migrate diff`'s auto-generated drop+re-add, since the Seller table was (re-)confirmed empty immediately before applying it and a drop was avoidable. Every string comparison against `'owner'`/`'expert'` was switched to the uppercase enum across `seller.controller.ts`, `auth.middleware.ts` (`requireSellerRole` now typed `PartnerRole[]`), `specialRequest.controller.ts`, four route files' `requireSellerRole(...)` call sites, `packages/shared`'s `sellerRegistrationSchema`, and the partner app's `Login.jsx`/`AuthContext.jsx`/`Layout.jsx` (`RM`/`NAV`/`PAGES` keys, `safeRole` fallback). **REPORTER is a valid enum value but is deliberately not offered at signup** — `sellerRegistrationSchema`'s `partnerRole` field only accepts `OWNER`/`EXPERT` — because there's still no Reporter feature module (content uploads, reward ledger) behind it; offering it would recreate exactly the "fabricated role" problem a prior session (roadmap Day 1) removed. Verified live: OWNER instant-approves, EXPERT stays PENDING, a lowercase `"expert"` or an `"REPORTER"` signup attempt both 400 with the new enum listed, and an OWNER token correctly 403s against an EXPERT-only route (`POST /api/seller/listings`). One operational note from this pass: three stray `tsx src/index.ts` dev-server processes accumulated across restarts (Windows/Git-Bash `kill $(cat pid)` doesn't reliably kill the actual child node process spawned by `npx`) and the oldest one kept serving stale code on port 3000 despite newer ones reporting a successful bind — diagnosed via `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` and cleared with a filtered `Stop-Process`. Worth remembering if a future session's manual verification against the dev server doesn't reflect a just-made change.

Firebase Google/Apple SSO was left untouched — it's independent of MSG91 and wasn't part of this brief.

---

## Property System foundation decisions — 2026-08-20

Phase 2 of the same requirements pass. Git repo history for this project starts the same day as this work (see the Auth cutover section above) — the git baseline commit landed mid-session, right before this phase began, so everything here has real commit history from the start (`71e6df7`), unlike Phase 1 which was partly done before `git init`.

**Deliberately did not merge `Listing` and `Property` into one table.** The brief's "unified property model for Owner, Reporter and Expert uploads" is real at the API/read layer (`GET /api/properties/feed` combines both, tagged `EXPERT_REPORT`/`OWNER_LISTING`, both formatters expose the same `uploadedBy`/`mapUrl`/`images`/`videos` shape) but the two underlying tables stay separate. `Listing` carries `Purchase`/`PaymentOrder`/`Refund`/`Review`/`Subscription`/`SpotCheck` relations that `Property` has none of — collapsing them would be a large, genuinely risky schema migration for a "foundation" pass, and buys nothing functional today. Worth revisiting only if a future phase needs them to actually share a table (e.g. a verification request that can target either).

**`uploaderRole` is a snapshot, not a live join**, same reasoning as `PaymentOrder.platformCut`/`sellerCut` being frozen at order time rather than recomputed: "Uploaded by" should never silently change if a seller's role were ever reassigned. Both columns are `NOT NULL` with no default — safe only because `Listing`/`Property` were confirmed to have 0 rows in production immediately before the migration was written (checked twice: once during planning, once immediately before `migrate deploy`, per this project's established practice of re-verifying row counts right before any schema change with no default).

**Risk badge stayed exactly as-is.** The brief asks for "Expert-only RED/AMBER/GREEN" — `Listing.riskBadge` already existed and Listing creation was already `EXPERT`-only as of the Phase 1 `PartnerRole` pass, so this requirement was already satisfied; nothing new was built for it. The unified feed reports `riskBadge: null` for every `OWNER_LISTING` item — no expert has assessed an Owner's self-listed property, and building that assessment workflow is explicitly the Phase 3 verification-marketplace scope (quotes, first-accept-wins assignment, 50/50 payment), not this pass.

**Media stayed as flat `String[]` arrays (`images`, `videos`), not a relational `PropertyMedia` table.** A dedicated media table (ordering, captions, per-item moderation status) would scale better long-term, but every existing upload path in this codebase already works with flat Cloudinary URL arrays (`documents` on both models, exactly the same shape), and building a parallel relational pattern for just images/videos would mean two different media storage strategies living side by side for no immediate benefit. Revisit if per-item metadata is ever actually needed.

**Cloudinary video support is new, not a relaxation of an existing limit.** `lib/cloudinary.ts` previously signed one global `pdf,jpg,jpeg,png` / 10MB constraint for every upload purpose. It now takes a `kind: 'document' | 'image' | 'video'` (video: `mp4,mov,webm` / 100MB) — the client already posts to Cloudinary's `/auto/upload` endpoint (see `apps/*/api/cloudinaryUpload.js`), which picks the resource type from the file itself, so no `resource_type` needed adding to the signed payload. One incidental fix in passing: `kyc-selfie` was scoped from the old single document config (which happened to allow PDF selfies, which never made sense) to the new `image` kind — a real tightening, not a behavior regression.

**Google Maps integration is real today, not a placeholder for later.** `buildMapUrl()` returns `https://www.google.com/maps?q=lat,lng` — no API key, no billing account, the same URL a Google Maps "Share" button produces. `GOOGLE_MAPS_API_KEY` is wired into `.env.sample` and `isGoogleMapsEmbedConfigured()` for a *future* embedded/interactive map (Maps JavaScript API or `react-native-maps`), which is a separate frontend build this pass didn't include — not because the deep-link approach is a stopgap, but because an embedded map is a materially bigger, different piece of work.

**Frontend scope was deliberately narrow — functional wiring, not the responsive-design pass** (explicitly deferred by the client this session). Two new reusable seller-app components (`MediaUpload.jsx`, `LocationCapture.jsx`) replace `AddProperty.jsx`'s old "Property Photos" / "Property Videos" / "Google Map Location" entries, which were previously just generic PDF-only document-upload slots — a location was literally an uploaded screenshot. They're now backed by real Cloudinary image/video upload and the real browser Geolocation API. `NewListing.jsx` gained the same media upload plus optional lat/long capture (the backend already had `Listing.latitude`/`longitude` since Day 1, but no UI ever exposed them until now). Buyer-app `ReportScreen.tsx`/`VerifiedPropertyDetailScreen.tsx` gained an "Uploaded by" field and a "Location & media" section (tappable rows opening the map link / each image or video URL) — reusing each screen's existing `SectionCard`/`DetailRow` components and styles, no new visual design.

**`.gitignore` bug found and fixed while preparing this commit, unrelated to Property System work itself but caught in the same pass:** a broad `.env*` catch-all (in both the root `.gitignore` and `apps/seller/.gitignore`) was silently overriding the earlier, more specific "keep .env.sample tracked" intent stated in the root file's own comment. All four env template files (`apps/admin/.env.sample`, `apps/api/.env.sample`, `apps/buyer/.env.example`, `apps/seller/.env.sample`) had *never* been tracked in this repo's git history, including in the Phase 1 baseline commit. Fixed with explicit `!` negation rules; all four reviewed line-by-line for real secret values before staging (none found — blank `KEY=` placeholders / localhost URLs only) and committed alongside this phase's work.

**Verification method — same constraint as Phase 1:** Jest can't run in this sandbox (Node 22.20 vs. `firebase-admin`'s ESM chain needing ≥24.9). Verified instead via `tsc --noEmit` / `vite build` clean across every app, plus a full live-server pass against the real Neon DB covering: Expert Listing creation with images/videos/lat-long; Owner Property creation with address/tehsil/lat-long/images; an Owner blocked from creating a Listing and an Expert blocked from creating a Property (403 both directions); both buyer-facing detail responses correctly exposing the new fields (and `verifiedProperty`'s response still never exposing `documents`); the unified feed returning both items correctly tagged; the new image/video Cloudinary purposes issuing correctly-scoped signatures. New `tests/property-system.test.ts` covers the same ground for once the suite can actually run.

**Operational note carried over from Phase 1, recurred here:** the interruption between the two `/loop`-style requests this session left a dev-server process and DB test rows (two smoke-test sellers, one Listing, one Property, one throwaway `SUPER_ADMIN`) alive from before the interruption. Both were found and cleaned up at the start of this phase's continuation (`Get-CimInstance` for the stray process, a Prisma script for the rows) before any new work began — worth checking for on any resumed session, not just after a clean stop.

---

## Property Verification Marketplace decisions — 2026-08-20

Phase 3 of the same requirements pass. Backend/domain only by explicit instruction this round — no frontend CTA, no Reporter/AI-support/responsive work.

**New models, not fields on Listing/Property, and not a repurposed `SpecialRequest`.** `SpecialRequest` already does something adjacent (buyer pays an advance, admin assigns one seller to research a property) but is a different product: fixed ₹999–4999 advance, admin hand-picks the seller, no competing quotes. This phase needed competing quotes with first-acceptance-wins locking and a genuine 50/50 split — sharing either existing shape would have conflated two workflows that happen to look similar. Five new tables: `PlatformSetting` (singleton config), `VerificationRequest`, `VerificationQuote`, `VerificationReport`, `Claim`.

**First-acceptance-wins is literal, not a two-step "quote then buyer picks" flow.** Re-reading the brief's exact wording ("the first valid acceptance must atomically lock the request... prevent another professional from accepting it") — a professional's proposed fee IS their acceptance attempt, submitted in one call (`POST .../verification-marketplace/:id/quote`). There's no separate "buyer selects a quote" endpoint. The claim is a single `updateMany({ where: { id: requestId, status: 'OPEN' } })` inside a `$transaction` (verification.service.ts's `submitVerificationQuote`) — Postgres serializes concurrent UPDATEs on the same row, so the first transaction to reach it wins (count 1) and every other concurrent caller blocks until it commits, then sees the now-non-OPEN status and updates 0 rows (count 0), losing cleanly. Verified live with two Experts firing genuinely parallel curl requests (backgrounded with `&`, joined with `wait`) against the running dev server — exactly one won, one 409'd, and the DB showed exactly one `ACCEPTED` quote and one `CLOSED` quote. Also covered by a scripted `Promise.all` concurrent test in `tests/verification-marketplace.test.ts`.

**Payment reuses the existing Razorpay adapter (`lib/razorpay.ts`) completely unchanged** — no new integration surface, just two new `PaymentKind` values (`VERIFICATION_ADVANCE`/`VERIFICATION_FINAL`) on the existing `PaymentOrder` model, following the exact same atomic-claim-then-finalize shape every other payment kind already uses (`payment.service.ts`). The split is `VerificationRequest.platformCommissionRate`, frozen from `PlatformSetting` at the moment a quote wins — not looked up from `computeCommission()`'s fixed table (that function's type signature now explicitly excludes the two verification kinds, so calling it with one is a compile error, not a runtime surprise). One genuinely new piece of handling: a payment that lands (webhook or checkout-verify) for a request the buyer already cancelled in the meantime is never silently dropped or used to un-cancel the request — `refundStrandedPayment()` flags it into a `PENDING` `Refund` row for an admin, because real money moved and that must never be invisible.

**Report locking mirrors `property.controller.ts`'s existing free/paid preview split**, not a new pattern: `VerificationReport` is created the moment the professional submits (status → `COMPLETED`), but its content is withheld from the buyer's response until `status === 'REPORT_UNLOCKED'` — the buyer's detail endpoint reports `reportAvailable: true, report: null` in between. Verified live: `GET .../report` 403s right after submission, 200s with full content only after the final payment's checkout-verify call completes.

**Cancellation is one configurable rate, not two separate hardcoded rules**, per the brief's own framing. `PlatformSetting.cancellationFeeRateAfterAcceptance` is applied to `paidAmount` (the sum of this request's `PAID` `PaymentOrder`s) unconditionally — cancelling before any money has moved (`OPEN`/`ACCEPTED`/`ADVANCE_PAYMENT_PENDING` with nothing captured yet) is naturally free because `paidAmount` is 0, not because of a separate branch. Verified live at the default 20% rate: cancelling with a ₹5000 paid advance produced exactly ₹1000 fee / ₹4000 refund, and a `Refund` row was created for the buyer to be paid back. The buyer-facing `cancelVerificationRequest` and the admin-oversight `adminForceCancelVerificationRequest` share one private `executeCancellation()` core (verification.service.ts) — the only difference is the buyer path checks request ownership first and the admin path doesn't (route middleware already establishes that authority).

**Claims are deliberately inert on the money side.** `POST .../claims` only records a dispute (`OPEN`, one active claim per request enforced by a partial unique index); `POST /api/admin/claims/:id/resolve` only moves the status forward by hand. A `REFUND_APPROVED`/`REFUND_PROCESSED` status here is a *decision record*, not a trigger — actually moving money still goes through the existing, separate `/api/admin/refunds` flow (`executeRefund`), which an admin invokes on purpose once a `Refund` row exists. Nothing here auto-refunds, matching the brief's explicit instruction.

**Authorization tiers, mirrored from patterns already established in Phase 1/2:** Listing-style `requireSellerRole(EXPERT)` plus an explicit KYC-approval check gates marketplace participation for Experts (Owners get a structural 403, verified live); admin-as-participant (quoting/accepting) is `SUPER_ADMIN + SUB_ADMIN`, the same tier as listing QC; admin-as-overseer's money-adjacent actions (force-cancel, claim resolution, platform-rule changes) are `SUPER_ADMIN`-only, the same tier as refunds/KYC decisions; oversight reads are open to all three admin roles including `VIEWER`. Every buyer endpoint checks `request.userId === req.user.id`, verified live — a second buyer's token 404s (not 403) against the first buyer's request, so a wrong id can't even be used to probe existence.

**Not built this pass, deliberately:** any frontend (buyer "Verify This Property" CTA, professional marketplace UI, admin oversight screens) — explicitly out of scope for this round, backend/domain workflow only. A payout ledger for the assigned professional's earned share (`PaymentOrder.platformCut`/`sellerCut` are computed and stored with real numbers regardless, but nothing pays them out yet) — same "record it now, wire the mechanism later" gap `SpecialRequest`'s advance had before Day 6 added `SpecialRequestPayout`; a natural next step, not an oversight. No in-app notification for an Admin who wins/loses a quote (Experts get one via the existing seller `Notification` model; Admins have no equivalent inbox anywhere in this codebase, so none was invented here either — matches "use the existing notification architecture").

**Verification method — same constraint as Phases 1–2:** Jest can't run in this sandbox (Node 22.20 vs. a dependency needing ≥24.9). Verified instead via `tsc --noEmit` clean on `apps/api`/`packages/shared` (and `vite build` clean on `apps/admin`/`apps/seller`, confirmed even though this phase didn't touch their code), plus the full live-server walkthrough described above: request creation → source-not-approved rejection → buyer isolation → min-fee rejection → cross-role rejection → the concurrent race → post-acceptance quote rejection → start-before-payment rejection → non-assigned-professional rejection → advance payment → start → report submission → report-locked check → final payment → report unlock → claim creation → admin claim list/resolve → free cancellation → double-cancellation rejection → admin force-cancel → fee-charged cancellation with exact-amount verification → platform settings read/update/revert. All test rows (2 verification requests' worth of quotes/reports/refunds/payment orders, 3 sellers, 2 buyers, 1 property, 1 throwaway admin) deleted afterward; DB reconfirmed at its exact baseline (0 rows in every business table, 1 untouched Super Admin) with the new `PlatformSetting` singleton left at its default values and a stale `updatedBy` reference cleared.

---

## Reporter Module decisions — 2026-08-21

Phase 4A of the same requirements pass. Explicit instruction this round: build on the existing Phase 1-3 architecture, no rewrite/duplication of the Verification Marketplace, no AI support, no responsive redesign.

**Reporter property submission reuses the `Property` model and its existing Zod schemas as-is** — `propertyCreateSchema`/`propertyUpdateSchema` were already role-agnostic (no Owner-specific fields baked in), so no shared-package change was needed for the property shape itself. What's new is a parallel controller/route pair, `property-reporter.controller.ts` / `property-reporter.routes.ts`, mounted at `/api/seller/reporter/properties` — deliberately a *different mount* from Owner's `/api/seller/properties`, not a shared router with a role branch inside it, because Owner's route enforces an 8-mandatory-document ownership-proof rule (`REQUIRED_DOCUMENT_COUNT`) that makes no sense for a Reporter, who is sourcing third-party information, not proving they own the property. Every Reporter route is gated `requireSellerRole(REPORTER)`, mirroring the existing `requireSellerRole(OWNER)`/`requireSellerRole(EXPERT)` pattern exactly — an Owner or Expert JWT replayed against a Reporter route gets a structural 403, verified live in both directions.

**Moderation reuses `Property.status` — one additive enum value (`SUSPENDED`) added, nothing else changed.** The brief asked for `PENDING_REVIEW / APPROVED / REJECTED / SUSPENDED`; the existing `PropertyStatus` already had `PENDING` (functionally identical to "pending review" — Owner properties already start here) and `APPROVED`/`REJECTED`. Only `SUSPENDED` was missing, so it was added as a new enum value via `ALTER TYPE ... ADD VALUE` rather than inventing a second status dimension. This means every existing buyer-facing read path that already gates on `status === 'APPROVED'` (`property.controller.ts`'s feed, `verifiedProperty.controller.ts`) needed **zero code changes** to correctly hide `SUSPENDED` (and `REJECTED`) Reporter properties — verified live: an approved-then-suspended property 404s from `GET /api/verified-properties/:id` with no changes to that controller. `admin.controller.ts` gained `suspendProperty`/`unsuspendProperty`, reusing the exact `updateMany({ where: { status: {...} } })` guard-clause pattern `approveProperty`/`rejectProperty` already use. Unsuspending returns to `PENDING`, not straight back to `APPROVED` — a suspension always needs a fresh admin look, same "must be reviewed again" discipline `suspendSeller`'s listing-unpublish cascade already applies elsewhere.

**Reward ledger is one table with per-row status, not four separate buckets.** `RewardTransaction` (type: `EARNED`/`ADMIN_ADJUSTMENT`/`REDEMPTION`, status: `PENDING`/`APPROVED`/`REJECTED`, signed `points`) is the single source of truth — every wallet number (`totalEarned`, `pendingPoints`, `approvedPoints`, `redeemedPoints`, `adjustmentPoints`, `rejectedPoints`, `availableBalance`) is a plain aggregate over this one table (`reward.service.ts`'s `getRewardSummary`), never a second denormalized total that could drift. `EARNED` rows are created `PENDING` at property-approval time (inside the same `$transaction` as the `Property.status` flip — a property can never end up `APPROVED` without its earn event also being recorded, or neither) and need a **separate** Admin approval to become spendable; `ADMIN_ADJUSTMENT` rows are created already `APPROVED` (an admin typing an adjustment IS the approval, by construction); `REDEMPTION` rows are negative-point, created only when a `RedeemRequest` is approved, inside a transaction that re-checks the balance at approval time (not just at request time) so two redeem requests can't jointly overdraw a balance that moved in between. The point value itself — `PlatformSetting.reporterRewardPointsPerApprovedProperty` (default 10) — is read fresh at credit time and frozen onto the row, same "never hardcode business numbers, freeze at decision time" pattern `VerificationRequest.minFee` already established in Phase 3. **No currency conversion anywhere in this code** — redemption is fulfilled off-platform by an Admin once approved; the ledger only ever moves points, per the explicit "do not create fake money payouts" instruction.

**Partner account deletion is soft, not a copy of `deleteAdmin`'s hard delete.** `deleteAdmin` (Phase 1) can hard-delete because `AuditLog` deliberately has no FK to `Admin`. `Seller` has the opposite shape — `Listing`, `Property`, `Notification`, `Review`, `Subscription`, `SpecialRequestPayout`, `VerificationQuote`/`VerificationRequest.assignedSeller`, and now `RewardTransaction`/`RedeemRequest` all carry a required FK to it, several of them `RESTRICT`. This was **confirmed empirically, not just reasoned about**: an early version of this phase's smoke-test cleanup script tried `prisma.seller.deleteMany()` on a test partner and hit `violates RESTRICT setting of foreign key constraint "Notification_sellerId_fkey"` — exactly the failure a naive hard-delete-on-request would produce in production. `Seller.deletedAt` (nullable, additive) is the fix: `deleteSeller` sets it, `sellerMiddleware` and `sellerLogin` both now check it on every request/login (same "DB state is the real source of truth, a live 7-day JWT can't outlive it" reasoning `adminMiddleware`'s `blocked`/`active` checks already use), and `getAllSellers` excludes it by default. Every row the partner ever created — listings, properties, reward history — stays intact and attributable. No prior "account-deletion rule" existed for `Seller` before this; this is the one this phase establishes, and it's the one meant by "delete partner accounts per existing account-deletion rules" in the brief (there were none to follow — `deleteAdmin`'s shape doesn't transfer).

**Reporter disclaimer reuses the existing `Disclaimer` Content Control model outright — no new model, no new admin CRUD.** A single row (`key: reporter-property-disclaimer`) was seeded directly against the live DB with the exact required text; the existing `PUT /api/admin/content/disclaimers` upsert endpoint (Phase 0/Day 2) already lets a Super Admin edit it later, and the existing public `GET /api/content/disclaimers/:key` (already used by the buyer app's `Disclaimer.tsx` component for the `report`/`purchase` keys) needed zero backend changes to serve it. The buyer app's `VerifiedPropertyDetailScreen.tsx` now renders `<Disclaimer disclaimerKey="reporter-property-disclaimer" />` conditionally when `property.uploadedBy === 'REPORTER'`, and the screen's top tag switches from the hardcoded "✓ Owner verified" to "📝 Uploaded by Reporter" for the same condition — Reporter-uploaded content was never going to get an unearned "verified" badge.

**Expert's existing KYC/verification authority is untouched.** `sellerRegister`'s `instantApprove` gained exactly one more `||` branch (`partnerRole === 'REPORTER'`) — Expert's `kycStatus` still defaults to `PENDING` and still requires the same Super-Admin-only `/api/admin/sellers/:id/approve` gate before `requireSellerRole(EXPERT)` routes (Verification Marketplace quoting/accepting, Listing creation) become reachable. Verified live: a freshly-registered Expert's `kycStatus` is `PENDING`, not `APPROVED`.

**Frontend scope was "light functional wiring," matching the Phase 2 precedent, not the deferred responsive-design pass.** Seller app: `Login.jsx`'s `ROLE_OPTS` now offers Reporter (previously deliberately excluded — see Phase 1's comment about not selling a signup path with nothing behind it, which is no longer true); `Layout.jsx` gained a `REPORTER` nav/page registry entry; four new pages (`reporter/Dashboard.jsx`, `MyProperties.jsx`, `AddProperty.jsx`, `Rewards.jsx`) reuse the exact `Card`/`Field`/`SectionTitle`/`Modal` component set and CSS classes Owner's equivalent pages already use — no new visual design, no new component library. Admin app: `Properties.jsx` gained an "Uploaded By" column/badge and Suspend/Unsuspend actions; `Sellers.jsx` gained a partner-role filter/column and a Delete Account action; a new `RewardLedger.jsx` page (transactions / redeem requests / settings, tab-switched within one page rather than three separate routes) was added to the existing sidebar `NAV` array and `Routes` block, following `Refunds.jsx`'s table+modal shape. Buyer app: see the disclaimer paragraph above — the only two changed lines are the tag and the conditional `<Disclaimer>` insert; every other field on that screen (media, map, health score) was Phase 2 work, unchanged.

**Verification method — same constraint as Phases 1-3:** Jest can't run in this sandbox (Node 22.20 vs. a dependency needing ≥24.9); `apps/api/tests/reporter-module.test.ts` was still written, against the exact same scenarios verified live below, for whenever that blocker clears — it typechecks clean (`tsc --noEmit` against a scratch config that additionally includes `tests/**/*`, since the main `apps/api/tsconfig.json` only covers `src/**/*`). Verified instead via `tsc --noEmit` clean on `apps/api`/`packages/shared`, `vite build` clean on `apps/admin`/`apps/seller`, and `tsc --noEmit` clean on `apps/buyer`, plus a full live-server walkthrough against the real Neon dev DB: Reporter/Owner/Expert registration (including Expert still landing `PENDING`) → missing-phone rejection → Reporter blocked from Owner routes and vice versa → Expert blocked from Reporter reward routes → Reporter property creation (starts `PENDING`, `uploaderRole` frozen) → a `PENDING` property confirmed not buyer-visible → admin approval → buyer-visible with `uploadedBy: REPORTER` → suspend → confirmed hidden again → unsuspend → the earn transaction confirmed `PENDING` (balance still 0) → admin transaction approval → balance becomes spendable → manual adjustment → over-balance redeem rejection → valid redeem request → admin approval → balance debited correctly → reward-rate config read/update/revert → partner filter by role → the disclaimer's exact text → soft-delete → login refused afterward → excluded from the default partner list → Owner's existing property flow (8-document rule) confirmed still intact and unaffected. All test rows (3+ sellers, 1 throwaway admin, reward transactions, redeem requests) deleted afterward — DB reconfirmed at its exact baseline (0 sellers/properties/reward rows, the one seeded `Disclaimer` row, `PlatformSetting` back at its default `reporterRewardPointsPerApprovedProperty: 10`).

---

## Financial Ledger decisions — 2026-08-21

Phase 4B of the same requirements pass. Explicit instruction: audit the existing payment architecture first and extend it, never build a second payment system, never rewrite the existing Verification Marketplace/refund flow, no AI support, no responsive redesign, no mobile-app work, and don't touch Reporter functionality unless the shared ledger genuinely needs it (it didn't — Reporter's reward ledger and this financial ledger never intersect).

**Audit findings, which shaped every decision below:** the existing Razorpay integration (`lib/razorpay.ts`, Checkout Orders) already had a real, working, race-safe payment state machine (`PaymentOrderStatus` CREATED→PAID/FAILED, atomic `updateMany` claims), a single generic `Refund` model already wired for `verificationRequestId` (Phase 3), a single webhook handler routing by `PaymentOrder.kind`, and — genuinely surprising — a second, *already-integrated* Razorpay product, RazorpayX Payouts (`lib/razorpayPayouts.ts`), used since Day 6 for the weekly seller settlement. Razorpay Route (marketplace Linked Accounts) had no trace anywhere: no env vars, no adapter, nothing. `VerificationRequest.platformCommissionRate` was already a frozen-per-transaction, admin-configurable rate (`PlatformSetting.verificationPlatformCommissionRate`, default 0.30) — Phase 3 had already solved "never hardcode the commission, freeze it at transaction time," which is most of what this phase's commission section asked for. The gap was entirely on the *record-keeping and payout* side: no ledger, no professional-payout mechanism, no reconciliation, and every money field in the schema is a `Float` in rupees, not integer paise.

**Money stays `Float` rupees everywhere it already was; every NEW Phase 4B field is integer paise.** Rewriting `PaymentOrder.platformCut`/`sellerCut`, `Purchase.amountPaid`, or `VerificationRequest.agreedFee`/`advanceAmount`/`finalAmount` to paise would touch Phases 1-3's tested behavior broadly for no functional gain — explicitly out of scope ("do not rewrite existing payment/verification functionality"). Instead, every new ledger/payout paise figure is `Math.round(rupees * 100)` derived from an existing frozen Float field at the exact moment a ledger row is written — never an independent recomputation, so the ledger can never disagree with the payment state machine about what was actually charged.

**Commission is still one stored rate, not two.** The brief asked for `verificationPlatformCommissionPercent` + `professionalSharePercent` fields validated to sum to 100. Given `verificationPlatformCommissionRate` already exists, is already frozen per-transaction, and is already the value every quote/payment calculation reads — adding two new independently-stored percent fields would create a second source of truth that could drift out of sync with the first. Instead, `professionalSharePercent` is *derived* (`100 - commissionPercent`) at the API response layer only, never stored — "sums to 100" holds by construction, a stronger guarantee than a validation check on two separately-stored numbers. `GET`/`PATCH /api/admin/verification-settings` now return both percents for the admin UI; the PATCH body still takes the 0-1 rate (unchanged Phase 3 shape) — the admin app's Financial Dashboard settings tab does the percent↔rate conversion client-side.

**The ledger is one append-only table with a `type` column, not a wide row with a dozen amount columns.** A wide-row design (one `VerificationRequestLedger` row with `grossAmount`/`commissionAmount`/`refundAmount`/... columns) would need existing columns *edited* to record a reversal — directly violating "never delete the original ledger transaction" and "create a proper reversal state." `FinancialLedgerEntry` instead has one row per money movement (`GROSS_PAYMENT`, `PLATFORM_COMMISSION`, `PROFESSIONAL_EARNING`, `PROCESSING_FEE`, `CANCELLATION_FEE`, `REFUND`, `REVERSAL_COMMISSION`, `REVERSAL_EARNING`), each with its own `idempotencyKey` (DB-unique, e.g. `${paymentOrderId}:GROSS_PAYMENT`) so a webhook/callback replay cannot double-insert. A correction is always a *new* row with `reversesEntryId` pointing at the original; the original is never edited except a `status` flip to `REVERSED` (a later row reversed it) or `REQUIRES_RECONCILIATION` (an automatic reversal could not safely apply — see below). `PROCESSING_FEE` is opportunistic, not fabricated: Razorpay's `payment.captured` webhook payload includes `fee`/`tax` fields only on fee-bearing accounts, and this phase's mock mode never populates them — the ledger simply omits the row when absent rather than inventing a number.

**`ProfessionalEarning` is a second, mutable table — not a status column bolted onto the immutable ledger.** The brief's payout state machine (EARNED → PENDING_SETTLEMENT → AVAILABLE_FOR_PAYOUT → PAYOUT_REQUESTED → PROCESSING → PAID, with FAILED/RETRYABLE/MANUAL_REVIEW/REVERSED branches) genuinely needs to *change* over time for the same economic event, which an append-only ledger row structurally cannot do without becoming mutable and defeating its own purpose. This mirrors a pattern this codebase already uses — `Purchase.settled`/`settledAt` is exactly "a mutable status flag living next to an otherwise-immutable created record" — just with more states. `EARNED` fires the moment a capture's ledger entries are written (same transaction); the promotion to `PENDING_SETTLEMENT`→`AVAILABLE_FOR_PAYOUT` happens automatically the instant a request reaches `REPORT_UNLOCKED` (both legs captured, work delivered) — deliberately with **no invented hold period**, since a `Claim` can only be raised *after* the report is unlocked (see `Claim`'s own model comment), so there is structurally no open dispute to check for at that exact moment. A claim raised later, after payout, is exactly what the `REQUIRES_RECONCILIATION` path below is for.

**A payout only ever reaches PAID on a webhook-confirmed `payout.processed` event — never the synchronous RazorpayX response.** This is the one deliberate difference from the *existing* weekly settlement (`settlement.service.ts`), which does trust RazorpayX's synchronous "processed" response as final (Day 6 behavior, left completely unchanged — not in this phase's scope to fix). The new payout path (`payout.service.ts`) only ever moves a record to `PROCESSING` on a successful `createPayout()` call; `webhook.controller.ts` gained four new `case`s (`payout.processed`/`failed`/`rejected`/`reversed`) inside its *existing* `switch` — not a second webhook handler — that are the only code path that can set `PAID` or `REVERSED`. Verified live: after `POST /admin/payouts/:id/process`, the professional's earnings summary shows the amount as "in payout," explicitly not "paid," until a signed `payout.processed` event arrives; a duplicate delivery of that same event is a no-op (`updateMany({where:{status:'PROCESSING'}})` claims exactly once).

**Razorpay Route gets a real, documented, unusable-until-configured adapter — never a fake transfer.** `lib/razorpayRoute.ts` mirrors Razorpay's actual Route API shape (`createLinkedAccount`/`createTransfer`/`fetchTransferStatus`) so wiring it up later is a matter of filling in HTTP calls, not a redesign — but `isRouteConfigured()` always returns `false` today (no `RAZORPAY_ROUTE_ENABLED` env var anywhere), and every function returns a structured "not configured" result rather than a mock success. The file's header spells out exactly what's needed before it can go live: Razorpay's own Route approval on the account (a business/compliance review on their side, not a code change), the env flag, a real Linked Account per professional, and a `transfers[]` array added to order creation — none of which exist yet. `payout.service.ts` checks `isRouteConfigured()` before every payout attempt and always falls through to RazorpayX Payouts (the real, already-integrated mechanism) instead — satisfying "reuse existing Razorpay integration wherever possible, do not create a second independent payment system" literally: RazorpayX Payouts already *is* that one system.

**A real bug was found and fixed via live testing, not by inspection alone: `refund.service.ts`'s `executeRefund` could never actually process a verification-marketplace refund.** `resolveRazorpayPaymentId()` only ever handled `refund.purchaseId` and `refund.specialRequestId` — the `refund.verificationRequestId` branch (added to the `Refund` model in Phase 3) was simply never written, so it fell through to `return null`, and `executeRefund` failed every time with "No captured payment was found behind this refund." This was invisible to prior phases because Phase 3's own test suite exercises `cancelVerificationRequest` (which *creates* the `Refund` row) but never calls the generic admin `/refunds/:id/process` endpoint against it. Fixed by adding the missing branch (most-recent `PAID` `VERIFICATION_ADVANCE`/`VERIFICATION_FINAL` order for the request) — in scope here because Phase 4B section 9 explicitly requires refunds to integrate with the new ledger, which is impossible if refunds can't process at all.

**A second, unrelated masking gap was found and fixed in the same pass: `admin.controller.ts`'s `getSellerById` returned every scalar field, including `passwordHash` and a seller's full, unmasked `bankAccount`/`ifsc`/`pan`, to any admin role — VIEWER included.** A bare Prisma `include` (rather than `select`) implicitly returns all scalars; nothing downstream ever narrowed the response before `res.json()`. Confirmed via `grep` that the admin frontend never actually reads `bankAccount`/`ifsc` from this endpoint (`Sellers.jsx`'s KYC modal uses the separate, already-correctly-masked `getKycApplication` endpoint instead), so the fix — an explicit `select` plus a `bankAccountLast4`/`panOnFile` masking shape matching `kyc.service.ts`'s existing convention — is purely additive-safe. In scope because Phase 4B section 7 explicitly requires masking sensitive payout-adjacent values in admin responses, and this is the primary admin read of a professional's bank details.

**Cancellation-fee ledger entries are split by the SAME frozen commission rate the request's payments used**, applied to `VerificationRequest.cancellationFee` (an amount `verification.service.ts` already computed, unchanged) — the least-hardcoded, most-consistent choice available given the brief specifies "platform share if applicable, professional share if applicable" without a distinct cancellation-split rule. Recorded inside `executeCancellation`'s existing transaction, independent of if/when the resulting `Refund` row is later processed by an admin — a cancellation fee is retained the moment cancellation happens, not the moment a refund clears.

**Refund reversal never claws back a payout that already happened.** `recordReversalForRefund` (`ledger.service.ts`) walks unreversed `GROSS_PAYMENT` entries for the request oldest-first, reversing proportionally up to the refund amount. If the `ProfessionalEarning` behind an entry has already reached `PAID`, the reversal ledger rows are written with status `REQUIRES_RECONCILIATION` (not `RECORDED`) and a `ReconciliationIssue` is opened — the earning itself is left untouched, still showing `PAID`. A Super Admin has to look at it and decide; nothing here ever silently subtracts money from a professional who was already paid.

**Reconciliation ships as two independent checks, not one.** *Internal consistency* (does our own ledger agree with our own `PaymentOrder`/`ProfessionalPayoutRecord` rows — amount sums, commission splits, payout totals) runs unconditionally and is fully testable today with zero external dependency; verified live by deliberately corrupting a `PaymentOrder.platformCut`, running the sweep, confirming a `COMMISSION_MISMATCH` `ReconciliationIssue` opened, then resolving it. *Remote consistency* (does a locally-PAID `PaymentOrder` actually match what Razorpay has on file — a new `fetchPayment()` added to `lib/razorpay.ts`, `GET /v1/payments/:id`) only runs when `isRazorpayConfigured()` is true, and is honestly reported as skipped otherwise rather than silently passing — this half genuinely needs real or Razorpay test-mode credentials to exercise, which this sandbox does not have. Neither check ever auto-fixes anything; both only ever create an `OPEN` `ReconciliationIssue` for a Super Admin to resolve by hand (`resolveReconciliationIssue` — the resolution itself changes zero financial data, only records that a human looked at it).

**Authorization mirrors the existing tiers exactly, extended, not reinvented.** Every read (financial overview, ledger drill-down, payout list, reconciliation issue list) is open to all three admin roles — `VIEWER` included, same as every other admin list/detail endpoint in this codebase. Every action that moves money or changes payout eligibility (commission-rate change — already `superOnly` since Phase 3; process/retry/write-off a payout; update payout eligibility; run a reconciliation sweep; resolve a reconciliation issue) is `SUPER_ADMIN`-only, the same tier as refunds and KYC decisions. Verified live in both directions: a `SUB_ADMIN` token gets 403 on all six mutating actions; a `SUPER_ADMIN` token succeeds on all of them. A professional's earnings/payout endpoints (`/api/seller/verification-marketplace/earnings/*`, `/payouts`) are gated `requireSellerRole(EXPERT)` and scoped to `req.seller.id` — verified live that a second Expert sees zero earnings for the first Expert's completed job, and an Owner replaying their JWT against the route gets a structural 403.

**Frontend scope was "light functional wiring," matching the Phase 2/4A precedent, not the deferred responsive-design pass, and explicitly not the buyer app (mobile-app work, out of scope this round).** Seller app: one new page, `expert/VerificationEarnings.jsx` — deliberately separate from the existing `expert/Earnings.jsx` (Report-Unlock/weekly-settlement money, unchanged), since conflating two different money systems into one screen would misrepresent what a professional is actually owed and from where. Admin app: one new page, `FinancialDashboard.jsx` (overview / payouts / reconciliation / commission-settings tabs, matching `RewardLedger.jsx`'s tab-within-one-page shape from Phase 4A), plus the `verification-settings` commission rate finally getting a UI (it existed as a working API since Phase 3 but no admin screen ever called it).

**Verification method — same constraint as Phases 1-4A:** Jest can't run in this sandbox (Node 22.20 vs. a dependency needing ≥24.9); `apps/api/tests/financial-ledger.test.ts` was still written against the exact scenarios verified live below and typechecks clean (`tsc --noEmit` against a scratch config additionally including `tests/**/*`, same method as Phase 4A). Verified instead via `tsc --noEmit` clean on `apps/api`/`packages/shared`, `vite build` clean on `apps/admin`/`apps/seller`, and a full live-server walkthrough against the real Neon dev DB covering every scenario in this phase's testing list: a ₹30,000 quote splitting into exactly ₹9,000/₹21,000 across both legs → duplicate advance-verify callback → duplicate `payment.captured` webhook → commission-rate change with the historical request's frozen 30% confirmed unaffected → `SUB_ADMIN` blocked from changing the rate → job completion (start/report/final payment) → earnings promoted to `AVAILABLE_FOR_PAYOUT` on unlock → payout blocked without eligibility/bank details → payout requested → a second request finding nothing left to claim → `SUB_ADMIN` blocked from processing → `SUPER_ADMIN` processing to `PROCESSING` (not `PAID`) → webhook-confirmed `PAID` → duplicate payout webhook not double-counting → a synthetic `payout.failed` moving a record to `RETRYABLE` → cross-professional and cross-role unauthorized-access checks → cancellation fee ledger split → refund processing creating `REVERSAL_EARNING` entries → reconciliation sweep detecting and resolving an injected mismatch → the financial overview endpoint. All test rows (sellers, a buyer, a throwaway `SUPER_ADMIN`, verification requests, ledger entries, payout records, reconciliation issues) deleted afterward; DB reconfirmed at its exact baseline (0 rows in every business table touched, `PlatformSetting.verificationPlatformCommissionRate` back at its default 0.30).

**Production blockers / exact configuration still required before live money can move**, spelled out in full in this phase's final report to the user: real `RAZORPAY_KEY_ID`/`SECRET`/`WEBHOOK_SECRET` and `RAZORPAYX_KEY_ID`/`SECRET`/`ACCOUNT_NUMBER` (a funded RazorpayX current account) in production `.env`; the Razorpay dashboard webhook configuration must include RazorpayX Payouts events (`payout.processed`/`failed`/`rejected`/`reversed`), not just Checkout payment events — these may share the platform's existing webhook secret or need a second one depending on the live Razorpay account's setup, worth confirming directly with Razorpay support before go-live; every professional needs real `bankAccount`/`ifsc` on file and an explicit Super Admin `payoutEligibilityStatus: ELIGIBLE` decision (defaults to `PENDING_ONBOARDING` — nobody is payout-eligible by default); Razorpay Route remains unconfigured and unused by design until a deliberate future decision to enable marketplace Linked Accounts.

---

## Buyer Marketplace + Support decisions — 2026-08-21

Phase 4C of the same requirements pass, resumed after an earlier session was interrupted mid-implementation by context exhaustion. Explicit instruction this round: inspect the working tree first rather than restarting, continue only the remaining work, no second payment system, no second notification system, no full premium UI redesign yet, no new phase, no commit.

**Resume-audit findings before any new code was written.** The backend half of Phase 4C (schema/migration, notification hooks, AI support system, admin support endpoints, knowledge-base CRUD + seed) and the buyer app's types/format-helpers/API-client layer were already complete, typechecked clean, and verified via a 32-check live smoke test from the interrupted session. What remained was entirely presentation-layer: the buyer-app screens themselves (feed detail's Verify CTA, verification request list/detail, support ticket list/detail, notification inbox) and the Admin Support Dashboard — nothing architectural was missing, so this pass built directly on the existing API client rather than touching schema or services except where testing surfaced a real bug (below).

**`Notification` gained a buyer-carrying shape instead of a second model** — already decided in the interrupted session and left unchanged: `sellerId`/`userId` are XOR (raw-SQL CHECK constraint, the same pattern `Refund` established in Phase 3), and `notifyBuyerAlert()` is the one buyer notification pathway, reused for every Phase 4C event (verification request/quote/payment/cancellation/claim, support escalation/reply) rather than a second function per event type.

**AI support answers only from an admin-curated knowledge base and never sees account-specific state.** `lib/aiSupport.ts`'s `generateAiAnswer()` receives the user's message text and the approved `SupportKnowledgeEntry` rows — nothing else. It has no Prisma access and no path to any mutating service function, so it structurally cannot invent a payment confirmation, a refund approval, a verification result, or a legal conclusion, because it never receives the facts that would let it. Any account-specific fact a user needs (their request's actual status, whether a payment cleared) is injected elsewhere as a plain `SYSTEM` message from a direct read — never phrased by the model. `PAYMENT`/`CANCELLATION`/`CLAIM` categories skip the AI and escalate on ticket creation, per the brief's own "payment/refund/claim-sensitive issue" escalation trigger.

**Human takeover is a structural no-op guard, not a manual discipline the code has to remember to apply.** `advanceTicket()` — the one function that decides AI-vs-escalate on every new message — returns immediately without calling the AI at all once a ticket's status is `ASSIGNED`/`IN_PROGRESS`/`RESOLVED`/`CLOSED`. There is no separate "is a human handling this" flag to keep in sync; the ticket's own status *is* that flag, so "the AI must stop replying after human takeover" can't drift out of sync with reality. "Talk to a human" has no dedicated endpoint — it's a plain user message matching an explicit regex (`HUMAN_REQUEST_PATTERN` in mock mode; the real-mode system prompt instructs the model to emit a literal `ESCALATE` line on the same signal) — the buyer-app ticket screen's "🧑‍💼 Talk to a human" button just posts that exact phrase through the normal message endpoint, rather than inventing a second code path for the same outcome.

**Two retry-order bugs found and fixed via the smoke test, both real correctness gaps in the buyer-facing payment path, not test-script issues.** `createAdvanceOrder`/`createFinalOrder`'s controller preconditions checked only the pre-order status (`request.status !== 'ACCEPTED'` / `!== 'COMPLETED'`) — but `createVerificationAdvanceOrder`/`createVerificationFinalOrder` (`payment.service.ts`) unconditionally flip the request to `ADVANCE_PAYMENT_PENDING`/`FINAL_PAYMENT_PENDING` the moment an order is created, before any payment is confirmed. A buyer who closed the `PaymentSheet` without completing checkout — or whose connection dropped — was left permanently stuck: the request's status no longer matched the one status the retry precondition accepted, and there was no other path back to a payable state. Fixed by widening both preconditions to also accept the request's own post-order-pending status (`ACCEPTED` **or** `ADVANCE_PAYMENT_PENDING`; `COMPLETED` **or** `FINAL_PAYMENT_PENDING`) — safe because order creation is naturally idempotent here: a second Razorpay order is just a second intent, and `finalizeVerificationAdvance`/`finalizeVerificationFinalPayment` settle the request from whichever specific order the buyer actually ends up paying, keyed by that order's own id, not by "the most recent one." Verified live: three consecutive retries against the same request all returned a fresh `201` order.

**Buyer-app screens follow the closest existing template exactly, not a new pattern.** `VerificationRequestDetailScreen.tsx` is modeled directly on `SpecialRequestDetailScreen.tsx`'s status-pill/`PaymentSheet`/timeline shape, reusing `Card`/`SectionCard`/`DetailRow`/`Pill`/`Button` as-is; the two genuinely new pieces this phase needed and the template didn't have are a "Cancel Request" confirmation step and a "Raise a Claim" form, both added inline rather than as new shared components since they're used in exactly one place. `VerifyPropertyCTA.tsx` is the one new shared component — deliberately factored out because the identical create-request-then-navigate flow (with the minimum-fee copy fetched live from `GET /verification-requests/config`, never hardcoded) is needed from both `ReportScreen.tsx` (source `LISTING`) and `VerifiedPropertyDetailScreen.tsx` (source `PROPERTY`), so one component avoided a second copy of the same 409-handling/navigation logic. Cancellation and the claim form never compute a fee or refund amount client-side — `cancelVerificationRequest()`'s response (backend-computed `cancellationFee`/`refundAmount`) is the only thing ever displayed, per the brief's explicit "backend remains the source of truth" instruction.

**The Admin Support Dashboard reuses every existing shared primitive (`Pagination`/`Toast`/`Badge` from `components/ui.jsx`) and the exact table+modal shape `SpecialRequests.jsx`/`RewardLedger.jsx` already established** — no new list/modal pattern was introduced. Permission tiers mirror the backend exactly: `canManageSupport` (assign/reply/reopen/return-to-AI/priority) is `SUPER_ADMIN` + `SUB_ADMIN`, the same tier as listing QC; `canResolveSupportTicket` additionally checks the ticket's own category client-side (`PAYMENT`/`CANCELLATION`/`CLAIM` require `SUPER_ADMIN`) so a `SUB_ADMIN` never sees a Resolve button that would just 403 — verified live in both directions. The admin ticket-detail view is the one place `aiSummary` is ever shown (explicitly stripped from every buyer/partner-facing response by the existing `hideAiSummary()` helper from the interrupted session) — it exists purely so a human agent taking over mid-conversation has context without re-reading the whole thread.

**Verification method — same constraint as every prior phase this pass:** Jest can't run in this sandbox (Node 22.20 vs. a dependency needing ≥24.9). Verified instead via `tsc --noEmit` clean on `apps/api`/`packages/shared`/`apps/buyer`, `vite build` clean on `apps/admin`, and two live-server smoke passes against the real Neon dev DB: the interrupted session's 32-check backend pass (buyer feed visibility, verification request lifecycle + notifications, cross-buyer isolation returning 404 not 403, AI-confident-match/no-match/sensitive-category-immediate-escalation/explicit-human-request paths, admin assign/reply/resolve/reopen/return-to-AI, `SUB_ADMIN`-vs-`SUPER_ADMIN` sensitive-ticket-resolve authorization, knowledge-base CRUD authorization) plus this session's 28-check resume pass specifically targeting the two fixed retry bugs (order-retry-while-pending for both advance and final legs, including a third consecutive retry to confirm it's genuinely idempotent and not a one-shot patch) and every new admin support endpoint end-to-end. All test rows (buyers, sellers, a throwaway listing, verification requests/quotes, support tickets/messages, a throwaway `SUB_ADMIN`) deleted afterward; DB reconfirmed at its exact baseline (0 rows in every business table, the 10 seeded `SupportKnowledgeEntry` rows from the interrupted session intact and untouched).

**Not built this pass, deliberately, per explicit instruction:** the final premium UI/UX redesign (all new screens reuse the existing dark-theme design tokens and component library exactly, no new visual language); a new phase; a commit (working tree left uncommitted for review, same as every phase this pass).

---

### Phase 0 — workspace setup (completed outside the original plan)

Restructured into a pnpm workspace: `apps/api`, `apps/admin`, `apps/seller`, `apps/buyer`, `packages/shared`. Root `package.json` (filtered `dev:*` / `build:api` scripts), `.npmrc`, workspace globs and a monorepo-aware `.gitignore` were added; `packages/shared` was initialized as `@civilcheck/shared`.

Two findings worth keeping:

* **`nodeLinker: hoisted` must live in `pnpm-workspace.yaml`, not `.npmrc`** — pnpm 11 ignores pnpm-specific settings in `.npmrc`. The isolated layout produced two `@prisma/client` copies (`prisma generate` wrote to one, the app resolved the other), so newly added models were missing at runtime with no build error.
* `allowBuilds` entries are required for `unrs-resolver`, `@firebase/util` and `protobufjs`.

### Day 2 decisions (all four blockers resolved 22 July 2026)

1. **TOTP dependency** — `otplib` approved and installed (v13). Note that v13 is a functional rewrite: there is no `authenticator` singleton, `keyuri` is now `generateURI`, and `verify()` is **async** because the default crypto plugin has no synchronous HMAC path. Drift tolerance is expressed as `epochTolerance` in seconds (30 = ±1 step), not `window`.
2. **Resend + Msg91 credentials** — not needed to ship. The adapter reads `RESEND_API_KEY` / `MSG91_AUTH_KEY` **per call**, so dropping real keys into `.env` and restarting switches it to live sending with no code change. Without keys it logs the exact payload. This is the permanent shape, not a stub to remove later.
3. **Content Control (PDF 5.4)** — four models shipped: `PropertyCategory`, `ServiceArea`, `Disclaimer`, `BannerAnnouncement`. See the Day 2 section below for the shape and the reasoning.
4. **Analytics gap** — everything derivable from the `Alert` table ships now. `monthlyRenewalRate` and `subscriberChurnRate` return **`null`** (not `0`) so a dashboard can distinguish "nobody renewed" from "not computable yet". Day 4 populates them.

---

## User Review & Integration Strategy

To support development while third-party configurations are finalized, we will implement pluggable adapters:

* **Firebase Auth & Notifications:** Integrate Firebase Admin SDK for user token verification and FCM push notifications. A local mock strategy will decode test payloads and log notifications to local files if credentials are not configured.
* **Resend & Msg91:** Deliver emails (with PDF attachments) and SMS alerts through structured SDK clients that fallback to a console logger in development.
* **Razorpay (Payments & Subscriptions):** Establish checkout endpoints, order generation, and subscription triggers alongside a webhook simulation engine.
* **CI/CD & DevOps:** Pre-configure GitHub Actions pipelines to run automated test suites and deploy directly to Railway.app (backend) and Vercel (frontend panels) upon every git push.

---

## Type Safety & TypeScript Guidelines — ✅ Satisfied as of Day 1

To ensure production-grade reliability and seamless integration with the Next.js panels and React Native buyer app, we will apply strict typings:

1. **Refactor Express Request Extensions:** Update the global request declarations in `src/middleware/auth.middleware.ts` to strictly type `req.user`, `req.seller`, and `req.admin` (incorporating `AdminRole` from the Prisma client) to avoid compilation warnings.
2. **Remove `any` Types:** Eliminate generic `: any` stubs inside search query inputs, payload variables, and database error catch blocks.
3. **Use Prisma Client Typings:** Replace dynamic objects in formatter functions (e.g., `formatFreePreview(listing: any)`) with strong types exported by the Prisma client (such as `Prisma.ListingGetPayload` or custom composite interfaces).
4. **Compile-Time Validation:** Ensure that running the TypeScript compiler (`npx tsc`) produces zero errors or warning traces.

**Verified 21 July 2026:** `req.user` / `req.seller` / `req.admin` are strictly typed with `AdminRole` from the Prisma client; `apps/api/src` contains zero `any` occurrences; the formatters in `property.controller.ts` already take composed Prisma types (`Listing & { seller: Pick<Seller, …> }`) rather than `listing: any`; `pnpm --filter @civilcheck/api build` compiles clean. Re-check this section at the end of each day.

**Re-verified 24 July 2026 (end of Day 4):** still zero `any` in `apps/api/src` (grep count 0) after the FTS, notification/FCM and subscription work; `pnpm build:api` compiles clean. New surfaces stay strictly typed — raw FTS rows are read through `Prisma.sql` with explicit `$queryRaw<{ id: string }[]>` result types, and the subscription/notification/webhook paths use Prisma model types (`Subscription`, `DeliveryResult`, `PushResult`) rather than loose objects.

**Re-verified 24 July 2026 (end of Day 5):** still zero `any` in `apps/api/src` after the Cloudinary, DigiLocker and caching work; `pnpm build:api` compiles clean. The new `TtlCache<V>` is a proper generic rather than a loosely-typed cache-of-anything, and the DigiLocker adapter's `DigiLockerProfile`/state-JWT payload are explicit interfaces, not decoded into `any`.

**Re-verified 24 July 2026 (end of Day 6):** still zero `any` in `apps/api/src` after the dashboard, refund, special-request payment, SLA scheduler, PDF and settlement work; `pnpm build:api` compiles clean. `refund.service.ts`'s `executeRefund()` and `pdf.service.ts`'s document builders take explicit interfaces throughout — including the pdf-lib `Doc` wrapper type — rather than loosening to `any` anywhere money or PDF layout data flows through.

**Re-verified 25 July 2026 (end of Day 7):** still zero `any` in `apps/api/src` after the QC/penalty, review, report-flag and app/index split work; `pnpm build:api` compiles clean. `penalty.service.ts`'s `applyStrikeEscalation()` and `review.service.ts`'s `recalculateSellerRating()` return explicit result interfaces rather than loose objects. The test suite (`apps/api/tests/`) sits outside `src/` and is compiled separately by ts-jest against `tsconfig.test.json` — it is not part of this zero-`any` guarantee, but is itself `any`-free by inspection.

**Re-verified 28 July 2026 (end of Day 8):** still zero `any` in `apps/api/src` after the payout-ledger, retry-endpoint, seller-auto-match, churn-analytics, featured-expiry, Msg91-webhook and 2FA-grace-period work; `pnpm build:api` compiles clean. `sellerMatch.service.ts`'s ranking and `specialRequestPayout.service.ts` use Prisma model types and explicit interfaces throughout, same discipline as every prior day.

---

## Proposed Changes

### Day 1: Schema Updates, Database Seeding, Zod Validation, Admin RBAC, and Firebase Auth Type Gating — ✅ COMPLETE

*Modify the database schema to support geospatial pins, compliance checkboxes, search history logs, and buyer flagging. Create a comprehensive data seeder for local dev and client demonstrations. Implement Zod schema validations, define admin RBAC middleware checks, and set up Firebase Auth.*

**Delivered in 6 commits (`day1: …`).** Migrations `20260721090115_day1_geo_kyc_search_flags` and `20260721093708_day1_admin_session_activity` are applied to the Neon dev database. One item — mounting `/api/webhooks/razorpay` — was deliberately carried into Day 3 (see the note under `index.ts` below).

#### ✅ [MODIFY] [schema.prisma](apps/api/prisma/schema.prisma)

* **Geospatial Pins (PDF 7.3):** Add `latitude` and `longitude` fields (Float?) to the `Listing` model.
* **Seller KYC Payload (PDF 6.1):** Add nullable fields `selfieUrl` and `barCouncilDoc` (replacing placeholder string types) to hold Cloudinary document links.
* **Compliance Checks (PDF 6.1):** Add fields `tcAccepted` (Boolean @default(false)) and `digitalSignature` (String?) to the `Seller` model.
* **Search History Logger (PDF 7.3):** Create the `SearchQuery` model:
  ```prisma
  model SearchQuery {
    id        String   @id @default(uuid(7))
    userId    String
    user      User     @relation(fields: [userId], references: [id])
    query     String
    createdAt DateTime @default(now())
  }
  ```
* **Listing Report Outdated Flags (PDF 7.8):** Create the `ReportFlag` model:
  ```prisma
  model ReportFlag {
    id         String     @id @default(uuid(7))
    userId     String
    user       User       @relation(fields: [userId], references: [id])
    listingId  String
    listing    Listing    @relation(fields: [listingId], references: [id])
    reason     String
    status     FlagStatus @default(PENDING)
    adminNote  String?
    createdAt  DateTime   @default(now())
  }

  enum FlagStatus {
    PENDING
    RESOLVED
    DISMISSED
  }
  ```
* **Listing Fields Alignment (PDF 6.3):** Enforce all 17 listing fields in the schema enums (`propertyType`, `caseType`, `caseStatus`, `riskBadge`) and verify optionality parameters.
  * *Outcome: verification only — all four enums already matched the spec and optionality was correct, so no schema change was needed. Field-level enforcement now happens at the edge via `listingCreateSchema` in `packages/shared`, which also requires `caseNumber`/`caseType`/`caseStatus`/`courtName` when `caseExists` is true and `lenderName` when `loanDefault` is true.*

#### ✅ [NEW] [seed.ts](apps/api/prisma/seed.ts)

* **Database Seeder for Demonstrations:** Build a seeder script to populate PostgreSQL with realistic pilot data:
  * Admins with pre-hashed bcrypt passwords representing Super Admin, Sub-Admin, and Viewer roles.
  * Buyers (Users) with active search history logs.
  * Verified sellers (Lawyers, Civil Engineers, Tehsil Experts) with bank details and KYC uploads.
  * Listings of property reports in Jaipur (Vaishali Nagar, Mansarovar) representing RED, AMBER, and GREEN states (complete with coordinates, khasra/survey numbers, and notes).
  * Sample purchases, alert subscriptions, and custom special requests to demonstrate platform capabilities.

*Seeder is idempotent (upsert / find-or-create only, never deletes) and safe to re-run. Registered as the `prisma db seed` command in `prisma.config.ts`. Demo admin logins: `superadmin@civilcheck.in` / `Super@123`, `subadmin@civilcheck.in` / `Sub@123`, `viewer@civilcheck.in` / `Viewer@123` — dev only, rotate before any real deployment.*

#### ⚠️ [MODIFY] [index.ts](apps/api/src/index.ts) — 4 of 5 done

* ✅ Mount `/api/purchases` using [purchase.routes.ts](apps/api/src/routes/purchase.routes.ts). *(The routes file already existed but was never mounted.)*
* ⏭️ **Mount `/api/webhooks/razorpay` for payment and subscription events — deferred to Day 3.** Signature verification needs `RAZORPAY_WEBHOOK_SECRET`, and the handler itself is a Day 3 deliverable. Mounting an endpoint that cannot verify signatures would let anyone POST forged `payment.captured` events and create `Purchase` rows, so it was left unmounted by agreement.
* ✅ Integrate `helmet` for secure HTTP headers. *(Registered before all routes.)*
* ✅ Inject `express-rate-limit` on OTP and payment order creation routes. *(OTP limiters already existed; added `paymentLimiter` — 20 per 15 min, keyed per authenticated user with an IPv6-safe IP fallback — on `POST /api/purchases`.)*
* ✅ Add session check logic to handle the 30-minute inactivity timeout. *(Implemented as described below.)*

##### Decision: how the 30-minute inactivity timeout works

Admin JWTs live for 7 days, so the token alone cannot express "idle too long". The agreed approach is **admin-only and database-backed**:

* New `Admin.lastActivityAt` column. Set on login, refreshed by `adminMiddleware` while the session is active, cleared on logout or expiry — `null` means "no active session".
* Requests arriving more than 30 idle minutes later return `401 { code: 'SESSION_EXPIRED' }` and the stamp is cleared, killing the JWT server-side while it is still cryptographically valid.
* `POST /api/auth/logout` now performs a real server-side logout for admins; buyer/seller logout stays stateless.
* `GET /api/auth/me` rejects expired admin sessions too, so the admin panel cannot restore a dead session on reload.
* The stamp is refreshed at most once per minute to avoid a Postgres write on every admin request; the timeout is therefore accurate to within one minute.
* Configurable via `ADMIN_SESSION_TIMEOUT_MINUTES` (default 30).

*Rejected alternatives: rotating 30-minute tokens (needs admin-panel changes to store the rotated token, which was out of scope this session) and applying the timeout to buyers/sellers (poor UX for the React Native app).*

#### ✅ [NEW] [firebase.ts](apps/api/src/lib/firebase.ts)

* Initialize Firebase Admin SDK to process Buyer/Seller phone OTP logins and verify Google/Apple SSO identity tokens.

*Real mode activates when `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_SERVICE_ACCOUNT_PATH` is set. With neither, a mock adapter decodes test payloads **without verification** so local dev and demos work without a Firebase project — and it refuses to authenticate anyone when `NODE_ENV=production`. Phone numbers are normalized from E.164 to the bare 10-digit form the database uses.*

#### ✅ [MODIFY] [auth.middleware.ts](apps/api/src/middleware/auth.middleware.ts)

* Update authentication middleware to extract and verify Firebase ID tokens, retrieving or creating the corresponding User/Seller in PostgreSQL.
* **Admin Role-Based Access Control (RBAC) (PDF 5.1):** Extend the admin verification middleware to check and enforce permissions matching three distinct administrative roles:
  * **Super Admin:** Full platform capabilities (kyc decisions, payments, settlements, content).
  * **Sub-Admin:** Read-only analytics, listing approvals, manual QC reviews.
  * **Viewer:** Read-only access to search data, analytics dashboards, and lists.
* **Express Request Extensions:** Update the global request declarations to type `req.user`, `req.seller`, and `req.admin` (incorporating `AdminRole` from the Prisma client).

*Implemented as `requireAdminRole(...allowed)`, applied per route in `admin.routes.ts`. `SUPER_ADMIN` passes everything; KYC decisions, suspensions, badge changes and refunds are `SUPER_ADMIN`-only; listing approve/reject/spot-check also admits `SUB_ADMIN`; all `GET` routes stay open to the three roles so `VIEWER` is read-only. Buyer and seller middleware now accept either a legacy local JWT or a Firebase ID token — buyers are found-or-created by phone, sellers are retrieve-only because registration requires profession and bank data.*

*Verified against a running server: `VIEWER` → 403 on seller-approve and listing-approve; `SUB_ADMIN` → 403 on seller-approve but passes RBAC on listing-approve.*

#### ✅ [NEW] [validation.middleware.ts](apps/api/src/middleware/validation.middleware.ts)

* Create generic body validator middleware using Zod to enforce schema layouts for listing creation, KYC records, and special research requests.
* **Banking & Compliance Validations (PDF 6.1):** Validate seller registration parameters to verify banking routing strings (Account Number + IFSC) alongside the boolean `tcAccepted: true` checkbox.

*`validateBody(schema)` replaces `req.body` with the parsed result, so controllers receive defaults and transforms already applied. All schemas live in `packages/shared/src/validation.ts` and are imported by the API: seller registration (account number + IFSC validated as a pair, `tcAccepted` must literally be `true`), KYC upload, listing creation, and special requests. Wired onto `POST /api/seller/register`, `POST /api/seller/kyc/certificate`, `POST /api/seller/listings` and `POST /api/special-requests`.*

#### 🐛 Bug fixed in passing

`POST /api/special-requests` — the buyer-facing route — was wired to `adminMiddleware`. Buyers received 403, and an admin token would have crashed the controller on `req.user!.id`. Now uses `authMiddleware`.

---

### Day 2: Admin Security (2FA), KYC Approval Pipelines, Audit Trails, and Analytics — ✅ COMPLETE

*Enforce admin authorization rules, 2FA, audit logs, seller application approval pipelines, and verify admin analytics.*

Delivered in one migration (`20260722070804_day2_2fa_content_control`) and one implementation pass. Verified against a running server: 80 end-to-end assertions pass, covering enrollment, TOTP enforcement, the KYC pipeline, audit rows, content CRUD, public reads, analytics, and RBAC.

#### ✅ [NEW] `src/services/` — the service layer the guidelines require

The repo had no `services/` directory; business logic lived in controllers. Day 2 introduces it and moves the new work there, leaving controllers as request/response translation only:

| Service | Responsibility |
| --- | --- |
| `audit.service.ts` | `AuditAction` vocabulary, IP extraction, `recordAudit()` |
| `notification.service.ts` | Resend / Msg91 / in-app adapters and the `notifySeller` fan-out |
| `twoFactor.service.ts` | TOTP secret generation, otpauth URI, verification |
| `kyc.service.ts` | Every `Seller.kycStatus` transition, guarded and notified |
| `content.service.ts` | CRUD for the four Content Control models |
| `analytics.service.ts` | Alert-subscription metrics |

#### ✅ [MODIFY] [schema.prisma](apps/api/prisma/schema.prisma) — one migration

* `Admin.twoFactorSecret` (String?) and `Admin.twoFactorEnabled` (Boolean, default false).
* `Seller.email` (String?) — **added beyond the approved list.** The seller had no email column, so the Resend channel on KYC decisions would have been dead code. Nullable and additive; the email channel reports `skipped` when no address is on record.
* Content Control: `PropertyCategory`, `ServiceArea` (unique on `city+tehsil`), `Disclaimer` (versioned), `BannerAnnouncement` (+ `BannerAudience`, `BannerSeverity` enums).
* `AuditLog` gained indexes on `createdAt` and `adminId` but **deliberately no FK to `Admin`** — an audit row must outlive the admin it describes. A FK would either block admin deletion or cascade the evidence away. Identity is resolved at read time with a batched lookup, and a deleted admin resolves to `null`.

#### ✅ Two-Factor Authentication (PDF 5.1)

Enrollment is two-step so it can never lock anyone out: `/2fa/setup` writes a secret but leaves it inert; `/2fa/enable` verifies a live code before flipping the flag. Login enforces TOTP **only once `twoFactorEnabled` is true** — demanding a code from an admin with no secret would lock every existing account out of the panel, including the one needed to enroll. Unenrolled logins succeed with `twoFactor.enrollmentRequired: true` so the panel can push to setup.

* `GET  /api/admin/2fa/status`
* `POST /api/admin/2fa/setup` → `{ otpauthUri, secret }`
* `POST /api/admin/2fa/enable` → `{ totp }`
* `POST /api/admin/2fa/disable` → `{ password, totp }` — both required; a hijacked session alone cannot strip the factor.

**The QR image is not rendered server-side.** The API returns the standard `otpauth://` URI and the admin panel draws it — shipping a bitmap would mean a second dependency and a secret travelling through logs and proxies as an image. `secret` is returned alongside as the manual-entry fallback.

`adminLoginLimiter` was raised from 5 to 10 per 15 minutes as a direct consequence: the endpoint now takes a 30-second-lived code that legitimate admins mistype, and the limiter is IP-keyed so an office NAT shares one budget.

#### ✅ Audit Trail (PDF 5.1)

`recordAudit()` is wired into **every** admin mutation: login (success and failure), logout, 2FA setup/enable/disable, seller approve/reject/suspend/unsuspend/badge, listing approve/reject/spot-check, refund create/process/reject, special-request assign/approve/reject, and all Content Control writes.

KYC decisions pass the audit write **into the same transaction** as the mutation, so the action and its evidence commit together. Outside a transaction it is best-effort: the mutation has already committed, and throwing there would report failure for work that succeeded.

> **Bug fixed in passing:** `GET`/`POST /api/admin/audit-logs` were implemented but never mounted in `admin.routes.ts` — the panel's Audit Log page was hitting a 404. Now mounted, with `action` / `adminId` / `from` / `to` filters and resolved admin identity.

#### ✅ KYC Approval Pipeline (PDF 5.2)

* `GET /api/admin/kyc/pending` — FIFO review queue exposing certificate, selfie, Aadhaar flag, T&C acceptance, plus `documentsComplete` and `bankDetailsComplete` for triage.
* `GET /api/admin/kyc/:id` — one application in full. Bank account is masked to the last 4 and PAN is reported as a boolean; an unmasked PAN in an admin response is a needless PII exposure.
* approve / reject / suspend / unsuspend / badge — all guarded with `updateMany` + a status predicate, so two admins clicking at once produce one winner and one "already in that state" rather than a lost update. Each fires email + SMS + in-app.

Two behaviour changes worth knowing:

* **Reject now accepts `PENDING` only.** Rejecting an already-`APPROVED` seller used to strip their status while leaving their live listings published. The response points at `/suspend`, which does it properly with the cascade.
* **Unsuspend does not republish listings.** They were unpublished under a suspension, so each goes back through review rather than silently reappearing in buyer search.

#### ✅ Notification adapter (PDF 12/20 — pulled forward from Day 4)

Keys are read **per call**, never at module load. Key present → real HTTP send; key absent → the exact payload is logged. Both paths return the same `DeliveryResult`, so callers never branch on configuration, and the API response reports per-channel status (`{ in_app: 'sent', email: 'logged', sms: 'logged' }`) so an admin can see what actually went out.

Resend and Msg91 are called over global `fetch` with a 10s timeout — no SDK dependencies. Nothing throws: a dead provider must not roll back the KYC decision that triggered it. Notifications always fire **after** the transaction commits, so a third-party round-trip never pins a database connection.

`MSG91_TEMPLATE_ID` is required alongside the auth key — Indian transactional SMS must use a DLT-approved template, so an auth key alone cannot send. That combination logs a loud error and preserves the payload rather than silently dropping it.

#### ✅ Content Control (PDF 5.4)

Four models sharing one shape: a stable business key, an `active` flag, and `updatedAt`. **DELETE is a soft delete** — audit-log targets must stay resolvable and a listing referencing a category must not be orphaned by an admin tidying a dropdown. Create therefore *revives* a matching inactive row instead of colliding with its unique constraint.

* Admin CRUD under `/api/admin/content/{categories,service-areas,disclaimers,banners}` — reads open to all three roles, every write `SUPER_ADMIN` only.
* Public reads under `/api/content/{categories,coverage,banners,disclaimers/:key}` — no auth, live rows only. Content the admin publishes *for* buyers and sellers would otherwise write to nowhere.
* Disclaimer `version` increments only when the body actually changes, so a report can pin the wording it was issued under and a title-only edit does not invalidate every pinned reference.
* Banners are live only when active **and** inside their optional `[startsAt, endsAt]` window, so campaigns can be scheduled ahead.

#### ✅ Analytics & Alert Dashboard (PDF 5.6)

`GET /api/admin/analytics/subscriptions` ships active/inactive/total subscriptions, unique subscribers, average subscriptions per subscriber, new this month vs last, month-over-month growth, and a 6-month trend. `/analytics/overview` gained `subscriptions.activeAlertSubscriptions` and `users.suspendedSellers`.

`monthlyRenewalRate` and `subscriberChurnRate` return `null` with `pendingMetricsNote` explaining why. Churn is doubly blocked: it needs a cancellation **timestamp**, and `Alert` carries only a bare `active` boolean with no `cancelledAt` — so a cancelled row cannot be attributed to a month even in principle. Day 4 should add that column alongside the subscription ledger.

> **Fixed in passing:** `overview.pendingSellers` was computed as `totalSellers - approvedSellers`, which lumped `REJECTED` and `SUSPENDED` sellers into the review queue. Now counted directly.

#### ✅ [MODIFY] [auth.controller.ts](apps/api/src/controllers/auth.controller.ts)

TOTP verification on `/api/auth/admin/login`, gated on enrollment as described above. The body is now Zod-validated (`adminLoginSchema`); codes pasted with a space ("123 456") are normalized.

#### 🔒 Security fix in passing

The four `/api/admin/special-requests/*` write routes were gated by `adminMiddleware` alone, so a `VIEWER` — the read-only role — could assign work and approve or refund requests. They now require `SUPER_ADMIN` or `SUB_ADMIN`, matching the listing approval routes.

#### 🐛 Bug fixed in passing

`POST /api/seller/register` accepted an `email` in the validated body but never persisted it, so `Seller.email` was always null and the KYC email channel reported `skipped`. Caught by the smoke test.

#### Manual verification of the four fixed-in-passing changes (22 July 2026)

Run beyond the assertion suite, because these are behavioural rather than additive.

1. **Audit-logs mount** — `GET /api/admin/audit-logs` returns `200` with 44 real rows. Response carries `{ success, total, page, totalPages, logs }`; every field `AuditLog.jsx` reads (`id`, `createdAt`, `action`, `target`, `details`, `ipAddress`) is present, plus a new `admin: { id, name, email, role } | null`. The panel needs no change — the extra key is additive. Recorded actions span `ADMIN_LOGIN`, `ADMIN_LOGIN_FAILED`, `ADMIN_2FA_SETUP/ENABLE/DISABLE`, `CATEGORY_*`, `BANNER_*`, `DISCLAIMER_UPDATE`.
2. **RBAC matrix** — probed with a bogus id so `403` (stopped by RBAC) is distinguishable from `404` (passed RBAC, controller rejected the id). Full result below.
3. **Seller email** — registered with an email, then read the row **directly from Postgres**: column populated. A follow-up KYC approve reported `email: 'logged'`, confirming the address reaches the adapter.
4. **pendingSellers** — the seed has no `REJECTED`/`SUSPENDED` sellers, so both formulas returned 0 and proved nothing. Created one of each: old formula `total - approved` = 2, new value = 0, API reported 0 with `suspendedSellers: 1`. Temporary rows removed afterwards.

##### Admin RBAC matrix (verified, not inferred)

| Route | SUPER_ADMIN | SUB_ADMIN | VIEWER |
| --- | --- | --- | --- |
| Special request assign / approve / reject | ✅ | ✅ | ⛔ 403 |
| Listing approve / reject / spot-check | ✅ | ✅ | ⛔ 403 |
| Seller KYC approve / reject / suspend / unsuspend / badge | ✅ | ⛔ 403 | ⛔ 403 |
| Refund create / process / reject | ✅ | ⛔ 403 | ⛔ 403 |
| Content Control writes (all four models) | ✅ | ⛔ 403 | ⛔ 403 |
| Audit log — manual write | ✅ | ✅ | ⛔ 403 |
| Audit log — read | ✅ | ✅ | ✅ |
| Own 2FA enrollment | ✅ | ✅ | ✅ |
| All `GET` analytics / lists | ✅ | ✅ | ✅ |

Special requests now sit in the same tier as listing QC (`SUPER_ADMIN` + `SUB_ADMIN`), which is the intended reading of PDF 5.1: `SUB_ADMIN` does approvals and manual QC, money and identity decisions stay with `SUPER_ADMIN`.

---

### Day 2 tail — carry-over tasks

Not blocking the Day 2 commit. Pick these up during Day 3 or before go-live, in this order.

#### 🔴 Must fix before production launch

1. **TOTP replay window** — a valid code stays usable for its ±30s tolerance, so anyone who glances at a code being typed can reuse it inside that window. Standard fix: an `Admin.lastTotpStep Int?` column storing the last accepted 30-second step; refuse a code whose step is `<=` the stored value. Small schema change, roughly 30 lines. Do it as a Day 3/4 side task, not on launch day. → **Now folded into Day 3 side-tasks.**
2. **`app.set('trust proxy', 1)` before the Railway deploy** — Express currently reads the socket IP, which on Railway is the platform proxy, so `AuditLog.ipAddress` would record the proxy for every admin action. `X-Forwarded-For` is only trustworthy once Express is told how many proxies sit in front. One line in `index.ts`, applied when the deploy is configured. → **Now folded into Day 3 side-tasks** (same `index.ts` pass as the webhook mount).

#### 🟡 Nice to have, not launch-blocking

3. ✅ **Msg91 delivery webhooks — done in Day 8.** `POST /api/webhooks/msg91` logs delivery status to the new `SmsDeliveryLog` model, readable via `GET /api/admin/sms-delivery-logs`. Msg91 provides no HMAC scheme, so verification is a shared-secret custom header (`MSG91_WEBHOOK_SECRET`) rather than a signature — see *Day 8 decisions*. Email remains the stronger signal for KYC decisions in the meantime; this makes SMS delivery observable, not authoritative.
4. ✅ **2FA enrollment policy — done in Day 8, default OFF.** `adminMiddleware` now enforces the grace period described here, gated behind `ADMIN_2FA_ENFORCE_GRACE_PERIOD` (unset by default) — see *Day 8 decisions* for why turning it on unconditionally would have broken the seeded demo admins and the Jest suite.
5. **TOTP secrets encrypted at rest** — currently plaintext, which is normal practice when the database is the trust boundary. App-level encryption needs a managed KMS key; revisit past the Jaipur pilot, not now.
6. **`Alert.cancelledAt`** — needed for `subscriberChurnRate`; already folded into Day 4.

#### 🔵 Front-end follow-ups (not backend work)

7. **Admin panel — TOTP field on `Login.jsx`** and a QR renderer for `/2fa/setup`. Login now answers `401 { code: 'TOTP_REQUIRED' }` for enrolled admins, and `twoFactor.enrollmentRequired` on success.
8. **Seller panel — explain the post-unsuspend re-review.** An unsuspended seller finds their listings back in `PENDING_REVIEW` rather than live. Without a message ("Your listings are being re-reviewed after your account was restored"), this generates support tickets. Deliberate policy, but it needs surfacing.
9. **Seller panel — collect email at registration.** `Seller.email` now exists and drives KYC decision emails, but the registration form has to ask for it.

#### ⚖️ Policy decisions needing product sign-off

Both are correct defaults, but they change existing behaviour and should be deliberate rather than discovered:

* **Reject accepts `PENDING` only** — removing an already-approved seller now goes through `/suspend`, which cascades to unpublish their listings. Previously reject silently stripped the status and left listings live.
* **Unsuspend does not republish listings** — see front-end follow-up 8.

---

### Day 3: Razorpay Payments, Webhooks, and Dynamic Commissions

*Implement the transactional purchase ledger and dynamic commission calculations.*

> **✅ Delivered 23 July 2026** across the earlier `day3:` commits (adapter, raw-parser mount, `trust proxy`, `lastTotpStep` column, verification scripts) plus two implementation commits: `day3: razorpay report-unlock orders, webhook + dynamic commissions` and `day3: enforce TOTP replay guard via lastTotpStep`. Build is clean (`pnpm build:api`); the Razorpay adapter and commission math are verified by the scripts under `apps/api/scripts` and a runtime split check. ~~One deploy step remains: apply the new migration.~~ **Applied 24 July 2026** — `20260723010000_day3_payment_orders` (and all later migrations) are live on the Neon dev DB; `prisma migrate status` reports "up to date".
>
> **Credentials:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (documented in `.env.sample`). Leave them blank in dev — order creation returns `order_mock_…` orders and signatures verify against a dev secret, so checkout + webhook run end-to-end without a Razorpay account. In production, missing keys is a hard error (the adapter refuses to mint mock orders).

#### Day 3 decisions

**A `PaymentOrder` ledger, not a `status` on `Purchase`.** The unlock path (`property.controller`, `getMyPurchases`) gates on the mere existence of a `Purchase` row, so a `Purchase` must mean "a paid, unlocked report." A pending order therefore lives in its own table (`PaymentOrder`, keyed by the Razorpay order id) rather than as an unpaid `Purchase` — which keeps every buyer-facing read path untouched. The order → listing → buyer binding and the commission split are computed **server-side at order creation and stored on the ledger**, so neither the checkout-verify call nor the webhook has to trust a client-supplied listing or amount. Added beyond the approved model list, documented here like Day 2's `Seller.email`. Migration: `20260723010000_day3_payment_orders`.

**One idempotent finalize, two callers.** `POST /api/purchases/verify` (the checkout handshake, for an immediate unlock) and the webhook (the authoritative safety net) both call `finalizeReportUnlock`, which claims the order atomically (`CREATED → PAID` via a guarded `updateMany`) so the `Purchase` is written exactly once whichever confirmation arrives first. A buyer who paid twice via two orders is linked to the single existing `Purchase` and logged as a refund candidate rather than double-unlocked. `Purchase.settled` stays `false` — the seller's cut is owed but frozen until the Day 6 settlement run.

**Webhook is authenticated by signature, mounted before `express.json()`.** `express.raw()` on `/api/webhooks/razorpay` (already committed) leaves `req.body` the exact bytes the HMAC covers; the router mounts on the same path in the next middleware pass. A bad/missing signature → `400`; every authentic event, including duplicates and unhandled kinds, → `200` so Razorpay stops retrying. An amount that does not match the frozen order amount is logged and **not** unlocked.

**Scope — special-request advances and subscriptions are forward-compatible, not yet wired.** The commission engine and the webhook router already recognise `SPECIAL_REQUEST_ADVANCE`, `ALERT_SUBSCRIPTION` and `FEATURED_LISTING` kinds, but `SpecialRequest` has no payment column and subscriptions need the Razorpay Subscriptions API — both are already scheduled (Day 4 subscriptions, Day 6 special-request money + refund client). Report-unlock is the complete, tested money path this day ships.

#### ✅ [NEW] [razorpay.ts](apps/api/src/lib/razorpay.ts)

* Razorpay adapter with a toggleable mock mode. *Built on `fetch` + node `crypto` rather than the SDK — same per-call-credentials shape as the notification adapter, so no key at module load and nothing to delete when going live. Exposes `createOrder`, `verifyWebhookSignature`, `verifyPaymentSignature`, `getRazorpayKeyId`, and signed-payload test helpers. `createOrder` **throws** on failure (an order is on the request's critical path) and refuses to mint mock orders in production.*

#### ✅ [MODIFY] [purchase.controller.ts](apps/api/src/controllers/purchase.controller.ts)

* `POST /api/purchases` now creates a real Razorpay **order** (no `Purchase` row yet) and returns the checkout params; `POST /api/purchases/verify` confirms the checkout signature and unlocks. Orchestration lives in `payment.service.ts` (`createReportOrder`, `finalizeReportUnlock`), keeping the controller thin.
* **Commission Split Logic (PDF 6.2 & 8.2) — `computeCommission()`, runtime-verified:**
  * **Bronze/Silver Sellers:** 60% Seller / 40% Platform
  * **Gold Sellers:** 65% Seller / 35% Platform
  * **Platinum Sellers:** 70% Seller / 30% Platform
  * **Special Request (Custom Research):** 70% Seller / 30% Platform *(engine ready; wired in Day 6)*
  * **Alert subscriptions / Featured listings:** 100% Platform *(engine ready; wired in Day 4)*
  * *The seller cut is derived as `gross − platform` so the two halves always sum back to the exact amount charged.*

#### ✅ [NEW] [webhook.controller.ts](apps/api/src/controllers/webhook.controller.ts) + [webhook.routes.ts](apps/api/src/routes/webhook.routes.ts)

* Verifies the `X-Razorpay-Signature` HMAC over the raw body, then processes `payment.captured` → `finalizeReportUnlock` (creates the `Purchase`, freezes the payout). Payout freeze = `Purchase.settled: false`; **invoicing is emitted as a log placeholder** pending the Day 6 `pdf.service`. `payment.failed` marks the order `FAILED`. Mounted in `index.ts` after `express.json()`.

#### ✅ Day 3 side-tasks — folded in from the Day 2 tail

1. ✅ **`app.set('trust proxy', 1)`** — applied in `index.ts` ahead of the routes (committed with the raw-parser mount).
2. ✅ **TOTP replay window** (`Admin.lastTotpStep`) — enforced. `verifyTotp` now returns the accepted `timeStep` and accepts `afterTimeStep`; admin login, 2FA enable and 2FA disable reject any code whose step is `<=` the stored one and persist the new step, closing the ±30s replay window. Uses otplib v13's native `afterTimeStep`/`timeStep` primitives.

---

### Day 4: Razorpay Subscriptions, Multi-Channel Notifications, and Search Logs — ✅ COMPLETE

*Integrate subscription engines, complex search query logic, user search logging, and push/email/SMS delivery clients.*

> **✅ Delivered 24 July 2026** in three commits: `day4: postgres full-text search + buyer search history logging`, `day4: multi-channel buyer alerts — FCM push with SMS fallback`, and `day4: razorpay subscriptions — alert (₹49) + featured listing (₹499)`. Three migrations applied to the Neon dev DB (`day4_listing_fts`, `day4_buyer_push`, `day4_subscriptions`). Build clean (`pnpm build:api`); each workstream verified by a throwaway runtime script (FTS 12/12, notification fan-out 4/4, subscriptions 16/17 — the 17th was a test-assertion quirk, see below) and the search endpoints additionally driven over HTTP against a running server.

#### Day 4 decisions

**Search route stays public; logging is buyer-scoped.** `SearchQuery.userId` is required, so only authenticated buyers' searches are logged — which is exactly what "last 10 searches of the *authenticated* buyer" (PDF 7.3) needs. A new `optionalAuthMiddleware` attaches `req.user` on the public `/search` route without ever 401-ing and never auto-creates a user on a GET. Logging is fire-and-forget: it never blocks or fails the search.

**FTS via a generated `tsvector` column + GIN index, not ILIKE.** `Listing.searchVector` is a Postgres STORED generated column over address/city/tehsil/khasra/survey (`'simple'` config — no stemming to distort place names / khasra codes), declared `Unsupported("tsvector")?` in Prisma with an accompanying `@@index(type: Gin)`. Search uses `websearch_to_tsquery` + `ts_rank`; structured filters (city/tehsil/type/badge/price) compose into the same query so the count matches the page. There is **no separate "society/colony" column** — that text lives in the free-text `address` field, which the vector already covers.

**Buyer push (FCM) with SMS fallback.** `User.fcmToken` + `User.pushEnabled` added. `firebase.ts sendPush` sends via `firebase-admin` messaging in real mode and logs the payload in mock mode (same pluggable shape as auth). `notifyBuyerAlert` policy, straight from PDF 7.7: **push** when enabled + token, **SMS fallback** when push is off/unavailable, **email** opportunistically. `triggerAlerts` now dispatches for real (was TODO stubs) and is already invoked from the listing case-status update handler. Buyers manage this via `PUT /api/alerts/device-token` and `PUT /api/alerts/push-preference`.

**Subscriptions use a `Subscription` ledger keyed by the Razorpay subscription id** (same idea as `PaymentOrder`), so the webhook resolves an event to its row directly. `kind` reuses `PaymentKind` (100% platform via the existing `FLAT_PLATFORM_SHARE`). `createSubscription`/`cancelSubscription` follow the adapter's mock/real/prod-guard pattern; plan ids come from `RAZORPAY_PLAN_ALERT`/`RAZORPAY_PLAN_FEATURED` (mock plan ids in dev, **required in production** when keys are set). Webhook handles `subscription.activated`/`charged` → activate + extend, and `cancelled`/`halted`/`completed` → revoke. `Alert.cancelledAt` was added (the churn column Day 2 deferred).

**⚖️ Product decision needing sign-off — the ₹49 alert subscription is billing infrastructure, not yet a gate.** It is recorded and billable but does **not** yet restrict the existing *free* per-listing watch (`alert.controller`). Making alerts paid would change current behaviour, so gating is left as a deliberate one-line switch. The ₹499 featured subscription *does* take effect: activation sets `Listing.featured` + `featuredUntil`, and search ordering prefers live featured listings.

**Pre-existing quirk noted, not fixed (Day 3 scope):** with a blank `RAZORPAY_KEY_ID=` in `.env`, `getRazorpayKeyId()` returns `''` rather than `null` (dotenv yields an empty string; `?? null` doesn't catch it). Functionally harmless (`''` is falsy, so the frontend's mock-checkout branch still fires); the report-unlock path already ships with this.

#### ✅ [MODIFY] [notification.service.ts](apps/api/src/services/notification.service.ts)

* Multi-channel delivery: **FCM push** (`sendPush` in `firebase.ts`), **Resend email**, **Msg91 SMS** — all pluggable (real key → send, no key → log). `notifyBuyerAlert` fans one alert across the buyer's channels; connected to the alert-update callback in `triggerAlerts`.

#### ✅ [MODIFY] [webhook.controller.ts](apps/api/src/controllers/webhook.controller.ts)

* Subscription events: `subscription.activated`/`charged` renew access and extend `featuredUntil`; `subscription.cancelled`/`halted`/`completed` revoke. **Case Update Alerts** ₹49/mo (PDF 7.7) and **Seller Featured Listings** ₹499/mo (PDF 3.3), both 100% platform. Subscribe endpoints: `POST /api/subscriptions/alerts` (buyer), `POST /api/seller/subscriptions/featured` (seller).

#### ✅ [MODIFY] [property.controller.ts](apps/api/src/controllers/property.controller.ts)

* **PostgreSQL Full-Text Search (PDF 13):** GIN-indexed `searchVector`, `websearch_to_tsquery` + `ts_rank`; featured listings surface first.
* **Search History Logger (PDF 7.3):** every authenticated-buyer query logged to `SearchQuery`; `GET /api/properties/searches` returns the last 10 unique, newest-first.

#### Day 4 carry-over (not blocking the commit)

* **FCM `data` payload delivery timing / queue.** `triggerAlerts` awaits an inline fan-out to every subscriber inside the seller's listing-update request. Fine at pilot scale; a production alert fan-out belongs on a queue.
* ✅ **Featured-listing expiry sweep — done in Day 8.** `sweepExpiredFeaturedListings()` in `subscription.service.ts`, wired into `index.ts`'s scheduler alongside the SLA/settlement intervals.
* ✅ **`subscriberChurnRate` wiring — done in Day 8.** `analytics.service.ts` now computes it as cancellations-this-month ÷ active-at-start-of-month from `Alert.cancelledAt`. `monthlyRenewalRate` stays `null` — that one is still genuinely blocked on Razorpay subscription renewal data.

---

### Day 5: Document Upload CDN, DigiLocker, Caching, and Risk Badge Auto-Calculation — ✅ COMPLETE

*Add CDN storage, Aadhaar KYC verification flows, accept seller KYC media, verify listing risk statuses, and configure performance caching.*

> **✅ Delivered 24 July 2026** in three separate commits, kept independent
> because the three workstreams don't depend on each other (same discipline as
> the Day 3 Razorpay pass): `day5: cloudinary signed uploads for seller KYC +
> listing documents`, `day5: digilocker aadhaar oauth verification`, `day5:
> in-memory TTL cache for free property check`. No migration this day — nothing
> proposed required a schema change. Build clean (`pnpm build:api`, zero `any`).
> Each piece was runtime-verified with a throwaway `tsx` script before
> committing: the Cloudinary signature was checked byte-for-byte against
> Cloudinary's documented SHA-1 signing algorithm; the DigiLocker state JWT was
> confirmed to expire at exactly 300s and the mock/name-match logic exercised
> directly; the cache's TTL expiry and oldest-entry eviction were both exercised
> directly. **One item shipped as a discovery, not new code** — see below.

#### Day 5 decisions

**Risk badge auto-calc (PDF 6.3 & 16 Flow 2) already existed — predates this day-by-day plan.** `calculateRiskBadge()` in `listing.controller.ts` (RED for `ACTIVE`/`STAYED` case or `loanDefault`, AMBER for `DISPOSED`, GREEN for clean) was already implemented and wired into both `createListing` and `updateListing`, from the original listing/search commit that predates the monorepo restructure. Verified against the exact PDF spec — no gaps found, nothing changed. **Documented here so a future session doesn't rebuild it thinking it's an open Day 5 item.**

**Cloudinary — the signature itself constrains the upload, not just documentation.** `allowed_formats` and `max_file_size` are baked into the signed payload alongside `folder` and `timestamp`, so a client cannot take a signature issued for `pdf,jpg,jpeg,png` and upload an oversized file or a renamed executable — those upload params would no longer match the signature and Cloudinary rejects the request outright. Built on `node:crypto` (SHA-1) rather than the Cloudinary SDK, same "fetch + crypto, no SDK" shape as `razorpay.ts` — credentials read per call, mock signature when unconfigured, hard error in production. Endpoint is seller-scoped (`GET /api/seller/uploads/signature?purpose=kyc-certificate|kyc-selfie|listing-document`) since KYC docs and listing documents are the only Cloudinary consumers the spec calls for.

**DigiLocker — state JWT is 5 minutes, not the 7-day session length.** It travels in a public redirect URL (browser history, referrer headers, server logs), so it needed a short, purpose-scoped expiry rather than reusing the long-lived login-token shape — `{ sellerId, purpose: 'digilocker-state' }` signed for `5m`, and the callback rejects a token whose `purpose` claim doesn't match even if the signature is otherwise valid, so a stray login JWT can't be replayed as state. Verification is a **name-alignment check only** — DigiLocker's Partner API never hands a Requester the raw Aadhaar number, only the linked user's basic profile (name/dob/gender) via `/user`; we compare that name against `Seller.name` and never request or store the eAadhaar XML itself. Real partner credentials require formal empanelment as a DigiLocker Requester organisation, not obtainable in a dev sandbox, so — same shape as `firebase.ts` — no credentials means a mock exchange that returns a profile matching the seller's *own* registered name, so the demo flow always ends verified. Refused outright when `NODE_ENV=production`.

**Free-check cache — single-instance, 60s TTL, no new dependency.** A plain `Map`-based `TtlCache<V>` (`apps/api/src/lib/cache.ts`) with a 5,000-entry cap (oldest evicted first) rather than pulling in Redis or a caching library for a single-instance pilot deploy. **Known limitation, not a defect:** it does not survive a process restart and is not shared across horizontally-scaled instances — a buyer could see a stale cache hit on instance A and a fresh miss on instance B for the same query seconds apart. Acceptable for the Jaipur pilot's single Railway instance; revisit (Redis or similar) only if the API ever scales beyond one instance. The 60s staleness window (a just-approved listing or an updated case status can take up to a minute to show up in the free check) is the accepted cost for the PDF's explicit "sub-millisecond responses" ask, and it self-heals on expiry — no manual invalidation.

#### ✅ [NEW] [cloudinary.ts](apps/api/src/lib/cloudinary.ts)

* Signed-upload signature generator (SHA-1 over `allowed_formats`/`folder`/`max_file_size`/`timestamp` + secret) so the seller panel uploads directly to Cloudinary — files never touch the Express server. `GET /api/seller/uploads/signature` (sellerMiddleware), mounted in [seller.routes.ts](apps/api/src/routes/seller.routes.ts).

#### ✅ [MODIFY] [seller.controller.ts](apps/api/src/controllers/seller.controller.ts)

* **KYC Upload Payload (PDF 6.1):** already covered pre-Day-5 — `POST /api/seller/kyc/certificate` and `POST /api/seller/register` accept `barCouncilDoc`/`selfieUrl` Cloudinary URLs (Day 1). Day 5 adds the signing step in front of it: the panel now gets a Cloudinary signature from this day's new endpoint before it uploads, rather than trusting an arbitrary client-supplied URL.
* **DigiLocker Integration (PDF 6.1):** `GET /api/seller/kyc/digilocker/authorize` (sellerMiddleware) issues the signed state and consent URL; `GET /api/seller/kyc/digilocker/callback` (**public** — DigiLocker's redirect is a plain browser GET carrying no auth header, so identity is resolved from the signed `state` instead) exchanges the code, compares names, and sets `aadhaarVerified: true` only on a match — a mismatch is reported, never silently accepted.

#### ✅ [MODIFY] [listing.controller.ts](apps/api/src/controllers/listing.controller.ts) — already complete, no change needed

* **Dynamic Property Risk Badge (PDF 6.3 & 16 Flow 2):** verified against the spec, already implemented exactly as specified (RED / AMBER / GREEN per the rules below) and wired into both `createListing` and `updateListing`. See *Day 5 decisions* above.

#### ✅ [MODIFY] [property.controller.ts](apps/api/src/controllers/property.controller.ts)

* **"Free Check" Caching Engine (PDF 7.2):** `freeCaseCheck` now checks a 60s in-memory `TtlCache` (`apps/api/src/lib/cache.ts`) before touching Postgres, keyed on the normalized address/khasra/survey query. Response carries `cacheHit: true|false` so a cache hit is externally observable during testing.

---

### Day 6: Seller Dashboards, Special Requests, Manual Refunds, Invoices, Payout Statements, and Case Hooks — ✅ COMPLETE

*Configure seller-side earnings aggregation, manual admin refund disputing, PDF certificate watermarking, payouts scheduling, and listing status update listeners.*

> **✅ Delivered 24 July 2026** in six separate commits, kept independent
> because each workstream is separately reviewable (same discipline as Day 3
> and Day 5): `day6: seller dashboard aggregator endpoint` (`872cfcc`), `day6:
> razorpay refund integration` (`b0549e3`), `day6: special-request advance
> payment + refund wiring` (`75244b5`), `day6: SLA timers for special
> requests` (`31dd917`), `day6: pdf service (report certificate, gst invoice,
> payout statement)` (`6da1368`), `day6: weekly settlement cron` (`f6021e2`).
> Two migrations applied to the Neon dev DB. Build clean (`pnpm build:api`,
> zero `any`). Every piece was runtime-verified with a throwaway `tsx` script
> before committing: the refund claim-before-Razorpay-call race, the full
> special-request order → verify → assign-guard → reject → refund lifecycle
> and the DB-level XOR constraint, both SLA timers (including a genuinely
> stale row already sitting in the dev DB from earlier testing), all three PDF
> outputs (including forced pagination past a page boundary), and the
> settlement run's threshold/bank-details/payout/claim behaviour across three
> sellers. **One item shipped as a discovery, not new code** — see below.

#### Day 6 decisions

**Case-update alert hook (PDF 16 Flow 3) already existed — predates this day-by-day plan.** `updateListing` in `listing.controller.ts` already calls `triggerAlerts(id, existing.caseStatus, caseStatus || existing.caseStatus, newRiskBadge)` on every update, wired since the Day 4 alert engine landed. Verified against the spec — no gap found, nothing changed. Documented here so a future session doesn't rebuild it, same category as the Day 5 risk-badge discovery.

**Shared-computation extraction, twice.** `getEarningsOverview`'s lifetime/month/week/pending math was pulled into `computeEarningsSummary()` so the new `/api/seller/dashboard` and the existing `/api/seller/earnings` can never drift apart; `getEarningsStatement`'s FY/TDS/net math was pulled into `computeEarningsStatement()` the same way so the new PDF export and the existing JSON statement report identical numbers. Same pattern both times: extract, don't duplicate.

**Refund execution centralized into `refund.service.ts`, and a race fixed along the way.** The original `processRefund` claimed the row (`PENDING → PROCESSED`) *after* calling Razorpay — meaning two racing requests (double-click, retry) could both pass the pre-check and both reach Razorpay before either claim landed, double-refunding the buyer. `executeRefund()` claims first, calls Razorpay second, and rolls the claim back to `PENDING` on failure so a rejected refund is retryable rather than stuck `PROCESSED` with no money moved. Extracting it into a service (rather than leaving it inline in `admin.controller.ts`) was necessary, not just tidiness — the special-request SLA auto-refund sweep needs the identical claim + Razorpay-call + status-sync path, and CLAUDE.md's controllers-stay-thin rule points the same direction.

**Special-request advance payment mirrors the report-unlock order/finalize/webhook shape exactly.** `createSpecialRequestOrder` / `finalizeSpecialRequestAdvance` in `payment.service.ts` are the special-request twins of `createReportOrder` / `finalizeReportUnlock` — same atomic `CREATED → PAID` claim, same idempotent finalize callable from both `POST /verify` and the webhook. `SpecialRequest.advancePaid` gates `assignRequest`, so a request can sit `PENDING` indefinitely without ever reaching a seller until it's paid for.

**No seller is assigned at request-creation time, so there's no one to split the advance with yet.** `PaymentOrder.platformCut`/`sellerCut` are non-nullable, but the 70% seller-payout-on-approval ledger for special requests doesn't exist (out of scope this day — see *Day 6 carry-over*). `platformCut` is provisionally recorded as the full advance and `sellerCut: 0`, rather than inventing a split against a seller who isn't chosen yet.

**`Refund.purchaseId` made optional, with a DB CHECK constraint doing the XOR — not a nullable-and-hope pattern.** A refund now reverses either a purchase or a special-request advance via `Refund.specialRequestId`, never both, never neither. Prisma's schema language has no declarative XOR-across-columns, so the constraint (`Refund_purchase_xor_specialRequest`) is hand-added raw SQL in the migration, verified directly against `pg_constraint` and by attempting (and getting rejected on) a dual-set insert.

**`rejectSpecialRequest` now moves real money — REJECTED as a transition state, not a jump straight to REFUNDED.** The pre-Day-6 code already had `REJECTED`/`REFUNDED` status messages implying a two-phase lifecycle ("Refund process mein hai" → "Refund successfully process ho gaya") that nothing populated. `executeRefund` now sets `SpecialRequest.status = REFUNDED` on a successful refund, so the existing message copy finally matches reality. A request with no advance ever paid skips straight to `REJECTED` with no refund attempt — there's nothing to reverse.

**SLA timers use a bespoke scheduler, not a cron dependency.** `lib/scheduler.ts` is a `setInterval` wrapper with non-overlapping runs (a slow sweep can't stack on itself) and a first tick 5s after boot. The 12h-accept / 72h-completion sweep reads `updatedAt` — the timestamp of whichever transition started that clock (admin assign, seller accept) — and claims each row with a guarded `updateMany` before acting, so the sweep can't race an admin/seller action on the same request. `recordAudit()` is deliberately **not** called from here: it requires an authenticated `req.admin` and refuses to write without one, since this is a system actor, not an admin. Logged via `logger` instead, same as the webhook path.

**"Weekly, Monday 10am" built on a plain interval, not a cron expression.** `startInterval` only supports a fixed period, so `weeklySettlementTick()` ticks every 30 minutes and gates on `getDay() === 1 && getHours() === 10` plus an in-memory per-week guard (a restart mid-window just means a second run finds nothing left to settle — `runWeeklySettlement()` only ever selects `settled: false` rows).

**Settlement claims before paying out, mirroring the refund fix.** `runWeeklySettlement()` sets `settled: true, settledAt: now` in a guarded `updateMany` *before* calling RazorpayX, not after — so a crash between a successful payout and the DB write can't cause next week's run to double-pay the same purchases. A failed payout call rolls the claim back. Sellers with no `bankAccount`/`ifsc` on file are skipped and their balance carries forward rather than being silently dropped.

**pdf-lib over Puppeteer (user-approved), and pagination is a correctness fix, not a feature.** Puppeteer's bundled Chromium was ruled out for Railway's memory limits — pdf-lib draws pages directly with manual text placement, no headless browser. The internal `line()` helper starts a new page whenever the next line wouldn't fit, so a seller's payout statement lists every transaction in a tax period instead of silently truncating past some fixed row count — verified with a 60-transaction statement that correctly spans two pages.

**Recurring `searchVector` phantom drift in `prisma migrate dev`.** Every `migrate dev --create-only` run in Day 6 generated an unrelated `ALTER TABLE "Listing" ALTER COLUMN "searchVector" DROP DEFAULT` line — a false-positive from Prisma's diff engine against the `Unsupported("tsvector")` generated column from Day 4, not anything this session touched. Stripped from both Day 6 migrations by hand before applying; a real generated column shouldn't have a "default" to drop in the first place, and running it risked breaking the FTS column for no reason. `migrate deploy` (used for the second migration) doesn't hit this at all, since it applies pending migrations without the interactive diff step — prefer it over `migrate dev` for straightforward applies.

#### ✅ [MODIFY] [earnings.controller.ts](apps/api/src/controllers/earnings.controller.ts)

* **Seller Dashboard Analytics API (PDF 6.4):** `GET /api/seller/dashboard` (mounted in `seller.routes.ts`, not `earnings.routes.ts`, to hit the literal spec path) bundles `computeEarningsSummary()` (lifetime/month/week/pending + next payout) with every listing's views/total-sales in one call. `rating: null` per listing — the `Review` model doesn't exist until Day 7.
* **PDF payout statement:** `GET /api/seller/earnings/statement/pdf` renders `computeEarningsStatement()` (extracted from the existing `getEarningsStatement`) through `pdf.service.ts`.
* **Fix-in-passing:** `getSettlements` now groups by `settledAt ?? createdAt` instead of `createdAt` alone, so settlement history reflects when a payout actually happened, not when the underlying report was unlocked.

#### ✅ [MODIFY] [admin.controller.ts](apps/api/src/controllers/admin.controller.ts)

* **Manual Admin Refund Controller (PDF 5.5):** `POST /api/admin/refunds/:id/process` now calls the real Razorpay Refunds API (`refundPayment()` in `lib/razorpay.ts`) via the shared `executeRefund()` service — `PENDING → PROCESSED` only happens once Razorpay actually accepts the refund, and the claim-before-call ordering closes the double-refund race described above.
* `GET /api/admin/refunds` now also includes/exposes `specialRequest` alongside `purchase`, plus a `source: 'PURCHASE' | 'SPECIAL_REQUEST'` field, since a refund can now reverse either.

#### ✅ [MODIFY] [specialRequest.controller.ts](apps/api/src/controllers/specialRequest.controller.ts)

* **Special Request Assignment Endpoint (PDF 7.9):** `POST /api/admin/special-requests/:id/assign` now refuses (`400`) until `advancePaid` is true. **Not built:** nearest-qualified-seller-in-tehsil auto-selection — admin still supplies `sellerId` manually, same as before Day 6 (see *Day 6 carry-over*).
* **Advance payment (new, not in the original plan but required to make the SLA refund meaningful):** `createSpecialRequest` now opens a Razorpay order after writing the row; `POST /api/special-requests/:id/verify` confirms the checkout handshake (mirrors `purchase.controller.ts`'s `verifyPurchase`, reusing the identical `purchaseVerifySchema`); the webhook's `payment.captured` handler finalizes `SPECIAL_REQUEST_ADVANCE` orders the same way it finalizes `REPORT_UNLOCK`.
* **12-Hour SLA Timer (PDF 7.9):** `autoDeclineOverdueAssignments()` in the new `specialRequestSla.service.ts`, swept every 15 minutes.
* **48–72 Hour Completion SLA & Refund (PDF 7.9):** `autoRefundOverdueCompletions()`, same sweep — an overdue `IN_PROGRESS` request is claimed, a real `Refund` row is created and immediately executed via `executeRefund()`.
* **`rejectSpecialRequest`** now creates and immediately executes a real refund when an advance was paid (see *Day 6 decisions*); skips straight to `REJECTED` with no refund attempt when it wasn't.

#### ✅ [MODIFY] [listing.controller.ts](apps/api/src/controllers/listing.controller.ts) — already complete, no change needed

* **Case Update Alert Hook (PDF 16 Flow 3):** verified against the spec, already implemented and wired into `updateListing`. See *Day 6 decisions* above.

#### ✅ [NEW] [pdf.service.ts](apps/api/src/services/pdf.service.ts)

* **Report Certificate & Watermark (PDF 7.8 & 13):** `GET /api/purchases/:id/certificate` — a diagonal translucent buyer-name overlay over the property/risk/litigation detail, drawn with pdf-lib (not Puppeteer — see *Day 6 decisions*).
* **GST Invoice (PDF 5.5):** `GET /api/purchases/:id/invoice` — 18% GST computed on the platform's commission (`Purchase.platformCut`) only, treated as GST-exclusive (18% added on top). **Flagged, not resolved** — this is a business-policy reading, not something specified elsewhere in the codebase (see *Day 6 carry-over*).
* **Tax Payout Statement (PDF 6.4):** `GET /api/seller/earnings/statement/pdf` — gross/TDS/net + full transaction list, auto-paginated.

#### ✅ [NEW] [settlement.service.ts](apps/api/src/services/settlement.service.ts)

* **Settlement Cron (PDF 8.3):** `runWeeklySettlement()` groups unsettled purchases by seller, skips sellers below the Rs. 500 threshold or with no bank details on file, withholds a flat 10% TDS, and pays out via the new `lib/razorpayPayouts.ts` (RazorpayX adapter, same mock/real/prod-guard shape as `razorpay.ts`). `weeklySettlementTick()` gates it to the Monday 10:00 window (see *Day 6 decisions*) and is wired into the scheduler from `index.ts` alongside the SLA sweep.

#### Day 6 carry-over (not blocking the commits)

1. **RazorpayX credentials needed before go-live** — `RAZORPAYX_KEY_ID`/`KEY_SECRET`/`ACCOUNT_NUMBER` (documented in `.env.sample`). Without them the settlement cron mints mock payouts and marks purchases settled with no real money moving; in production this is a hard error instead.
2. ✅ **Seller payout on special-request approval — done in Day 8.** New `SpecialRequestPayout` model, created via `specialRequestPayout.service.ts`'s `createPayoutForApprovedRequest()` when `approveSpecialRequest` succeeds (70/30 split via the existing `computeCommission()`), and picked up by `runWeeklySettlement()` alongside `Purchase.sellerCut`. See *Day 8 decisions*. (`PaymentOrder.sellerCut` staying `0` for these orders is unchanged and still correct — the payout now lives on its own ledger row instead.)
3. **GST-exclusive invoice reading still needs product sign-off.** `pdf.service.ts` adds 18% on top of `platformCut`; if GST is meant to be inclusive instead (`platformCut × 18/118`), the invoice math needs a one-line change — flagged rather than guessed silently. Explicitly left open again in Day 8 at the user's direction.
4. **TDS interpretation is still unreconciled between two paths.** `settlement.service.ts` withholds a flat 10% on every weekly payout; `getEarningsStatement`/`getEarningsStatementPdf` instead apply 10% only when a seller's *cumulative annual* earnings exceed Rs. 30,000. Both are live simultaneously and disagree with each other — needs a product decision on which rule is authoritative. Explicitly left open again in Day 8 at the user's direction.
5. ✅ **Nearest-qualified-seller-in-tehsil auto-selection — done in Day 8.** `sellerMatch.service.ts`'s `selectBestSellerForRequest()`; `POST /api/admin/special-requests/:id/assign` auto-selects when `sellerId` is omitted, still accepts a manual `sellerId` unchanged. See *Day 8 decisions* for the known limitation (ranks by a seller's past listing history, since `Seller` has no declared service-area field).
6. ✅ **`createSpecialRequest` orphaned unpaid row — done in Day 8.** `POST /api/special-requests/:id/retry` reopens checkout for any `PENDING`/unpaid request, covering both the order-creation-throws case and a buyer simply abandoning the first checkout.
7. **Single-instance scheduler, same caveat class as the Day 5 cache.** Both the SLA sweep and the settlement cron are in-process `setInterval` timers — if this API ever runs as more than one instance, each instance runs its own sweep. Fine at pilot scale.

---

### Day 7: QC Auto-Flagging, Outdated Flags, Cascading Suspensions, Reviews, CI/CD Pipeline Setup, and Testing — ✅ COMPLETE

*Set up auto-flagging QC triggers, buyer report flagging endpoints, cascading seller bans, seller strike penalties, rating modules, GitHub Actions CI/CD, and integration tests.*

> **✅ Delivered 25 July 2026.** One migration
> (`20260725041938_day7_qc_reviews_flags`) applied to the Neon dev DB, adding
> `Listing.flaggedForSpotCheck`, `Seller.strikeCount`/`avgRating`/`reviewCount`,
> and the new `Review` model (with a hand-added `rating BETWEEN 1 AND 5` CHECK
> constraint, same pattern as the Day 6 `Refund` XOR constraint). Build clean
> (`pnpm build:api`, zero `any`). Every workstream was runtime-verified either
> over HTTP against a live `tsx`-run server (admin login, the report-flags
> endpoint, the `flaggedForSpotCheck` filter) or through the Jest suite itself,
> which exercises the full strike-escalation, review/badge-recalculation and
> SLA-sweep paths end to end — 13/13 tests passing across 5 suites, confirmed
> stable over five consecutive runs.

#### Day 7 decisions

**Cascading unpublish on seller suspension (PDF 5.2) already existed — predates this day-by-day plan.** `suspendSeller()` in `kyc.service.ts` (lines ~264-278) already flips every `APPROVED` listing to `UNPUBLISHED` inside the same transaction as the suspend, wired since the Day 2 KYC pipeline landed. Verified against the exact PDF spec — no gap found, nothing changed. Same category as the Day 5 risk-badge and Day 6 case-update-alert discoveries: documented here so a future session doesn't rebuild it.

**Strike escalation mechanics — product-approved defaults, not independently specified.** The PDF text ("warning, suspension, Rs. 500 fine, and auto-refunding buyers of fraudulent listings on the 3rd strike") doesn't fully pin down strike-by-strike behavior, so before writing any code this session presented the ambiguity and got an explicit choice on three points, all accepted as recommended:
* Strikes 1-2 → a warning notification only (`accuracyScore` already takes its existing -10 hit per FAIL, unchanged from before Day 7).
* Strike 3, **and every FAIL after** (not just the one that first crosses the threshold) → suspend the seller (idempotent — `suspendSeller` no-ops if already suspended), fine Rs. 500, and auto-refund every un-refunded purchase of *that specific listing*. Reasoning: each fraudulent listing has its own buyers to make whole, independent of whether the seller was already suspended from an earlier strike.
* The Rs. 500 fine is recorded as a straight decrement of `Seller.totalEarnings`, floored at 0 — the same pattern `accuracyScore` already uses — rather than a new ledger/`Penalty` model. `AuditLog` (via the new `SELLER_STRIKE_ESCALATION` action) is the paper trail for *why* it dropped.

New service: `penalty.service.ts`'s `applyStrikeEscalation(sellerId, triggeringListingId)`, called from `spotCheckListing` only on `FAIL`. It reuses `kycService.suspendSeller` and `refund.service.ts`'s `executeRefund` rather than duplicating either — same "extract, don't duplicate" discipline as Day 6.

**Badge auto-recalculation — also a product-approved default.** `Seller.badge` was, until now, a purely admin-set field (`PATCH /api/admin/sellers/:id/badge`) that happens to drive the commission split (60/65/70%). Making reviews auto-write it changes existing behavior, so this was flagged and confirmed rather than assumed: every new `Review` recalculates `avgRating`/`reviewCount` and **auto-overwrites** `Badge` from fixed thresholds (`>=4.5` Platinum, `>=4.0` Gold, `>=3.0` Silver, else Bronze) in `review.service.ts`'s `recalculateSellerRating()`. The admin PATCH endpoint still works — it's a manual override that holds only until the next review recalculates over it. **Known, accepted gameability:** a single 5-star review immediately jumps a seller to Platinum (70% commission) with no minimum-review-count gate — noted but not built, since gating wasn't part of the approved design and would be scope creep.

**10% spot-check auto-flag stays invisible to the seller.** `Listing.flaggedForSpotCheck` is set once at `createListing` (`Math.random() < 0.1`) and surfaced only through `GET /api/admin/listings?flaggedForSpotCheck=true`, never in the seller-facing create response — showing a flagged seller their own flag would let them behave differently around it, defeating the point of a QC sample.

**`GET /api/purchases/:id/*` ownership pattern reused for flag and review.** Both `POST /api/purchases/:id/flag` and `POST /api/purchases/:id/review` gate on `Purchase.userId`, the same pattern already used by `getReportCertificate`/`getPurchaseInvoice` — a buyer must have actually unlocked the report (proved by owning the `Purchase` row) to flag or review it, not merely have viewed the free preview.

**`index.ts` split into `app.ts` + `index.ts` — a structural prerequisite for Jest, not a refactor for its own sake.** The Express `app` used to be constructed and `.listen()`-ed in the same file, so nothing could import it without also binding a port. `app.ts` now owns construction (CORS, helmet, the raw-body webhook mount ahead of `express.json()`, every route, the 404 and error handlers) and exports `app`; `index.ts` keeps just `dotenv/config`, the import, `.listen()`, and the two scheduler `startInterval` calls. Behavior is byte-for-byte identical — verified by booting the split app and re-hitting the root route, admin login, and the new report-flags endpoint over HTTP before writing a single test.

**Jest + supertest run against the same Neon dev DB — a product-approved default, consistent with the pilot's existing "no separate test DB" posture.** Same reasoning as the throwaway `tsx` verification scripts used in Days 3-6, just formalized into a real suite. Consequences worth knowing for whoever runs this next:
* Every fixture helper (`apps/api/tests/helpers.ts`) generates unique phone numbers/emails per call and cleans up its own rows in each test — nothing relies on or mutates the seed data.
* Deleting a `Seller` or `User` requires clearing every `RESTRICT`-FK child row first (`Notification`, `PaymentOrder`, `Refund`, `Review`, `ReportFlag`, `SearchQuery`, `Subscription`, `Alert`, `SpecialRequest`, `Purchase`) — `deleteSeller()`/`deleteBuyer()` centralize this so a test doesn't have to remember the full list.
* The Neon serverless pooler occasionally can't hand out a transaction slot fast enough under the suite's rapid sequential requests (`"Unable to start a transaction in the given time"` — a transient infra hiccup, not an app bug, observed a small handful of times across two dozen runs while building this out). Every mutating fixture call retries with backoff on that specific error class (`withTransientRetry` in `helpers.ts`). The suite has run clean (13/13) on every attempt since the retry was added.
* SLA-timer tests (`special-request-sla.test.ts`) exercise `autoDeclineOverdueAssignments()`/`autoRefundOverdueCompletions()` directly against DB fixtures with `updatedAt` backdated via raw SQL, rather than waiting 12/72 real hours — same idea as the manual verification scripts from Day 6, just automated.
* `maxWorkers: 1` — tests run sequentially because they share one live database and mutate seller-level state (`strikeCount`, `badge`) that would race under parallel workers.
* ts-jest runs against a separate `tsconfig.test.json` (`rootDir: "."`, includes both `src/` and `tests/`) rather than the main `tsconfig.json`, whose `rootDir: "./src"` would otherwise reject anything under `tests/`.

**CI/CD deploy steps are wired but unverified — no Railway/Vercel account access this session.** `.github/workflows/deploy.yml` always runs install/build/test (test step self-skips with a `::warning::` if no `DATABASE_URL` secret is configured, rather than hard-failing every PR before secrets exist) and a second job builds the `admin`/`seller` Vite panels (`buyer` is Expo/React Native — no CI-appropriate build script, out of scope). The deploy job — Railway via `railway up`, Vercel via deploy-hook `curl` — only runs on push to `main`, and every step individually checks for its own secret before running, no-oping with a warning rather than failing when unconfigured. Same "unconfigured = safe no-op" shape as the Razorpay/Cloudinary/DigiLocker adapters. **Nobody has run this workflow against a real Railway/Vercel account** — the YAML is correct GitHub Actions syntax and the build/test job is proven (it's the same commands verified locally all session), but the deploy job itself is unverified.

#### ✅ [NEW] [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

* **CI/CD Pipeline Setup (PDF 12/20):** `build-and-test` (install → `pnpm build:api` → conditionally `prisma migrate deploy` + `pnpm --filter @civilcheck/api test`, gated on a `DATABASE_URL` secret) and `build-frontends` (`admin`/`seller` Vite builds) run on every push/PR to `main`. `deploy` (Railway API deploy + Vercel deploy-hook triggers for both panels) runs only on push to `main`, after both build jobs pass, and only for whichever secrets are actually configured.

#### ✅ [MODIFY] [listing.controller.ts](apps/api/src/controllers/listing.controller.ts)

* **10% Spot-Check Auto-Flagging (PDF 5.3):** `createListing` rolls `Math.random() < 0.1` into `Listing.flaggedForSpotCheck` on every insert. `GET /api/admin/listings` (`admin.controller.ts`) gained a `?flaggedForSpotCheck=true|false` filter and now returns the field.

#### ✅ [NEW] [penalty.service.ts](apps/api/src/services/penalty.service.ts) + [MODIFY] [admin.controller.ts](apps/api/src/controllers/admin.controller.ts)

* **False Information Penalty System (PDF 10.4):** `spotCheckListing`'s existing FAIL path (accuracy score -10, listing rejected) now also calls `applyStrikeEscalation()`. See *Day 7 decisions* above for the exact strike-by-strike behavior and the money-handling choices. New `AuditAction.SELLER_STRIKE_ESCALATION`, fired only when a strike actually escalates (strike 3+), alongside the existing `LISTING_SPOT_CHECK` entry.

#### ✅ [NEW] Buyer report-outdated flags + admin dashboard (PDF 7.8)

* `POST /api/purchases/:id/flag` (`purchase.controller.ts` / `purchase.routes.ts`) — buyer-owned-purchase-gated, creates a `ReportFlag` (the Day 1 model, unused until now).
* `GET /api/admin/report-flags`, `POST /api/admin/report-flags/:id/resolve`, `POST /api/admin/report-flags/:id/dismiss` (`admin.controller.ts` / `admin.routes.ts`) — same RBAC tier as listing QC (`SUPER_ADMIN` + `SUB_ADMIN`), guarded `updateMany` on `status: 'PENDING'` so a flag can only be actioned once, audit-logged via two new actions (`REPORT_FLAG_RESOLVE`/`REPORT_FLAG_DISMISS`).

#### ✅ [NEW] [review.service.ts](apps/api/src/services/review.service.ts) + reviews on `purchase.controller.ts`

* **Buyer reviews + rating (PDF 7.8 / 16):** `POST /api/purchases/:id/review` — one review per purchase (`Review.purchaseId` unique constraint; a duplicate attempt returns `400`, caught via Prisma's `P2002`). Every insert calls `recalculateSellerRating()`, which recomputes `Seller.avgRating`/`reviewCount` via `prisma.review.aggregate()` and auto-writes `Badge` from the thresholds in *Day 7 decisions*.
* `GET /api/seller/dashboard` (`earnings.controller.ts`) — the `rating: null` placeholder Day 6 left per listing (documented then as "Review model doesn't exist until Day 7") is now a real per-listing average via one grouped `review.groupBy()` query, plus a new `reviewCount` field.

#### ✅ [NEW] [app.ts](apps/api/src/app.ts) — split out of [index.ts](apps/api/src/index.ts)

* Structural prerequisite for the test suite — see *Day 7 decisions*. `app.ts` exports the configured Express app; `index.ts` now only wires `dotenv/config`, `.listen()`, and the scheduler.

#### ✅ [NEW] [apps/api/tests/](apps/api/tests/) — Jest + supertest integration suite

* `helpers.ts` — shared fixtures (`loginAdmin`, `registerAndLoginBuyer`, `registerApprovedSeller`, `createApprovedListing`, `purchaseListing` via the real mock-Razorpay order/verify handshake, `backdateSpecialRequest`, `deleteSeller`/`deleteBuyer` cleanup, `withTransientRetry`).
* `auth.test.ts` — admin login (success/failure), buyer registration + fixed-OTP (`123456`) login, token-gated admin route access.
* `search.test.ts` — Postgres FTS finds a freshly created listing by address text; an authenticated buyer's search is logged and appears in `GET /api/properties/searches`.
* `qc-penalty.test.ts` — `flaggedForSpotCheck` is a real, filterable boolean; the full 3-strike escalation (warn, warn, suspend+fine+refund) end to end against real purchases.
* `review-flag.test.ts` — multi-buyer review/badge recalculation across two ratings; the buyer flag → admin resolve/dismiss lifecycle, including the ownership check (a non-purchasing buyer gets `404`, not `403` — same information-hiding shape as the rest of the purchase-scoped endpoints).
* `special-request-sla.test.ts` — both SLA sweeps (`autoDeclineOverdueAssignments`, `autoRefundOverdueCompletions`) driven directly against backdated fixtures.
* `jest.config.ts` / `tsconfig.test.json` — ts-jest in ESM mode (`NodeNext` + explicit `.js` import extensions, same as the app itself), `maxWorkers: 1`.

#### Day 7 carry-over (not blocking the commits)

1. **CI/CD deploy steps are unverified** — see *Day 7 decisions*. Needs `RAILWAY_TOKEN`/`RAILWAY_SERVICE_ID` and/or `VERCEL_DEPLOY_HOOK_ADMIN`/`VERCEL_DEPLOY_HOOK_SELLER` repo secrets, plus one real run against them, before this is trustworthy for an actual deploy.
2. **Strike escalation and badge auto-recalculation are product-approved defaults from this session, not independently specified in the source material.** Both are reasonable, deliberate readings — see *Day 7 decisions* for the exact reasoning — but flagging them here the same way Day 6 flagged GST/TDS, in case product wants a different threshold or mechanic before go-live.
3. **Badge-gaming via a single review has no minimum-review-count gate.** Noted in *Day 7 decisions* — a seller can hit Platinum's 70% commission split off one 5-star review. Not built because it wasn't part of the approved design; worth a product conversation before launch.
4. **The Rs. 500 strike fine and the special-request 70% seller payout both eventually want a real ledger.** ✅ The special-request payout half is **done in Day 8** — `SpecialRequestPayout`. The strike fine is still a bare `totalEarnings` decrement with only an `AuditLog` row as evidence — fine for a pilot, but a dedicated `Penalty` ledger would be worth building once there's more than a handful of these events to reconcile.
5. **Integration suite runs against the shared Neon dev DB**, not an isolated test database — see *Day 7 decisions* for the cleanup/retry discipline this required. Fine at pilot scale; revisit if the dev DB ever needs to stay pristine for a demo.
6. ✅ **Nearest-qualified-seller-in-tehsil auto-selection — done in Day 8** (Day 6 carry-over #5). The **GST/TDS reconciliation** (Day 6 carry-over #3/#4) is still open — explicitly left unresolved again in Day 8 at the user's direction.

---

### Day 8: Roadmap Carry-Over Cleanup — ✅ COMPLETE

*Not part of the original 7-day plan — a follow-up pass closing out the concrete backend code gaps left in the Day 2/4/6/7 carry-over lists. Credential-only items, front-end follow-ups, and the GST/TDS product-policy question were explicitly left open at the user's direction (see the *Resuming* note above).*

> **✅ Delivered 28 July 2026.** One migration
> (`20260728040411_day8_payout_sms_log`) applied to the Neon dev DB, adding
> `SpecialRequestPayout` and `SmsDeliveryLog`. Build clean (`pnpm build:api`,
> zero `any`). `pnpm --filter @civilcheck/api test` green — 23/23 across 6
> suites (13 pre-existing + 10 new in `day8-carryover.test.ts`).

#### Day 8 decisions

**Two research findings shaped the plan before any code was written:**

* **`Seller` has no city/tehsil field, and registration never collects one.** "Nearest-qualified-seller-in-tehsil" therefore can't match against a declared seller location — only against the tehsil/city of `Listing` rows a seller has already authored. Adding a new `Seller` field plus an admin endpoint to set it would have been a much bigger, separately-approvable change, so the auto-match is scoped to that derived signal instead. **Known limitation:** a newly onboarded specialist with no prior listings can never rank as "nearest" for anything, even if they're the right local expert.
* **Approving a special request had a TOCTOU race.** `approveSpecialRequest` used a plain `findUnique` + `update`, so two concurrent approve calls could both pass the `status !== 'COMPLETED'` guard before either write landed. Building the payout ledger required closing this first — same "claim before act" idiom Day 6 already uses for refunds/settlement — otherwise the new ledger could double-credit a seller.

**Seller payout ledger (`SpecialRequestPayout`) mirrors `Purchase`'s settled/settledAt shape, not a new settlement mechanism.** `computeCommission('SPECIAL_REQUEST_ADVANCE', …)` already existed and already computed the correct 70/30 split — nothing in the special-request flow ever called it. `specialRequestPayout.service.ts`'s `createPayoutForApprovedRequest()` is called from `approveSpecialRequest` right after the guarded status-flip succeeds. `settlement.service.ts`'s `runWeeklySettlement()` now fetches unsettled `Purchase` and unsettled `SpecialRequestPayout` rows in parallel, groups both by seller, and merges the totals before the Rs. 500 threshold/TDS/payout call — claiming both sources together and releasing both on any mismatch or a failed RazorpayX call, so a partial claim can never pay out an amount that no longer matches what got claimed. `earnings.controller.ts`'s `computeEarningsSummary`/`getPendingSettlement` were extended the same way, so a seller's dashboard reflects special-request earnings alongside report-unlock earnings. Deliberately **not** touched: `getTransactions`/`getSettlements`' per-item breakdown lists — a special-request row needs a different display shape than a listing row, flagged as a fast-follow rather than blocking this pass.

**Special-request retry endpoint reuses the exact order-creation call `createSpecialRequest` already makes.** `POST /api/special-requests/:id/retry` covers both the scenario the roadmap named (`createSpecialRequestOrder` throwing after the row was already committed) and the more common one it didn't (a buyer simply abandoning the first checkout) — both leave the row `PENDING`/`advancePaid: false`, which is exactly the state the retry endpoint checks for. No cleanup of a stale earlier `CREATED` order: `finalizeSpecialRequestAdvance` validates `orderId`+`specialRequestId`+`kind` before finalizing, so whichever order actually gets paid completes correctly regardless of how many were minted.

**Nearest-qualified-seller auto-match is additive, not a behavior change.** `sellerId` on `POST /api/admin/special-requests/:id/assign` became optional rather than being replaced — passing it explicitly still works exactly as before. Omitting it triggers `sellerMatch.service.ts`'s `selectBestSellerForRequest()`: candidate pool is `kycStatus === 'APPROVED'` (the same bar the endpoint already used), ranked by tehsil-matching listing count (desc), then city-matching listing count (desc) as a fallback signal, then current open-request workload (asc), then `avgRating` (desc, nulls last), then `accuracyScore` (desc) as the final tiebreak — two `groupBy` queries against the candidate id set, not N+1. There's no data anywhere mapping a `SpecialRequest` to a required `Profession` (LAWYER/CIVIL_ENGINEER/TEHSIL_EXPERT/PROPERTY_CONSULTANT), so matching doesn't filter by profession, only ranks by locality and workload.

**`subscriberChurnRate` uses a standard cohort-churn definition, not a novel one.** Cancellations this month ÷ subscriptions that were active at the moment this month began (`createdAt` before this month, and either never cancelled or cancelled during/after this month) — the same "null when the denominator is 0" convention the file already used for `monthOverMonthGrowthPct`. `monthlyRenewalRate` stays `null`: it's blocked on Razorpay subscription *renewal* data, a genuinely different gap from the `Alert.cancelledAt` one this closes.

**Featured-listing expiry sweep follows the existing scheduler pattern exactly.** `sweepExpiredFeaturedListings()` in `subscription.service.ts`, registered via `startInterval('featured-expiry', 30 * 60 * 1000, …)` in `index.ts` alongside the SLA and settlement intervals — no new primitives.

**Msg91 delivery webhook — verified against Msg91's actual docs before writing any code, not guessed.** Their delivery-report webhook POSTs JSON with `requestId`, `telNum`, `status` (0=Sent, 1=Delivered, 2=Failed, 9=NDNC, 16/25=Rejected, 17=Blocked, 20=Country blocked), `deliveryTime`, `failureReason`. **Confirmed from their own docs: Msg91 provides no HMAC/signature scheme** — the only available safeguard is a custom header configured in the Msg91 dashboard, checked against `MSG91_WEBHOOK_SECRET`. Left permissive (accept-and-warn) rather than hard-blocked when unconfigured, since this is delivery-status observability, not a money-moving flow — doesn't need the payment adapters' stricter prod-guard. `SmsDeliveryLog` is a new, standalone log table (not linked back to the outbound send, since `sendSms()` never persisted one to join against) — observability only, not a full send-to-delivery audit trail. New admin read endpoint `GET /api/admin/sms-delivery-logs`, otherwise the table would be write-only.

**2FA enrollment grace period ships fully implemented but default OFF — a deliberate compatibility decision, not a partial implementation.** The three seeded demo admins and the Jest suite's `loginAdmin` fixture all rely on non-2FA-enrolled admin login working today, and are already long past any reasonable grace window. Turning the check on unconditionally would have locked out the demo admins and broken the integration suite the moment it shipped. `ADMIN_2FA_ENFORCE_GRACE_PERIOD` (unset by default) gates the whole check in `adminMiddleware` — same "unconfigured = no-op" shape as every other optional adapter in this codebase (Razorpay, Cloudinary, DigiLocker, the Msg91 webhook above). Flip it on once real admins exist and 2FA rollout is a deliberate choice; no code change needed. `req.path.startsWith('/2fa/')` exempts all four existing 2FA routes without listing each one, since `req.path` is relative to the router's mount point.

**GST/TDS reconciliation (Day 6 carry-over #3/#4) was raised again this session and explicitly deferred at the user's request** — both remain open, unchanged from Day 6.

#### ✅ [NEW] `SpecialRequestPayout` + `SmsDeliveryLog` models ([schema.prisma](apps/api/prisma/schema.prisma))

One migration, two additive models — see *Day 8 decisions* above for what each backs.

#### ✅ [NEW] [specialRequestPayout.service.ts](apps/api/src/services/specialRequestPayout.service.ts) + [MODIFY] [specialRequest.controller.ts](apps/api/src/controllers/specialRequest.controller.ts)

* `approveSpecialRequest` — guarded `updateMany` status-flip closes the TOCTOU race, then creates the payout row. New `AuditAction.SPECIAL_REQUEST_PAYOUT_CREATED`.
* `retrySpecialRequestPayment` (new) — `POST /api/special-requests/:id/retry`.
* `assignRequest` — `sellerId` now optional; auto-selects via `sellerMatch.service.ts` when omitted.

#### ✅ [NEW] [sellerMatch.service.ts](apps/api/src/services/sellerMatch.service.ts)

Nearest-qualified-seller-in-tehsil ranking — see *Day 8 decisions*.

#### ✅ [MODIFY] [settlement.service.ts](apps/api/src/services/settlement.service.ts) + [earnings.controller.ts](apps/api/src/controllers/earnings.controller.ts)

`SpecialRequestPayout` folded into the weekly settlement run and the seller earnings dashboard — see *Day 8 decisions*.

#### ✅ [MODIFY] [analytics.service.ts](apps/api/src/services/analytics.service.ts)

`subscriberChurnRate` computed for real; `monthlyRenewalRate` stays `null` with an updated note.

#### ✅ [MODIFY] [subscription.service.ts](apps/api/src/services/subscription.service.ts) + [index.ts](apps/api/src/index.ts)

`sweepExpiredFeaturedListings()`, wired into the scheduler.

#### ✅ [NEW] [msg91Webhook.routes.ts](apps/api/src/routes/msg91Webhook.routes.ts) + [MODIFY] [webhook.controller.ts](apps/api/src/controllers/webhook.controller.ts) / [admin.controller.ts](apps/api/src/controllers/admin.controller.ts)

`POST /api/webhooks/msg91`, `GET /api/admin/sms-delivery-logs` — see *Day 8 decisions*.

#### ✅ [MODIFY] [session.ts](apps/api/src/lib/session.ts) + [auth.middleware.ts](apps/api/src/middleware/auth.middleware.ts)

`isTwoFactorEnrollmentOverdue()`, wired into `adminMiddleware`, default OFF — see *Day 8 decisions*.

#### ✅ [NEW] [apps/api/tests/day8-carryover.test.ts](apps/api/tests/day8-carryover.test.ts)

Ten new tests covering every feature above, sharing 3 sellers + 1 buyer across sub-tests rather than registering fresh ones per `it()` — `otpVerifyLimiter` is a single IP-keyed bucket shared by both buyer and seller OTP verification (10 per 15 min), and this file alone would otherwise need 11 registrations. `helpers.ts`'s `deleteSeller`/`deleteBuyer` were extended to also clear `SpecialRequestPayout` rows (a new RESTRICT FK) before their parent rows.

#### Day 8 carry-over (not blocking the commits)

Folded into the *Resuming* note at the top of this document rather than repeated here — see that note for the full current list of credentials needed, open product-policy sign-offs, front-end follow-ups, and known/accepted limitations.

---

## Verification Plan

### Automated Verification

Run from the repository root (pnpm workspace):

* Install dependencies:
  ```bash
  pnpm install
  ```
* Build compiler check (builds `@civilcheck/shared` first, then the API):
  ```bash
  pnpm build:api
  ```
* Regenerate the Prisma client after any schema change (run with `apps/api` as
  the working directory — see the *Tooling note* under Build Status; the
  `pnpm --filter … exec prisma` form fails against the stale local `.bin` shim):
  ```bash
  cd apps/api && node ../../node_modules/prisma/build/index.js generate
  ```
* Apply migrations and reseed the dev database:
  ```bash
  cd apps/api
  node ../../node_modules/prisma/build/index.js migrate deploy   # or migrate dev
  node ../../node_modules/prisma/build/index.js db seed
  ```
* Run the integration test suite (Jest + supertest, `apps/api/tests/`, delivered
  Day 7 and extended in Day 8 — runs against `DATABASE_URL` from `apps/api/.env`,
  the same Neon dev DB as everything else; see *Day 7 decisions* for why there's
  no separate test DB):
  ```bash
  pnpm --filter @civilcheck/api test
  ```
  23 tests across 6 suites, sequential (`maxWorkers: 1`). Expect ~70-100s — most
  of it is real network round trips to Neon and the mock Razorpay/notification
  adapters, not test logic.

### Manual Verification

* Run Postman test requests to check endpoints.
* Verify generated PDFs, tax statements, and invoices.
* Admin session check: log in, wait past `ADMIN_SESSION_TIMEOUT_MINUTES` (or back-date `Admin.lastActivityAt`), and confirm the next request returns `401 SESSION_EXPIRED`.
