import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

// Conservative, IP-keyed defaults for authentication endpoints only.
// These do not stop a distributed attack across many IPs — that needs
// infrastructure-level protection — but they block the common single-source
// brute-force / flooding case with minimal impact on legitimate users.

// Jest exercises the real register/login endpoints for every buyer/seller
// fixture, all from one process sharing a single IP key — several test files
// in one run legitimately exceed these production thresholds. Skipped only
// under NODE_ENV=test (which Jest sets itself); staging/production keep the
// full limit enforced.
const isTestEnv = () => process.env.NODE_ENV === 'test'

// Buyer login (/login) — password brute-force guard.
export const buyerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
})

// Seller/partner login (/seller/login) — same guard, separate bucket so a
// buyer and a partner behind the same IP don't share one budget.
export const sellerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
})

// Admin login (/admin/login)
// Guards against password brute-forcing.
//
// Raised from 5 to 10 when 2FA landed. The endpoint now takes a 6-digit code
// that expires every 30 seconds, so a legitimate admin mistypes or submits a
// stale code far more often than with a password alone — and the key is the
// IP, so several admins behind one office NAT share the budget. At 10 per 15
// minutes a brute-force attempt is still hopeless (a 6-digit code alone is a
// million possibilities) while ordinary retries stop locking the office out.
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Production hardening — this was the one login limiter missing the same
  // NODE_ENV=test skip the other three already have (see the top-of-file
  // comment). Adding it only changes test-run behavior: `isTestEnv()` is
  // never true outside `NODE_ENV=test`, so production enforcement is
  // unchanged.
  skip: isTestEnv,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
})

// Admin 2FA enrollment (/api/admin/2fa/*)
// A 6-digit TOTP is only a million possibilities and the accepted window
// spans 90 seconds, so unmetered guessing is a real threat. Keyed per
// authenticated admin — these routes sit behind adminMiddleware, and an IP
// key would let one admin's attempts lock out a colleague behind the same
// office NAT.
export const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.admin?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: { success: false, message: 'Too many 2FA attempts. Please try again later.' },
})

// SuperAdmin-assisted 2FA reset (/api/admin/admins/:id/2fa/reset)
// Not a code-guessing target like the limiter above — this guards against a
// compromised or careless SuperAdmin session mass-resetting other admins'
// second factor. Keyed per acting SuperAdmin (route sits behind
// adminMiddleware), generous enough for genuine recovery cases.
export const adminTwoFactorResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.admin?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: { success: false, message: 'Too many 2FA reset attempts. Please try again later.' },
})

// Password reset — request step. Guards against using the endpoint to
// mass-spam arbitrary inboxes with OTP emails; the service layer's own
// per-account resend cooldown handles the single-target-repeat case
// independently of this. One separate limiter INSTANCE per actor — like
// buyerLoginLimiter/sellerLoginLimiter/adminLoginLimiter above, sharing one
// rate-limit object across routes would share one IP budget across all three
// actors' endpoints, which is not the intent.
function makePasswordResetRequestLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTestEnv,
    message: { success: false, message: 'Too many requests. Please try again later.' },
  })
}
export const buyerPasswordResetRequestLimiter = makePasswordResetRequestLimiter()
export const sellerPasswordResetRequestLimiter = makePasswordResetRequestLimiter()
export const adminPasswordResetRequestLimiter = makePasswordResetRequestLimiter()

// Password reset — verify/reset steps. Higher than the request limiter since
// genuine typos happen, but still bounded — the real brute-force guard is
// the per-OTP `attempts` counter in the database (see
// passwordReset.service.ts's MAX_ATTEMPTS); this is a second, IP-keyed layer
// on top of it. Same one-instance-per-actor reasoning as above.
function makePasswordResetVerifyLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTestEnv,
    message: { success: false, message: 'Too many attempts. Please try again later.' },
  })
}
export const buyerPasswordResetVerifyLimiter = makePasswordResetVerifyLimiter()
export const sellerPasswordResetVerifyLimiter = makePasswordResetVerifyLimiter()
export const adminPasswordResetVerifyLimiter = makePasswordResetVerifyLimiter()

// Buyer registration (/register)
// Lighter guard against mass account creation.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many registration attempts. Please try again later.' },
})

// Signup Email Verification — resend / verify. Same shape and reasoning as
// the password-reset request/verify limiters above (this reuses the same
// PasswordResetOtp table and MAX_ATTEMPTS discipline); one instance per
// actor so a buyer and a partner behind the same IP don't share one budget.
function makeEmailVerificationRequestLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTestEnv,
    message: { success: false, message: 'Too many requests. Please try again later.' },
  })
}
export const buyerEmailVerificationRequestLimiter = makeEmailVerificationRequestLimiter()
export const sellerEmailVerificationRequestLimiter = makeEmailVerificationRequestLimiter()

function makeEmailVerificationVerifyLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTestEnv,
    message: { success: false, message: 'Too many attempts. Please try again later.' },
  })
}
export const buyerEmailVerificationVerifyLimiter = makeEmailVerificationVerifyLimiter()
export const sellerEmailVerificationVerifyLimiter = makeEmailVerificationVerifyLimiter()

// Payment / order-creation endpoints (report unlock, special-request advance)
// Guards against order-flooding and duplicate-charge probing. Keyed per
// authenticated user when available, else per IP.
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: { success: false, message: 'Too many payment attempts. Please try again later.' },
})

// Support-ticket CREATION only (audit 2026-09-02) — every new ticket triggers
// one real Anthropic call (see support.service.ts's advanceTicket), so this is
// a cost/abuse guard, not just an anti-flood one. Deliberately NOT applied to
// reading an existing ticket, replying to one, or any other support route —
// those don't create a new AI-billed conversation.
//
// Mounted on both /api/support/tickets (buyer, req.user) and
// /api/seller/support/tickets (partner, req.seller) — support.controller.ts's
// createTicket is the exact same code path either way, so the cost exposure
// is identical for both actor types; keying on whichever principal is present
// (falling back to IP only for the unauthenticated case, which the route's
// own auth middleware already blocks before this ever matters) keeps one
// malicious account from spending its budget and then simply switching IPs,
// while never conflating two different buyers/partners sharing one network.
//
// Deliberately NOT skipped under NODE_ENV=test like the sibling limiters
// above — this task's own test suite (tests/support-rate-limit.test.ts)
// exercises the actual 429 response, which requires the limiter to be live
// during a Jest run. tests/support-ai.test.ts was adjusted to use a fresh
// buyer per ticket-creating case so it doesn't collide with this budget.
export const supportTicketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.seller?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: { success: false, message: 'Too many support requests. Please try again later.' },
})
