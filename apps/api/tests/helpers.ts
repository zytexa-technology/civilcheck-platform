// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures for the integration suite. Runs against the same Neon dev DB
// used throughout Days 1-6 (see roadmap.md Day 7 — no separate test DB is
// provisioned for this pilot), so every helper generates unique phone/email
// values per call rather than relying on fixed seed rows, and tests clean up
// their own rows in `afterAll`.
// ─────────────────────────────────────────────────────────────────────────────
import request from 'supertest'
import bcrypt from 'bcryptjs'
import app from '../src/app.js'
import prisma from '../src/lib/prisma.js'
import { signMockPaymentResponse } from '../src/lib/razorpay.js'

export const ADMIN_EMAIL = 'superadmin@civilcheck.in'
export const ADMIN_PASSWORD = 'Super@123'

let counter = 0
export function uniquePhone(): string {
  counter += 1
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, '0')
  // starts with 9 (valid Indian mobile prefix), 10 digits total
  return `9${Date.now().toString().slice(-3)}${rand}`.slice(0, 10)
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@test.civilcheck.in`
}

// Satisfies passwordSchema (min 8 chars, at least one letter + one number)
// for every fixture that registers a buyer/seller/admin.
export const TEST_PASSWORD = 'Test1234'

// Satisfies addressSchema (min 10 chars) for every fixture that registers a
// buyer/seller — Signup Email Verification made this a required field.
const TEST_ADDRESS = '221B QA Test Street, Baker Colony, Jaipur, Rajasthan'

// Signup Email Verification (see emailVerification.service.ts) never returns
// the real OTP anywhere the test process can read it — by design, the same
// as production. Every fixture that needs a verified account instead swaps
// the stored hash to a value it controls, exactly as this feature's own live
// QA scripts did: same bcrypt mechanism and round count as production
// (OTP_BCRYPT_ROUNDS = 10 in emailVerification.service.ts), same DB column
// (otpHash), never persisted in plaintext, never logged, never a real code.
const FIXTURE_OTP = '013579'

async function forceKnownOtp(column: 'userId' | 'sellerId', accountId: string): Promise<void> {
  const hash = await bcrypt.hash(FIXTURE_OTP, 10)
  const row = await prisma.passwordResetOtp.findFirst({
    where: { [column]: accountId, purpose: 'EMAIL_VERIFICATION' },
    orderBy: { createdAt: 'desc' },
  })
  if (!row) throw new Error(`No EMAIL_VERIFICATION OTP row found for ${column}=${accountId}`)
  await prisma.passwordResetOtp.update({ where: { id: row.id }, data: { otpHash: hash } })
}

// The Neon dev DB's serverless pooler occasionally can't hand out a
// connection/transaction slot fast enough under this suite's rapid
// sequential requests ("Unable to start a transaction in the given time",
// pool timeouts) — a transient infra hiccup, not an application bug. Every
// mutating fixture call below goes through this retry.
const TRANSIENT_ERROR = /unable to start a transaction|timed out fetching|connection.*(closed|terminated|reset)/i

async function withTransientRetry<T extends { body: { success?: boolean; message?: string } }>(
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let last: T
  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = await fn()
    if (last.body.success !== false) return last
    if (!TRANSIENT_ERROR.test(last.body.message ?? '')) return last
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt))
  }
  return last!
}

export async function loginAdmin(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/admin/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  if (!res.body.success) throw new Error(`Admin login failed: ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

// Signup Email Verification changed this in two ways: (1) registration now
// requires address/confirmPassword and (2) it creates an UNVERIFIED account
// with no token — POST /api/auth/verify-email is what actually issues a
// session. This helper still returns the exact same { token, userId, phone }
// shape every existing caller expects; it just gets there via register →
// (controlled OTP) → verify instead of register alone.
export async function registerAndLoginBuyer(): Promise<{ token: string; userId: string; phone: string }> {
  const phone = uniquePhone()
  const email = uniqueEmail('buyer')
  const registerRes = await withTransientRetry(() =>
    request(app)
      .post('/api/auth/register')
      .send({ phone, name: 'Test Buyer', email, address: TEST_ADDRESS, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD })
  )
  if (!registerRes.body.success) throw new Error(`Buyer register failed: ${JSON.stringify(registerRes.body)}`)
  // The register response is deliberately unauthenticated (requiresVerification:
  // true, no token/user) — the account id has to be looked up directly.
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })

  await forceKnownOtp('userId', user.id)
  const verifyRes = await withTransientRetry(() =>
    request(app).post('/api/auth/verify-email').send({ email, otp: FIXTURE_OTP })
  )
  if (!verifyRes.body.success) throw new Error(`Buyer email verification failed: ${JSON.stringify(verifyRes.body)}`)

  return { token: verifyRes.body.token as string, userId: verifyRes.body.user.id as string, phone }
}

// Signup Email Verification made the same two changes on the Partner side:
// registration requires address/confirmPassword and no longer returns a
// seller object or token — POST /api/auth/seller/verify-email does. That
// verify response already carries the same session shape the old
// POST /api/auth/seller/login call existed only to obtain, so the separate
// login step is no longer necessary (a verified account's JWT is identical
// either way — sellerMiddleware re-checks kycStatus from the DB per request,
// never from the token). This helper still returns the exact same
// { token, sellerId, phone } shape every existing caller expects.
export async function registerApprovedSeller(
  adminToken: string,
  partnerRole: 'OWNER' | 'REPORTER' | 'EXPERT' = 'EXPERT'
): Promise<{ token: string; sellerId: string; phone: string }> {
  const phone = uniquePhone()
  const email = uniqueEmail('seller')
  const registerRes = await withTransientRetry(() =>
    request(app).post('/api/seller/register').send({
      phone,
      name: 'Test Seller',
      email,
      address: TEST_ADDRESS,
      password: TEST_PASSWORD,
      confirmPassword: TEST_PASSWORD,
      profession: 'LAWYER',
      partnerRole,
      // sellerRegistrationSchema requires yearsOfExperience for EXPERT
      // applications (Property Expert KYC hardening) — OWNER/REPORTER never
      // send it, same as before.
      ...(partnerRole === 'EXPERT' ? { yearsOfExperience: 5 } : {}),
      tcAccepted: true,
    })
  )
  if (!registerRes.body.success) throw new Error(`Seller register failed: ${JSON.stringify(registerRes.body)}`)
  // The register response is deliberately unauthenticated (requiresVerification:
  // true, no seller/token) — the account id has to be looked up directly.
  const seller = await prisma.seller.findUniqueOrThrow({ where: { email } })

  await forceKnownOtp('sellerId', seller.id)
  const verifyRes = await withTransientRetry(() =>
    request(app).post('/api/auth/seller/verify-email').send({ email, otp: FIXTURE_OTP })
  )
  if (!verifyRes.body.success) throw new Error(`Seller email verification failed: ${JSON.stringify(verifyRes.body)}`)
  const sellerId = verifyRes.body.seller.id as string

  // Owners and Reporters auto-activate on registration (Partner Module item
  // 1.8; Phase 4A extends the same instant-approve to Reporter), so the admin
  // approve step is a no-op that would return "already approved". Only drive
  // it for fixtures that actually start PENDING (e.g. experts).
  if (verifyRes.body.seller.kycStatus !== 'APPROVED') {
    const approveRes = await withTransientRetry(() =>
      request(app).post(`/api/admin/sellers/${sellerId}/approve`).set('Authorization', `Bearer ${adminToken}`)
    )
    if (!approveRes.body.success) throw new Error(`Seller approve failed: ${JSON.stringify(approveRes.body)}`)
  }

  return { token: verifyRes.body.token as string, sellerId, phone }
}

export async function createApprovedListing(
  sellerToken: string,
  adminToken: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const createRes = await withTransientRetry(() =>
    request(app)
      .post('/api/seller/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        address: `Test Plot ${Date.now()}-${Math.floor(Math.random() * 1e6)}, Vaishali Nagar`,
        propertyType: 'RESIDENTIAL',
        city: 'Jaipur',
        tehsil: 'Sanganer',
        caseExists: false,
        price: 199,
        researchDate: new Date().toISOString(),
        ...overrides,
      })
  )
  if (!createRes.body.success) throw new Error(`Listing create failed: ${JSON.stringify(createRes.body)}`)
  const listingId = createRes.body.listing.id as string

  const approveRes = await withTransientRetry(() =>
    request(app).post(`/api/admin/listings/${listingId}/approve`).set('Authorization', `Bearer ${adminToken}`)
  )
  if (!approveRes.body.success) throw new Error(`Listing approve failed: ${JSON.stringify(approveRes.body)}`)

  return listingId
}

// Drives the full mock Razorpay order → verify handshake, same as a real
// buyer checkout, and returns the resulting Purchase id.
export async function purchaseListing(buyerToken: string, listingId: string): Promise<string> {
  const orderRes = await withTransientRetry(() =>
    request(app).post('/api/purchases').set('Authorization', `Bearer ${buyerToken}`).send({ listingId })
  )
  if (!orderRes.body.success) throw new Error(`Purchase order failed: ${JSON.stringify(orderRes.body)}`)

  if (orderRes.body.alreadyPurchased) {
    return orderRes.body.purchase.id as string
  }

  const orderId = orderRes.body.order.id as string
  const paymentId = `pay_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const signature = signMockPaymentResponse(orderId, paymentId)

  const verifyRes = await withTransientRetry(() =>
    request(app)
      .post('/api/purchases/verify')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
  )
  if (!verifyRes.body.success) throw new Error(`Purchase verify failed: ${JSON.stringify(verifyRes.body)}`)

  return verifyRes.body.purchase.id as string
}

// Backdates updatedAt via raw SQL — bypasses Prisma's @updatedAt
// auto-management so the SLA sweep sees a genuinely overdue row.
export async function backdateSpecialRequest(id: string, hoursAgo: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "SpecialRequest" SET "updatedAt" = now() - (${hoursAgo}::text || ' hours')::interval
    WHERE id = ${id}
  `
}

// Notification.sellerId is a RESTRICT foreign key (no cascade — see
// Notification model), and every seller fixture triggers at least one
// notification (KYC approval). Deleting a seller without clearing its
// notifications first throws a FK violation, so every cleanup goes through
// this helper rather than a bare `prisma.seller.deleteMany`.
export async function deleteSeller(sellerId: string): Promise<void> {
  await prisma.notification.deleteMany({ where: { sellerId } })
  await prisma.specialRequestPayout.deleteMany({ where: { sellerId } })
  // Reporter Reward Ledger (Phase 4A) — same RESTRICT-FK reasoning as
  // Notification above; every Reporter fixture that earns/redeems points
  // leaves rows here.
  await prisma.redeemRequest.deleteMany({ where: { sellerId } })
  await prisma.rewardTransaction.deleteMany({ where: { sellerId } })
  await prisma.property.deleteMany({ where: { sellerId } })
  // Signup Email Verification — PasswordResetOtp.sellerId is also a RESTRICT
  // FK, and every seller fixture now has at least one row here (the welcome
  // verification email at registration).
  await prisma.passwordResetOtp.deleteMany({ where: { sellerId } })
  await prisma.seller.deleteMany({ where: { id: sellerId } })
}

// Every RESTRICT foreign key that points at User (PaymentOrder, Refund,
// Review, ReportFlag, SearchQuery, Subscription, Alert, SpecialRequest,
// Purchase) must be cleared before the User row itself can go — same
// reasoning as deleteSeller above, just with more child tables.
export async function deleteBuyer(userId: string): Promise<void> {
  await prisma.refund.deleteMany({ where: { userId } })
  await prisma.review.deleteMany({ where: { userId } })
  await prisma.reportFlag.deleteMany({ where: { userId } })
  await prisma.searchQuery.deleteMany({ where: { userId } })
  await prisma.paymentOrder.deleteMany({ where: { userId } })
  await prisma.subscription.deleteMany({ where: { userId } })
  await prisma.alert.deleteMany({ where: { userId } })
  // SpecialRequestPayout.specialRequestId is a RESTRICT FK — must go before
  // the SpecialRequest rows it points at.
  await prisma.specialRequestPayout.deleteMany({ where: { specialRequest: { userId } } })
  await prisma.specialRequest.deleteMany({ where: { userId } })
  await prisma.purchase.deleteMany({ where: { userId } })
  // Signup Email Verification — PasswordResetOtp.userId is also a RESTRICT
  // FK, and every buyer fixture now has at least one row here (the welcome
  // verification email at registration).
  await prisma.passwordResetOtp.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
}

afterAll(async () => {
  await prisma.$disconnect()
})

export { app, prisma, withTransientRetry }
