# CivilCheck — Property Verification Marketplace

**Version:** 1.0.0
**Status:** Feature-complete backend (all 7 planned days + Day 8 carry-over, see `docs/roadmap.md`) with three working clients — admin panel, seller/partner panel, buyer app. A pre-production QA audit on 2026-08-03 found one authentication-bypass-level issue and two authorization/session gaps; all 10 audit findings are now fixed and verified as of 2026-08-04 (see `docs/qa-fixes-status-2026-08-04.md`) — two of the ten are code-complete but pending an external verification step outside plain code review. **CI/CD is currently disabled** (`.github/workflows/deploy.yml` is fully commented out, unlike the "shipped" status below) and go-live still needs real third-party credentials — see *Known Limitations & Roadmap* below. A separate 2026-08-05 gap analysis (`docs/changes-required-2026-08-05.md`) scopes a much larger "CivilCheck Partner" role/auth rework against a new product spec; none of that has been started.
**Product By:** Zytexa Technology LLP
**Tech Stack:** Node.js, Express, TypeScript, PostgreSQL, Prisma, JWT, Zod (API) · React 19 + Vite (admin, seller) · Expo/React Native (buyer)
**Repo Layout:** pnpm monorepo — `apps/api` (backend) + `apps/admin` + `apps/seller` + `apps/buyer` (three clients) + `packages/shared` (Zod schemas + enums, imported by all four)

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-54-000020?style=for-the-badge&logo=expo&logoColor=white)

---

## Project Overview

CivilCheck is **India's first three-sided property verification marketplace**. It solves a fundamental problem in the Indian property market: buyers investing their life savings have no easy, affordable way to know if a property has a pending court case, loan default, or title dispute.

Instead of hiring a lawyer for Rs. 5,000-50,000 and spending weeks visiting tehsil offices and district courts, a buyer gets a complete legal picture for Rs. 99-4,999 — sourced from verified local civil experts.

### The Three-Sided Marketplace Model

CivilCheck is a marketplace — the company does not perform verification itself:

| Actor                 | Action                                                                | Result                                             |
| --------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| **Civil Expert (Seller)** | Uploads verified property information with supporting documents    | Information listed in marketplace with risk badge  |
| **Buyer (User)**      | Searches property — sees free preview, unlocks paid details            | Complete legal picture for Rs. 99-4,999            |
| **Admin (Zytexa)**    | Quality checks listings, approves sellers, manages commission          | Platform quality and trust maintained              |

### Key Differentiators

- **Free "Case Exists?" Check:** Every buyer gets a free binary Yes/No answer per property — the conversion hook into paid reports.
- **Risk Badge System:** Every listing is auto-classified GREEN (clean), AMBER (old disposed case / minor encumbrance), or RED (active case / loan default).
- **Spot-Check Quality Control:** Admin randomly audits listings — fake information leads to seller suspension, listing removal, and buyer auto-refund.
- **Seller Badge Levels:** Bronze → Silver → Gold → Platinum progression based on listing count, rating, and accuracy score — higher tiers earn higher commission (60% up to 70%).
- **Special Requests:** Buyers can commission custom research for properties not yet in the database — admin assigns the nearest qualified expert in that tehsil.

---

## The Apps in This Repo

A pnpm monorepo with one backend and three clients, all talking to the same API over the same Zod-validated contract (`packages/shared`):

| App | Path | Who uses it | Stack | Dev command | Local URL |
| --- | ---- | ----------- | ----- | ----------- | --------- |
| **API** | `apps/api` | All three clients | Node.js, Express 5, TypeScript, Prisma 7, PostgreSQL | `pnpm dev:api` | `http://localhost:8000` |
| **Admin Panel** | `apps/admin` | Zytexa staff (`SUPER_ADMIN`/`SUB_ADMIN`/`VIEWER`) | React 19, Vite, react-router-dom | `pnpm dev:admin` | `http://localhost:5174` |
| **Seller / Partner Panel** | `apps/seller` | Property Owners + Property Experts (civil/legal professionals) | React 19, Vite, react-router-dom | `pnpm dev:seller` | `http://localhost:5173` |
| **Buyer App** | `apps/buyer` | Property buyers | Expo (React Native 0.81), TypeScript, expo-router | `pnpm dev:buyer` | Expo Go / simulator |

Full breakdown of each frontend's pages, personas, and setup is in *Frontend Applications* below; the full monorepo file tree is in *Project Structure*.

---

## System Architecture

```
Client (Seller Panel / Admin Panel / Buyer App)
    → Helmet security headers
    → CORS allowlist
    → JSON body parser
    → Rate limiter (per-route)
    → Role JWT middleware (+ admin idle-session check)
    → RBAC role guard (admin writes only)
    → Zod body validation
    → Controller → Service → Prisma ORM → PostgreSQL
```

**Request Flow:**

1. `helmet()` applies secure HTTP headers before any routing
2. Request arrives from an allowed frontend origin (local Vite dev servers or deployed Vercel URLs via `FRONTEND_URLS`)
3. CORS middleware validates the origin (server-to-server / Postman requests without origin allowed); blocked origins are logged via Winston
4. Express routes the request to the matching router (`/api/auth`, `/api/seller`, `/api/properties`, `/api/admin`, `/api/content`, ...)
5. A per-route rate limiter throttles abuse-prone endpoints (OTP, admin login, 2FA, registration, payments)
6. Role-based JWT middleware (`authMiddleware` / `sellerMiddleware` / `adminMiddleware`) verifies the token and attaches the actor to the request
7. Admin requests additionally pass an idle-session check, then `requireAdminRole(...)` for any write
8. `validateBody(schema)` parses the payload against a Zod schema from `@civilcheck/shared`
9. Controller delegates to a service (`services/`) → Prisma ORM → PostgreSQL
10. JSON response returned with a consistent `{ success, message, data }` shape; a global error handler catches the rest

**Key Architecture Decisions:**

- **Three Separate Auth Middlewares:** Buyers, sellers, and admins are distinct database models with distinct JWT payloads (`userId` / `sellerId` / `adminId`) — a seller token can never access admin routes.
- **RBAC on Admin Writes:** `requireAdminRole()` gates KYC decisions, suspensions, badges, refunds and all content changes to `SUPER_ADMIN`; listing QC and special-request workflow admit `SUB_ADMIN`. `VIEWER` is read-only by construction — every `GET` is open to all three roles.
- **DB-Backed Admin Sessions:** `Admin.lastActivityAt` drives a 30-minute inactivity timeout (`ADMIN_SESSION_TIMEOUT_MINUTES`). Activity writes are throttled to once a minute so a busy panel does not write on every request.
- **Shared Validation Contract:** Zod schemas live in `packages/shared` and are imported by the API — the frontends validate against the exact same schemas rather than a duplicated copy.
- **Thin Controllers, Logic in Services:** `services/` holds the reusable logic (audit, KYC, content, analytics, notifications, TOTP); controllers only marshal request/response.
- **KYC Gate on Sellers:** `sellerMiddleware` blocks suspended sellers at the middleware layer; listing management requires an approved seller account.
- **Commission Split at Purchase Time:** Every purchase record stores `amountPaid`, `platformCut` (40%), and `sellerCut` (60%) — settlement math is captured at transaction time, not recomputed later.
- **Fail-Fast Secrets:** The app refuses to boot without `JWT_SECRET` and `DATABASE_URL` — no insecure hardcoded fallbacks.
- **Prisma Driver Adapter (`@prisma/adapter-pg`):** Direct `pg` connection pooling through Prisma 7's adapter API.
- **Listing Approval Workflow:** All listings start as `PENDING_REVIEW` and only become searchable after explicit admin approval.
- **Audit Trail Without an FK:** `AuditLog` deliberately has no relation to `Admin` — a compliance row must outlive the admin it describes. Identity is resolved at read time with a batch lookup.
- **Soft Deletes on Content:** Content Control `DELETE` endpoints set `active = false` rather than removing rows, so audit-log targets and historical references always resolve.

---

## Core Technology Stack

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.2-000000?style=flat-square&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.6-2D3748?style=flat-square&logo=prisma&logoColor=white)

| Layer          | Technology                     | Version | Purpose                                        |
| -------------- | ------------------------------ | ------- | ---------------------------------------------- |
| Runtime        | Node.js                        | v18+    | Server execution environment                   |
| Language       | TypeScript                     | v6.0    | Type safety, strict mode, compile-time checks  |
| Framework      | Express.js                     | v5.2    | HTTP request handling, routing, middleware     |
| Database       | PostgreSQL                     | v14+    | ACID-compliant relational storage for payments |
| ORM            | Prisma + `@prisma/adapter-pg`  | v7.6+   | Type-safe queries, migrations, pg driver pool  |
| Auth           | JWT (`jsonwebtoken`)           | v9.0    | Stateless role-based authentication            |
| Hashing        | bcryptjs                       | v3.0    | Admin password hashing                         |
| Validation     | Zod (via `@civilcheck/shared`) | v4.4    | Runtime schema validation on every write route |
| Security       | helmet                         | v8.3    | Secure HTTP response headers                   |
| Rate Limiting  | express-rate-limit             | v8.6    | Brute-force / abuse throttling per route       |
| 2FA            | otplib                         | v13.4   | Admin TOTP (Google Authenticator)              |
| Logging        | winston                        | v3.19   | Structured app + security event logging        |
| Identity       | firebase-admin                 | v14.2   | ID token verification (mock adapter in dev)    |
| Monorepo       | pnpm workspaces                | v11     | `apps/*` + `packages/*` with hoisted linker    |
| Dev Server     | tsx (watch mode)               | v4.21   | Instant TypeScript execution during dev        |

**Third-Party Integrations:**

| Concern            | Technology                                         | Status                                          |
| ------------------ | -------------------------------------------------- | ----------------------------------------------- |
| Email              | Resend                                             | **Implemented** — adapter, logs payload if unkeyed |
| SMS                | — (removed)                                        | **Deactivated** — Msg91 was removed platform-wide; `sendSms()` is a no-op stub. See Auth section below. |
| Identity           | Firebase Auth (`firebase-admin`)                   | **Implemented** — mock adapter when unconfigured (optional Google/Apple SSO, independent of the auth cutover below) |
| Admin 2FA          | otplib TOTP + Google Authenticator                 | **Implemented**                                 |
| Auth (buyer/seller)| Email + password                                   | **Implemented** — bcrypt-hashed, phone stays mandatory as a stored contact field, not a login credential. Replaces the old Msg91 phone-OTP login. |
| Payments           | Razorpay + RazorpayX (UPI/Card/Netbanking, payouts) | **Implemented** — mock orders/payouts when unkeyed, hard-refuses mock in production |
| Identity Document KYC | Manual admin review (Cloudinary upload)         | **Implemented** — seller uploads a document, SUPER_ADMIN approves/rejects |
| Document Storage   | Cloudinary CDN                                     | **Implemented** — mock signed-upload payload when unconfigured |
| Push Notifications | Firebase FCM                                       | **Implemented** on the app side (permission request, device registration, handling) — not yet confirmed end-to-end; needs a real Firebase project + iOS push cert, which is account setup, not code |
| Hosting            | Railway (API) + Vercel (frontends) + Supabase-class Postgres (Neon) | Not yet deployed — `.github/workflows/deploy.yml` exists but is currently fully disabled (commented out); dev DB runs on Neon already |

> **Adapter pattern:** Resend credentials are read **per call**, never at module load. With no key set, the adapter logs the exact payload it would have sent; drop a real key into `.env` and restart to go live — no code change either way. This is the permanent shape, not a stub to be removed.

### Frontend Technology Stack

| App | Layer | Technology | Version | Notes |
| --- | ----- | ---------- | ------- | ----- |
| Admin, Seller | Framework | React | 19.2 | Same major version pinned in both |
| Admin, Seller | Build tool | Vite | 8.0 | `vite build` → static `dist/`, deployed to Vercel |
| Admin, Seller | Routing | react-router-dom | 7.14 | `BrowserRouter` — real deep-linkable URLs, not tab state |
| Admin, Seller | HTTP client | axios | 1.15 | Request interceptor auto-attaches the JWT from `localStorage` |
| Admin | Charts | recharts | 3.8 | Analytics dashboard |
| Admin | 2FA UI | qrcode.react | 4.2 | Renders the TOTP `otpauth://` URI as a scannable QR |
| Buyer | Framework | Expo (React Native) | ~54.0 | Managed workflow — see `apps/buyer/AGENTS.md` for version-specific gotchas |
| Buyer | Routing | expo-router | ~6.0 | File-based routing (`app/` directory), same convention as Next.js |
| Buyer | Language | TypeScript | ~5.9 | Buyer app is TS; admin/seller are plain JSX |
| Buyer | Push | expo-notifications | ~0.32 | Device registration + permission flow wired up (needs a real Firebase project to deliver — see *Known Limitations*) |
| Buyer | Secure storage | expo-secure-store | ~15.0 | JWT persisted outside plain storage, unlike the two web panels' `localStorage` |

All three frontends validate against the exact same Zod schemas the API uses (`@civilcheck/shared`) — no duplicated, driftable copy of "what a valid listing looks like."

---

## Database Schema

**24 models, 20 enums.** The schema is fully normalized with enum-driven state machines and relation-linked financial records. Source of truth: `apps/api/prisma/schema.prisma`.

### UUID v7 Primary Keys

All primary keys use **UUID v7** (`@default(uuid(7))`) — time-ordered, lexicographically sortable unique strings. This keeps PostgreSQL B-tree indexes efficient and insert-friendly (new rows always land at the end of the index), avoiding the fragmentation that random UUID v4 keys cause.

### Core Models (Prisma Model Map)

**User (Buyer)**
- `id` (String UUIDv7, Primary Key)
- `phone` (String, Unique) — OTP-based login, no password
- `name`, `email` (Nullable)
- Relations: `purchases`, `alerts`, `specialRequests`, `refunds`, `searchQueries`, `reportFlags`

**Seller (Civil Expert)**
- `id` (String UUIDv7, Primary Key)
- `phone` (String, Unique), `email` (Nullable) — KYC decision emails via Resend; SMS uses `phone`
- `profession` (Enum: LAWYER / CIVIL_ENGINEER / TEHSIL_EXPERT / PROPERTY_CONSULTANT)
- `aadhaarVerified` (Boolean), `barCouncilDoc`, `pan`, `bankAccount`, `ifsc`
- `selfieUrl` (Nullable) — KYC selfie
- `tcAccepted` (Boolean), `digitalSignature` (Nullable) — registration compliance capture
- `partnerRole` (Nullable) — owner / reporter / expert, chosen at registration
- `badge` (Enum: BRONZE / SILVER / GOLD / PLATINUM)
- `kycStatus` (Enum: PENDING / APPROVED / REJECTED / SUSPENDED)
- `accuracyScore` (Float, default 100.0) — public trust metric, affected by spot-checks
- `totalEarnings` (Float)
- Relations: `listings`, `specialRequests`, `properties`, `notifications`

**Admin**
- `id` (String UUIDv7, Primary Key)
- `email` (String, Unique), `password` (bcrypt hashed), `name`, `phone`
- `role` (Enum: SUPER_ADMIN / SUB_ADMIN / VIEWER)
- `lastActivityAt` (Nullable DateTime) — drives the 30-minute inactivity timeout; `null` means no active session
- `twoFactorSecret` (Nullable), `twoFactorEnabled` (Boolean) — TOTP secret is written at `/2fa/setup` but stays inert until proven at `/2fa/enable`, so a half-finished enrollment can never lock anyone out

**Listing (Verified Property Report)**
- `id` (String UUIDv7, Primary Key)
- `sellerId` (Foreign Key → Seller)
- `address`, `surveyNumber`, `khasraNumber`, `propertyType`, `city`, `tehsil`
- `caseExists` (Boolean) — shown FREE to buyers
- `caseNumber`, `caseType` (PARTITION / TITLE_DISPUTE / LOAN_DEFAULT / OTHER), `caseStatus` (ACTIVE / DISPOSED / STAYED), `courtName`, `partiesInvolved`
- `loanDefault` (Boolean), `lenderName`
- `latitude`, `longitude` (Nullable Float) — geospatial pin for the map view
- `riskBadge` (Enum: GREEN / AMBER / RED)
- `price` (Float, Rs. 99-4,999), `sellerNotes`, `documents` (String[])
- `status` (Enum: PENDING_REVIEW / APPROVED / REJECTED / UNPUBLISHED)
- `views` (Int), `researchDate`
- Relations: `purchases`, `alerts`, `spotChecks`, `reportFlags`

**SearchQuery (Buyer Search History)**
- `userId` (FK → User), `query`, `createdAt` — powers recent-search UX and demand analytics

**ReportFlag (Buyer "Report Outdated")**
- `userId` (FK → User), `listingId` (FK → Listing), `reason`
- `status` (Enum: PENDING / RESOLVED / DISMISSED), `adminNote`

**Purchase (Report Unlock)**
- `id` (String UUIDv7, Primary Key)
- `userId` (FK → User), `listingId` (FK → Listing)
- `amountPaid`, `platformCut` (40%), `sellerCut` (60%)
- `razorpayId` (String, Unique), `settled` (Boolean)

**Alert (Case Update Subscription)**
- `userId` (FK → User), `listingId` (FK → Listing), `active` (Boolean)

**SpotCheck (Quality Control)**
- `listingId` (FK → Listing), `adminNote`, `result` (PASS / FAIL), `checkedAt`

**SpecialRequest (Custom Research)**
- `userId` (FK → User), `sellerId` (Nullable FK → Seller)
- `address`, `city`, `tehsil`, `propertyType`, `questions`, `documents` (String[])
- `advanceAmount` (Float)
- `status` (Enum: PENDING / ASSIGNED / IN_PROGRESS / COMPLETED / APPROVED / REJECTED / REFUNDED)

**Refund**
- `purchaseId` (FK → Purchase), `userId` (FK → User)
- `amount`, `reason`, `status` (PENDING / PROCESSED / REJECTED), `adminNote`

**Property (Owner-Listed Property)**
- Separate from `Listing` — a property owner listing their own property for verification
- `sellerId` (FK → Seller), `title`, `area`, `age`, `city`, `propertyType`
- `health` (Int 0-100 document/verification score)
- `status` (DRAFT / PENDING / APPROVED / REJECTED / DELETED — soft delete)

**Notification (Seller Inbox)**
- `sellerId` (FK → Seller), `type` (sale / request / review / approval / settlement / badge / platform), `title`, `body`, `read`

**AuditLog**
- `adminId`, `action`, `target`, `details`, `ipAddress`, `createdAt` — admin action trail
- Indexed on `createdAt` and `adminId`
- **No FK to Admin by design:** an audit row must outlive the admin it describes. A foreign key would either block admin deletion or cascade the evidence away — both wrong for a compliance trail. Identity is resolved at read time with a batch lookup, and the row stands alone if the admin is gone.

### Content Control Models

Four admin-managed models share one shape so the CRUD layer, audit wiring and public read endpoints stay uniform: a stable business key, an `active` flag for soft-disable (rows are never hard-deleted), and `updatedAt` for change tracking.

**PropertyCategory** — admin-editable presentation layer over the fixed `PropertyType` enum
- `slug` (Unique), `label`, `description`, `propertyType` (Nullable enum), `sortOrder`, `active`
- `propertyType` is nullable so a category can be published ahead of a schema change (e.g. "Industrial") without a migration

**ServiceArea** — the cities/tehsils coverage map buyers and sellers pick from
- `state` (default "Rajasthan"), `city`, `tehsil`, `active` — unique on `(city, tehsil)`

**Disclaimer** — global disclaimer text keyed by surface (`report`, `listing`, ...)
- `key` (Unique), `title`, `body`, `version`, `active`, `updatedBy` (adminId snapshot, no FK)
- `version` bumps on every body change so a purchased report can pin the wording that was live at purchase time

**BannerAnnouncement** — in-app banner announcements
- `title`, `body`, `audience` (ALL / BUYERS / SELLERS / ADMINS), `severity` (INFO / WARNING / CRITICAL)
- `active`, `startsAt`, `endsAt`, `createdBy` — a banner is live when `active` **and** inside its optional window, so campaigns can be scheduled ahead

---

## Frontend Applications

Three clients, all speaking to the one API in *The Apps in This Repo* above. All three carry the "CivilCheck Partner" rename and multi-role scope described in `docs/changes-required-2026-08-05.md` as **not yet started** — what's documented below is what's actually built today.

### Admin Panel (`apps/admin`)

Internal tool for Zytexa staff — seller/listing quality control, KYC approval, content management, refunds, analytics, and platform settings. Role-gated UI mirrors the backend's RBAC exactly (`src/utils/permissions.js`), so a `VIEWER` never even sees a control it couldn't use.

**Auth:** email + bcrypt password, then an optional TOTP challenge (`Login.jsx` reveals the 6-digit field only when the backend answers `TOTP_REQUIRED`) → JWT in `localStorage`, attached to every request by an axios interceptor. Real server-side logout on sign-out (`POST /auth/logout`), not just a local token clear.

**Pages** (`src/pages/admin/`, routed under `/dashboard/*` — real URLs, not tab state):

| Group | Pages |
| ----- | ----- |
| Overview | Dashboard (live GMV/conversion/risk stats), Analytics (revenue trend, funnel, subscriptions) |
| Management | Sellers (KYC review with real document viewer), Listings (approve/reject/spot-check, flagged-for-QC filter), Owner Properties, Buyers, Special Requests, Report Flags, Content Control (categories/service areas/disclaimers/banners, 4 tabs) |
| Finance | Payments, Settlements, Payout Ledger (special-request seller payouts), Refunds (search-by-buyer-phone-or-address → create/process/reject) |
| Reports & Compliance | Reports (CSV export), Alert Subs, Audit Log, SMS Delivery Log |
| Account | Security (2FA setup/enable/disable with a live QR code via `qrcode.react`), Settings (read-only — displays real commission/pricing constants sourced from the backend, not an editable form pretending to persist) |

**Notable UI decisions:** every list page (Sellers/Listings/Special Requests/Refunds) is server-paginated, not client-sliced; stat cards read real aggregate endpoints rather than counting whatever page happens to be loaded; a shared `Toast`/`Pagination`/`Badge` component set (`components/ui.jsx`) replaced five copy-pasted local implementations.

**Local dev:** `pnpm dev:admin` → `http://localhost:5174`. Env: `apps/admin/.env` needs `VITE_API_URL` (see `.env.sample`).

### Seller / Partner Panel (`apps/seller`)

One app, two personas, chosen at registration and enforced server-side (`requireSellerRole`) — a token from one persona cannot call the other's endpoints even if replayed directly.

**Property Owner** — lists their own property for verification, tracked separately from marketplace listings:
- Dashboard, My Properties, Add Property (8 mandatory documents enforced both client- and server-side: Sale Deed, Registry, Khata, Mutation, Property Tax Receipt, Electricity Bill, Owner Aadhaar, PAN Card), Analytics

**Property Expert** — civil/legal professional doing paid verification work (the original "Seller" persona):
- **Work:** Dashboard, Requests (accept/decline assignments), Reports
- **Listings:** My Listings (create/edit verified-property reports — editing sends a listing back to `PENDING_REVIEW`), New Listing
- **Finance:** Earnings (badge-tier commission: 60% Bronze/Silver → 70% Platinum), Settlements, Ratings & Reviews

**Shared by both personas** (`pages/shared/`): Profile (read-only partner-status card — role, KYC status, badge, accuracy score), Notifications, KYC & Documents (Cloudinary signed upload for certificates and identity documents, with manual SUPER_ADMIN review — a real adapter with a mock fallback in dev).

**Auth:** phone OTP, same real-random-code flow as the buyer app. `AuthContext.jsx` only ever sets the authenticated seller from a verified `/seller/profile` response — no optimistic cached-user paint.

**Local dev:** `pnpm dev:seller` → `http://localhost:5173`. Env: `apps/seller/.env` needs `VITE_API_URL`. No lint tooling configured for this app yet (`apps/admin`, `apps/buyer`, and `apps/api` all have one).

### Buyer App (`apps/buyer`)

Expo/React Native mobile app — the actual marketplace storefront. File-based routing via `expo-router` (`app/` directory mirrors the URL structure, same convention as Next.js).

**Bottom tabs** (`app/(tabs)/`): Home, Search, Alerts, Profile.

**Stack screens**: Login / Register (phone OTP, matching the seller flow), Reports (unlocked purchases) + Report detail, Requests (special-request list) + Request detail + new-request form, Verified Properties (list + detail — the owner-listed-property side of the marketplace), Coverage (cities/tehsils served), Notifications + Notification Settings.

**Key implementation notes:**
- `src/config/env.ts` derives the API host from the Metro dev-server address by default (so "API and phone/simulator on the same laptop" just works without any config) — a shipped build has no Metro host to read, so `EXPO_PUBLIC_API_URL` **must** be set for a release build (there's a runtime guard screen if it isn't, added as part of the 2026-08-04 QA fixes).
- JWT lives in `expo-secure-store`, not plain storage.
- Push notifications (`expo-notifications`) are fully wired on the app side — permission request, device registration, foreground/background handling — but can't be confirmed end-to-end without a real Firebase project + iOS push certificate (account setup, not code; see *Known Limitations*).
- Payment flow (`PaymentSheet.tsx`) never claims success before the backend confirms it — no client-side "payment succeeded" state that isn't backed by a real API response.

**Local dev:** `pnpm dev:buyer` (runs `expo start`) — scan the QR with Expo Go, or press `a`/`i` for an emulator/simulator. Env: `apps/buyer/.env`, copy from `.env.example`. Two cases need `EXPO_PUBLIC_API_URL` set by hand: the Android emulator (`localhost` there means the emulator itself — use `http://10.0.2.2:3000`) and an API running on a different machine (use its LAN IP). Read `apps/buyer/AGENTS.md` before touching Expo-version-specific code — it's a pinned pointer to the exact versioned docs for the Expo SDK this app is on.

---

## API Architecture

**Base URL:** `/api` — **122 endpoints across 20 categories.** Full endpoint-by-endpoint listing (routes, request shape, auth/RBAC per route) lives in **[docs/api-reference.md](./docs/api-reference.md)** — this section covers the auth flow and a category-level map.

### Authentication Flow

```
Buyer:  Register (phone) → Send OTP → Verify OTP → JWT issued (userId payload, 7d expiry)
Seller: Register (KYC details) → Send OTP → Verify OTP → JWT issued (sellerId payload)
Admin:  Email + Password (bcrypt) → [if enrolled] TOTP 6-digit code → JWT issued (adminId payload)
Protected Route → Extract Bearer Token → Verify JWT → DB existence check → Attach actor to request
Admin Route     → ... → Idle-session check → RBAC role guard → Zod body validation
```

**Token Strategy:**

- Bearer token in `Authorization` header
- Separate JWT payload shapes per role — cross-role token reuse impossible
- Middleware re-validates the actor against the database on every request (revocation-safe: deleted/suspended accounts are rejected even with a valid token)

**Admin Login Response Codes:**

| Code | Meaning |
| ---- | ------- |
| `TOTP_REQUIRED` | Password accepted, admin has 2FA enrolled — resend with the 6-digit code |
| `TOTP_INVALID`  | The supplied 6-digit code did not verify |
| `SESSION_EXPIRED` | Admin idled past the timeout — re-login required |

### Endpoint Categories

Full request/response detail for every route is in **[docs/api-reference.md](./docs/api-reference.md)**. Category map:

| # | Category | Count | Notes |
| - | -------- | :---: | ----- |
| 1 | Authentication | 8 | Phone OTP (buyer/seller), password+TOTP (admin), all rate limited |
| 2 | Public Property Search | 4 | Free "Case Exists?" check — no login needed |
| 3 | Public Content Reads | 4 | Categories, coverage, banners, disclaimers |
| 4 | Seller Onboarding & Profile | 5 | Registration, KYC upload, profile |
| 5 | Seller Listings | 5 | CRUD on verified-property reports |
| 6 | Owner Properties | 5 | CRUD on owner-listed properties |
| 7 | Seller Earnings & Settlements | 5 | Overview, transactions, tax statement, settlements |
| 8 | Seller Notifications | 3 | Inbox + read receipts |
| 9 | Buyer Alerts | 4 | Case-update subscriptions |
| 10 | Purchases | 2 | Report unlock, 60/40 commission split recorded |
| 11 | Special Requests | 11 | Buyer submit → seller accept/submit → admin approve, custom research |
| 12 | Admin 2FA | 4 | TOTP setup/enable/disable — every role manages their own |
| 13 | Admin KYC Pipeline | 2 | Review queue with documents exposed |
| 14 | Admin Seller Management | 7 | Approve/reject/suspend/badge — `SUPER_ADMIN` only |
| 15 | Admin Listings & QC | 4 | Approve/reject/spot-check |
| 16 | Admin Content Control | 14 | Categories/areas/disclaimers/banners CRUD, soft-delete only |
| 17 | Admin Analytics | 7 | GMV, funnel, top sellers/cities, risk breakdown |
| 18 | Admin Buyers/Refunds/Reports | 9 | Refund workflow, revenue/settlement/QC reports |
| 19 | Admin Audit Trail | 2 | Reads open to all roles; writes need SUPER/SUB |
| 20 | Health Check | 1 | `GET /` — no auth |

Every RBAC-gated write returns `403` on a blocked attempt and logs `[rbac] Admin <id> (<role>) blocked on <METHOD> <url>`. Unknown routes return `404` with `{ success: false, message: "Endpoint not found" }`; a global error handler catches everything else and logs the stack via Winston.

---

## Commission & Business Rules

### Commission Structure

| Scenario                          | Buyer Pays  | Platform Keeps | Seller Receives |
| --------------------------------- | ----------- | -------------- | --------------- |
| Standard Report (Bronze/Silver)   | Rs. 299     | 40%            | 60%             |
| Standard Report (Gold)            | Rs. 299     | 35%            | 65%             |
| Standard Report (Platinum)        | Rs. 299     | 30%            | 70%             |
| Special Request (custom research) | Rs. 999-4,999 | 30%          | 70%             |
| Alert Subscription (monthly)      | Rs. 49-199  | 100%           | — (platform feature) |

*Currently the 60/40 split is applied at purchase time; badge-tier commission rates are on the roadmap.*

### Seller Badge Levels

| Badge    | Requirement                            | Benefit                                  |
| -------- | -------------------------------------- | ---------------------------------------- |
| Bronze   | KYC approved, 0-4 listings             | Listed on platform, basic visibility     |
| Silver   | 5+ listings, 4.0+ rating, 90%+ accuracy | Priority in search results              |
| Gold     | 20+ listings, 4.5+ rating, 95%+ accuracy | Homepage featured, 35% platform cut    |
| Platinum | 50+ listings, 4.8+ rating, 98%+ accuracy | Top placement, 30% platform cut        |

### Risk Badge System

| Badge   | Color | Meaning                                     | Buyer Action                            |
| ------- | ----- | ------------------------------------------- | --------------------------------------- |
| Clear   | GREEN | No case, clean title, no loan default       | Safe to proceed — do final lawyer check |
| Caution | AMBER | Old disposed case OR minor encumbrance      | Proceed with caution — consult lawyer   |
| Risk    | RED   | Active court case OR active loan default    | Do NOT buy without legal clearance      |

---

## Security Implementation

### Authentication & Authorization

**Password Security:**

- Admin, buyer, and partner/seller passwords are all bcrypt-hashed (10 rounds)
- Buyers and partners log in with email + password. Phone is mandatory at signup and stored, but is not itself a login credential — this replaced the old Msg91 phone-OTP login (MSG91 removed platform-wide; `OtpCode`/`SmsDeliveryLog` tables remain in the schema, unused, rather than being dropped from production)
- Admin accounts additionally support TOTP 2FA (below) and Super Admin-managed `active`/`blocked` flags, checked on every authenticated request, not just at login

**Admin Two-Factor Authentication (TOTP):**

- Google Authenticator-compatible TOTP via `otplib` v13, issuer configurable through `TOTP_ISSUER`
- **Two-step enrollment:** `/2fa/setup` writes the secret but leaves it inert; only `/2fa/enable` — which requires a valid 6-digit code — flips `twoFactorEnabled`. A half-finished enrollment therefore can never lock an admin out.
- Login returns `TOTP_REQUIRED` when a code is needed and `TOTP_INVALID` on a bad code; both outcomes are written to the audit trail
- Every 2FA route is rate limited (10 attempts / 15 min)

**DB-Backed Admin Sessions (30-minute inactivity timeout):**

- `Admin.lastActivityAt` is set on login, refreshed while active, and cleared on logout/expiry — `null` means "no active session"
- Idle past `ADMIN_SESSION_TIMEOUT_MINUTES` (default 30) → `401` with code `SESSION_EXPIRED`
- Activity writes are throttled to at most once a minute, so an active panel does not issue a DB write on every request

**JWT Configuration:**

```javascript
{
  secret: process.env.JWT_SECRET,   // app refuses to start if missing
  expiry: "7d",
  payloads: {
    buyer:  { userId, phone },
    seller: { sellerId, phone },
    admin:  { adminId }
  }
}
```

**Middleware Stack:**

```
Request → Helmet (secure HTTP headers)
    → CORS (origin allowlist + credentials)
    → JSON Body Parser
    → Rate Limiter (per-route, abuse-prone endpoints)
    → Role-specific JWT Verification (auth / seller / admin middleware)
    → DB existence + suspension check
    → Admin idle-session check (admin routes only)
    → requireAdminRole(...) RBAC guard (admin writes only)
    → validateBody(zodSchema)
    → Route Handler → Service → Prisma
    → Global error handler (Winston-logged)
```

### Rate Limiting

| Limiter          | Window | Max | Applied To                                    |
| ---------------- | ------ | --- | --------------------------------------------- |
| `otpSendLimiter`   | 10 min | 5   | Buyer + seller OTP send                       |
| `otpVerifyLimiter` | 15 min | 10  | Buyer + seller OTP verify                     |
| `adminLoginLimiter`| 15 min | 10  | `POST /auth/admin/login`                      |
| `twoFactorLimiter` | 15 min | 10  | All four `/admin/2fa/*` routes                |
| `registerLimiter`  | 60 min | 10  | `POST /auth/register`                         |
| `paymentLimiter`   | 15 min | 20  | `POST /purchases`                             |

### Role-Based Access Control (RBAC)

Three admin roles, enforced by `requireAdminRole(...)` in `auth.middleware.ts`. `SUPER_ADMIN` passes every allow-list; other roles pass only when explicitly named. Every `GET` is open to all three roles, which makes `VIEWER` read-only by construction rather than by convention.

| Capability                                            | SUPER_ADMIN | SUB_ADMIN | VIEWER |
| ----------------------------------------------------- | :---------: | :-------: | :----: |
| Read anything (sellers, listings, analytics, audit)    | ✅ | ✅ | ✅ |
| Manage own 2FA                                         | ✅ | ✅ | ✅ |
| Listing approve / reject / spot-check                  | ✅ | ✅ | ❌ |
| Special-request assign / approve / reject              | ✅ | ✅ | ❌ |
| Write audit-log entries                                | ✅ | ✅ | ❌ |
| KYC approve / reject, suspend, badge changes           | ✅ | ❌ | ❌ |
| Refunds (create / process / reject)                    | ✅ | ❌ | ❌ |
| Content Control writes (categories, areas, disclaimers, banners) | ✅ | ❌ | ❌ |

Blocked attempts are logged (`[rbac] Admin <id> (<role>) blocked on <METHOD> <url>`) and return `403`.

### Audit Trail

Every consequential admin action is recorded in `AuditLog` with `adminId`, `action`, `target`, `details` and `ipAddress`, indexed on `createdAt` and `adminId`. The table carries **no foreign key** to `Admin` on purpose — see the schema notes above.

### Access Control

- **Suspended sellers** are blocked at the middleware layer (403) — all their actions stop immediately
- **Listing visibility:** only `APPROVED` listings are purchasable; `PENDING_REVIEW` content never reaches buyers
- **Paid content gating:** full case details (case number, court, parties, documents) only returned to buyers with a recorded purchase
- **Duplicate purchase protection:** re-purchasing an unlocked report returns the existing purchase instead of double charging

### Input & Data Safety

- **Zod validation on every write route** — schemas live in `packages/shared` and are imported by both the API and the frontends, so client and server validate against one definition rather than two drifting copies
- Prisma parameterized queries (SQL injection prevention)
- Helmet secure response headers applied before routing
- No hardcoded secret fallbacks — `JWT_SECRET` and `DATABASE_URL` are fail-fast required
- Firebase mock-token mode is **refused when `NODE_ENV=production`** — dev convenience cannot leak into a deployed environment
- No Aadhaar numbers stored (DPDP Act 2023 compliance per product spec) — only verification status flag
- CORS origin allowlist rejects unknown browser origins (logged for debugging)

---

## Legal & Compliance Framework

Every report carries a mandatory disclaimer (per product spec):

> *CivilCheck provides information sourced from independent verified professionals. This report is NOT legal advice and does NOT substitute a legal opinion from a qualified advocate. Verify all details independently before any financial transaction.*

**Compliance targets:**

- IT Act 2000 + Intermediary Guidelines Rules 2021 (platform liability protection, grievance officer)
- Consumer Protection Act 2019 (refund policy — implemented via admin refund workflow)
- GST Act — 18% GST on platform commission
- Income Tax Act — 10% TDS on seller earnings above Rs. 30,000/year
- DPDP Act 2023 — no Aadhaar retention post-KYC

**False Information Penalty System:** warning → suspension + fine → permanent ban + legal action, enforced through the spot-check and suspension endpoints.

---

## Getting Started

### Prerequisites

```bash
Node.js v18+
PostgreSQL v14+
pnpm v11+          # npm/yarn will NOT work — this is a pnpm workspace
```

For the buyer app specifically: the [Expo Go](https://expo.dev/go) app on a phone (fastest way to run it), or Xcode/Android Studio for a simulator. No separate Expo CLI install needed — `pnpm dev:buyer` runs it via the local `expo` dependency.

### 1. Clone & install (once, for everything)

```bash
git clone https://github.com/zytexa-technology/CivilCheck.git
cd CivilCheck
pnpm install     # installs all four apps + packages/shared from the repo root
```

> **Workspace note:** `nodeLinker: hoisted` in `pnpm-workspace.yaml` is load-bearing. pnpm 11 ignores pnpm-specific settings in `.npmrc`, and the default isolated layout produces two `@prisma/client` copies — `prisma generate` writes to one while the app resolves the other, so newly added models go missing at runtime with **no build error**.

### 2. Start the API

```bash
cp apps/api/.env.sample apps/api/.env
# Edit apps/api/.env with your database URL and a strong JWT secret (see Environment Variables below)

cd apps/api
pnpm prisma migrate dev     # applies migrations; `prisma generate` runs on postinstall
pnpm prisma db seed         # optional — seeds a demo SUPER_ADMIN/SUB_ADMIN/VIEWER + sample listings
cd ../..

pnpm dev:api                # watch mode, http://localhost:8000 (or PORT from .env)

# Production build
pnpm build:api               # builds @civilcheck/shared then the API
pnpm --filter @civilcheck/api start
```

### 3. Start a frontend

Each frontend needs to know where the API is. Copy its env template and point `VITE_API_URL` / `EXPO_PUBLIC_API_URL` at the API from step 2 (defaults below assume everything runs on one machine):

```bash
# Admin panel
cp apps/admin/.env.sample apps/admin/.env    # VITE_API_URL=http://localhost:3000 by default
pnpm dev:admin                                # http://localhost:5174

# Seller / Partner panel
cp apps/seller/.env.sample apps/seller/.env  # same VITE_API_URL convention
pnpm dev:seller                               # http://localhost:5173

# Buyer app
cp apps/buyer/.env.example apps/buyer/.env   # only needed on Android emulator or a multi-machine setup — see below
pnpm dev:buyer                                # runs `expo start`; scan the QR with Expo Go, or press a/i
```

> **Buyer app networking:** by default `EXPO_PUBLIC_API_URL` is unset and the app derives the API host from the Metro dev-server address — correct for "API and phone/simulator on the same laptop" and survives a network change. Two cases need it set by hand: the **Android emulator** (`localhost` there is the emulator itself, not your machine — use `http://10.0.2.2:3000`), and an **API running on a different machine** (use its LAN IP). A shipped release build has no Metro host to read, so `EXPO_PUBLIC_API_URL` is **mandatory** there.

### Keeping the Database in Sync

```bash
cd apps/api

pnpm prisma migrate status                      # are all migrations applied?
pnpm prisma migrate dev --name <change_name>    # author + apply a new migration
pnpm prisma generate                            # regenerate the typed client

# Detect drift between schema.prisma and the live database
pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

An empty result from that last command (`-- This is an empty migration.`) means the live database matches `schema.prisma` exactly.

### Environment Variables

Location: `apps/api/.env` (template at `apps/api/.env.sample`).

```env
# ─── Core (required — app refuses to boot without these) ────────────────────
DATABASE_URL="postgresql://postgres:root@localhost:5432/civilcheck_local?schema=public"
JWT_SECRET="<64-char-random-string>"          # generate: openssl rand -hex 64

# Deployed frontend origins (comma-separated) — local Vite ports always allowed
FRONTEND_URLS=https://civil-check-seller.vercel.app,https://civil-check-admin.vercel.app

ACCESS_TOKEN_EXPIRY=7d
PORT=3000                                      # defaults to 8000

# ─── Firebase Auth (optional in dev) ────────────────────────────────────────
# Leave BOTH unset to run the mock adapter: ID tokens are decoded WITHOUT
# verification so local dev/demos work without a Firebase project.
# Mock mode is REFUSED when NODE_ENV=production. Set ONE to enable real checks:
FIREBASE_SERVICE_ACCOUNT=
FIREBASE_SERVICE_ACCOUNT_PATH=

# ─── Admin session ──────────────────────────────────────────────────────────
ADMIN_SESSION_TIMEOUT_MINUTES=30               # idle timeout, default 30

# ─── Admin 2FA (TOTP) ───────────────────────────────────────────────────────
# Issuer shown in Google Authenticator. Changing it after enrollment only
# relabels the entry — existing codes keep working.
TOTP_ISSUER="CivilCheck Admin"

# ─── Notifications ──────────────────────────────────────────────────────────
# Read at send time, not at boot. Blank key → the channel logs the exact
# payload instead of sending. Fill it in and restart to go live.
# SMS (Msg91) has been removed platform-wide — sendSms() is a no-op stub, no
# env vars to configure.
RESEND_API_KEY=
RESEND_FROM="CivilCheck <noreply@civilcheck.in>"   # domain must be Resend-verified
```

**Frontend env vars** — one variable each, no server-side secrets in any of them (they're all public bundles):

| App | File | Variable | Default | Notes |
| --- | ---- | -------- | ------- | ----- |
| Admin | `apps/admin/.env` | `VITE_API_URL` | `http://localhost:3000` | No trailing slash, no `/api` suffix — `src/api/axios.js` appends `/api` itself |
| Seller | `apps/seller/.env` | `VITE_API_URL` | `http://localhost:3000` | Same convention as admin |
| Buyer | `apps/buyer/.env` | `EXPO_PUBLIC_API_URL` | derived from the Metro host if unset | See the networking note under *Getting Started* — mandatory for a release build |

### Verification

> Examples assume the default port **8000**. The shipped `.env.sample` sets `PORT=3000` — adjust the URLs to match whatever you configured.

```bash
# Health check
curl http://localhost:8000/

# Expected response
{ "message": "CivilCheck API is running 🚀" }

# Free case check (the conversion hook — no login needed)
curl "http://localhost:8000/api/properties/check?address=Plot%2045%20Vaishali%20Nagar"

# Buyer register — email + password + mandatory phone; returns a token
# straight away, no separate verification step
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Buyer","email":"buyer@example.com","phone":"9999999999","password":"Test1234"}'

# Buyer login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"buyer@example.com","password":"Test1234"}'

# Unlock a report (authenticated)
curl -X POST http://localhost:8000/api/purchases \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"<listing-uuid>"}'

# Public content reads (no login needed)
curl http://localhost:8000/api/content/coverage
curl http://localhost:8000/api/content/disclaimers/report

# Admin login — returns code TOTP_REQUIRED if the account has 2FA enrolled
curl -X POST http://localhost:8000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@civilcheck.in","password":"<password>"}'

# ...then repeat with the 6-digit Google Authenticator code
curl -X POST http://localhost:8000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@civilcheck.in","password":"<password>","totp":"123456"}'
```

---

## Project Structure

```
CivilCheck/
├── apps/
│   ├── api/                               # @civilcheck/api — Express backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma              # 24 models, 20 enums
│   │   │   ├── migrations/                # Migration history (16 applied)
│   │   │   └── seed.ts                    # Demo SUPER_ADMIN/SUB_ADMIN/VIEWER + sample listings
│   │   ├── src/
│   │   │   ├── index.ts                   # App entry — helmet, CORS, routes, error handler
│   │   │   ├── lib/
│   │   │   │   ├── prisma.ts              # Prisma client with pooled pg driver adapter
│   │   │   │   ├── jwt.ts                 # Central JWT secret (fail-fast)
│   │   │   │   ├── otp.ts                 # Real random-code OTP adapter (mock/prod split)
│   │   │   │   ├── logger.ts              # Winston logger
│   │   │   │   ├── session.ts             # Admin idle-timeout math + throttle
│   │   │   │   ├── cache.ts               # Free-check response cache
│   │   │   │   ├── firebase.ts            # Firebase Admin SDK / mock adapter (SSO + FCM)
│   │   │   │   ├── cloudinary.ts          # Signed-upload adapter / mock
│   │   │   │   ├── razorpay.ts            # Orders, subscriptions, refunds, webhook verify
│   │   │   │   ├── razorpayPayouts.ts     # RazorpayX seller payouts
│   │   │   │   └── scheduler.ts           # Cron: weekly settlement, featured-listing sweep
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts     # Buyer/Seller/Admin guards + requireAdminRole/requireSellerRole
│   │   │   │   ├── rateLimiter.ts         # Six per-route limiters
│   │   │   │   └── validation.middleware.ts # validateBody(zodSchema)
│   │   │   ├── controllers/               # Request/response only — thin by rule
│   │   │   │   ├── auth.controller.ts     # OTP, admin login + TOTP challenge
│   │   │   │   ├── twoFactor.controller.ts # Admin 2FA enrollment
│   │   │   │   ├── seller.controller.ts   # Registration, KYC, profile
│   │   │   │   ├── listing.controller.ts  # Property report CRUD
│   │   │   │   ├── property.controller.ts # Public search + free case check
│   │   │   │   ├── property-owner.controller.ts # Owner property listings
│   │   │   │   ├── verifiedProperty.controller.ts # Public verified-property reads
│   │   │   │   ├── purchase.controller.ts # Report unlock + commission split
│   │   │   │   ├── subscription.controller.ts # Alert / featured-listing subscriptions
│   │   │   │   ├── alert.controller.ts    # Case update subscriptions
│   │   │   │   ├── earnings.controller.ts # Seller earnings & settlements
│   │   │   │   ├── notification.controller.ts # Seller notification inbox
│   │   │   │   ├── specialRequest.controller.ts # Custom research workflow
│   │   │   │   ├── content.controller.ts  # Content Control CRUD + public reads
│   │   │   │   ├── webhook.controller.ts  # Razorpay payment/subscription webhooks
│   │   │   │   └── admin.controller.ts    # Sellers, listings, admins, analytics, refunds, audit
│   │   │   ├── services/                  # Business logic lives here (14 files)
│   │   │   │   ├── analytics.service.ts, audit.service.ts, content.service.ts
│   │   │   │   ├── kyc.service.ts, notification.service.ts, twoFactor.service.ts
│   │   │   │   ├── payment.service.ts, refund.service.ts, settlement.service.ts
│   │   │   │   ├── penalty.service.ts     # 3-strike false-info penalty system
│   │   │   │   ├── review.service.ts      # Buyer reviews + badge auto-recalc
│   │   │   │   ├── sellerMatch.service.ts # Nearest-qualified-seller-in-tehsil auto-assign
│   │   │   │   ├── specialRequestPayout.service.ts, specialRequestSla.service.ts
│   │   │   │   └── pdf.service.ts, subscription.service.ts
│   │   │   └── routes/                    # Express routers per domain
│   │   ├── tests/                         # Jest + supertest integration suite (7 suites)
│   │   ├── prisma.config.ts               # Prisma 7 config (schema + seed + datasource)
│   │   ├── tsconfig.json                  # Strict TypeScript config
│   │   └── .env.sample                    # Environment template
│   ├── admin/                             # @civilcheck/admin — React 19 + Vite panel (:5174)
│   │   └── src/
│   │       ├── App.jsx, main.jsx          # Router shell + entry
│   │       ├── context/AuthContext.jsx    # Admin session state, real server-side logout
│   │       ├── api/                       # auth.api.js, admin.api.js, content.api.js, axios.js
│   │       ├── utils/permissions.js       # Frontend mirror of the backend's RBAC matrix
│   │       ├── components/ui.jsx          # Shared Toast / Pagination / Badge
│   │       └── pages/
│   │           ├── Login.jsx, Dashboard.jsx      # Password+TOTP login, routed shell
│   │           └── admin/                        # 18 pages — see *Frontend Applications*
│   ├── seller/                            # @civilcheck/seller — React 19 + Vite panel (:5173)
│   │   └── src/
│   │       ├── App.jsx, main.jsx          # Router shell + entry
│   │       ├── context/AuthContext.jsx    # Seller session state (owner/expert persona)
│   │       ├── api/                       # auth.api.js, seller.api.js, cloudinaryUpload.js, axios.js
│   │       ├── styles/GlobalStyles.jsx    # Shared design tokens (CSS variables)
│   │       └── pages/
│   │           ├── Login.jsx, Layout.jsx  # OTP login, role-aware routed shell (RM/NAV/PAGES registry)
│   │           ├── owner/                 # Dashboard, MyProperties, AddProperty, Analytics
│   │           ├── expert/                # Dashboard, Requests, Reports, Earnings, Ratings
│   │           ├── seller/                # MyListings, NewListing, Settlements (expert's listing side)
│   │           └── shared/                # Profile, Notifications (both personas)
│   └── buyer/                             # @civilcheck/buyer — Expo/React Native (TypeScript)
│       ├── AGENTS.md                      # Pointer to the exact versioned Expo SDK docs
│       ├── app/                           # expo-router file-based routes
│       │   ├── (tabs)/                    # index (Home), search, alerts, profile
│       │   ├── login.tsx, register.tsx
│       │   ├── reports.tsx, report/[id].tsx
│       │   ├── requests/                  # index, [id], new
│       │   ├── verified/                  # index, [id]
│       │   └── coverage.tsx, notifications.tsx
│       └── src/
│           ├── api/                       # One file per domain — client.ts holds the axios instance
│           ├── screens/                   # Screen components rendered by app/ routes
│           ├── components/                # Button, Card, PropertyCard, BottomSheet, StarRating, ...
│           ├── context/AuthContext.tsx    # JWT in expo-secure-store
│           ├── config/env.ts              # Metro-host API URL derivation
│           └── lib/pushNotifications.ts, pdf.ts, format.ts, errors.ts
├── packages/
│   └── shared/                            # @civilcheck/shared — imported, never duplicated
│       └── src/
│           ├── enums.ts                   # Shared enum constants
│           ├── validation.ts              # Zod schemas (API + all three frontends)
│           └── index.ts
├── docs/                                  # Roadmap, API reference, deployment guide, QA history
├── pnpm-workspace.yaml                    # Workspace globs + nodeLinker: hoisted
└── package.json                           # Root — filtered dev:* / build:api scripts
```

---

## Known Limitations & Roadmap

> The two lists below were last accurate at "Day 2 of 7" and had drifted badly out of date — by Day 8 (see `docs/roadmap.md`) real Razorpay checkout/webhooks/payouts, Cloudinary uploads, DigiLocker KYC, badge-tier commissions, Postgres full-text search, FCM/Msg91/Resend alert delivery, and PDF certificate generation are all built. Replaced 2026-08-03 with the actual current-state constraints from the pre-production QA audit; **updated again 2026-08-06** now that all ten of that audit's findings have fixes applied (`docs/qa-fixes-status-2026-08-04.md`) and a fresh repo check surfaced one new gap (CI/CD).

### Current Constraints (verified 2026-08-06)

1. **CI/CD is fully disabled.** `.github/workflows/deploy.yml` is entirely commented out (`git log` shows this was done deliberately, "for clarity") — no build, test, or deploy runs on push/PR today, contradicting the "shipped" Day 7 status elsewhere in this doc. Needs an explicit decision to re-enable (and Railway/Vercel secrets added) before it does anything.
2. **Real credentials still needed to go fully live** (everything below runs in mock/logging mode without them, and genuinely just needs the env var filled in — no code change): Razorpay/RazorpayX, Firebase (including a real project + iOS push cert for FCM delivery), Cloudinary, Railway/Vercel deploy secrets. (SMS/Msg91 has been removed — nothing to configure there.)
3. **Open product-policy questions**, unchanged since Day 6/8 (`docs/roadmap.md`): GST-invoice inclusive-vs-exclusive reading, and two TDS-rate implementations that disagree with each other (`settlement.service.ts`'s flat 10%/payout vs. `getEarningsStatement`'s annual >Rs 30,000 threshold).
4. **`apps/seller` has no lint/CI tooling configured** (no `eslint.config.js`, no `lint` script) — `apps/admin`, `apps/buyer`, and `apps/api` all do.
5. **Known, accepted limitations** (not bugs — see `docs/roadmap.md`'s "Resuming" note for detail): no minimum-review-count gate before a badge can move on a single 5-star review; the Rs 500 QC strike fine is a bare balance decrement, not a ledger row; the nearest-qualified-seller auto-match can never pick a brand-new specialist with zero prior listings in that tehsil; the integration test suite runs against the shared Neon dev DB rather than an isolated test database (and is consequently slow/timeout-prone over a high-latency connection — a 2026-08-06 run from a low-bandwidth environment saw Jest hook timeouts on DB-heavy Day 8/QC tests; re-run from a normal-latency environment for a trustworthy pass count, last clean one was Day 8 at 26/26 across 7 suites).
6. **A much larger scope change is proposed but not started**: a 2026-08-05 gap analysis (`docs/changes-required-2026-08-05.md`) compares the current build against a new "CivilCheck Partner" role/auth model (docx) and a Master UX Specification — multi-role identity, a third partner type (Property Reporter), RBAC/ABAC + row-level security, a double-entry wallet ledger, and a possible domain-model shift (legal/title verification vs. physical/structural inspection). None of it is built yet; `Seller.partnerRole` is still a single un-enforced-by-enum string field, one role per seller.

### Recently Completed (see `docs/roadmap.md` for the full day-by-day history)

- ✅ **Days 1–7 (product proposal scope):** RBAC, real Razorpay checkout/webhooks/subscriptions, dynamic badge-tier commissions, Postgres full-text search, multi-channel (FCM/email/SMS) buyer alerts, Cloudinary signed uploads, DigiLocker Aadhaar OAuth, real refunds, special-request advance payments + SLA auto-refund, PDF certificates/invoices/statements, weekly settlement cron, spot-check QC + 3-strike penalties, report-outdated flags, reviews with badge auto-recalculation, GitHub Actions CI/CD (written Day 7, since disabled — see Constraints #1), Jest/Supertest integration suite.
- ✅ **Day 8 carry-over:** seller payout ledger for special requests, checkout retry/reopen, nearest-qualified-seller auto-match, subscriber-churn-rate wiring, featured-listing expiry sweep, Msg91 delivery webhook, 2FA enrollment grace period.
- ✅ **2026-08-03:** full pre-production QA audit across all four apps — one auth-bypass-level issue (hardcoded OTP) and two authorization/session gaps (`partnerRole` not enforced server-side; admin sign-out not hitting the backend), plus seven lower-priority findings. See `docs/qa-audit-2026-08-03.md`.
- ✅ **2026-08-04:** all ten QA audit findings fixed — real random hashed OTP with production guard, server-side `partnerRole` enforcement, real admin server-side logout, validated seller bank-detail/listing-price updates, mandatory Owner document enforcement, sanitized error messages, DB-level duplicate-refund prevention, Poppins font + contrast fix on admin panel. Two items (buyer-app release-build config guard, FCM push wiring) are code-complete but still need an out-of-band check — a real release build and real Firebase credentials, respectively. See `docs/qa-fixes-status-2026-08-04.md`.
- ✅ **The standalone `ts_refactoring_plan.md` foundational-architecture pass is fully complete**: pooled `pg.Pool` in `prisma.ts`, typed `Express.Request` actors, zero `: any` anywhere in `apps/api/src`, atomic Prisma decrements, winston structured logging, and per-route rate limiting are all in place today.

### Planned Enhancements (per product proposal)

- Google Maps view with risk-badge-colored pins (the only major product-proposal item not yet built)
- Deployment: Railway (API) + Vercel (panels) — CI/CD workflow exists but is currently disabled (see Constraints #1); dev DB already runs on Neon

---

## Technical Decisions & Trade-offs

### Why PostgreSQL over MongoDB?

- **ACID Compliance:** Purchases, commission splits, refunds, and settlements are financial records — atomicity is non-negotiable
- **Relational Integrity:** Seller → Listing → Purchase → Refund chains require real foreign keys
- **Prisma ORM:** Type-safe queries, migration management, enum-driven state machines

### Why Three Separate Auth Middlewares?

- **Distinct JWT payloads** per role make privilege escalation via token reuse structurally impossible
- **Per-request DB validation** means suspending a seller takes effect immediately — no waiting for token expiry
- **Trade-off:** one extra DB lookup per request, acceptable at pilot scale

### Why Phone-OTP for Buyers (No Password)?

- **Frictionless conversion:** the free "Case Exists?" check must be one step away from a paid unlock
- **India-first:** phone numbers are the universal identity for the target market (including NRI buyers via family)

### Why Marketplace over In-House Verification?

- **Supply scales cheaply:** onboarding local experts beats opening an office in every city
- **Local knowledge:** a tehsil expert knows records a generic AI scan cannot reach
- **Accountability:** sellers are KYC'd, legally bound, and publicly scored — the community of verified experts is the competitive moat

### Why Record Commission at Purchase Time?

- `platformCut` and `sellerCut` are frozen on the purchase row, so historical settlements stay correct even if commission policy changes later

---

## Contributing

Contributions welcome. Follow standard Git workflow:

```bash
git checkout -b feature/feature-name
# Make changes
pnpm --filter @civilcheck/api exec tsc --noEmit   # must be clean before committing
git commit -m "Add: feature description"
git push origin feature/feature-name
# Open pull request
```

**Code Standards:**

- TypeScript strict mode — `tsc --noEmit` must produce zero errors
- Controllers stay thin; business logic belongs in `services/`
- All database access goes through Prisma — no raw SQL
- Validate every external input with Zod, and put the schema in `packages/shared` so the frontends can reuse it
- Avoid `any`; prefer Prisma's generated types (`Prisma.ListingGetPayload<...>`)
- Prisma schema migrations required for DB changes — never edit an applied migration
- Update this README's endpoint list for new routes

---

## License

ISC License

---

## Team

**Zytexa Technology LLP** — CivilCheck Product Team

- **Nishant Sharma** — GitHub: [@Nishant-444](https://github.com/Nishant-444)

Repository: [CivilCheck](https://github.com/zytexa-technology/CivilCheck)

---

## Other Documentation

- **[API Reference](./docs/api-reference.md)** — every endpoint, route by route, with auth/RBAC per route. The full detail behind *API Architecture* above.
- **[Roadmap](./docs/roadmap.md)** — consolidated backend build log: per-day status, technical decisions, and the current open-items list (credentials, product-policy sign-offs, CI/CD).
- **[Admin Panel Plan](./apps/admin/roadmap.md)** / **[Seller Panel Plan](./apps/seller/roadmap.md)** — per-app completion logs and QA findings for `apps/admin` and `apps/seller`.
- **[QA Audit — 2026-08-03](./docs/qa-audit-2026-08-03.md)** — pre-production audit findings (file:line detail). All ten items fixed as of 2026-08-04.
- **[QA Fix Status — 2026-08-04](./docs/qa-fixes-status-2026-08-04.md)** — plain-language writeup of what got fixed, for non-technical readers.
- **[Partner Module Gap Analysis — 2026-08-05](./docs/changes-required-2026-08-05.md)** — what changes against the current build if the new "CivilCheck Partner" role/auth model is adopted. Not started yet.
- **[Deployment Guide](./docs/deployment.md)** — Railway (API) + Vercel (admin/seller) deploy steps.

Removed 2026-08-06 as stale/redundant: the Postman collection (self-admittedly missing 6 of 8 build days' worth of routes, and not worth partially fixing), `docs/architecture.md` (a thinner duplicate of the *System Architecture* section above — README's own former description of it as "deeper" was wrong), and `docs/ts_refactoring_plan.md` (fully absorbed into the codebase, nothing left to track). All three are still recoverable from git history if ever needed.
