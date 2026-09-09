// ─────────────────────────────────────────────────────────────────────────────
// Express app construction, separated from index.ts's app.listen() + scheduler
// wiring so the Jest/supertest suite (Day 7) can import `app` directly and
// drive it in-process without binding a port.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import logger from './lib/logger.js'
import prisma from './lib/prisma.js'
import authRoutes from './routes/auth.routes.js'
import sellerRoutes from './routes/seller.routes.js'
import listingRoutes from './routes/listing.routes.js'
import propertyRoutes from './routes/property.routes.js'
import propertyOwnerRoutes from './routes/property-owner.routes.js'
import reporterPostRoutes from './routes/reporterPost.routes.js'
import reporterPostFeedRoutes from './routes/reporterPostFeed.routes.js'
import rewardRoutes from './routes/reward.routes.js'
import ownerPropertyRoutes from './routes/ownerProperty.routes.js'
import adminRoutes from './routes/admin.routes.js'
import contentRoutes from './routes/content.routes.js'
import alertRoutes from './routes/alert.routes.js'
import earningsRoutes from './routes/earnings.routes.js'
import notificationRoutes, { buyerNotificationRouter } from './routes/notification.routes.js'
import purchaseRoutes from './routes/purchase.routes.js'
import webhookRoutes from './routes/webhook.routes.js'
import { buyerSubscriptionRouter, sellerSubscriptionRouter } from './routes/subscription.routes.js'
import {
  buyerSpecialRequestRouter,
  sellerSpecialRequestRouter,
  adminSpecialRequestRouter,
} from './routes/specialRequest.routes.js'
import {
  buyerVerificationRouter,
  expertVerificationRouter,
  adminMarketplaceRouter,
} from './routes/verification.routes.js'
import { buyerSupportRouter, partnerSupportRouter } from './routes/support.routes.js'
import feedRoutes from './routes/feed.routes.js'

// ─── CORS ─────────────────────────────────────────────────────────────────
const localOrigins = [
  'http://localhost:5173', // seller app (vite)
  'http://localhost:5174', // admin app
  'http://localhost:3000', // buyer app (react native)
  'http://localhost:8081', // buyer app web(react native)
  'http://localhost:8098',
  'http://localhost:5175', // buyer-web (vite)
]

// Known-stable production origins hardcoded here (not FRONTEND_URLS-dependent)
// so they can't be lost to an env var that's out of sync with what's actually
// deployed — see docs/deployment.md's CORS section for the incident this
// guards against.
const productionOrigins = [
  'https://civilcheck-partner.vercel.app', // Seller/Partner Portal (Vercel)
]

const envOrigins = (process.env.FRONTEND_URLS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, '')) // trailing slash hata do
  .filter(Boolean)

const allowedOrigins = [...localOrigins, ...productionOrigins, ...envOrigins]

const app = express()

// Behind Railway's proxy the socket IP is the platform's, not the client's.
// Trust one proxy hop so req.ip / X-Forwarded-For reflect the real caller —
// otherwise AuditLog.ipAddress records the proxy for every admin action, and any
// client-IP read in the webhook path is wrong.
app.set('trust proxy', 1)

// Secure HTTP headers — sabse pehle lagao (routes se pehle)
app.use(helmet())

app.use(
  cors({
    origin: (origin, callback) => {
      // Postman / server-to-server (origin undefined) allow
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true)
      logger.warn(`[CORS] blocked origin: ${origin}`)
      return callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  })
)

// ─── RAZORPAY WEBHOOK — raw body BEFORE express.json() ──────────────────────
// Webhook signature verification hashes the exact bytes Razorpay sent, so this
// path must stay unparsed: re-serialized JSON would not match the signature.
// express.raw() runs here (ahead of the global JSON parser) and leaves req.body
// a Buffer for the webhook router, which mounts on this same path in the next
// pass. Once a body parser has run, the express.json() below skips this
// request, so there is no double-parse. Do not move this after express.json().
app.use('/api/webhooks/razorpay', express.raw({ type: 'application/json' }))

app.use(express.json())

// Webhook router mounts on the same path — express.raw() above already ran, so
// req.body is the raw Buffer the signature check needs, and express.json()
// skips a request whose body a parser has already claimed.
app.use('/api/webhooks/razorpay', webhookRoutes)

// ─── ROUTES ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/seller', sellerRoutes)
app.use('/api/seller/listings', listingRoutes)
app.use('/api/seller/properties', propertyOwnerRoutes) // ← Owner properties (naya)
app.use('/api/seller/reporter-posts', reporterPostRoutes) // Reporter content posts — not Property (Reporter/Owner architecture split)
app.use('/api/seller/reporter/rewards', rewardRoutes) // Reporter reward ledger (Phase 4A) — manual ADMIN_ADJUSTMENT only, see reward.service.ts
app.use('/api/seller/earnings', earningsRoutes)
app.use('/api/seller/special-requests', sellerSpecialRequestRouter)
app.use('/api/seller/notifications', notificationRoutes)
app.use('/api/notifications', buyerNotificationRouter) // buyer in-app inbox (Phase 4C)
app.use('/api/seller/subscriptions', sellerSubscriptionRouter) // ₹499/mo featured (PDF 3.3)
app.use('/api/properties', propertyRoutes)
app.use('/api/owner-properties', ownerPropertyRoutes) // Owner self-verification — free, separate from paid Listing reports. No "Verified" badge — see ownerProperty.controller.ts
app.use('/api/reporter-posts', reporterPostFeedRoutes) // Public Reporter content feed — informational, not a listing, no admin gate
app.use('/api/purchases', purchaseRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/admin/special-requests', adminSpecialRequestRouter)
app.use('/api/content', contentRoutes) // public Content Control reads (PDF 5.4)
app.use('/api/alerts', alertRoutes)
app.use('/api/subscriptions', buyerSubscriptionRouter) // ₹49/mo case-update alerts (PDF 7.7)
app.use('/api/special-requests', buyerSpecialRequestRouter)
// Property Verification Marketplace (Phase 3)
app.use('/api/verification-requests', buyerVerificationRouter)
app.use('/api/seller/verification-marketplace', expertVerificationRouter)
app.use('/api/admin/verification-marketplace', adminMarketplaceRouter)
// AI / Human Customer Support (Phase 4C)
app.use('/api/support', buyerSupportRouter)
app.use('/api/seller/support', partnerSupportRouter)
// Buyer Web social feed — Like/Save/Comment (Buyer Experience redesign)
app.use('/api/feed', feedRoutes)
app.get('/', (_req, res) => {
  res.json({ message: 'CivilCheck API is running 🚀' })
})

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────
// Production readiness — GET / above only proves the process is up, not that
// it can actually serve a request; Railway's preDeployCommand runs `prisma
// migrate deploy` but nothing probes the app itself afterward. This is a
// lightweight liveness+dependency check for a platform healthcheckPath
// (railway.json): 200 only when the process AND the database are both
// reachable, 503 otherwise. Never exposes DATABASE_URL, a stack trace, or any
// other internal detail — just the two flags a load balancer/orchestrator
// needs to decide whether to route traffic here or restart the container.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.status(200).json({ status: 'ok', database: 'ok' })
  } catch {
    // Logged as a plain warning, not the raw error object — a health probe
    // firing every few seconds must not flood the log with a connection
    // string or driver internals on every failed check, but an operator
    // watching logs still needs to see that the database went unreachable.
    logger.warn('[health] database check failed')
    res.status(503).json({ status: 'error', database: 'error' })
  }
})

// handler for unknown routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  })
})

// global error handler
interface HttpError {
  status?: number
  message?: string
}

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err instanceof Error ? err.stack || err.message : String(err))

  const httpError = err as HttpError

  // Production hardening — every error this codebase throws on purpose
  // (RazorpayError, CloudinaryError, VerificationError, SupportError, ...)
  // sets `status` itself, so its `message` is a deliberately-authored,
  // client-safe string. An error with NO `status` at all is something
  // unexpected — a raw Prisma/pg driver error, a TypeError, a bug — whose
  // `.message` can carry internal detail (query text, column/constraint
  // names) that must never reach a client. Those get a generic message here;
  // the full error is still in the server log above. This only changes
  // behavior for that unexpected-error case — every existing intentional
  // error (400/403/404/502/503, whatever status it already used) keeps its
  // exact message and status code.
  const hasExplicitStatus = typeof httpError.status === 'number'

  res.status(hasExplicitStatus ? httpError.status! : 500).json({
    success: false,
    message: hasExplicitStatus && httpError.message ? httpError.message : 'Internal server error',
  })
})

export default app
