# Changes Required — CivilCheck Partner Module + Master UX Spec vs. Current Build

**Prepared:** 2026-08-05
**Source documents:**
1. `CivilCheck_Platform_User_Authentication_CivilCheck_Partners_Contributor_Module_Requirements_v1.1.docx` — new role/auth model
2. `CivilCheck_Master_UX_Specification.md` (v1.0) — full UX + engineering spec

**Compared against:** current backend (`apps/api` — Express/TS/Prisma/PostgreSQL), `apps/buyer` (React Native), `apps/seller` + `apps/admin` (Next.js), as of the 2026-08-04 QA fix status.

**Re-verified 2026-08-06:** still accurate — no implementation against this document has started. `Seller.partnerRole` (`apps/api/prisma/schema.prisma`) remains a single un-enforced `String?` field; no `RoleAssignment`/`UserRole` table, no Reporter models, no ledger, no RBAC scope catalogue exist yet.

---

## 0. Read this first — confirmed stack + one open conflict

### 0.1 Backend stack — confirmed, no change
The Master UX Spec's engineering contract (§33) references a FastAPI (Python) backend. **This does not apply** — the Express/TypeScript + Prisma + PostgreSQL backend is already built and integrated (all 7+ roadmap days, QA-audited). Every API path the UX spec lists (e.g. `POST /auth/otp/request`, `POST /roles/request`, `GET /me/roles`) is to be read as a **contract to implement equivalently as Express routes/controllers**, not an instruction to rewrite the backend. Nothing in this document requires a backend migration; all new endpoints below are additions/extensions to the existing Express API.

Mobile stack (Flutter, per §33.1) is a separate, still-open question — the current buyer app is React Native/Expo. Not addressed further in this document since it wasn't raised; flag separately if it needs a decision.

### 0.2 Domain-model conflict
The original product proposal and the current build are a **legal/title due-diligence marketplace** ("Case Exists? Yes/No", court case data, RED/AMBER/GREEN based on litigation/loan default). The Master UX Spec (§1, §21.4) instead describes a **structural/civil-inspection marketplace**: Owner lists → Reporter physically visits and captures evidence (photos, measurements) → Expert scores structural/legal/civil-quality/amenities/risk sections → issues a report. The spec even flags this itself in §35 as an "assumption of record."
- These produce different data models, different document/evidence requirements, and different Property Expert workflows.
- **Recommendation:** confirm with the client whether Property Expert reports are (a) legal/case-history verification (matches current build + original proposal) or (b) physical/structural inspection (matches the new UX spec), or (c) both. This document lists changes for both interpretations where they diverge and flags them **[DOMAIN-Q]**.

---

## 1. Role & auth model changes (from the DOCX)

| # | Change | Current state | Action |
|---|---|---|---|
| 1.1 | Rename "Seller" → **"CivilCheck Partner"** everywhere (code, DB enums, UI, docs) | `Seller` model/routes/apps throughout (`apps/seller`, `Seller` Prisma model, `seller.controller.ts`, etc.) | Rename or alias at the API contract + UI layer. Full DB rename is optional (breaking); minimum bar is UI copy + docs matching "CivilCheck Partner." |
| 1.2 | Three Partner types instead of two: **Property Owner, Property Reporter, Property Expert** | `Seller.partnerRole` enum currently only has **owner / expert** (per QA audit — Reporter does not exist) | Add `PROPERTY_REPORTER` to the partner-role enum. **Property Reporter is an entirely new module** — see §3. |
| 1.3 | Multi-role per user (`role_assignment`-style: one identity, many active/pending roles) | Current model: one `Seller` record has a single `partnerRole`; no concept of a user holding Owner + Reporter + Expert simultaneously | New: `UserRole`/`RoleAssignment` join table (`userId`, `role`, `status: pending/active/suspended`), replacing the 1:1 Seller↔partnerRole shape. This is a schema-level change, not additive. |
| 1.4 | Role switching without logout, scoped token re-issue on switch | Not implemented — apps are role-siloed (`apps/buyer`, `apps/seller`, `apps/admin`) with separate logins | New endpoint `POST /session/active-role` issuing a role-scoped token; `GET /me/roles`; UI role-switcher component. |
| 1.5 | Google Sign-In as a first-class login option for **all users**, alongside mobile OTP, with account-link resolution rules | Partially exists already — QA audit references Firebase Google/Apple SSO for buyers (`property.controller.ts` purchase-check bug references SSO buyers), but it's inconsistent (that bug is explicitly because SSO isn't handled the same as OTP everywhere) | Standardize: `POST /auth/google`, `POST /auth/link`; enforce "mobile OTP always mandatory, even after Google login" rule (§3 of docx); fix the known SSO-buyer purchase-check bug as part of this. |
| 1.6 | New Basic Profile step: Full Name, Mobile, Email (optional), Photo (optional), **City, State** required on first login | Not confirmed present for buyers/all roles as a mandatory first-login step | Add/confirm a first-login profile-completion gate before role selection. |
| 1.7 | New "Become a CivilCheck Partner" role-selection screen (3 option cards) shown post-profile-completion | No equivalent — current seller onboarding is a separate app/flow, not a mid-buyer-journey upsell | New screen + `POST /roles/request` endpoint (S07 in UX spec). |
| 1.8 | Approval rule: **Property Owner = instant**, **Property Reporter = instant**, **Property Expert = Super Admin approval required** | Current: all sellers (owner + expert) go through the same KYC approval (24–48h) per the product proposal | Change: Owner and Reporter should auto-activate on registration (no admin approval step); only Expert stays gated on KYC/professional verification. This is a workflow change to `kyc.service.ts` / seller approval logic. |
| 1.9 | New subdomain: **`partners.civilcheck.in`** — common entry point for all 3 partner types, dashboard routed by active role | Current: separate `apps/seller` app, no unified partner portal | Either repoint `apps/seller`'s domain/branding to `partners.civilcheck.in` and add role-based dashboard routing inside it, or scaffold a new shell app. |

---

## 2. Property Owner module — delta from current build

Mostly aligns with the existing "owner" seller type, with these specific deltas:

| # | Change | Notes |
|---|---|---|
| 2.1 | Mandatory document list now explicitly: **Sale Deed, Registry, Khata, Mutation, Property Tax Receipt, Electricity Bill, Owner Aadhaar, PAN Card** (8 mandatory) + Optional (NOC, Builder Docs, Encumbrance Certificate, Photos, Videos, Map Location) | Current build (per QA fixes doc) already enforces "8 mandatory documents" server + client side — **confirm the current 8 match this exact list**, since PAN Card and Owner Aadhaar specifically must be in the mandatory set, not just "Sale Deed, Registry, Khata, etc." |
| 2.2 | New dashboard breakdown: **Draft / Pending / Approved / Rejected / Deleted** listing states + **Property Health Score** metric | Current listing status flow is `PENDING_REVIEW → APPROVED`; needs a `DRAFT` state (save-without-submit) and a `DELETED` (soft-delete) state added to the schema, plus a new "Property Health Score" calculation — **[DOMAIN-Q]** definition of this score isn't specified in either doc; needs clarification. |
| 2.3 | Re-review on edit: editing a published listing sends it back to Pending Review | Confirm this matches current listing-edit behavior; if not already enforced, add. |
| 2.4 | Buyer preview strictly limited to: Owner Verified / Property Verified / Documents Available / Last Updated / Property Area / Property Age / Verification Badge — documents blurred, not just hidden | Confirm redaction is server-side per current implementation (UX spec §S09 explicitly requires server-side redaction, not CSS blur — worth an explicit check against `property.controller.ts`'s preview endpoint). |

---

## 3. Property Reporter module — net-new build

This has **no current equivalent** in the codebase. Full new module.

- **Purpose:** contributor uploads property-market content (not sales): News, Government Notifications, Court Orders, Newspaper Articles, YouTube/Instagram/FB/Twitter links, Survey, Research Report, Blog, Market Analysis, Auction Notice, Circle Rate Update, Metro Update, Road Project, Master Plan, Other.
- **Publishing workflow:** Upload → **AI moderation** (spam/harmful-content filter) → Published. **No Super Admin approval step** (differs from Owner/Expert).
- **Reward system (gamification):** points for uploads/views/likes/shares (1 upload = 10 pts, 100 views = 5 pts, 500 views = 20 pts, 1000 views = 50 pts, 1 like = 1 pt, 1 share = 5 pts), streaks, leaderboard.
- **Redemption:** Cash, UPI transfer, Amazon/Flipkart/gift vouchers, CivilCheck Credits.
- **Dashboard:** Uploads, Views, Likes, Bookmarks, Reward Points, Coins Earned, Redeem Wallet, Leaderboard, Notifications.

**Backend work required:**
- New Prisma models: `ReporterContent` (type enum, media refs, moderation status), `Reward`/`RewardLedger`, `Wallet` (or extend existing settlement/earnings model to support non-sale earnings), redemption request + fulfillment flow.
- AI moderation integration (new — no existing service does content moderation; current AI-adjacent work is none that I've seen in the reviewed docs).
- Anti-abuse: per the UX spec, reward points should only be tied to *verified* activity where applicable, with fraud-flag review states.
- **[DOMAIN-Q]:** the UX spec's "Property Reporter" (evidence capture for structural inspections) and the DOCX's "Property Reporter" (market news/content contributor) are **two different roles with the same name**. These need to be reconciled — confirm with the client which one (or both, as separate concepts) is intended.

---

## 4. Property Expert module — delta from current build

Broadly aligned with the current "expert" seller type (special requests, paid verification, earnings, ratings) — deltas:

| # | Change | Notes |
|---|---|---|
| 4.1 | Expanded eligible-professional list: Advocate, Property Lawyer, Civil Lawyer, **Civil Engineer, Retired Judge, Patwari, Tehsildar, Revenue Officer, Survey Expert, Document Verification Expert** | Current model is Lawyer/Civil Engineer/Tehsil Expert (3 categories, per the original proposal). Needs enum expansion. |
| 4.2 | Mandatory KYC fields expanded: Aadhaar, PAN, Professional Certificate, **Government ID, Experience Details, Service Area, Bank Details** | Confirm current KYC form includes all of these — PAN and Service Area look like additions. |
| 4.3 | Structured professional-verification **stepper** with per-item status (ID ✔ / License pending), external registry link where available, license-expiry tracking with renewal reminders and temporary block on report-issuing when expired | Current KYC approval is a single admin approve/reject action, not a per-credential stepper with expiry tracking. New feature. |
| 4.4 | **[DOMAIN-Q]** If the structural-inspection model (UX spec) is adopted: Expert's job changes from reviewing/uploading legal-case reports to reviewing Reporter-submitted evidence and scoring sections (structural, legal/title, civil quality, amenities, risk) with a request-changes loop back to Reporter. This is a materially different workflow than current `specialRequest` → seller uploads report. |

---

## 5. Super Admin — deltas

- Partner approval queue needs to handle **3 partner types with different approval rules** (Owner/Reporter auto-approve, Expert manual) instead of one uniform seller-KYC queue.
- New: Reporter content moderation oversight (even though AI handles first pass, admin likely needs an escalation/appeals view).
- New: generic **approval-engine/verification_case** pattern (UX spec §21.1) intended to be reused for partner approval, professional verification, property verification, report QA, payout approval, and disputes — this is an architectural recommendation (one workflow engine, many subjects) rather than a one-off feature; adopting it is a larger refactor than adding one new queue.
- Analytics: role-scoped dashboards per persona (Owner/Reporter/Expert/Buyer) plus global admin BI — current admin analytics dashboard would need new widgets for Reporter (uploads/engagement/redemptions) and updated RBAC-scoped views for the 3-way partner split.

---

## 6. Cross-cutting platform changes (Master UX Spec, Parts 1–2)

These apply regardless of the domain-model question in §0.2:

| # | Area | Change vs. current |
|---|---|---|
| 6.1 | **RBAC/ABAC** | New formal permission-scope catalogue (`property:read`, `report:issue`, `payout:approve`, etc.) with a documented scope-per-role matrix, enforced at edge/middleware, UI, API, and DB (Postgres Row-Level Security). Current auth is role-check middleware only (`buyerMiddleware`/`sellerMiddleware`/`adminMiddleware`) — no scope catalogue, no RLS. Significant addition if adopted literally. |
| 6.2 | **Wallet / ledger** | New double-entry `ledger_entry` (append-only) + `wallet` model for Reporter/Expert earnings and buyer credits — current earnings/settlement system uses direct balance fields (`totalEarnings` decrements, per the roadmap notes), not an immutable ledger. This is a real architectural change, not just additive, if pursued to spec. |
| 6.3 | **OTP UX rules** | 6-box auto-submit input, resend cooldown w/ escalation after 3 tries, 5-wrong-attempts lockout (15 min), 5-min expiry, uniform response (never reveal if contact exists). Current OTP fix (per 2026-08-04 status doc) already does real random 5-min single-use codes — good baseline; the UI-level rules (auto-submit, lockout, escalation copy) need a frontend audit against this checklist. |
| 6.4 | **Notifications** | Formal event→channel matrix (in-app/push/email/SMS per event type), user-controllable per category, quiet hours, batching of noisy events. Current notification system (Msg91 SMS + FCM + email) exists but likely doesn't have this full per-category user-configurable matrix — needs a settings UI + backend preference model. |
| 6.5 | **Design system / tokens** | Single `tokens.json` (Style Dictionary) feeding Tailwind (web) + Flutter ThemeData — only relevant if design tokens aren't already centralized; worth a quick audit of `apps/seller`/`apps/admin`'s current Tailwind config. |
| 6.6 | **Accessibility (WCAG 2.2 AA)** | Formal a11y requirements (contrast, keyboard nav, screen-reader live regions, 44px touch targets, reduced-motion) with CI automated checks (axe) — no evidence this is currently tracked; net-new QA gate if adopted. |
| 6.7 | **Payment UX hardening** | Idempotency keys per order, "never grant access before webhook confirmation," explicit pending/ambiguous state copy, refund-request flow surfaced in buyer purchases UI. Current Razorpay integration already does webhook-driven unlock (per architecture notes) — confirm idempotency-key usage and the "pending, not double-charged" UI state exist. |

---

## 7. What can be done right now — no major changes

These are additive, low-risk, and fit the current schema/architecture without a structural rework. No new domain concepts (no multi-role, no ledger, no inspection pipeline).

| # | Item | Why it's "now" |
|---|---|---|
| 1.5 | Standardize Google Sign-In + fix the known SSO-buyer purchase-check bug | Firebase Google/Apple SSO already exists; this is closing a gap in existing logic (`property.controller.ts`), not new infra. |
| 1.6 | Add mandatory City/State (+ optional photo) to the first-login profile step | Additive fields on an existing profile form/table. |
| 1.8 (Owner only) | Make Property Owner approval instant (skip admin KYC queue) | Single conditional change in existing `kyc.service.ts` approval logic. Reporter half of this item is blocked on §3 (new module) — defer that part. |
| 1.1 (UI copy only) | Relabel "Seller" → "CivilCheck Partner" in UI text/copy/docs | Copy-only change, no schema/DB rename. Full backend rename stays a future item (see below). |
| 2.1 | Confirm/align the 8 mandatory Owner documents to include PAN Card + Owner Aadhaar explicitly | Same document-count mechanism already built; likely just adding 1–2 fields to an existing checklist, not new plumbing. |
| 2.3 | Confirm/enforce "edit sends listing back to Pending Review" | Small state-transition check in existing listing-update controller, if not already enforced. |
| 2.4 | Audit + fix buyer-preview redaction to be strictly server-side | Existing preview endpoint; verifying/tightening field selection is not new infra. |
| 4.1 | Expand Property Expert eligible-profession enum (add Retired Judge, Patwari, Tehsildar, Revenue Officer, Survey Expert, Document Verification Expert) | Enum extension on the existing `partnerRole`/profession field. |
| 4.2 | Expand Expert KYC form fields (PAN, Service Area) | Additive fields on the existing KYC form/model, same approval flow. |
| 6.3 | Frontend OTP UX audit against the spec's checklist (auto-submit on 6th digit, lockout copy, resend escalation messaging) | UI-layer polish on top of the already-fixed real-OTP backend; no backend change needed beyond what's already shipped. |
| 6.7 | Payment UX audit: confirm idempotency keys per order + confirm "pending, not double-charged" UI copy exists | Verification/hardening pass on the existing, already-working Razorpay webhook-driven unlock flow. |

**None of the above require:** a new Prisma model, a new app/portal, a new auth architecture, or a client decision on the domain-model question (§0.2). These can be scoped and built independently of everything else in this document.

---

## 8. What should wait for a future version

These require new data models, new architecture, a new module, or a client decision before they're buildable at all.

| # | Item | Why it's "later" |
|---|---|---|
| 1.1 (full) | DB-level Seller → CivilCheck Partner rename | Touches the `Seller` model, every route/controller referencing it, and both frontend apps — a coordinated breaking change, not a quick win. Bundle with a larger refactor pass. |
| 1.2, 1.3, 1.7, 1.8 (Reporter half), 1.9 | Property Reporter as a real partner type, multi-role (`RoleAssignment`) schema, role-switching, "Become a Partner" screen, `partners.civilcheck.in` unified portal | All depend on the same foundational change: moving from "one Seller row = one role" to "one identity, many roles." This is a schema/architecture change that everything else in this bucket sits on top of — do it once, as its own phase. |
| 1.4 | Role switching without logout | Depends on 1.3 (multi-role schema) existing first. |
| 2.2 | Draft/Deleted listing states + "Property Health Score" | Needs new status states **and** a defined scoring formula — the score isn't specified in either source doc, so it needs a client-defined spec before it can even be estimated. |
| §3 (whole) | Property Reporter content/rewards module | Entirely net-new: content model, AI moderation integration, rewards ledger, redemption fulfillment. Also still has the **[DOMAIN-Q]** naming conflict (content-contributor vs. evidence-capture) unresolved — don't start until that's settled. |
| 4.3 | Expert verification stepper with per-credential status + license-expiry tracking | New UI pattern + new expiry-monitoring/reminder logic; not a form-field addition like 4.1/4.2. |
| 4.4 | Structural-inspection Expert workflow (evidence review, sectioned scoring, request-changes loop) | Directly blocked on §0.2 — don't build until the client confirms this is the intended Expert workflow (vs. the current legal/case-check one). |
| §5 (all) | 3-way partner approval queue, Reporter moderation oversight, generic verification-case approval engine, per-role analytics dashboards | All depend on multi-role (1.3) and/or Property Reporter (§3) existing first. The generic approval-engine pattern in particular is an architectural choice (one engine for many workflows) worth designing deliberately, not retrofitting. |
| 6.1 | RBAC/ABAC scope catalogue + Postgres Row-Level Security | Cross-cutting security architecture change touching every route; needs its own design/migration plan, not a drop-in. |
| 6.2 | Double-entry wallet/ledger system | Replaces direct-balance earnings logic with an immutable ledger — a real data-model and financial-logic change; do deliberately with its own testing plan given it's money-related. |
| 6.4 | Per-category notification preference matrix | Needs a new preference model + settings UI across channels (SMS/push/email/in-app); moderate net-new scope. |
| 6.5 | Centralized design-token pipeline (Style Dictionary → Tailwind/Flutter) | Only worth doing as a deliberate design-system investment, and only matters at all if/when a second frontend (e.g. Flutter) is greenlit. |
| 6.6 | WCAG 2.2 AA automated a11y CI gate | New QA infrastructure (axe in CI, manual screen-reader pass) — a process/tooling investment, not a code change. |

---

## 9. Delivery timeline — full exhaustive build

The client accepts only the complete build, so everything in §1–§6 is in scope for delivery. The schedule below sequences the whole document into one continuous solo effort (one full-stack dev, focused full-time). The §7 "do now" items become the warm-up phase; the §8 "future" items are folded into the main phases in dependency order rather than deferred. The two **[DOMAIN-Q]** decisions are raised on day 1 and resolved in parallel during Phase 1, so they don't block the critical path.

**Assumptions that keep this quick:** heavy existing infra is reused (auth, OTP, Razorpay webhooks, notifications, KYC approval); the architectural pieces ship as pragmatic MVP-to-spec versions first (e.g., a working append-only ledger and a scoped RBAC catalogue) and are hardened during the final QA phase; no second frontend (Flutter) is greenlit, so design-token pipelining stays lightweight.

| Phase | Weeks | Scope | Covers |
|---|---|---|---|
| **1 — Quick wins + foundations kickoff** | 1–2 | All §7 additive items (Google SSO standardize + purchase-check fix, City/State profile, Owner instant-approval, UI relabel, Owner doc/preview audits, Expert enum + KYC fields, OTP + payment UX audits). Domain-Q decisions raised and locked. | §7 (all), 1.5, 1.6, 1.8, 2.1, 2.3, 2.4, 4.1, 4.2, 6.3, 6.7 |
| **2 — Multi-role core + RBAC** | 2–4 | `RoleAssignment`/`UserRole` schema, role-scoped token re-issue, `GET /me/roles`, `POST /session/active-role`, RBAC scope catalogue + middleware enforcement (RLS as a fast-follow hardening item). | 1.2, 1.3, 1.4, 6.1 |
| **3 — Partner portal + Owner module** | 4–5 | `partners.civilcheck.in` unified shell with role-routed dashboard, "Become a Partner" screen, `POST /roles/request`, Draft/Deleted listing states + Property Health Score (formula locked in Phase 1). | 1.7, 1.9, 2.2 |
| **4 — Property Reporter module** | 5–8 | `ReporterContent`, rewards/`RewardLedger`, `Wallet` + double-entry ledger, AI moderation integration, redemption flow, gamification (points/streaks/leaderboard), anti-abuse. Largest single build. | §3 (all), 6.2 |
| **5 — Expert module + admin** | 8–9 | Expert verification stepper + license-expiry tracking, sectioned-scoring / evidence-review workflow (per Domain-Q outcome), 3-way partner approval queue, generic verification-case engine, per-role analytics. | 4.3, 4.4, §5 (all) |
| **6 — Cross-cutting + hardening/QA** | 9–10 | Notification preference matrix, WCAG 2.2 AA + axe CI gate, design-token centralization, RLS hardening, full regression + buffer. | 6.4, 6.5, 6.6, RLS follow-up |

**End-to-end: ~10 weeks (≈2.5 months)** for the complete document, solo, with a built-in buffer in Phase 6. Phases 1–3 are shippable/demoable incrementally, so the client sees working progress from week 2 onward rather than waiting for the full build.

---

*This document is a gap analysis with a delivery schedule for planning purposes. Items marked **[DOMAIN-Q]** are resolved in Phase 1 so they no longer block delivery. Timeline is an optimistic-but-buffered solo estimate assuming full-time focus and reuse of existing infrastructure; material scope additions or the Flutter mobile decision (§0.1) would extend it.*
