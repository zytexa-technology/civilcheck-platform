# API Reference

Full endpoint-by-endpoint listing for `apps/api`. For the request pipeline, auth flow, and a condensed category summary, see the *API Architecture* section in the main [README](../README.md) — this doc is the detailed drill-down it links to.

**Base URL:** `/api` — **122 endpoints across 20 categories** (verified 2026-08-06 by counting live route registrations; see `docs/roadmap.md` if this drifts).

Unknown routes return a `404` with `{ success: false, message: "Endpoint not found" }`; a global error handler catches everything else and logs the stack via Winston.

---

## 1. Authentication (8 endpoints)

```
POST   /auth/register            - Register buyer (phone-based)          [rate limited]
POST   /auth/send-otp            - Send buyer login OTP                  [rate limited]
POST   /auth/verify-otp          - Verify OTP, issue buyer JWT           [rate limited]
POST   /auth/seller/send-otp     - Send seller login OTP                 [rate limited]
POST   /auth/seller/verify-otp   - Verify OTP, issue seller JWT          [rate limited]
POST   /auth/admin/login         - Admin password + optional TOTP login  [rate limited]
GET    /auth/me                  - Get current authenticated actor
POST   /auth/logout              - Logout (clears admin session activity)
```

## 2. Public Property Search — Buyer Side (4 endpoints)

```
GET    /properties/search        - Search by address/city/tehsil/type (no login needed)
GET    /properties/check         - FREE "Case Exists? Yes/No" check (key differentiator)
GET    /properties/trending      - Most viewed properties by city
GET    /properties/:id           - Free preview; full report if purchased (token optional)
```

## 3. Public Content Control Reads (4 endpoints)

```
GET    /content/categories       - Active property categories (admin-curated)
GET    /content/coverage         - Cities/tehsils CivilCheck currently serves
GET    /content/banners          - Live banner announcements for the caller's audience
GET    /content/disclaimers/:key - Versioned disclaimer text by surface ("report", ...)
```

## 4. Seller Onboarding & Profile (5 endpoints)

```
POST   /seller/register          - Seller signup with profession + KYC details [Zod validated]
POST   /seller/kyc/certificate   - Upload Bar Council / CE certificate  (auth: seller)
GET    /seller/kyc/status        - Check KYC approval status            (auth: seller)
GET    /seller/profile           - View own profile                     (auth: seller)
PATCH  /seller/profile           - Update profile                       (auth: seller)
```

## 5. Seller Listings (5 endpoints)

```
POST   /seller/listings          - Create listing  [Zod validated]      (auth: seller)
GET    /seller/listings          - List own listings                    (auth: seller)
GET    /seller/listings/:id      - Single listing detail                (auth: seller)
PUT    /seller/listings/:id      - Update listing                       (auth: seller)
DELETE /seller/listings/:id      - Delete listing                       (auth: seller)
```

## 6. Owner Properties (5 endpoints)

```
POST   /seller/properties        - List own property for verification   (auth: seller)
GET    /seller/properties        - View own properties                   (auth: seller)
GET    /seller/properties/:id    - Single property detail                (auth: seller)
PUT    /seller/properties/:id    - Update property                       (auth: seller)
DELETE /seller/properties/:id    - Soft delete property                  (auth: seller)
```

## 7. Seller Earnings & Settlements (5 endpoints)

```
GET    /seller/earnings                      - Overview: lifetime / month / week   (auth: seller)
GET    /seller/earnings/transactions         - Per-listing breakdown (?settled=)   (auth: seller)
GET    /seller/earnings/statement            - Income tax statement (?from=&to=)   (auth: seller)
GET    /seller/earnings/settlements          - Weekly settlement history           (auth: seller)
GET    /seller/earnings/settlements/pending  - Next payout detail                  (auth: seller)
```

## 8. Seller Notifications (3 endpoints)

```
GET    /seller/notifications                 - List notifications        (auth: seller)
POST   /seller/notifications/mark-all-read   - Mark all as read          (auth: seller)
POST   /seller/notifications/:id/read        - Mark one as read          (auth: seller)
```

## 9. Buyer Alerts (4 endpoints)

```
POST   /alerts/subscribe         - Subscribe to case updates on a property  (auth: buyer)
GET    /alerts                   - Active alert subscriptions               (auth: buyer)
GET    /alerts/history           - Full alert history                       (auth: buyer)
DELETE /alerts/:id               - Cancel alert                             (auth: buyer)
```

## 10. Purchases (2 endpoints)

```
POST   /purchases                - Unlock full report (60/40 split recorded) [rate limited] (auth: buyer)
GET    /purchases                - All unlocked reports - lifetime access                   (auth: buyer)
```

## 11. Special Requests — Custom Research (11 endpoints)

```
# Buyer
POST   /special-requests                     - Submit request + advance  [Zod] (auth: buyer)
GET    /special-requests                     - My requests                     (auth: buyer)
GET    /special-requests/:id                 - Request detail                  (auth: buyer)
POST   /special-requests/:id/verify          - Confirm advance-payment checkout (auth: buyer)
POST   /special-requests/:id/retry           - Reopen checkout for a PENDING, unpaid request (auth: buyer)

# Seller (expert persona only, enforced server-side)
GET    /seller/special-requests/available    - Open requests in my tehsil      (auth: seller, expert)
GET    /seller/special-requests              - Full history, all statuses      (auth: seller, expert)
POST   /seller/special-requests/:id/accept   - Accept assignment               (auth: seller, expert)
POST   /seller/special-requests/:id/decline  - Decline assignment              (auth: seller, expert)
POST   /seller/special-requests/:id/submit   - Submit completed research       (auth: seller, expert)

# Admin — GET open to all roles, writes need SUPER_ADMIN or SUB_ADMIN
GET    /admin/special-requests               - All requests                    (any admin)
POST   /admin/special-requests/:id/assign    - Assign to qualified seller (or auto-match if sellerId omitted) (SUPER/SUB)
POST   /admin/special-requests/:id/approve   - Approve submitted research      (SUPER/SUB)
POST   /admin/special-requests/:id/reject    - Reject submitted research       (SUPER/SUB)
```

## 12. Admin — Two-Factor Authentication (4 endpoints)

Deliberately **not** role-gated: every admin manages the second factor on their own account, `VIEWER` included — a read-only admin still has to be able to secure their own login. All four are rate limited.

```
GET    /admin/2fa/status             - Is 2FA enrolled for me?              (any admin)
POST   /admin/2fa/setup              - Generate secret + otpauth:// URI     (any admin)
POST   /admin/2fa/enable             - Prove possession, activate 2FA [Zod] (any admin)
POST   /admin/2fa/disable            - Turn off 2FA: password + code  [Zod] (any admin)
```

Disabling is a privilege de-escalation, so it re-proves **both** the password and possession of the device — a hijacked live session cannot quietly strip the second factor.

## 13. Admin — KYC Approval Pipeline (2 endpoints)

```
GET    /admin/kyc/pending            - Review queue with documents exposed  (any admin)
GET    /admin/kyc/:id                - One application in full              (any admin)
```

## 14. Admin — Seller Management (7 endpoints)

```
GET    /admin/sellers                - All sellers (filter by KYC status)   (any admin)
GET    /admin/sellers/:id            - Seller detail                        (any admin)
POST   /admin/sellers/:id/approve    - Approve KYC                          (SUPER_ADMIN)
POST   /admin/sellers/:id/reject     - Reject KYC (reason required)   [Zod] (SUPER_ADMIN)
POST   /admin/sellers/:id/suspend    - Suspend seller (reason required)[Zod] (SUPER_ADMIN)
POST   /admin/sellers/:id/unsuspend  - Lift suspension                      (SUPER_ADMIN)
PATCH  /admin/sellers/:id/badge      - Update badge tier                    (SUPER_ADMIN)
```

## 15. Admin — Listings & Quality Control (4 endpoints)

```
GET    /admin/listings                - All listings (default: pending review) (any admin)
POST   /admin/listings/:id/approve    - Approve listing → goes live            (SUPER/SUB)
POST   /admin/listings/:id/reject     - Reject listing                         (SUPER/SUB)
POST   /admin/listings/:id/spot-check - Record PASS/FAIL quality audit         (SUPER/SUB)
```

## 16. Admin — Content Control (14 endpoints)

Reads open to all three roles; every write is `SUPER_ADMIN` only — content changes are platform-wide and instantly visible to buyers and sellers. `DELETE` is a soft delete (`active = false`), never a row removal.

```
GET    /admin/content/categories          - List property categories        (any admin)
POST   /admin/content/categories          - Create category           [Zod] (SUPER_ADMIN)
PATCH  /admin/content/categories/:id      - Update category           [Zod] (SUPER_ADMIN)
DELETE /admin/content/categories/:id      - Soft-delete category            (SUPER_ADMIN)

GET    /admin/content/service-areas       - List cities/tehsils             (any admin)
POST   /admin/content/service-areas       - Add service area          [Zod] (SUPER_ADMIN)
PATCH  /admin/content/service-areas/:id   - Update service area       [Zod] (SUPER_ADMIN)
DELETE /admin/content/service-areas/:id   - Soft-delete service area        (SUPER_ADMIN)

GET    /admin/content/disclaimers         - List disclaimers                (any admin)
PUT    /admin/content/disclaimers         - Upsert by key, bumps ver  [Zod] (SUPER_ADMIN)

GET    /admin/content/banners             - List banners                    (any admin)
POST   /admin/content/banners             - Create banner             [Zod] (SUPER_ADMIN)
PATCH  /admin/content/banners/:id         - Update banner             [Zod] (SUPER_ADMIN)
DELETE /admin/content/banners/:id         - Soft-delete banner              (SUPER_ADMIN)
```

## 17. Admin — Analytics (7 endpoints)

```
GET    /admin/analytics/overview        - Platform stats: users, GMV, revenue  (any admin)
GET    /admin/analytics/funnel          - Free check → paid conversion funnel  (any admin)
GET    /admin/analytics/top-sellers     - Top earning sellers                  (any admin)
GET    /admin/analytics/top-cities      - Most active cities                   (any admin)
GET    /admin/analytics/monthly-revenue - Month-over-month revenue             (any admin)
GET    /admin/analytics/risk-breakdown  - GREEN/AMBER/RED distribution         (any admin)
GET    /admin/analytics/subscriptions   - Alert subscription dashboard         (any admin)
```

> `monthlyRenewalRate` currently returns **`null`**, not `0` — so a dashboard can distinguish "nobody renewed" from "not computable yet". `subscriberChurnRate` is computed for real (Day 4).

## 18. Admin — Buyers, Refunds & Reports (9 endpoints)

```
GET    /admin/buyers                    - All registered buyers                (any admin)

GET    /admin/refunds                   - All refunds                          (any admin)
POST   /admin/refunds                   - Create refund                        (SUPER_ADMIN)
POST   /admin/refunds/:id/process       - Process refund                       (SUPER_ADMIN)
POST   /admin/refunds/:id/reject        - Reject refund                        (SUPER_ADMIN)

GET    /admin/reports/revenue           - Revenue report                       (any admin)
GET    /admin/reports/settlements       - Settlement report                    (any admin)
GET    /admin/reports/qc                - Quality control report               (any admin)
GET    /admin/alert-subs                - All active alert subscriptions       (any admin)
```

## 19. Admin — Audit Trail (2 endpoints)

Reads are open to all three roles (compliance review is a read-only job); the manual write is limited to the roles that can actually mutate something, so a `VIEWER` cannot inject entries into the trail.

```
GET    /admin/audit-logs             - Paginated admin action trail            (any admin)
POST   /admin/audit-logs             - Record a manual entry                   (SUPER/SUB)
```

## 20. Health Check (1 endpoint)

```
GET    /                             - API status (no auth required)
```

---

## Day 8 carry-over additions (folded into the categories above, listed separately for traceability)

- `POST /api/special-requests/:id/retry` — reopen checkout for a `PENDING`, unpaid request.
- `admin/special-requests/:id/assign` — `sellerId` is now optional; omitting it auto-selects the nearest qualified seller in that tehsil via `sellerMatch.service.ts`.
- `POST /api/webhooks/msg91` + `GET /api/admin/sms-delivery-logs` — Msg91 delivery-report webhook and its admin-facing read.
- Weekly settlement now folds in `SpecialRequestPayout` rows alongside listing-purchase settlements.
