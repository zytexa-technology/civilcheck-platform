# Deploying to Railway (API) + Vercel (admin/seller panels)

**Prepared:** 2026-08-06. Covers a **demo/staging** deploy — mocks stay active for OTP login, KYC uploads, and payments (no real Msg91/Razorpay/Cloudinary/Firebase credentials needed). Reuses the existing dev Neon database rather than provisioning a new one.

Config files already added to the repo for this:
- `railway.json` (repo root) — build/start/migration commands for the API service.
- `apps/admin/vercel.json`, `apps/seller/vercel.json` — SPA rewrite fallback (both panels use `react-router-dom`'s `BrowserRouter`, which needs a catch-all rewrite to `index.html` on static hosting, or direct links to any in-app route 404).

`apps/buyer` (Expo/React Native) is **not** part of this — it's a mobile app, not deployable to Railway/Vercel. Distribution is via EAS Build / app stores, a separate task.

---

## The one thing that matters most: `NODE_ENV`

Every mock adapter in this backend (OTP login, Firebase SSO, Razorpay, RazorpayX, Cloudinary) checks `process.env.NODE_ENV === 'production'` and **hard-refuses to run its mock path** if that's true and no real credentials are set — by design, so a misconfigured real production deploy can't silently fake success. Since this deploy has no real credentials, **do not let `NODE_ENV` end up as `production`** or the entire app breaks (no login, no uploads, no payments).

Railway's Nixpacks builder sets `NODE_ENV=production` automatically unless overridden. **You must explicitly set a Railway service variable:**

```
NODE_ENV=staging
```

(Any value other than the literal string `production` works — `staging` is just descriptive.) Nothing else in the codebase branches on `NODE_ENV` except this adapter guard and the Jest rate-limiter relaxation (`NODE_ENV=test` only), so this one variable is the whole story.

---

## Step 1 — Deploy the API to Railway

1. `railway login` (or connect the GitHub repo in the Railway dashboard — either works; `railway.json` at the repo root drives the build either way).
2. New Railway project → new service from this repo. Leave **Root Directory** as the repo root (the pnpm workspace needs to resolve `packages/shared` from the top, not from inside `apps/api`).
3. Set these service variables in the Railway dashboard:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `staging` — **see above, do not skip this** |
   | `DATABASE_URL` | the same value already in your local `apps/api/.env` (reusing the dev Neon DB, per your earlier choice) |
   | `JWT_SECRET` | a fresh secret, **not** your local dev one — generate with `openssl rand -base64 48` or `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `ACCESS_TOKEN_EXPIRY` | `7d` |
   | `ADMIN_SESSION_TIMEOUT_MINUTES` | `30` |
   | `TOTP_ISSUER` | `CivilCheck Admin` (or leave default) |
   | `FRONTEND_URLS` | leave blank for now — fill in after Steps 2–3 give you the Vercel URLs |

   Leave every third-party credential (`MSG91_*`, `RAZORPAY*`, `CLOUDINARY_*`, `FIREBASE_*`) **unset** — that's what keeps the mock adapters active.

4. Deploy. `railway.json` handles the rest: `pnpm install --frozen-lockfile && pnpm build:api` to build, `prisma migrate deploy` as a pre-deploy step (safe no-op here since the reused DB is already current — matters for any future migrations), then `node apps/api/dist/index.js` to start. Railway injects `PORT` automatically — `index.ts` already reads `process.env.PORT`.
5. Note the public URL Railway assigns (e.g. `https://civilcheck-api-production.up.railway.app`). You'll need it in Step 2.
6. Smoke test once it's up:
   ```bash
   curl https://<your-railway-url>/
   # { "message": "CivilCheck API is running 🚀" }

   curl -X POST https://<your-railway-url>/api/auth/send-otp \
     -H "Content-Type: application/json" \
     -d '{"phone":"9999999999"}'
   # response should include an "otp" field (mock mode) — if you get a 503
   # instead, NODE_ENV is still "production"; fix the variable and redeploy
   ```

---

## Step 2 — Deploy the admin panel to Vercel

1. New Vercel project from this repo. Set **Root Directory** to `apps/admin`. Vercel detects the pnpm workspace and the Vite framework automatically.
2. Project → Environment Variables:
   ```
   VITE_API_URL=https://<your-railway-url>   (no trailing slash, no /api suffix)
   ```
3. Deploy. Note the assigned URL (e.g. `https://civilcheck-admin.vercel.app`).

## Step 3 — Deploy the seller panel to Vercel

Same as Step 2, but Root Directory `apps/seller`, same `VITE_API_URL` variable. Note this URL too.

---

## Step 4 — Close the CORS loop

Back in Railway, set:
```
FRONTEND_URLS=https://civilcheck-admin.vercel.app,https://civilcheck-seller.vercel.app
```
(comma-separated, exact origins, no trailing slash — `app.ts` splits on `,` and strips trailing slashes itself, but the scheme+host must match exactly). Redeploy/restart the Railway service so it picks up the new value — `app.ts` reads `FRONTEND_URLS` once at module load, not per-request.

---

## Step 5 — Smoke test end to end

- Admin panel → log in with a seeded demo account (`prisma/seed.ts`): `superadmin@civilcheck.in` / `Super@123` (or `subadmin@` / `viewer@`, same pattern). **These are well-known demo credentials — rotate them (or seed different ones) before sharing this URL beyond your own testing**, since anyone who finds the URL can also find these in the repo.
- Seller panel → register a new seller, verify OTP comes back mocked, walk through KYC upload (Cloudinary mock signature — file won't actually persist anywhere real, but the flow completes).
- Buyer flow (via curl or the mobile app pointed at the Railway URL) → free case check, OTP login, mock Razorpay checkout unlock.

---

## Known caveats of this setup

- **Shared data**: this deploy reuses your local dev Neon DB. Anything created through the deployed app (test registrations, purchases, refunds) shows up in your local dev data too, and vice versa — not isolated.
- **Not a security posture**: with `NODE_ENV≠production`, the mock success paths (KYC "verified", payments "paid") are reachable by anyone who finds the URL and calls the API directly — there's no real money or real identity verification behind them, but the *app believes* there is. Fine for a demo link shared deliberately; don't index it or leave it up indefinitely without knowing that.
- **CI/CD is still disabled** (`.github/workflows/deploy.yml` is fully commented out — see `docs/roadmap.md`) — this is a manual/dashboard-triggered deploy, not an automated one. Re-enabling that workflow is a separate decision, not covered here.
