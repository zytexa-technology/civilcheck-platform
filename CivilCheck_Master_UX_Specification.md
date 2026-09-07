# CivilCheck — Master UX Product Specification

**Document type:** Production-ready UX / Product / Engineering specification
**Status:** v1.0 — Master baseline (modular, expandable)
**Audience:** UI Designers · Frontend (Next.js / Flutter) · Backend (FastAPI / PostgreSQL) · QA · Product
**Design systems:** Web = TailwindCSS + ShadCN (Radix primitives). Mobile = Material 3 (Flutter). One shared token layer feeds both.

---

## 0. How to read this document

This spec is written as a **living, modular master document**. It is organized in five parts:

- **Part 1 — Foundations.** Product model, roles, Information Architecture, navigation, routing, RBAC, design tokens, component library, responsive rules, accessibility, copy system, universal states, motion, forms, search/filter/sort, notifications. These are *global systems* every screen inherits. Read this once; do not re-specify it per screen.
- **Part 2 — Cross-cutting UX systems.** OTP, Google login, role switching, document upload, wallet, rewards, payment, approval engine, partner approval, professional verification, property verification, analytics. Each is a reusable subsystem referenced by many screens.
- **Part 3 — Journeys, task flows, screen flows.** End-to-end per role.
- **Part 4 — Screen specifications.** Every screen uses the **Standard Screen Template** (§0.3). Dashboard architecture, property preview, buyer report purchase live here.
- **Part 5 — Modularity & roadmap.** How future roles (Builder, Broker, Architect, Surveyor, Bank, Valuer) plug in without refactor.

### 0.1 Modularity contract

Every module is a self-contained vertical slice: `route group → screens → components → API contracts → permissions → states`. A new role or feature is added by (a) registering it in the **Role Registry** (§2.4), (b) adding a **route group**, (c) adding **permission scopes** to the RBAC matrix (§6), (d) reusing existing components. **No global refactor is ever required to add a role.** This contract is the reason the platform is described as "future-ready."

### 0.2 Platform matrix

Four rendering targets, two codebases. Do not build four apps.

| Target | Codebase | Design system | Primary users |
|---|---|---|---|
| Website (marketing + buyer web) | Next.js (App Router, RSC) | Tailwind + ShadCN | Buyer, public |
| Desktop web app | Next.js | Tailwind + ShadCN | Super Admin, Expert, Owner (web) |
| Tablet | Same Next.js (responsive) + Flutter tablet layout | Tailwind / M3 | Reporter (field), Expert |
| Mobile | Flutter | Material 3 | Reporter (field-first), Buyer, Owner |

**Rule:** Web breakpoints are handled by one responsive Next.js app (§9). "Desktop / Tablet / Website" are *breakpoints of the same build*, not separate products. "Mobile" is the Flutter build. Each screen spec states any behaviour that diverges by breakpoint; if it is silent, the responsive rules in §9 apply.

### 0.3 Standard Screen Template

Every screen in Part 4 is documented with exactly these keys:

`Screen Name · Purpose · User Goal · Business Goal · Layout Structure · Header · Navigation · Primary CTA · Secondary CTA · Fields · Buttons · Validation · Permissions · API Required · States · Components · Responsive (Website/Desktop/Tablet/Mobile) · Developer Notes · UX Notes`

Where a key is fully inherited from a Foundation section, the screen references it (e.g. `Validation: inherits §14 + rules below`) instead of duplicating.

---

# PART 1 — FOUNDATIONS

## 1. Product overview & domain model

### 1.1 What CivilCheck is
A property due-diligence marketplace. It converts an unverified property listing into a **trusted, professionally verified CivilCheck Report** that a Buyer can purchase before committing to a transaction. Trust is manufactured through a chained workflow: *evidence capture (Reporter) → professional verification (Expert) → platform governance (Super Admin)*.

### 1.2 Core value loop
1. **Property Owner** registers a property (address, type, documents).
2. **Property Reporter** is assigned / self-assigns, visits the site, captures evidence (photos, measurements, structural observations, document scans) via the field mobile app.
3. **Property Expert** reviews the evidence, performs civil/structural/legal assessment, and issues a **verified report** with a rating.
4. **Super Admin** governs: approves partners, resolves disputes, releases payouts, monitors quality.
5. **Buyer** discovers the property, previews a redacted summary, and **purchases the full report**. Purchase revenue funds Reporter/Expert payouts + platform margin.

### 1.3 Domain entities (PostgreSQL — canonical)
| Entity | Key fields | Notes |
|---|---|---|
| `user` | id, phone, email, google_sub, kyc_status, created_at | One human = one user. Multi-role. |
| `role_assignment` | user_id, role, status(pending/active/suspended), scope | Enables role switching + partner approval. |
| `property` | id, owner_id, address, geo, type, status, listing_visibility | status: draft→submitted→in_inspection→in_review→verified→published→archived |
| `inspection` | id, property_id, reporter_id, status, evidence_manifest | Evidence bundle. |
| `evidence_item` | id, inspection_id, type(photo/doc/measure/note), file_ref, meta, geo, captured_at | Immutable once submitted. |
| `report` | id, property_id, expert_id, rating, sections, status, price, watermark_flag | The sellable artifact. |
| `report_purchase` | id, report_id, buyer_id, amount, payment_ref, access_expiry | Grants buyer access. |
| `wallet` | id, user_id, balance, currency, hold_balance | Reporters/Experts earn; buyers may hold credits. |
| `ledger_entry` | id, wallet_id, type, amount, ref, balance_after | Immutable double-entry. |
| `reward` | id, user_id, type, points, streak, ref | Gamification for Reporters. |
| `payout` | id, user_id, amount, status, method, admin_id | Admin-governed. |
| `verification_case` | id, subject_type(property/professional), subject_id, stage, assignee, decision | Powers approval engine §24. |
| `notification` | id, user_id, channel, type, payload, read_at | In-app/push/email/SMS. |
| `audit_log` | id, actor_id, action, target, before, after, ts | Every state transition. |

### 1.4 Non-negotiable product rules
- Evidence and reports are **immutable after submission**; corrections are new versions, never edits. (Legal defensibility.)
- A **report is a financial + legal artifact**: watermarking, access expiry, and audit are mandatory.
- **One identity, many roles.** Auth is identity-level; capability is role-level (§5, §6).
- Money always moves through the **ledger** (double-entry). No balance is ever mutated directly.

---

## 2. Roles, personas & the Role Registry

### 2.1 Role map
```
Buyer  ─────────────► consumes reports (pays)
CivilCheck Partner ─┬─ Property Owner    → supplies inventory
                    ├─ Property Reporter → supplies evidence (earns)
                    └─ Property Expert   → supplies verification (earns)
Super Admin ────────► governs everything
Future partners: Builder · Broker · Architect · Surveyor · Bank · Valuer
```

### 2.2 Personas (abridged)
- **Buyer "Ravi", 34, first-time buyer.** Anxious about hidden structural/legal defects. Low tolerance for jargon. Mobile-first, will pay for peace of mind. Success = confident go/no-go decision.
- **Property Owner "Sunita", 52.** Wants faster sale, willing to be verified to signal trust. Semi-technical. Wants status visibility, not workflow control.
- **Property Reporter "Imran", 27, field agent.** Uses phone in the field, poor connectivity, one hand busy. Motivated by earnings + streaks. Success = fast capture, get paid.
- **Property Expert "Dr. Nair", 45, structural engineer.** Time-poor, reputation-sensitive. Reviews on tablet/desktop. Success = efficient review, defensible verdict, payout.
- **Super Admin "Ops team".** Governance, quality, fraud, money. Desktop only. Success = throughput + integrity.

### 2.3 Role capability summary
| Capability | Buyer | Owner | Reporter | Expert | Admin |
|---|---|---|---|---|---|
| Browse/preview properties | ✔ | own | assigned | assigned | all |
| Purchase report | ✔ | — | — | — | — |
| List property | — | ✔ | — | — | ✔ |
| Capture evidence | — | — | ✔ | — | — |
| Verify & issue report | — | — | — | ✔ | override |
| Approve partners | — | — | — | — | ✔ |
| Manage payouts | — | — | request | request | ✔ |
| View analytics | own purchases | own props | own earnings | own work | global |

### 2.4 Role Registry (the extensibility engine)
A single config object (`role_registry.ts` web / `role_registry.dart` mobile / `roles` table backend) declares each role's: `key, label, icon, homeRoute, navModel, permissionScopes[], onboardingFlow, verificationRequired`. Adding **Valuer** later = one registry entry + permission scopes + one route group. The shell reads the registry to render nav, routing, and the role switcher — nothing is hardcoded per role.

---

## 3. Information Architecture (IA)

### 3.1 Global IA principle
IA is **role-scoped, not global**. There is one shared shell (auth, notifications, wallet, profile, help) and one role workspace mounted based on the active role. Switching role remounts the workspace, not the shell.

### 3.2 Shared shell (all authenticated users)
```
/ (public marketing) 
/auth  (login · otp · google · role-select)
/app
  ├── /notifications
  ├── /wallet
  ├── /profile        (identity, KYC, connected roles)
  ├── /settings       (security, language, appearance, consent)
  ├── /help           (support, disputes, docs)
  └── /switch-role    (role picker)
```

### 3.3 Role workspaces (mounted under `/app/{role}`)

**Buyer** `/app/buyer`
```
├── /explore              search + map + filters
│   └── /property/:id      preview → purchase
├── /reports              purchased reports library
│   └── /report/:id        full report viewer
├── /saved                shortlists / watchlist
├── /purchases            orders & invoices
└── /wallet (shared)
```

**Property Owner** `/app/owner`
```
├── /properties           my portfolio (grid/list)
│   ├── /new               list a property (wizard)
│   └── /:id               property detail + verification status
│       ├── /documents
│       ├── /inspection    reporter progress (read-only)
│       └── /report        issued report (read-only)
├── /invitations          reporter/expert assignment status
└── /earnings-not-applicable (owners don't earn; hidden)
```

**Property Reporter** `/app/reporter` (field-first, Flutter primary)
```
├── /jobs                 available + assigned inspections
│   └── /:id               inspection workspace (capture)
│       ├── /checklist
│       ├── /capture       camera/measure/doc
│       ├── /review        pre-submit
│       └── /submit
├── /earnings             wallet + rewards + streaks
├── /history              completed inspections
└── /training             how-to, quality standards
```

**Property Expert** `/app/expert`
```
├── /queue                cases awaiting review (SLA sorted)
│   └── /:id               review workspace
│       ├── /evidence      evidence explorer
│       ├── /assessment    scored sections + verdict
│       └── /issue         sign + issue report
├── /issued               my issued reports
├── /earnings             wallet + payouts
└── /credentials          professional verification status
```

**Super Admin** `/app/admin`
```
├── /dashboard            ops KPIs
├── /partners             approvals (owner/reporter/expert)
│   └── /:id               partner case
├── /properties           moderation + verification oversight
├── /reports              QA + publishing
├── /verification         professional + property verification queues
├── /payments             purchases · payouts · disputes · refunds
├── /wallet-admin         ledger, holds, adjustments
├── /rewards-admin        reward rules, fraud
├── /analytics            global BI
├── /users                identity, roles, suspensions
├── /content              CMS: help, categories, pricing
└── /audit                immutable log explorer
```

### 3.4 IA rules
- **Depth ≤ 3 taps** to any primary task from role home.
- Shared shell items are **always reachable** regardless of active role (global top bar / bottom sheet).
- Future roles append a sibling workspace under `/app/{role}` — never nested inside an existing one.

---

## 4. Navigation structure

### 4.1 Navigation models by device
| Device | Model | Chrome |
|---|---|---|
| Desktop web | Persistent left sidebar (collapsible) + top app bar | Sidebar = role workspace nav; top bar = search, role switcher, notifications, wallet chip, avatar |
| Tablet web | Collapsed rail (icons) expandable on hover/tap + top bar | Rail auto-expands >1024px |
| Website (buyer marketing) | Top horizontal nav + footer | Login/CTA right-aligned |
| Mobile (Flutter) | Bottom navigation (≤5 items, role-specific) + top app bar + role switcher in profile sheet | FAB for primary capture action (Reporter) |

### 4.2 Navigation composition rules
- **Bottom nav item count is capped at 5.** If a role needs more, the 5th slot is "More" → sheet.
- Nav items are generated from the Role Registry `navModel`; never hand-authored per screen.
- The **role switcher** is a persistent affordance (top bar avatar menu on web; profile sheet on mobile) present in every workspace (§19 Role Switching UX).
- **Active state** is unambiguous: filled icon + label + 2px accent indicator (web left border; mobile top indicator on M3 NavigationBar).
- Deep links restore full nav context (breadcrumb on web, back stack on mobile).

### 4.3 Per-role bottom nav (mobile)
- Buyer: Explore · Saved · Reports · Wallet · Profile
- Reporter: Jobs · Capture(FAB) · Earnings · History · Profile
- Owner: Properties · Add(+) · Status · Wallet · Profile
- Expert: Queue · Issued · Earnings · Credentials · Profile
- Admin: *desktop-only*; mobile shows read-only dashboard + approvals only.

### 4.4 Breadcrumbs & back
- Web: breadcrumb trail on all detail screens `Workspace / Section / Item`.
- Mobile: Material back + gesture; wizard flows show step progress instead of breadcrumb.

---

## 5. Role-based routing

### 5.1 Route guard chain (evaluated in order)
```
1. isAuthenticated?        → no  → /auth/login (preserve returnTo)
2. hasVerifiedContact?     → no  → /auth/otp
3. hasAnyActiveRole?       → no  → /app/onboarding (role selection)
4. activeRole set?         → no  → /app/switch-role
5. routeRole == activeRole? → no → soft switch prompt or 403 workspace
6. hasPermissionScope(route)? → no → 403 (in-workspace, not full page)
7. resourceOwnership/ABAC ok? → no → 404-as-403 (do not leak existence)
```

### 5.2 Home resolution
On login the router resolves home via Role Registry: single active role → that role's `homeRoute`; multiple active roles → last-used role (persisted) → else `/app/switch-role`.

### 5.3 Route groups (Next.js App Router)
```
app/
  (public)/           marketing, property preview (SSR/ISR, SEO)
  (auth)/             login, otp, google callback, role select
  (buyer)/            middleware: requireRole('buyer')
  (owner)/            requireRole('owner')
  (reporter)/         requireRole('reporter')  (thin — mobile primary)
  (expert)/           requireRole('expert')
  (admin)/            requireRole('admin') + requireStaff()
  (shared)/           wallet, profile, notifications, settings, help
```
Middleware reads the session, resolves `activeRole` + scopes from the JWT, and rejects at the edge before RSC render. **Never trust the client for authorization** — every FastAPI endpoint re-checks (§6.4).

### 5.4 Flutter routing
GoRouter with `redirect` implementing the same guard chain; `ShellRoute` per role workspace; role switch = `context.go(registry[role].homeRoute)` after re-issuing the scoped token.

### 5.5 Deep-link & returnTo
All guards preserve `returnTo`. Post-auth/role-switch, the user lands on the originally requested resource if still permitted; otherwise on role home with a toast explaining the redirect.

---

## 6. Permission handling (RBAC + ABAC)

### 6.1 Model
- **RBAC** = coarse capability by role via **permission scopes** (`property:read`, `report:issue`, `payout:approve`…).
- **ABAC** = fine resource rules layered on top (ownership, assignment, purchase, verification state).
- Effective permission = `scope granted (role) AND attribute check (resource)`.

### 6.2 Scope catalogue (excerpt)
```
auth:*  profile:read/write  role:switch  role:request
property:list  property:read  property:create  property:update:own  property:moderate
inspection:claim  evidence:create  evidence:read:assigned  inspection:submit
report:read:purchased  report:review  report:issue  report:qa  report:publish
purchase:create  purchase:read:own  wallet:read:own  payout:request  payout:approve
partner:approve  professional:verify  property:verify  analytics:read:global  audit:read
```

### 6.3 RBAC matrix (canonical — QA test source)
| Scope | Buyer | Owner | Reporter | Expert | Admin |
|---|---|---|---|---|---|
| property:read | purchased/preview | own | assigned | assigned | all |
| property:create | – | ✔ | – | – | ✔ |
| inspection:claim | – | – | ✔ | – | assign |
| evidence:create | – | – | ✔ | – | – |
| report:review | – | – | – | ✔ | ✔ |
| report:issue | – | – | – | ✔ | override |
| report:read | if purchased | own(final) | – | own issued | all |
| purchase:create | ✔ | – | – | – | – |
| payout:request | – | – | ✔ | ✔ | – |
| payout:approve | – | – | – | – | ✔ |
| partner:approve | – | – | – | – | ✔ |
| professional:verify | – | – | – | – | ✔ |
| analytics:read:global | – | – | – | – | ✔ |

### 6.4 Enforcement layers (defence in depth)
1. **Edge/middleware** (Next.js / GoRouter) — route gate, fast reject.
2. **UI capability gating** — `<Can scope="report:issue">` wrapper hides/disables actions (never the *only* control).
3. **API** — FastAPI dependency `require_scopes()` + row-level ABAC checks; RLS in PostgreSQL as final backstop.
4. **Data** — Postgres Row-Level Security policies on `property`, `report`, `wallet`, `report_purchase`.

### 6.5 UX of denial
- **Hidden** when the user should never see it exists (admin tools for buyers).
- **Disabled + tooltip** when the action exists but is currently not permitted ("Verify your professional credentials to issue reports").
- **403 in-workspace panel** for known-but-forbidden routes (keeps nav, offers path to access).
- **404-as-403** for resources the user must not learn exist (another owner's draft).

---

## 7. Design tokens

Tokens are defined **once** in a platform-neutral JSON (`tokens.json`, Style Dictionary) and transformed to: Tailwind theme (`tailwind.config`), CSS vars (ShadCN), and a Flutter `ThemeData` / Material 3 `ColorScheme`. **Never hardcode a hex in a component.**

### 7.1 Color — semantic (light)
| Token | Value | Use |
|---|---|---|
| `--color-bg` | #FFFFFF | app background |
| `--color-surface` | #F7F8FA | cards, sheets |
| `--color-surface-2` | #EEF1F5 | nested |
| `--color-border` | #E2E6EC | dividers |
| `--color-fg` | #0E1726 | primary text |
| `--color-fg-muted` | #5B6472 | secondary text |
| `--color-primary` | #1E5EFF | brand, primary CTA |
| `--color-primary-fg` | #FFFFFF | on-primary |
| `--color-trust` | #0F9D58 | verified / success |
| `--color-warning` | #F5A623 | pending / caution |
| `--color-danger` | #E5484D | error / destructive |
| `--color-info` | #2AA9E0 | info |
| `--color-focus` | #1E5EFF@40% | focus ring |

Dark theme: same token keys, remapped values (`--color-bg #0B0F17`, `--color-surface #131A26`, `--color-fg #E7ECF3`…). Components consume tokens, so dark mode is free.

Domain status colors (used in badges everywhere): `draft`=neutral, `submitted`=info, `in_inspection`=warning, `in_review`=info, `verified`=trust, `rejected`=danger, `published`=primary, `archived`=muted.

### 7.2 Typography
Web: Inter (UI), IBM Plex Mono (IDs, amounts). Mobile: Roboto Flex (M3) / Inter. Scale (rem / sp):
`display 32 · h1 28 · h2 24 · h3 20 · title 18 · body-lg 16 · body 14 · caption 12 · overline 11`. Line-height 1.4 body, 1.2 headings. Weights 400/500/600/700.

### 7.3 Spacing (4pt base)
`0,4,8,12,16,20,24,32,40,48,64` → tokens `space-0..space-10`. Layout gutters: mobile 16, tablet 24, desktop 32.

### 7.4 Radius / elevation / motion
- Radius: `sm 6 · md 10 · lg 16 · pill 999`.
- Elevation (web shadow / M3 tonal): `e0 none · e1 card · e2 sheet · e3 dialog · e4 menu`.
- Motion tokens: `dur-fast 120ms · dur-base 200ms · dur-slow 320ms`; easing `standard cubic-bezier(.2,0,0,1)`, `emphasized (.2,0,0,1)`, `exit (.4,0,1,1)`.

### 7.5 Breakpoints
`xs <480 · sm 480 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. Content max-width 1280 (admin 1440).

### 7.6 Z-index scale
`base 0 · dropdown 1000 · sticky 1100 · overlay 1200 · modal 1300 · toast 1400 · tooltip 1500`.

### 7.7 Iconography
Web: Lucide (via ShadCN). Mobile: Material Symbols. Same semantic names mapped in an icon registry so a "verified" icon is identical across platforms.

---

## 8. Component library (shared design system)

Naming maps ShadCN (web) ↔ Material 3 (Flutter). One component contract, two implementations.

### 8.1 Primitives
| Component | Web (ShadCN/Radix) | Mobile (M3) | Notes |
|---|---|---|---|
| Button | Button | FilledButton/Outlined/Text | variants: primary, secondary, ghost, destructive, link; sizes sm/md/lg; states default/hover/active/focus/disabled/loading |
| Input | Input | TextField | label, helper, error, prefix/suffix, char count |
| Select | Select | DropdownMenu | searchable variant |
| Combobox | Command | Autocomplete | async search |
| Checkbox/Radio/Switch | ✔ | ✔ | 44px min touch |
| Textarea | Textarea | TextField(multiline) | autosize |
| DatePicker | Popover+Calendar | DatePicker | range variant |
| FileUpload | Custom (Dropzone) | Custom | §18 doc upload |
| OTPInput | InputOTP | Pinput | §16 |
| Badge/Chip | Badge | Chip | status colors §7.1 |
| Avatar | Avatar | CircleAvatar | fallback initials |
| Tag/Filter chip | Toggle | FilterChip | §26 |

### 8.2 Composites
Card, ListItem, DataTable (sortable/filterable/paginated/selectable), Tabs, Accordion, Stepper/Wizard, Breadcrumb, Pagination, Toolbar, SearchBar, FilterPanel, EmptyState, ErrorState, Skeleton, ProgressBar/Ring, StatCard/KPI, Timeline (status history), MapView, Gallery/Lightbox, PdfViewer, SignaturePad, RatingScore, CurrencyDisplay, WalletChip, NotificationItem, Toast/Snackbar, Dialog/AlertDialog, Sheet/BottomSheet, Drawer, Tooltip, Popover, ContextMenu, CommandPalette (web admin), RoleSwitcher, VerificationBadge, ReportSectionCard, EvidenceTile, PayoutRow, LedgerRow.

### 8.3 Component states (universal contract)
Every interactive component must implement: `default · hover(web) · focus-visible · active/pressed · disabled · loading · error · read-only · selected`. QA verifies all nine where applicable.

### 8.4 Composition rules
- Components accept tokens only (no literal styles).
- Every actionable component exposes `aria-*`/semantics + testable `data-testid`.
- Async components accept `state: 'idle'|'loading'|'success'|'error'|'empty'` and render the matching universal state (§11).

---

## 9. Responsive behaviour

### 9.1 Layout strategy per breakpoint
| Zone | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Global nav | Bottom nav + top bar | Rail (collapsed) + top bar | Sidebar (expanded) + top bar |
| Content | Single column, stacked | 2-col where useful | 2–3 col, master–detail |
| Tables | Card list (stacked rows) | Horizontal scroll or condensed table | Full DataTable |
| Filters | Bottom sheet | Slide-over panel | Inline left filter column |
| Detail + list | Push navigation (full screen) | Split view optional | Persistent master–detail |
| Primary action | FAB / sticky bottom bar | Sticky bar | Toolbar button |
| Modals | Full-screen sheet | Centered dialog | Centered dialog |

### 9.2 Rules
- **Content-first reflow**: reorder by priority, not by hiding. Nothing critical is desktop-only except Admin bulk ops (documented per screen).
- Touch targets ≥ 44×44; hover-only affordances always have a tap/focus equivalent.
- Forms: single column on mobile; 2-column groupings allowed ≥ md for related fields only.
- Images/reports use responsive `srcset` (web) / cached resolutions (Flutter); report PDF viewer paginates on mobile, continuous scroll on desktop.
- Test matrix widths: 360, 390, 768, 834, 1024, 1280, 1440, 1920.

---

## 10. Accessibility (WCAG 2.2 AA target)

### 10.1 Global requirements
- **Contrast** ≥ 4.5:1 text, 3:1 large text/icons; status never conveyed by color alone (icon + label always accompany status color).
- **Keyboard**: full operability, visible focus ring (`--color-focus`), logical tab order, no traps; skip-to-content link (web).
- **Screen readers**: semantic HTML / Flutter `Semantics`; live regions for async updates (toasts, upload progress, OTP resend timer); form errors associated via `aria-describedby`.
- **Motion**: honour `prefers-reduced-motion` / disable-animations OS setting → replace transitions with instant state (§13).
- **Touch/target** ≥ 44px; spacing ≥ 8px between targets.
- **Zoom/text scale**: reflow to 200% (web) and respect OS font scaling (mobile) without clipping.
- **Language**: `lang` set; RTL-ready layout (logical properties, no hardcoded left/right).

### 10.2 Domain-specific a11y
- Report score/rating announced as text ("Structural safety: 4 of 5, good") not just a colored ring.
- Evidence gallery images require `alt`/labels (auto from checklist item + reporter note).
- OTP + payment flows: errors announced, timers announced politely, never steal focus mid-entry.
- Maps: provide a list-view equivalent of map results.

### 10.3 QA
Automated (axe / accessibility_test.dart) in CI + manual screen-reader pass (VoiceOver, TalkBack, NVDA) on every critical flow (auth, purchase, capture, issue report).

---

## 11. Universal states (Loading · Error · Empty · Success)

Every data-bound view declares behaviour for all four. Screen specs list only deviations.

### 11.1 Loading states
| Context | Pattern |
|---|---|
| First page load | Skeleton matching final layout (never spinner-only for content) |
| List/table | Skeleton rows (5–8) then progressive fill |
| Inline action (button) | Button → spinner + disabled + label "Saving…"; keep width to avoid shift |
| Background/optimistic | Optimistic UI + subtle progress; reconcile on response |
| Long job (report generation, payout) | Progress with stage labels + ETA + cancellable where safe |
| Image/PDF | Blurhash/placeholder → fade-in |
| Infinite scroll | Bottom skeleton + "Loading more" live region |

Rules: skeletons ≤ 1 tone shimmer; no layout shift on load (reserve space); if load < 300ms show nothing (avoid flash); after 10s show "Still working…" reassurance; after 30s offer retry.

### 11.2 Error states
Taxonomy → treatment:
| Type | Treatment |
|---|---|
| Field validation | Inline under field, red, icon + message, on blur/submit (§14) |
| Form-level | Summary banner top of form + focus first error |
| Network/offline | Non-blocking toast + retry; offline banner persists; queue writes (Reporter) |
| Server 5xx | Full-panel error state with illustration, "Something went wrong", Retry + support id |
| Permission 403 | In-workspace 403 panel (§6.5) |
| Not found 404 | Friendly 404 with path back to role home |
| Payment failure | Dedicated recovery screen (§23) — reason + retry + alternate method, never lose cart |
| Conflict 409 (stale) | "This changed since you opened it" → reload/merge |
| Upload failure | Per-file error + retry that file only (§18) |

Every error: plain language, cause + next action, correlation id for support, never blame the user.

### 11.3 Empty states
Three flavours: **first-use** (educational + primary CTA to create), **no-results** (search/filter — offer to clear filters), **cleared** (all done — positive). Each: illustration/icon, one-line headline, one-line help, primary action. Examples:
- Buyer Saved empty: "Nothing saved yet — tap ♥ on a property to shortlist it." CTA: Explore.
- Reporter Jobs empty: "No jobs nearby right now. We'll notify you." CTA: Enable notifications.
- Expert Queue empty: "Queue clear. Nice work." (celebratory, no CTA).
- Admin approvals empty: "No pending partner approvals." (calm neutral).

### 11.4 Success states
| Scale | Pattern |
|---|---|
| Micro (save, copy) | Toast/snackbar 3–4s, checkmark micro-anim |
| Task complete (submit inspection, issue report, purchase) | Confirmation screen: what happened, what's next, receipt/reference, primary next-step CTA |
| Milestone (first payout, streak) | Reward moment (§20) — modal/confetti (respect reduced-motion) |
Success is never a dead end: always route forward (view report, back to queue, download invoice).

---

## 12. Micro-interactions & animation

### 12.1 Micro-interaction inventory
| Element | Interaction | Feedback |
|---|---|---|
| Button | press | scale 0.98, ripple (M3) / bg darken, 120ms |
| Toggle/switch | change | thumb slide 200ms + haptic (mobile) |
| Checkbox | check | draw-in tick 150ms |
| Save ♥ | tap | heart pop + fill, haptic light |
| Copy id/amount | tap | icon → check 1s + toast |
| Tab switch | select | underline slide 200ms |
| Card | hover(web) | elevation e1→e2, 120ms |
| Upload | drop | dashed border pulse + file count bump |
| OTP | full entry | auto-submit + subtle success flash |
| Wallet balance | update | count-up animation to new value |
| Reward point | earn | +N chip floats up + haptic |
| Pull-to-refresh (mobile) | pull | M3 spinner + release snap |
| Status change | transition | badge cross-fades old→new color |

### 12.2 Animation principles
- **Purposeful**: motion explains change (where something came from/went), never decorates.
- **Fast & interruptible**: 120–320ms; user input always cancels.
- **Consistent easing** from tokens (§7.4). Enter emphasized, exit shorter.
- **Shared-element transitions** for list→detail (web view-transitions API / Flutter Hero) on property card → property detail, evidence tile → lightbox.
- **Choreography**: stagger list items 20–30ms; never animate more than one focal element at once.
- **Reduced motion**: all replaced by instant opacity/none; count-ups jump to final value.

### 12.3 Loading→content transition
Skeleton cross-fades to content (150ms), no pop-in. Images fade from placeholder. Numbers count up only on first appearance, not on every re-render.

---

## 13. UX copy system (voice, tone, patterns)

### 13.1 Voice
Trustworthy, plain, calm, expert-but-human. CivilCheck sells *confidence*; copy must reduce anxiety, never inflate claims. Avoid legalese in the UI (put it in linked docs). Avoid hype ("amazing", "best"). Prefer verbs.

### 13.2 Tone by context
- Onboarding: warm, guiding.
- Errors: neutral, solution-first, blameless.
- Money/legal: precise, unambiguous, includes exact amounts + refs.
- Success: brief, forward-looking.
- Empty: encouraging.

### 13.3 Reusable strings (source of truth for i18n)
| Key | English |
|---|---|
| cta.getReport | Get the CivilCheck Report |
| cta.previewReport | Preview report |
| cta.startInspection | Start inspection |
| cta.issueReport | Issue verified report |
| status.verified | Verified by CivilCheck |
| status.pending | Verification in progress |
| otp.sent | We sent a 6-digit code to {contact} |
| otp.resendIn | Resend code in {seconds}s |
| pay.success | Payment successful — your report is ready |
| err.generic | Something went wrong on our side. Try again — ref {id} |
| err.network | You're offline. We'll retry automatically. |
| empty.savedBuyer | Nothing saved yet |
| wallet.available | Available balance |
| payout.requested | Payout requested — usually 2–3 business days |
| verify.needCreds | Verify your professional credentials to continue |

### 13.4 Copy rules
- Numbers: currency always with symbol + code on money screens (₹1,200 INR). Dates human ("Issued 3 Jul 2025"). Relative time in feeds ("2h ago") with absolute on hover/long-press.
- Sentence case for everything except brand.
- Buttons = action verbs ("Purchase report", not "Submit").
- Never say "click" (say "select"/"tap"/"choose") — cross-platform.
- All strings live in `i18n/en.json`; no literal UI strings in code. RTL + pluralization ready.

---

## 14. Forms & validation framework

### 14.1 Form architecture
- Web: React Hook Form + Zod schema (shared with TS types). Mobile: Flutter `Form` + a Dart validator mirroring the same rules. Server: **Pydantic models in FastAPI are the source of truth**; client schemas must match. QA verifies parity.
- One field = label + control + helper + error slot (reserved height, no shift).
- Group related fields; long forms → Stepper/Wizard with per-step validation + save-as-draft.

### 14.2 Validation timing
- Validate **on blur** for individual fields; **on submit** for the whole form; **on change** only after first error (to show recovery).
- Async validation (phone/email uniqueness, coupon, IFSC) is debounced 400ms with inline spinner → check/error.
- Submit disabled only when the form has never been valid; otherwise enabled and validates on press (so users get error feedback).

### 14.3 Validation rules catalogue (canonical)
| Field | Rule | Message |
|---|---|---|
| Phone | E.164, country-aware, unique for signup | "Enter a valid mobile number" |
| Email | RFC + MX-lenient, unique | "Enter a valid email" |
| OTP | 6 digits, expiry, ≤5 attempts | "Incorrect code. {n} attempts left" |
| Full name | 2–60 chars, letters/space/'- | "Enter your full name" |
| Property address | required, geocodable | "Select an address from suggestions" |
| Pincode | 6 digits (IN) | "Enter a valid 6-digit PIN" |
| Property type | enum required | "Choose a property type" |
| Document file | pdf/jpg/png, ≤15MB, ≥1 required per doc slot | "Upload a PDF or image under 15 MB" |
| Report price | > 0, ≤ cap, 2dp | "Enter a valid price" |
| Bank account | numeric 9–18 | "Check the account number" |
| IFSC | regex `^[A-Z]{4}0[A-Z0-9]{6}$` | "Enter a valid IFSC" |
| Payout amount | ≤ available balance, ≥ min | "You can withdraw up to {balance}" |
| Rating/score | 1–5 integer per section, all required to issue | "Score every section to issue" |
| Coupon | exists, active, applicable | "This code isn't valid for this report" |
| Password (admin) | ≥12, complexity, breached-check | "Use 12+ chars with mixed types" |

### 14.4 Cross-field & business validation
- Payout: `amount ≤ wallet.available AND kyc == verified AND bank_verified`.
- Issue report: `all sections scored AND evidence_complete AND expert.verified AND no open dispute`.
- Purchase: `report.published AND buyer != owner (or allowed) AND payment authorized`.
- Errors from these appear as **form-level banners** with the specific blocking condition + a fix link.

### 14.5 Autosave & recovery
Wizards (list property, inspection, assessment) autosave draft every 5s + on step change; on reconnect, restore. "Unsaved changes" guard on navigate-away.

---

## 15. Search, filter, sort

### 15.1 Search behaviour
- **Global search** (web top bar / mobile search screen): scoped to active role. Buyer → properties; Admin → users/properties/reports/payments (typed tabs). Command palette (⌘K) for Admin.
- Input: debounce 300ms, min 2 chars, show recent + suggested; async results with skeleton; highlight matched terms.
- Empty query → recent searches + popular. No results → "no matches" empty state + "clear"/"broaden" suggestions + nearest alternatives.
- Property search supports **text + map + geo ("near me")**; results sync between list and map; keyboard accessible with list fallback for map.
- Errors: search failure keeps last results + retry chip; never blanks the screen.
- Server: full-text (Postgres `tsvector` + trigram) + geo (PostGIS) via FastAPI; paginate cursor-based.

### 15.2 Filter behaviour
- Filters are **role + context specific**, declared as a schema (type, operator, options) so the FilterPanel renders generically.
- Buyer property filters: price range, property type, city/locality, verification status, report availability, rating, bedrooms, area, age.
- Admin filters: status, role, date range, assignee, SLA breach, flagged.
- UX: desktop inline left column; tablet slide-over; mobile bottom sheet. Applied filters shown as **removable chips** above results with a count + "Clear all". Filter changes update results live (or "Apply" on mobile sheet to avoid churn). URL-encoded (web) so filters are shareable/bookmarkable and survive refresh; persisted per user.
- Multi-select facets show result counts; disabled facets that would yield 0 results are dimmed, not hidden.

### 15.3 Sort behaviour
- Sort control = single select (mobile) / dropdown or clickable column headers (web table).
- Default sorts by context: Buyer explore = Relevance; Reporter jobs = Nearest/Newest; Expert queue = SLA-urgency; Admin lists = Newest; Reports = Rating/Price.
- Options per list: relevance, price ↑/↓, date ↑/↓, rating, distance, SLA. Active sort shown with direction arrow; announced to SR.
- Sort + filter + search compose and are all reflected in the URL/query state; pagination resets on change.

---

## 16. Notification behaviour

### 16.1 Channels
In-app (notification center + toast), Push (FCM — mobile/web), Email, SMS. Each notification type declares allowed + default channels; user controls per-category in Settings.

### 16.2 Type → channel matrix (excerpt)
| Event | In-app | Push | Email | SMS |
|---|---|---|---|---|
| OTP | – | – | – | ✔(required) |
| Partner approved/rejected | ✔ | ✔ | ✔ | – |
| Job assigned (Reporter) | ✔ | ✔ | – | opt |
| Inspection submitted (Owner/Expert) | ✔ | ✔ | ✔ | – |
| Report issued (Owner/Buyer if watching) | ✔ | ✔ | ✔ | – |
| Report purchased (Reporter/Expert earn) | ✔ | ✔ | – | – |
| Payout status | ✔ | ✔ | ✔ | – |
| Payment success/failure (Buyer) | ✔ | ✔ | ✔ | opt |
| Dispute opened/resolved | ✔ | ✔ | ✔ | – |
| Reward/streak | ✔ | ✔ | – | – |
| SLA breach (Expert/Admin) | ✔ | ✔ | ✔ | – |

### 16.3 UX rules
- **Notification center**: grouped by day, unread dot + bold, filter by type, "mark all read", bulk actions; each item = icon + title + snippet + relative time + deep link to source.
- **Toast/snackbar**: transient (4s), max 1 stacked at a time (queue), action optional ("View"), never for critical unrecoverable info.
- **Badges**: nav bell shows unread count (99+ cap); role switcher shows per-role pending counts (§19).
- Real-time via WebSocket/SSE (web) + FCM (mobile); optimistic read state; debounce noisy events (batch "3 new jobs nearby").
- Respect quiet hours + per-category mute; OTP/security always deliverable.
- Accessibility: new in-app notifications announced politely, not assertively (except security).

---

# PART 2 — CROSS-CUTTING UX SYSTEMS

Each subsystem is reused across many screens. Screen specs reference these instead of re-describing them.

## 17. OTP UX

**Purpose:** Verify contact ownership for passwordless auth + sensitive actions (payout, role request).
**Flow:** Enter phone/email → request OTP → 6-digit entry → verify → continue.
**UX rules:**
- 6 separate boxes (InputOTP/Pinput), auto-advance, paste-fill all boxes, backspace moves back, numeric keypad on mobile, `autocomplete="one-time-code"` + SMS autofill (iOS/Android).
- **Auto-submit** when 6th digit entered; show inline verifying spinner.
- Resend disabled with countdown (default 30s), announced to SR; after 3 resends escalate ("Still not received? Try email / contact support").
- Attempts: max 5 wrong → lock 15 min with clear message + support path. Rate-limit send (per-number cooldown) surfaced as "Please wait {t}".
- Expiry 5 min; expired code → "Code expired, we sent a new one" auto-resend on request.
- Errors inline under boxes; wrong code shakes boxes (reduced-motion → red border only) + attempts remaining.
- Edit contact link ("Wrong number?") returns to previous step preserving entry.
**States:** idle · sending · sent(countdown) · verifying · error(wrong/expired/locked) · success.
**API:** `POST /auth/otp/request`, `POST /auth/otp/verify`. Never reveal whether contact exists (uniform response).
**Accessibility:** timer + errors in live region; focus starts on first box; do not steal focus on auto-resend.

## 18. Document & evidence upload UX

**Purpose:** Reliable capture/upload of legal docs (Owner), evidence (Reporter), credentials (Expert), KYC.
**UX rules:**
- Entry: drag-drop (web) + file picker + camera/gallery (mobile). Per-slot uploaders when specific docs are required (e.g., "Title deed", "Approved plan").
- Accepted types + size shown up-front; validate before upload; reject with reason.
- **Per-file lifecycle**: queued → uploading (determinate % + cancel) → processing (virus scan, thumbnail, OCR) → done (thumbnail + name + size) → error(retry that file). Multiple files upload in parallel (cap 3 concurrent) with overall progress.
- **Resumable / chunked** uploads (tus or S3 multipart) for large field photos on poor connectivity; **offline queue** for Reporter — captures stored locally, auto-sync when online, with sync status per item.
- Image capture: in-app camera with checklist overlay + auto geo/timestamp EXIF; blur/quality warning → prompt retake.
- Preview: tap to lightbox/PDF preview; reorder; delete (soft, before submit); replace.
- Evidence is **immutable after inspection submit** — UI switches to read-only; corrections require a new evidence version.
- Security: signed upload URLs, MIME sniff server-side, malware scan, EXIF strip on buyer-facing images, watermark on report images.
**States:** empty · dragover · queued · uploading · processing · success · error · offline-queued · read-only.
**API:** `POST /uploads/sign`, `PUT signed-url`, `POST /evidence`, `GET /uploads/:id`. 
**Accessibility:** progress in live region; each file row keyboard-removable; drag-drop has button fallback.

## 19. Role switching UX

**Purpose:** One identity, multiple roles; switch context without re-login.
**UX rules:**
- **Affordance:** avatar menu (web top bar) / profile bottom sheet (mobile) → "Switch role" with the list of the user's **active** roles, current role marked, per-role pending-count badges.
- Switching: confirm if there are unsaved changes; else instant → re-issue **role-scoped token** → route to that role's `homeRoute` → toast "Switched to {role}". Persist last-used role.
- Roles the user doesn't have yet appear under "Become a partner" → role request flow (→ §21 partner approval). Pending role shows "Under review" (non-switchable) with status.
- Suspended role appears disabled with reason + appeal link.
- Nav, theme accent (subtle per-role hue optional), and permissions all remount on switch; shared shell (wallet/profile/notifications) persists.
- Deep-link to a resource requiring a different owned role → offer one-tap switch ("This is in your Owner workspace — switch?").
**States:** single-role(no switcher shown, or shown with "add role") · multi-role · pending-role · suspended-role · switching.
**API:** `GET /me/roles`, `POST /session/active-role` (returns new scoped token).
**Security:** switching never elevates privilege beyond granted active roles; every switch audited.

## 20. Wallet & rewards UX

### 20.1 Wallet
**Purpose:** Show earnings (Reporter/Expert), holds, and enable payouts; show buyer credits if used.
**UX:** Header = **Available balance** (large, count-up on change) + "On hold" + currency. Tabs: Overview · Transactions · Payouts · Payment methods.
- Transactions = ledger rows: type icon, description, +/- amount (color-coded, never color-only), running balance, ref, timestamp; filter by type/date; export CSV.
- **On-hold** explained inline ("Held until buyer's refund window closes — releases {date}").
- Primary CTA: **Request payout** (§21.2). Empty: "No earnings yet — complete an inspection to start earning."
- Every amount is derived from the immutable ledger; UI never computes balances client-side.
**States:** loading · funded · empty · payout-in-progress · hold-only · error.
**API:** `GET /wallet`, `GET /wallet/transactions`, `POST /payouts`, `GET /payouts`.

### 20.2 Rewards (Reporter gamification)
**Purpose:** Motivate quality + volume for Reporters.
**UX:** Points, streaks (consecutive active days), badges/tiers (Bronze→Platinum), progress ring to next tier, this-week leaderboard (opt-in, privacy-safe). Earning a reward triggers a **reward moment** (chip float + haptic; tier-up = modal + confetti, reduced-motion safe). Rewards can convert to wallet bonus or perks per admin rules.
- Anti-abuse: rewards tied to *verified* inspections only (post-Expert approval); fraud flags hide points pending review with neutral copy.
**States:** no-activity · earning · tier-up · flagged-review.
**API:** `GET /rewards`, `GET /rewards/leaderboard`.

## 21. Approval engine, partner approval, professional & property verification

### 21.1 Generic approval engine (reused everywhere)
A `verification_case` moves through configurable **stages** with an **assignee**, **SLA**, **decision (approve/reject/request-changes)**, **reason codes**, and full audit. Used for: partner approval, professional verification, property verification, report QA, payout approval, disputes/refunds. One engine, many subjects — this is the modular core of governance.
**Common UX:** case header (subject summary, status timeline), evidence/context panel, decision panel (approve / reject / request changes + required reason + note), SLA countdown, audit trail. Reject/request-changes **requires** a reason (from a controlled list + free text) that is shown to the subject.

### 21.2 Partner approval UX (Admin ↔ Owner/Reporter/Expert)
**Applicant side:** role request → onboarding form (role-specific: Owner = basic + property intent; Reporter = ID + area + optional test; Expert = credentials §21.3) → submit → **"Under review"** status screen with checklist of what's pending, expected time, and ability to add missing docs. Notifications on decision. On reject: reason + "what to fix" + resubmit CTA.
**Admin side:** `/app/admin/partners` queue (filter by role/status/SLA) → case → review docs → approve (role becomes active + notify + welcome) / reject (reason) / request more info (partial, keeps case open). Bulk approve for low-risk. Every decision audited; four-eyes optional for Expert.
**States:** draft · submitted · under-review · info-requested · approved · rejected · suspended.
**API:** `POST /roles/request`, `GET /admin/partners`, `POST /admin/partners/:id/decision`.

### 21.3 Professional verification UX (Expert credentials / KYC)
**Purpose:** Only genuine, licensed professionals can issue reports.
**UX (applicant):** stepper — Identity (govt ID + selfie/liveness) → Professional credentials (license/registration no., issuing body, upload certificate, specialization, years) → Declarations/consent → Review → Submit. Each doc via §18 uploader with validation. Status screen shows per-item verification state (ID ✔, License pending). Verified → **VerificationBadge** on Expert profile + `report:issue` scope unlocked. Expiry-aware (license expiry → renewal reminder + temporary block on issue).
**UX (admin):** verification queue → check each credential (with external registry link if available), approve/reject per item, overall decision, reason on reject.
**States:** unverified · in-progress · partially-verified · verified · expired · rejected.
**API:** `POST /verification/professional`, `GET/POST /admin/verification/professional/:id`.
**Gate:** issuing a report checks `expert.verified && !expired` → else disabled CTA with fix link.

### 21.4 Property verification UX (the report pipeline)
**Purpose:** Turn a listing into a verified report through the chained workflow.
**Pipeline & who acts:**
```
draft(Owner) → submitted(Owner) → assigned(Admin/auto→Reporter)
 → in_inspection(Reporter captures) → inspection_submitted
 → in_review(Expert assesses) → [request_changes→Reporter] 
 → report_issued(Expert) → qa(Admin, optional) → published → (archived)
```
- **Owner view:** read-only status timeline with current stage, ETA, and who's acting; can respond to info requests; cannot alter evidence.
- **Reporter view:** checklist-driven capture (§18), progress %, submit gate (all required items present + quality checks).
- **Expert view:** evidence explorer + scored assessment sections (structural, legal/title, civil quality, amenities, risk) → verdict + overall rating → sign + issue. Can request changes (bounces to Reporter with notes).
- **Admin view:** oversight, reassignment, QA, publish, dispute handling.
- Each transition is audited, notified, and SLA-tracked; visible as a **status Timeline component** reused on all four role views.
**States:** every pipeline node above + rejected/on-hold/disputed.
**API:** `POST /properties`, `POST /properties/:id/submit`, `POST /inspections`, `POST /inspections/:id/submit`, `POST /reports`, `POST /reports/:id/issue`, `POST /reports/:id/publish`, `POST /verification-cases/:id/transition`.

## 22. Analytics UX

**Purpose:** Give each role decision-useful metrics; give Admin global BI.
**Principle:** analytics is role-scoped (own data) except Admin (global). Every dashboard = KPI row + trend charts + breakdown table + date-range + export.
- **Buyer:** lightweight — reports purchased, saved, spend, price trends in watched localities.
- **Owner:** property views, preview-to-purchase conversion of their reports, verification turnaround, buyer interest.
- **Reporter:** inspections done, approval rate, avg time, earnings trend, streak, ranking.
- **Expert:** cases handled, avg review time, approval/rework rate, earnings, SLA adherence.
- **Admin:** funnel (listing→inspection→report→purchase), GMV, payouts, partner supply/demand, SLA breaches, dispute/refund rate, fraud signals, cohort retention, geo heatmap.
**UX rules:** charts have accessible table equivalents; loading = skeleton chart; empty = "Not enough data yet"; numbers formatted per §13; date range persists; export CSV/PDF. Never expose PII in aggregate views.
**API:** `GET /analytics/{scope}?range=`. Precomputed rollups (materialized views / OLAP) for Admin.

## 23. Google login UX

**Purpose:** Frictionless federated sign-in/up alongside OTP.
**UX rules:**
- Button follows Google branding guidelines (official "Sign in with Google", correct logo, min size, not restyled beyond spec). Placed above/below OTP with "or" divider.
- Web: One Tap / OAuth popup (Authorization Code + PKCE); Mobile: Google Sign-In SDK. Never handle Google passwords.
- Flow: tap → Google consent → callback → **account link resolution**:
  - New user → create identity, prefill name/email/avatar, go to role selection/onboarding.
  - Existing email match → link `google_sub` to existing user (confirm ownership if email unverified) → home.
  - Missing phone (needed for OTP-gated actions like payout) → prompt to add + verify phone once, not blocking browsing/purchase.
- Loading: button → spinner "Connecting to Google…"; popup-blocked → inline hint + retry.
- Errors: cancelled (silent return), network (retry), email conflict (explain + offer OTP login to merge), disabled account (support path).
**States:** idle · connecting · linking · needs-phone · success · error(cancelled/conflict/blocked).
**API:** `POST /auth/google` (id_token/code) → session; `POST /auth/link`.
**Accessibility:** button is a real button with label; popup focus returns to app on close.

## 24. Payment UX (Buyer report purchase + platform payments)

**Purpose:** Convert intent into a paid, access-granted report with zero anxiety; handle failures gracefully.
**Checkout flow:** Property preview → "Get report ₹X" → order summary (report scope, price, taxes, coupon) → payment method (UPI, card, netbanking, wallet credits) → authorize (gateway / UPI intent / 3DS) → **success screen** (access granted, receipt, "View report" + download) or **failure recovery**.
**UX rules:**
- Price transparency before payment: base + tax + discount + total; no surprise fees at the end.
- Coupon field with async validation (§14.2).
- Method selection remembers last used; wallet credits shown if any ("Pay ₹200 credits + ₹1000").
- **Idempotent**: one order id; retries never double-charge; back button never re-submits.
- Authorization states: authorizing → processing (webhook confirm) → granted. Never grant access before webhook/settlement confirmation; show honest "confirming payment…" if async.
- **Failure recovery screen**: exact reason (declined, insufficient, timeout, cancelled), cart preserved, Retry + "try another method" + support ref. Pending/ambiguous → "We're confirming — you'll get access + email shortly" (no double pay).
- Refund/dispute path visible in Purchases (§ buyer purchases): request refund within window → creates dispute case (§21.1).
- Receipts/invoices downloadable (PDF), emailed. GST/tax fields where applicable.
- Security/compliance: PCI via gateway tokenization (no PAN stored), amounts server-authoritative, signed webhooks, full audit + ledger entries for revenue split (buyer pay → platform → reporter/expert payouts on hold).
**States:** summary · applying-coupon · selecting-method · authorizing · processing · success · failed · pending · refund-requested.
**API:** `POST /orders`, `POST /orders/:id/pay`, webhook `POST /payments/webhook`, `GET /orders/:id`, `POST /orders/:id/refund`.
**Accessibility:** amount + status announced; never trap during 3DS; timeout has clear recovery.

---

# PART 3 — JOURNEYS, TASK FLOWS, SCREEN FLOWS

Notation: `▸` step, `→` transition, `⟂` decision, `⟳` loop, `⊗` failure branch.

## 25. End-to-end user journeys

### 25.1 Buyer journey
Discover need → **Land on public property/preview (SEO)** → sign in (Google/OTP) ⟂ browse anonymously → Explore/search/filter → open Property Preview (redacted) → decide → **Purchase report** (Payment §24) ⊗ fail→recover → **Report viewer** (full) → save/share/decide → optionally request more reports / refund. Emotional arc: anxiety → curiosity → trust → confidence.

### 25.2 Property Owner journey
Sign up → become Owner (partner approval §21.2, light) → **List property** (wizard + docs) → submit for verification → track status timeline (read-only) → respond to info requests → report issued & published → see buyer interest/analytics → (future: manage multiple properties).

### 25.3 Property Reporter journey
Sign up → become Reporter (KYC approval) → training → see **Jobs** (nearby/assigned) → claim/accept → travel → **Inspection workspace**: checklist → capture evidence (photos/measures/docs, offline-tolerant) → review → submit → (Expert may request changes ⟳) → earnings credited on report issue → payout → rewards/streak. Field-first, low-connectivity resilient.

### 25.4 Property Expert journey
Sign up → **Professional verification** (§21.3) → verified → **Queue** (SLA-sorted) → open case → evidence explorer → score assessment sections → verdict + rating → request changes ⟳ or **issue report** (sign) → QA (admin) → published → earnings/payout. Reputation + defensibility central.

### 25.5 Super Admin journey
Login (staff) → **Ops dashboard** → triage: partner approvals, verification queues, report QA, payments/payouts, disputes → act via approval engine → monitor analytics/SLA/fraud → manage users/roles/content → audit. Governance + integrity.

## 26. Task flows (critical)

### 26.1 Buyer — purchase report
```
▸Open preview → ⟂signed-in? →no→ ▸Auth(OTP/Google) → back to preview
→ ▸Tap "Get report ₹X" → ▸Order summary → ⟂coupon? → apply
→ ▸Select method → ▸Authorize → ⟂result
   ✔ granted → ▸Success → ▸Report viewer
   ⊗ failed → ▸Recovery (retry/alt method) ⟳
   ⏳ pending → ▸"Confirming" → (webhook) → notify + grant
```

### 26.2 Reporter — submit inspection
```
▸Jobs → ▸Claim job → ▸Inspection workspace → ⟳per checklist item: capture → validate quality
→ ▸Review bundle → ⟂complete? →no→ show missing items → ⟳
→ ▸Submit → (offline? queue → sync) → ▸Submitted state → earnings pending
```

### 26.3 Expert — issue report
```
▸Queue → ▸Open case → ▸Evidence explorer → ⟳score each section (1–5 + notes)
→ ⟂evidence sufficient? →no→ ▸Request changes(reason) → back to Reporter
→ ▸Overall verdict + rating → ▸Sign → ⟂verified & all scored? →no→ block
→ ▸Issue report → ▸QA(admin optional) → Published → earnings credited
```

### 26.4 Admin — approve partner
```
▸Partners queue → ▸Open case → ▸Review docs → ⟂decision
   approve → role active + notify + welcome
   request-info → partial, notify checklist
   reject → reason + notify + resubmit path
→ audit log write
```

### 26.5 Owner — list property
```
▸Properties → ▸New (wizard) → step1 address(geocode) → step2 details/type
→ step3 documents(upload) → step4 review → ▸Submit for verification
→ autosave throughout; ▸Submitted → status timeline
```

## 27. Screen flow maps (per role)

**Buyer:** Explore ⇄ Filters/Search → Property Preview → Auth(if needed) → Order Summary → Payment → Success → Report Viewer → Purchases/Saved.

**Owner:** Properties → New (4-step wizard) → Property Detail(Status timeline) ⇄ Documents ⇄ Info-request response → Report (read-only).

**Reporter:** Jobs → Job Detail → Inspection Workspace (Checklist→Capture→Review→Submit) → History; Earnings → Payout; Rewards.

**Expert:** Queue → Case (Evidence → Assessment → Issue) → Issued; Credentials(verification); Earnings → Payout.

**Admin:** Dashboard → {Partners, Verification, Reports QA, Payments, Wallet-admin, Rewards-admin, Analytics, Users, Content, Audit} each list→detail→decision.

**Shared (all):** Notifications, Wallet, Profile/KYC, Settings, Help, Switch-role.

---

# PART 4 — SCREEN SPECIFICATIONS

## 28. Dashboard architecture

### 28.1 Dashboard framework (all roles)
Every dashboard is composed of the same layers so they are consistent and modular:
```
[Greeting + role context + primary action]
[KPI row: 3–5 StatCards — value, delta, sparkline]
[Priority/attention zone: what needs the user NOW (SLA, pending, failures)]
[Primary work list: role-specific (jobs/queue/properties/approvals)]
[Secondary widgets: earnings/analytics/notifications digest]
```
Widgets are config-driven (a dashboard is an ordered list of widget descriptors), so future roles get a dashboard by declaring widgets — no new layout code.

### 28.2 Per-role dashboard content
| Role | KPIs | Attention zone | Primary list |
|---|---|---|---|
| Buyer | Reports owned, Saved, Spend | Price drops on watched, expiring access | Recommended/verified properties |
| Owner | Properties, In-verification, Published, Interest | Info requests to answer, rejections | Property portfolio w/ status |
| Reporter | Jobs done, Approval %, Earnings, Streak | Jobs expiring, change-requests | Jobs (nearby/assigned) |
| Expert | In queue, Avg review time, Approval %, Earnings | SLA-breaching cases | Case queue (SLA sorted) |
| Admin | GMV, Pending approvals, Payouts due, Disputes, SLA breaches | Everything overdue/flagged | Multi-queue triage |

### 28.3 Dashboard states
loading (skeleton KPIs+list) · normal · empty (first-use per role, §11.3) · degraded (some widgets failed → per-widget error, page still usable) · offline (cached snapshot + banner).

### 28.4 Responsive
Desktop 3-col widget grid; tablet 2-col; mobile single column, KPI row → horizontal scroll cards, attention zone pinned top, primary list below. Admin dashboard is desktop-optimized (mobile = read-only KPIs + approvals).

### 28.5 Developer notes
Widgets fetch independently (parallel, suspense boundaries) so one slow query never blocks the dashboard. Each widget = its own API + cache key + error boundary. Server pushes KPI deltas via SSE for near-real-time admin ops.

---

## 29. Screen index (master registry)

Each screen below uses the Standard Screen Template (§0.3). Screens marked ★ are fully specified in §30. Others inherit the template pattern of their nearest specified sibling — that is the modular contract (add a screen by cloning its sibling's spec block).

| # | Module | Screen | Roles | Detailed |
|---|---|---|---|---|
| S01 | Auth | Login (phone/email + Google) | all | ★ |
| S02 | Auth | OTP verification | all | ★ (§17) |
| S03 | Auth | Role selection / onboarding | all | ★ |
| S04 | Shared | Notification center | all | ★ |
| S05 | Shared | Profile & KYC | all | inherits |
| S06 | Shared | Settings | all | inherits |
| S07 | Shared | Switch role | multi | ★ (§19) |
| S08 | Buyer | Explore (search+map+filter) | Buyer | ★ |
| S09 | Buyer | Property preview | Buyer/public | ★ |
| S10 | Buyer | Order summary & payment | Buyer | ★ (§24) |
| S11 | Buyer | Purchase success | Buyer | inherits |
| S12 | Buyer | Report viewer | Buyer | ★ |
| S13 | Buyer | Purchases & invoices | Buyer | inherits |
| S14 | Buyer | Saved / watchlist | Buyer | inherits |
| S15 | Owner | Property portfolio | Owner | inherits |
| S16 | Owner | List property (wizard) | Owner | ★ |
| S17 | Owner | Property detail + status timeline | Owner | ★ |
| S18 | Reporter | Jobs list | Reporter | inherits |
| S19 | Reporter | Inspection workspace (capture) | Reporter | ★ |
| S20 | Reporter | Earnings + rewards | Reporter | ★ (§20) |
| S21 | Expert | Case queue | Expert | inherits |
| S22 | Expert | Review workspace (assess+issue) | Expert | ★ |
| S23 | Expert | Professional verification | Expert | ★ (§21.3) |
| S24 | Admin | Ops dashboard | Admin | ★ (§28) |
| S25 | Admin | Partner approvals | Admin | ★ (§21.2) |
| S26 | Admin | Payments & payouts | Admin | ★ |
| S27 | Admin | Verification queues | Admin | inherits |
| S28 | Admin | Analytics | Admin | inherits (§22) |
| S29 | Admin | Users & roles | Admin | inherits |
| S30 | Admin | Audit log | Admin | inherits |
| S31 | Shared | Wallet | Reporter/Expert | ★ (§20) |
| S32 | Shared | 403 / 404 / offline | all | inherits (§11.2) |

---

## 30. Detailed screen specifications

### S01 — Login ★
- **Purpose:** Authenticate an identity via phone/email OTP or Google.
- **User Goal:** Get into my workspace quickly and safely.
- **Business Goal:** Low-friction conversion; verified contacts; reduce fraud.
- **Layout Structure:** Centered card (web) / full-screen (mobile). Logo → tagline → contact input → "Continue" → "or" divider → Google button → legal/consent footnote.
- **Header:** Minimal (brand mark; no nav for unauth).
- **Navigation:** None (pre-auth); link to Help + Terms/Privacy.
- **Primary CTA:** "Continue" (sends OTP).
- **Secondary CTA:** "Sign in with Google".
- **Fields:** `contact` (phone or email, auto-detected). 
- **Buttons:** Continue (primary, loading state), Google (branded), "Trouble signing in?" (text→help).
- **Validation:** §14.3 phone/email; disable Continue only when empty; on invalid show inline error.
- **Permissions:** Public.
- **API Required:** `POST /auth/otp/request`, `POST /auth/google`.
- **States:** idle · validating · sending · error(rate-limited/invalid) · redirect-to-otp · google-connecting.
- **Components:** Card, Input, Button, Divider, GoogleButton, Toast, Link.
- **Responsive:** Website/Desktop centered 400px card; Tablet centered; Mobile full-screen, keyboard-aware, Google + Continue pinned above keyboard.
- **Developer Notes:** Never disclose account existence. Rate-limit by IP+contact. Preserve `returnTo`. PKCE for Google. i18n keys only.
- **UX Notes:** Single field reduces choice friction; auto-detect phone vs email; primary action is OTP (most inclusive); Google as accelerator, not requirement.

### S02 — OTP verification ★ — see §17 (full spec). Template keys inherit §17; Permissions: public (during auth) or step-up (authed). API: `/auth/otp/verify`.

### S03 — Role selection / onboarding ★
- **Purpose:** After first auth, choose how to use CivilCheck; route into onboarding.
- **User Goal:** Pick my role (Buyer / become a Partner).
- **Business Goal:** Correct role routing; capture partner intent; start verification early.
- **Layout Structure:** Grid of role cards (icon, title, one-line value, "requires verification" tag for partners). Buyer = instant; Owner/Reporter/Expert = start approval flow.
- **Header:** "How will you use CivilCheck?" + skip→Buyer default.
- **Navigation:** Progress if entering a wizard.
- **Primary CTA:** Card select → Continue.
- **Secondary CTA:** "I'll decide later" (→ Buyer).
- **Fields:** none (selection).
- **Buttons:** per-card select; Continue.
- **Validation:** must select one to continue (unless skip).
- **Permissions:** authenticated.
- **API:** `GET /me/roles`, `POST /roles/request`.
- **States:** default · selecting · role-instant(buyer) · role-needs-verification · pending(if returning).
- **Components:** Card grid, Badge, Button, Stepper.
- **Responsive:** Desktop 2×2 grid; Mobile stacked cards.
- **Developer Notes:** Registry-driven cards (§2.4). Buyer role auto-active; partner roles create pending `role_assignment` + verification case.
- **UX Notes:** Show that a user can add more roles later (reduce pressure); partner cards set expectations ("review usually 1–2 days").

### S08 — Buyer Explore (search + map + filter) ★
- **Purpose:** Discover properties and their verification/report availability.
- **User Goal:** Find relevant, trustworthy properties fast.
- **Business Goal:** Drive report purchases; surface verified inventory.
- **Layout Structure:** Search bar (top) + filter controls; split list ⇄ map (desktop), toggle list/map (mobile); result cards (photo, price, type, locality, **verification badge**, "Report available ₹X" chip, rating).
- **Header:** Search + saved-search + sort + filter entry.
- **Navigation:** Buyer bottom nav / sidebar; breadcrumb none (top-level).
- **Primary CTA:** Card → "Preview report".
- **Secondary CTA:** Save ♥, Share.
- **Fields:** search query; filters (§15.2); sort (§15.3).
- **Buttons:** Filter, Sort, Map/List toggle, Save, per-card Preview.
- **Validation:** query ≥2 chars; graceful no-results.
- **Permissions:** public read (preview-level); purchase requires auth.
- **API:** `GET /properties?q&filters&sort&cursor` (FTS + PostGIS), `GET /properties/facets`.
- **States:** loading(skeleton cards+map) · results · no-results(clear filters) · error(retry, keep last) · offline(cached).
- **Components:** SearchBar, FilterPanel/Sheet, Sort, MapView, PropertyCard, Badge, Chip, Pagination/InfiniteScroll, EmptyState.
- **Responsive:** Desktop list+persistent map+left filters; Tablet list+map toggle+slide-over filters; Mobile list default, map toggle, bottom-sheet filters, sticky filter/sort bar.
- **Developer Notes:** URL-encode q/filters/sort (shareable, SEO for public). Cursor pagination. Map + list share state; cluster markers; debounce map-move refetch. Cache facet counts.
- **UX Notes:** Verification badge is the hero trust signal — always visible on card. "Report available" chip is the conversion hook. Map has list fallback (a11y).

### S09 — Property Preview ★ (Property Preview UX #39)
- **Purpose:** Show enough (redacted) to build trust and justify purchase, without giving away the paid report.
- **User Goal:** Decide whether this property/report is worth buying.
- **Business Goal:** Maximize preview→purchase conversion while protecting paid content.
- **Layout Structure:** Gallery/hero (owner photos, watermarked) → key facts (type, area, locality, price) → **Verification status + CivilCheck rating (overall only)** → **Report summary teaser** (section names + high-level verdicts, detailed findings/scores locked/blurred with lock icons) → owner/agent basics → sticky purchase bar "Get full report ₹X".
- **Header:** Back, Save ♥, Share, report price.
- **Navigation:** From Explore; deep-linkable + SEO (public).
- **Primary CTA:** "Get full report ₹X" → auth if needed → Order (S10).
- **Secondary CTA:** Save, Share, "What's in the report?" (explainer).
- **Fields:** none.
- **Buttons:** Purchase, Save, Share, expand teaser sections (locked).
- **Validation:** n/a; purchase gated by auth + report.published.
- **Permissions:** public preview; full findings require purchase (server-enforced redaction).
- **API:** `GET /properties/:id/preview` (returns only non-paid fields + teaser), `GET /reports/:id/summary`.
- **States:** loading(skeleton hero+facts) · preview · report-not-ready("Verification in progress — notify me") · already-purchased(→ "Open report") · unavailable/archived · error.
- **Components:** Gallery/Lightbox, Badge(verified), RatingScore, ReportSectionCard(locked), StickyPurchaseBar, ShareSheet, Timeline(status).
- **Responsive:** Desktop 2-col (gallery+facts left, purchase card right sticky); Tablet stacked with sticky bar; Mobile scroll + fixed bottom purchase bar; Website SSR/ISR for SEO + OpenGraph.
- **Developer Notes:** **Redaction is server-side** — never send paid detail to client and blur in CSS. Watermark preview images. `report:read:purchased` unlocks full. ISR for public SEO pages; revalidate on publish. Track preview→purchase funnel event.
- **UX Notes:** Show exactly enough to prove value (section titles + overall rating + 1 sample finding), lock the rest with clear "unlock with report" affordance. Never dark-pattern the lock; be transparent about what's paid. If not yet verified, offer "notify when ready" instead of a dead CTA.

### S10 — Order Summary & Payment ★ (Payment #38 + Buyer Report Purchase #40)
- **Purpose:** Complete purchase and grant report access.
- **User Goal:** Pay safely and get my report.
- **Business Goal:** Convert with minimal drop-off; correct revenue split + compliance.
- **Layout Structure:** Order summary (report scope, property, price breakdown) → coupon → payment method selector → pay button → (gateway/3DS/UPI) → success/failure.
- **Header:** "Checkout" + secure lock indicator + back (cart preserved).
- **Navigation:** Linear checkout; back returns to preview without losing order.
- **Primary CTA:** "Pay ₹Total".
- **Secondary CTA:** Apply coupon; change method.
- **Fields:** coupon; method-specific (UPI id / card via gateway iframe / netbanking bank).
- **Buttons:** Apply coupon, Pay, Cancel.
- **Validation:** coupon async (§14); method required; amount server-authoritative.
- **Permissions:** authenticated buyer; `purchase:create`.
- **API:** `POST /orders`, `POST /orders/:id/pay`, webhook confirm, `GET /orders/:id`.
- **States:** summary · applying-coupon · selecting-method · authorizing · processing(webhook) · success(→S11) · failed(recovery) · pending · expired.
- **Components:** OrderSummary, CouponInput, PaymentMethodList, CurrencyDisplay, Button(loading), AlertDialog, ReceiptCard.
- **Responsive:** Desktop 2-col (summary left, pay right); Mobile single column, sticky Pay bar; gateway iframe/redirect handled per platform.
- **Developer Notes:** Idempotency key per order; never grant on client — only on verified webhook; retries safe; PCI tokenization; ledger writes on settle (buyer→platform, hold reporter/expert splits). Handle 3DS/UPI async + timeouts.
- **UX Notes:** No hidden fees; show total before pay; failure keeps cart + gives exact reason + alternate method; pending state reassures without inviting double-pay.

### S12 — Report Viewer ★
- **Purpose:** Deliver the full verified report to a paying buyer.
- **User Goal:** Understand the property's condition/risk to decide.
- **Business Goal:** Prove value (retention, referrals, repeat purchase), protect content.
- **Layout Structure:** Report header (property, overall rating, issued date, verifying Expert + verification badge) → section nav (structural, legal/title, civil quality, amenities, risk) → per-section score + findings + evidence gallery → summary/recommendation → download PDF / share (access-controlled) / dispute.
- **Header:** Property title, rating, download, print, back.
- **Navigation:** Sticky section nav / TOC; on mobile, collapsible sections.
- **Primary CTA:** Download PDF.
- **Secondary CTA:** Share (revocable link), Raise a concern (dispute), Contact owner.
- **Fields:** none (dispute opens form).
- **Buttons:** Download, Share, Print, Dispute, section expand.
- **Validation:** access check on load + on download.
- **Permissions:** `report:read:purchased` (buyer who purchased) / owner (final) / expert (own) / admin.
- **API:** `GET /reports/:id` (access-checked), `GET /reports/:id/pdf` (signed, watermarked), `POST /disputes`.
- **States:** loading(skeleton sections) · viewing · access-expired(re-purchase/renew) · revoked(dispute/refund) · error.
- **Components:** ReportHeader, RatingScore, ReportSectionCard, EvidenceGallery/Lightbox, PdfViewer, Timeline, DisputeForm.
- **Responsive:** Desktop TOC sidebar + content; Tablet collapsible TOC; Mobile accordion sections + sticky download; PDF paginated on mobile.
- **Developer Notes:** Watermark buyer identity into PDF + on-screen (anti-leak); signed short-lived asset URLs; access + expiry enforced server-side; log views. Evidence images EXIF-stripped.
- **UX Notes:** Lead with the answer (overall verdict + recommendation) then detail — buyers want the go/no-go first. Findings in plain language with expandable technical detail. Every claim backed by visible evidence to justify trust.

### S16 — List Property (Owner wizard) ★
- **Purpose:** Capture a property + documents and submit for verification.
- **User Goal:** Get my property verified and sellable with a report.
- **Business Goal:** Grow verified inventory; capture clean, geocoded, documented data.
- **Layout Structure:** 4-step Stepper — (1) Address (autocomplete + map pin) (2) Details (type, area, bedrooms, age, price intent) (3) Documents (per-slot upload: title deed, approved plan, tax receipt, ID) (4) Review & submit.
- **Header:** "List a property" + step progress + save-draft indicator.
- **Navigation:** Stepper back/next; exit guard (unsaved).
- **Primary CTA:** step → "Continue"; final → "Submit for verification".
- **Secondary CTA:** "Save draft", Back.
- **Fields:** address(geocoded), type(enum), area, bedrooms, age, price; document slots (§18); consent checkbox.
- **Buttons:** Continue, Back, Save draft, Add document, Submit.
- **Validation:** §14.3 per field; each step validates before advancing; required doc slots; consent required to submit.
- **Permissions:** `property:create` (active Owner).
- **API:** `POST /properties`(draft), `PATCH /properties/:id`, `POST /uploads`, `POST /properties/:id/submit`.
- **States:** draft-autosave · step-valid/invalid · uploading · review · submitting · submitted(→ status) · error.
- **Components:** Stepper, Input, Select, AddressAutocomplete+Map, FileUpload, Checkbox, ReviewCard, Button.
- **Responsive:** Desktop 2-col (form + live preview/map); Tablet single column stepper; Mobile full-screen steps, sticky Continue.
- **Developer Notes:** Autosave every 5s + on step change; geocode server-side validate; draft resumable; submit creates `verification_case` (property). i18n.
- **UX Notes:** Show why each doc matters (reduces abandonment); allow save-and-finish-later; review step summarizes everything before the irreversible submit.

### S17 — Property Detail + Status Timeline ★ (Property Verification #37, owner view)
- **Purpose:** Let the owner track verification and respond to requests.
- **User Goal:** Know where my property is in the process and what I must do.
- **Business Goal:** Reduce support load; keep pipeline moving via timely owner responses.
- **Layout Structure:** Property summary → **Status Timeline** (draft→submitted→inspection→review→issued→published with current highlighted + timestamps + actor) → action zone (respond to info request / view report when ready) → tabs (Details, Documents, Inspection progress read-only, Report).
- **Header:** Property title + status badge + back.
- **Navigation:** Tabs; breadcrumb Properties / {name}.
- **Primary CTA:** contextual — "Respond to request" / "View report" / none.
- **Secondary CTA:** Edit (only in draft), Archive, Contact support.
- **Fields:** info-request response (text + optional upload) when applicable.
- **Buttons:** Respond, View report, Archive, Edit(draft only).
- **Validation:** response required text if requested.
- **Permissions:** owner of resource (`property:read:own`); read-only on evidence/report.
- **API:** `GET /properties/:id`, `GET /properties/:id/timeline`, `POST /verification-cases/:id/respond`.
- **States:** each pipeline stage · info-requested(action) · rejected(reason+resubmit) · report-ready · archived · error.
- **Components:** Timeline, Badge, Tabs, Card, InfoRequestForm, ReportLink.
- **Responsive:** Desktop timeline sidebar + tabbed content; Mobile stacked timeline (vertical) + accordion tabs.
- **Developer Notes:** Timeline built from `audit_log`/`verification_case` transitions; SSE for live status; owner cannot mutate evidence (server-enforced read-only).
- **UX Notes:** Timeline answers the #1 owner anxiety ("what's happening?"). Always show who is currently acting + realistic ETA. Rejections must be constructive with a clear resubmit path.

### S19 — Inspection Workspace (Reporter capture) ★ (Document Upload #28 heavy)
- **Purpose:** Guided field capture of evidence, resilient to poor connectivity.
- **User Goal:** Capture everything required fast and submit to get paid.
- **Business Goal:** High-quality, complete, geo/time-stamped evidence for defensible reports.
- **Layout Structure:** Job header (property, address, map, checklist progress %) → **Checklist** (items grouped: exterior, structural, interior, documents, measurements) → per-item **Capture** (camera with overlay guide, measure input, doc scan) → **Review** (bundle grid, missing-item warnings) → **Submit**.
- **Header:** Property + progress ring + connectivity/sync indicator.
- **Navigation:** Checklist ⇄ capture; bottom "Review & submit".
- **Primary CTA:** per item "Capture"; global "Submit inspection".
- **Secondary CTA:** Retake, Add note, Save draft (implicit/offline), Flag issue.
- **Fields:** photos, measurements(number+unit), notes(text), doc scans; per checklist item.
- **Buttons:** Capture, Retake, Add, Submit, Sync now.
- **Validation:** each required item must have valid evidence; quality checks (blur/geo present) before accept; submit blocked until complete.
- **Permissions:** assigned Reporter (`evidence:create`, `inspection:submit`).
- **API:** `GET /inspections/:id`, `POST /uploads/sign`, `POST /evidence`, `POST /inspections/:id/submit`.
- **States:** loading · capturing · uploading · offline-queued(sync pending) · item-complete · incomplete(blocking submit) · submitting · submitted(read-only) · change-requested(reopened) · error.
- **Components:** ChecklistItem, CameraCapture(overlay), MeasureInput, FileUpload, EvidenceTile, ProgressRing, SyncBadge, EmptyState, AlertDialog.
- **Responsive:** Mobile-first (Flutter) — one-handed, large targets, camera full-bleed; Tablet split checklist+capture; Web (rare) drag-drop upload equivalent for desk review.
- **Developer Notes:** **Offline-first**: local store (SQLite/Isar) + background sync queue; chunked/resumable uploads; auto EXIF geo+timestamp; conflict-free (append-only evidence). Immutable after submit. Haptics on capture. Battery/data-aware upload.
- **UX Notes:** Checklist removes guesswork + guarantees completeness. Show progress constantly; never lose captured work if the app closes; make "what's still missing" obvious before submit; celebrate submit (feeds rewards).

### S22 — Expert Review Workspace ★ (Property Verification #37, expert side)
- **Purpose:** Assess evidence, score the property, and issue the verified report.
- **User Goal:** Reach a defensible verdict efficiently.
- **Business Goal:** Trustworthy reports at SLA; the core value creation step.
- **Layout Structure:** Two-pane — left **Evidence explorer** (grouped media, docs, measurements, filter, lightbox, zoom) → right **Assessment** (scored sections 1–5 + findings text + reference evidence) → **Verdict** (overall rating + recommendation) → **Issue** (verify-checklist + sign + issue). Request-changes side-action.
- **Header:** Case id, property, SLA countdown, verification badge (own creds).
- **Navigation:** Section tabs; evidence ⇄ assessment linking (click finding → cited evidence).
- **Primary CTA:** "Issue verified report".
- **Secondary CTA:** "Request changes" (→ Reporter), "Save draft", "Escalate to admin".
- **Fields:** per-section score(1–5), findings(text), evidence citations, overall rating, recommendation, sign/confirm.
- **Buttons:** Score, Cite evidence, Request changes, Save, Issue.
- **Validation:** all sections scored + overall verdict + evidence sufficiency confirmed + expert verified & not expired → else Issue disabled with reason (§14.4).
- **Permissions:** `report:review`, `report:issue` (verified Expert).
- **API:** `GET /verification-cases/:id`, `GET /inspections/:id/evidence`, `POST /reports`(draft), `POST /reports/:id/request-changes`, `POST /reports/:id/issue`.
- **States:** loading · assessing(draft autosave) · insufficient(request-changes) · ready-to-issue · issuing · issued · error · SLA-breach(flag).
- **Components:** EvidenceExplorer, Lightbox, ReportSectionCard(editable), RatingScore, SignaturePad/Confirm, Timeline, AlertDialog.
- **Responsive:** Desktop/tablet two-pane (primary); Mobile stacked (evidence then assessment) — issue allowed but desktop encouraged.
- **Developer Notes:** Draft autosave; issuing is atomic + audited + triggers earnings holds + notifications + (optional) admin QA; report immutable post-issue (new version for changes); watermark + sign metadata. SLA timer from case creation.
- **UX Notes:** Evidence-cite linking makes the report defensible and faster to write. Block issuing until complete but always explain the block. Request-changes must carry actionable reasons to the Reporter.

### S23 — Professional Verification (Expert) ★ — see §21.3 (full). Template: stepper form, per-item status, gates `report:issue`. API `/verification/professional`. States: unverified→in-progress→partially→verified→expired→rejected. Responsive: web stepper / mobile full-screen steps.

### S25 — Partner Approvals (Admin) ★ — see §21.2 (full). 
- **Layout:** Queue (filter by role/status/SLA) + case detail (applicant, docs, decision panel). 
- **Primary CTA:** Approve. **Secondary:** Request info / Reject(reason). 
- **Permissions:** `partner:approve`. **API:** `/admin/partners`, `/admin/partners/:id/decision`. 
- **States:** queue-empty/loading/list; case: submitted/info-requested/approved/rejected. 
- **Components:** DataTable, CaseHeader, DocViewer, DecisionPanel, ReasonSelect, Timeline. 
- **Responsive:** desktop master-detail; mobile read-only + approve/reject. 
- **UX Notes:** reason mandatory on non-approve; bulk approve low-risk; four-eyes for Expert; everything audited.

### S26 — Payments & Payouts (Admin) ★
- **Purpose:** Govern money: purchases, payouts, refunds, disputes, ledger.
- **User Goal:** Process payouts/refunds correctly and see money flow.
- **Business Goal:** Financial integrity, timely partner payouts, dispute resolution.
- **Layout Structure:** Tabs — Purchases · Payouts(queue) · Refunds/Disputes · Ledger. Each = filterable DataTable + detail drawer + action (approve payout / process refund / resolve dispute).
- **Header:** Money KPIs (GMV, pending payouts, refunds, disputes) + search.
- **Navigation:** Tabs + detail drawer.
- **Primary CTA:** context — "Approve payout" / "Process refund" / "Resolve dispute".
- **Secondary CTA:** Hold, Reject(reason), Export.
- **Fields:** decision notes, refund amount, reason codes.
- **Buttons:** Approve, Reject, Hold, Refund, Resolve, Export CSV.
- **Validation:** payout ≤ available; refund ≤ paid; reason required on reject/hold; KYC/bank verified before payout approve.
- **Permissions:** `payout:approve`, refund/dispute scopes (staff).
- **API:** `GET/POST /admin/payouts`, `POST /admin/refunds`, `GET/POST /admin/disputes`, `GET /admin/ledger`.
- **States:** loading · list · empty · detail · processing · success · error · ambiguous(gateway pending).
- **Components:** DataTable, StatCard, Drawer, DecisionPanel, LedgerRow, ReasonSelect, ConfirmDialog.
- **Responsive:** Desktop-optimized (dense tables); tablet condensed; mobile read-only + urgent approvals only.
- **Developer Notes:** All actions write immutable ledger entries; idempotent; four-eyes for large payouts; reconcile against gateway; full audit; never mutate balances directly.
- **UX Notes:** Show the money trail (buyer pay → holds → payout) transparently; require reasons; make "why is this on hold" explainable to reduce partner support tickets.

### S31 — Wallet (Reporter/Expert) ★ — see §20.1 (full). 
- **Layout:** Balance header + tabs (Overview/Transactions/Payouts/Methods). **Primary CTA:** Request payout. **Permissions:** `wallet:read:own`, `payout:request`. **API:** `/wallet`, `/payouts`. **States:** funded/empty/hold-only/payout-in-progress/error. **Responsive:** mobile-first cards, web table. **UX:** ledger-derived amounts, holds explained, count-up on change.

### S04 — Notification Center ★
- **Purpose:** Central place for all events + deep links to source.
- **User Goal:** See what needs my attention and act.
- **Business Goal:** Re-engagement, faster workflow response, reduced SLA breaches.
- **Layout Structure:** Filter bar (All/Unread/by type) → grouped list by day → item (icon, title, snippet, time, unread dot) → "mark all read".
- **Header:** "Notifications" + unread count + settings link.
- **Navigation:** Item → deep link to source screen; per-role counts drive the switcher badge.
- **Primary CTA:** item → open source.
- **Secondary CTA:** Mark read, Mark all read, Mute type, Settings.
- **Fields:** none.
- **Buttons:** Mark all read, per-item action, filter chips.
- **Validation:** n/a.
- **Permissions:** own notifications only.
- **API:** `GET /notifications`, `POST /notifications/read`, WS/SSE stream, FCM.
- **States:** loading(skeleton) · list · empty("You're all caught up") · error · realtime-append.
- **Components:** NotificationItem, FilterChips, EmptyState, Badge.
- **Responsive:** Desktop panel/dropdown + full page; mobile full screen; tablet slide-over.
- **Developer Notes:** Optimistic read; batch noisy events; respect quiet hours + per-category prefs; live region announces new items politely.
- **UX Notes:** Group + type-filter prevent overwhelm; deep links must restore full context; never mark critical items auto-read.

---

# PART 5 — MODULARITY, EDGE CASES, ENGINEERING CONTRACT, QA

## 31. Modularity & future-role roadmap

### 31.1 Adding a future role (Builder / Broker / Architect / Surveyor / Bank / Valuer)
Zero-refactor recipe:
1. **Registry entry** (§2.4): key, label, icon, homeRoute, navModel, permissionScopes, onboardingFlow, verificationRequired.
2. **Route group** `/app/{role}` (Next.js) + `ShellRoute` (Flutter) — clone nearest sibling.
3. **Permission scopes** added to RBAC matrix (§6.3) + FastAPI dependencies + Postgres RLS policies.
4. **Verification flow** (if partner) reuses the approval engine (§21.1) — just a new `subject_type`/reason set.
5. **Dashboard** = ordered widget descriptors (§28.1) — no new layout.
6. **Screens** cloned from the Standard Screen Template (§0.3) of the nearest sibling.

### 31.2 Likely future-role fit
| Role | Reuses | New scopes | Notes |
|---|---|---|---|
| Broker | Owner + Buyer patterns | `listing:manage`, `lead:read` | Multi-property mgmt |
| Builder | Owner portfolio | `project:manage` | Bulk inventory |
| Architect/Surveyor | Reporter capture + Expert assess | `survey:create` | Specialized evidence types |
| Bank/Valuer | Expert review + Buyer report | `valuation:issue`, `report:consume:bulk` | B2B report consumption + valuation reports |

### 31.3 Feature-module expandability
New feature (e.g. "insurance quotes", "home loans") = new module folder + registry feature-flag + optional per-role nav item + own API namespace. Feature flags gate rollout per role/region.

## 32. Edge cases (do-not-skip register)

**Auth/identity:** duplicate email via Google vs OTP (merge flow); phone reassigned to new person (re-verify + fraud check); account with role suspended mid-session (force re-eval on next action); token expiry mid-form (refresh silently, preserve draft); deleted account requesting data (GDPR/DPDP export/delete).

**Roles:** user with all roles + resource requiring a non-active role (offer switch); role revoked while viewing that workspace (graceful boot to allowed home); pending role tries a gated action (disabled + status).

**Property/verification:** owner edits after submit (blocked; new version); reporter submits incomplete due to offline (queued, flagged); expert issues then evidence dispute (report version + investigation); property archived while in preview (unavailable state); two reporters claim same job (optimistic lock, first wins, other gets "already claimed").

**Payment:** double-tap pay (idempotency); success webhook lost (reconcile + grant retroactively + notify); refund after report downloaded (watermark + policy + partial); currency/tax edge; coupon expiring during checkout; buyer purchases then owner unpublishes (honour access); partial wallet + gateway split fails (rollback both).

**Wallet/payout:** payout requested then balance drops (hold reconciliation); bank details fail at gateway (return to wallet, funds restored); payout approved then reversed (ledger reversal entry, notify).

**Uploads:** file too large/wrong type; connection drop mid-upload (resume); malware detected (reject + notify + flag); EXIF missing geo (warn, allow with justification); duplicate evidence (dedupe by hash).

**Search/filter:** query with 0 results + all filters (clear-all CTA); map area with no inventory; stale filter in URL after schema change (ignore unknown, keep valid).

**Notifications:** flood after being offline (batch/summarize); OTP SMS undelivered (fallback email + resend limits); push disabled (in-app fallback + prompt).

**Concurrency:** two admins act on same case (lock/last-write-wins + conflict banner); SLA breach during action; expert license expires mid-review (block issue, allow save).

**Accessibility/i18n:** RTL layout; long translated strings truncation; screen-reader on OTP/payment; reduced-motion on count-ups/confetti; high-contrast mode.

**Offline (Reporter):** full-day offline field work then sync; app killed mid-capture (restore); storage full (warn + prioritize sync); clock skew on timestamps (server time reconcile).

## 33. Engineering contract (stack mapping)

### 33.1 Frontend
- **Next.js (App Router, RSC):** route groups = §5.3; middleware auth/role guard; server components for data + SEO (public preview, marketing); Zod schemas shared with types; TanStack Query for client cache; Tailwind + ShadCN consuming token CSS vars (§7). i18n via next-intl.
- **Flutter (mobile):** GoRouter guards (§5.4); Material 3 `ColorScheme` from tokens; Riverpod/Bloc state; offline store (Isar/SQLite) + sync queue (Reporter); Pinput OTP; camera + geolocation; FCM push.

### 33.2 Backend
- **FastAPI:** JWT (access+refresh), role-scoped tokens; `require_scopes()` + ABAC dependencies (§6.4); Pydantic = validation source of truth (mirrors §14.3); idempotency keys on money/mutation endpoints; signed upload URLs; webhook verification; async workers (report gen, notifications, payouts) via task queue; SSE/WebSocket for realtime.
- **PostgreSQL:** schema §1.3; Row-Level Security on `property`, `report`, `wallet`, `report_purchase`; double-entry `ledger_entry` (append-only, no updates); `audit_log` immutable; PostGIS (geo search), `tsvector`+`pg_trgm` (full-text); materialized views for analytics rollups; enums for status machines.

### 33.3 Design-token pipeline
`tokens.json` (Style Dictionary) → build → { Tailwind theme + CSS vars (web), Dart ThemeData/ColorScheme (mobile) }. Single source; CI check fails build if a component hardcodes a color.

### 33.4 API contract conventions
REST, cursor pagination, `{data, meta, error{code,message,correlationId}}` envelope, RFC-7807-style errors mapped to §11.2 treatments, ISO-8601 UTC, money as integer minor units + currency, ETags for optimistic concurrency (409 → §11.2 conflict UX).

## 34. QA & traceability

### 34.1 Test surfaces per screen
functional (happy + each edge in §32), permission matrix (§6.3 is the test oracle), all universal states (§11), responsive matrix (§9.2 widths), accessibility (§10.3), i18n/RTL, offline (Reporter), payment sandbox (all §24 states), idempotency/concurrency.

### 34.2 Definition of Done (per screen)
All template keys implemented · all listed states rendered · permission gates verified at edge+API+data · a11y automated+manual pass · responsive at all breakpoints · copy from i18n (no literals) · analytics events fired · audit entries written for state changes · error correlation ids surfaced.

### 34.3 Requirement → section traceability (all 40 deliverables)
| # | Requested | Where |
|---|---|---|
| 1 | Information Architecture | §3 |
| 2 | Navigation Structure | §4 |
| 3 | Complete User Journey | §25 |
| 4 | Task Flow | §26 |
| 5 | Screen Flow | §27 |
| 6 | Wireframe Description | §30 (Layout Structure per screen) |
| 7 | Component List | §8 |
| 8 | Micro Interactions | §12.1 |
| 9 | Animations | §12.2–12.3 |
| 10 | Loading States | §11.1 |
| 11 | Error States | §11.2 |
| 12 | Empty States | §11.3 |
| 13 | Success States | §11.4 |
| 14 | Permission Handling | §6 |
| 15 | Role Based Routing | §5 |
| 16 | Dashboard Architecture | §28 |
| 17 | Design Tokens | §7 |
| 18 | Responsive Behaviour | §9 |
| 19 | Accessibility | §10 |
| 20 | UX Copy | §13 |
| 21 | Forms | §14 |
| 22 | Validation Rules | §14.3–14.4 |
| 23 | Search Behaviour | §15.1 |
| 24 | Filter Behaviour | §15.2 |
| 25 | Sorting Behaviour | §15.3 |
| 26 | Notification Behaviour | §16, S04 |
| 27 | Approval Workflow | §21.1 |
| 28 | Document Upload UX | §18, S19 |
| 29 | OTP UX | §17, S02 |
| 30 | Google Login UX | §23, S01 |
| 31 | Role Switching UX | §19, S07 |
| 32 | Partner Approval UX | §21.2, S25 |
| 33 | Wallet UX | §20.1, S31 |
| 34 | Rewards UX | §20.2, S20 |
| 35 | Analytics UX | §22, S28 |
| 36 | Professional Verification UX | §21.3, S23 |
| 37 | Property Verification UX | §21.4, S17/S19/S22 |
| 38 | Payment UX | §24, S10 |
| 39 | Property Preview UX | S09 |
| 40 | Buyer Report Purchase UX | §24, S10/S12 |

---

## 35. Document control
- **Owner:** Product/UX. **Change process:** any new role/feature updates §2.4 registry, §6.3 RBAC, §29 index — these three are the "must-update" spine.
- **Versioning:** semantic (1.0 baseline). Screen specs are additive; the template (§0.3) is stable.
- **Assumption of record:** domain interpreted as property due-diligence / civil-structural verification marketplace (§1). If corrected, §1 + affected screen semantics revise; frameworks (Parts 1–2) remain valid.

*End of master baseline v1.0.*
