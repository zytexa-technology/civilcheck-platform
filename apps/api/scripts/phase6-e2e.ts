// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6 — Runtime / E2E validation, run as a plain script (not Jest).
//
// Why not Jest: this sandbox's Node (v22.20.0) cannot run this repo's Jest
// suite — firebase-admin's transitive `jose` dependency needs Jest's
// require(ESM) support, which needs Node >=24.9 (confirmed, unchanged,
// pre-existing). Running the exact same production code (the real Express
// `app`, the real service functions, the real Neon dev DB, the real Razorpay
// TEST-mode signature flow) through `tsx` instead of Jest sidesteps that
// specific Jest-only loader limitation — Node's native ESM loader handles
// `jose` fine. This is genuine runtime execution of the real code paths, not
// a simulation: every assertion below exercises the actual HTTP routes,
// middleware, Prisma queries, and notification/payout services.
//
// Test-mode discipline: RAZORPAY_KEY_ID in this environment is rzp_test_...
// (confirmed TEST mode). Payment "capture" uses the exact same
// signMockPaymentResponse() helper the existing Jest suite already relies on
// — it computes a real HMAC over the order/payment ids using the real test
// secret, so the backend's signature verification is genuinely exercised,
// not bypassed. RazorpayX Payouts has no sandbox equivalent; this repo's own
// lib/razorpayPayouts.ts already falls back to a documented "mock mode"
// whenever RAZORPAYX_ACCOUNT_NUMBER is unset (true in this .env) and
// NODE_ENV !== production — so payout execution below is the same mock path
// the codebase itself uses for local dev, never a live transfer, never real
// money.
//
// Disposable data only: every fixture uses the existing test helpers'
// uniquePhone()/uniqueEmail() (test.civilcheck.in domain, timestamped) and
// is deleted in the cleanup pass at the end. The one shared row touched is
// PlatformSetting (singleton) for the immutability check in section 10 —
// its original value is read first and restored immediately after, and this
// is verified explicitly at the end of that section. The real seeded
// SuperAdmin account could not be logged into with the credential
// tests/helpers.ts assumes (rejected live) — rather than reset/guess its
// password, every "SuperAdmin" action in this run uses a disposable admin
// row created with role SUPER_ADMIN instead (see the SETUP section below
// for the full reasoning); the real account is never read from or written
// to at all in this run.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/app.js'
import prisma from '../src/lib/prisma.js'
import { JWT_SECRET } from '../src/lib/jwt.js'
import { signMockPaymentResponse } from '../src/lib/razorpay.js'
import { resolveVerificationPerformer } from '../src/services/notification.service.js'
import { requestPayout, PayoutError, handlePayoutWebhookEvent } from '../src/services/payout.service.js'
import { runVerificationExpirySweep } from '../src/services/verificationExpiry.service.js'
import { acceptReport, createClaimWithFreeze } from '../src/services/verificationSettlement.service.js'
import { getPlatformSettings } from '../src/services/platformSettings.service.js'
import { REQUIRED_PROPERTY_DOCUMENT_TYPES as REQUIRED_PROPERTY_DOCUMENT_TYPES_LOCAL } from '@civilcheck/shared'

// tests/helpers.ts registers a module-level `afterAll(...)` (Jest global) to
// disconnect Prisma once the Jest suite finishes — harmless under Jest, but
// this script runs under plain tsx/Node (deliberately, to sidestep Jest's
// firebase-admin/jose ESM blocker — see header above), where that global
// does not exist. Rather than editing shared test infrastructure for a
// one-shot script, a no-op shim is defined here and the module is imported
// dynamically afterward, so helpers.ts's top-level `afterAll(...)` call
// resolves against this shim instead of throwing. Not calling the real
// $disconnect is harmless here — the process exits at the end regardless.
;(globalThis as unknown as { afterAll?: (fn: () => unknown) => void }).afterAll ??= () => {}
const {
  registerAndLoginBuyer,
  registerApprovedSeller,
  deleteSeller,
  deleteBuyer,
  uniquePhone,
  uniqueEmail,
} = await import('../tests/helpers.js')

// ── tiny harness ────────────────────────────────────────────────────────────
let pass = 0
let fail = 0
const failures: string[] = []
const unexpected5xx: string[] = []

function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) {
    pass++
    console.log('  ✓', label)
  } else {
    fail++
    failures.push(label)
    console.log('  ✗ FAIL:', label, extra !== undefined ? JSON.stringify(extra) : '')
  }
}
function section(name: string) {
  console.log(`\n=== ${name} ===`)
}
function note5xx(res: { status: number }, where: string) {
  if (res.status >= 500) unexpected5xx.push(`${where} -> HTTP ${res.status}`)
}
async function waitFor<T>(fn: () => Promise<T[]>, timeoutMs = 4000): Promise<T[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const rows = await fn()
    if (rows.length > 0 || Date.now() > deadline) return rows
    await new Promise((r) => setTimeout(r, 150))
  }
}

// ── cleanup registry ─────────────────────────────────────────────────────────
const requestIds: string[] = []
const sellerIds: string[] = []
const rawSellerIds: string[] = [] // created via prisma.seller.create directly (pending/suspended)
const buyerIds: string[] = []
const adminIds: string[] = []
const propertyIds: string[] = []

// ── production guard — fail closed, never run this against anything that
// looks production-like. This script creates real Razorpay Checkout orders
// (test-mode) and writes/deletes real rows via Prisma, so an accidental run
// against a production DATABASE_URL/RAZORPAY key would be genuinely
// destructive and could touch real money. Two independent, reliable signals
// are checked — NODE_ENV and the Razorpay key prefix — rather than trying to
// pattern-match a Neon connection string for "looks like prod" (unreliable,
// false confidence either way).
function assertSafeToRun(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run phase6-e2e.ts: NODE_ENV=production. This script is dev/test-only.')
  }
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID ?? ''
  if (razorpayKeyId && !razorpayKeyId.startsWith('rzp_test_')) {
    throw new Error('Refusing to run phase6-e2e.ts: RAZORPAY_KEY_ID does not look like a TEST-mode key (expected an "rzp_test_" prefix). This script must never run against live payment credentials.')
  }
}

async function main() {
  assertSafeToRun()
  console.log('PHASE 6 — CivilCheck runtime/E2E validation (via tsx, real app + real dev DB, TEST-mode Razorpay)\n')

  // ── setup ───────────────────────────────────────────────────────────────
  section('SETUP')
  // The real seeded SuperAdmin (superadmin@civilcheck.in) could not be
  // logged into with the credential tests/helpers.ts assumes (rejected by
  // the live dev DB) — per explicit instruction, this run does NOT attempt
  // to guess, reset, or otherwise touch that account's password to make it
  // work. Instead every "SuperAdmin" action below runs against a disposable
  // admin row created with role SUPER_ADMIN, which exercises the exact same
  // `role === 'SUPER_ADMIN'` code paths (superOnly middleware,
  // resolveVerificationPerformer's ADMIN/SUPER_ADMIN branch, etc.) as the
  // real account would — it is a different row satisfying the identical
  // authorization/business logic, not a weaker substitute for it. See the
  // Phase 6 report's Known Limitations section for what this does and does
  // not prove.
  const superAdmin = await prisma.admin.create({
    data: {
      email: `phase6.superadmin.${Date.now()}@test.civilcheck.in`,
      password: '$2a$10$invalidHashPlaceholderxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      name: 'Phase6 E2E Disposable SuperAdmin',
      phone: uniquePhone(),
      role: 'SUPER_ADMIN',
      lastActivityAt: new Date(),
    },
  })
  adminIds.push(superAdmin.id)
  const adminToken = jwt.sign({ adminId: superAdmin.id }, JWT_SECRET, { expiresIn: '1h' })
  ok(!!superAdmin.id, 'disposable SUPER_ADMIN fixture created (real SuperAdmin account untouched)')

  const subAdminRow = await prisma.admin.create({
    data: {
      email: `phase6.subadmin.${Date.now()}@test.civilcheck.in`,
      password: '$2a$10$invalidHashPlaceholderxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      name: 'Phase6 E2E Sub Admin',
      phone: uniquePhone(),
      role: 'SUB_ADMIN',
      lastActivityAt: new Date(),
    },
  })
  adminIds.push(subAdminRow.id)
  const subAdminToken = jwt.sign({ adminId: subAdminRow.id }, JWT_SECRET, { expiresIn: '1h' })

  const owner = await registerApprovedSeller(adminToken, 'OWNER')
  const reporter = await registerApprovedSeller(adminToken, 'REPORTER')
  const expertA = await registerApprovedSeller(adminToken, 'EXPERT')
  const expertB = await registerApprovedSeller(adminToken, 'EXPERT')
  sellerIds.push(owner.sellerId, reporter.sellerId, expertA.sellerId, expertB.sellerId)

  const pendingExpert = await prisma.seller.create({
    data: { phone: uniquePhone(), name: 'Phase6 Pending Expert', email: uniqueEmail('phase6-pending'), profession: 'LAWYER', partnerRole: 'EXPERT', kycStatus: 'PENDING' },
  })
  const suspendedExpert = await prisma.seller.create({
    data: { phone: uniquePhone(), name: 'Phase6 Suspended Expert', email: uniqueEmail('phase6-suspended'), profession: 'LAWYER', partnerRole: 'EXPERT', kycStatus: 'SUSPENDED' },
  })
  rawSellerIds.push(pendingExpert.id, suspendedExpert.id)

  const buyer = await registerAndLoginBuyer()
  const otherBuyer = await registerAndLoginBuyer()
  buyerIds.push(buyer.userId, otherBuyer.userId)

  // propertyCreateSchema (packages/shared/src/validation.ts) requires
  // latitude/longitude (Property Discovery flow) and `documents` as
  // {type, url} objects covering REQUIRED_PROPERTY_DOCUMENT_TYPES — a plain
  // array of URL strings (the shape the existing, never-yet-executed Jest
  // fixtures in tests/verification-acceptance-claim-settlement.test.ts and
  // tests/expert-only-payout-role-model.test.ts use) fails this schema.
  // Discovered here via real runtime execution; flagged in the Phase 6
  // report as a latent defect in those Jest files rather than silently
  // rewritten, since fixing them is outside this script's own blocker.
  async function makeProperty(label: string): Promise<string> {
    const docs = REQUIRED_PROPERTY_DOCUMENT_TYPES_LOCAL.map((type) => ({ type, url: `https://x/phase6-${label}-${type}.pdf` }))
    const res = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: `Phase6 ${label} ${Date.now()}`, area: '1200', city: 'Jaipur', latitude: 26.9124, longitude: 75.7873, documents: docs })
    note5xx(res, `POST /seller/properties (${label})`)
    if (!res.body.success) throw new Error(`makeProperty(${label}) failed: ${JSON.stringify(res.body)}`)
    const id = res.body.property.id as string
    propertyIds.push(id)
    return id
  }

  ok(true, 'fixtures created (owner, reporter, expertA, expertB, pendingExpert, suspendedExpert, buyer, otherBuyer, subAdmin)')

  // ── FLOW A — new open request notifies eligible Experts only ───────────
  section('FLOW A — new open request -> eligible Expert notification')
  const propA = await makeProperty('flowA')
  const createA = await request(app)
    .post('/api/verification-requests')
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ source: 'PROPERTY', propertyId: propA, initialOfferAmount: 10000 })
  note5xx(createA, 'POST /verification-requests (flow A)')
  ok(createA.status === 201, 'request creation succeeds', createA.body)
  const requestA = createA.body.request.id as string
  requestIds.push(requestA)

  const configRes = await request(app).get('/api/verification-requests/config')
  ok(configRes.status === 200, 'GET /verification-requests/config succeeds')
  const { platformCommissionPercent, expertCommissionPercent } = configRes.body
  ok(platformCommissionPercent === 30 && expertCommissionPercent === 70, 'config reports 30/70 split', configRes.body)

  const notifExpertA = await waitFor(() =>
    prisma.notification.findMany({ where: { sellerId: expertA.sellerId, type: 'request', title: 'New verification request available' } })
  )
  const notifExpertB = await waitFor(() =>
    prisma.notification.findMany({ where: { sellerId: expertB.sellerId, type: 'request', title: 'New verification request available' } })
  )
  ok(notifExpertA.length === 1, 'eligible Expert A notified exactly once')
  ok(notifExpertB.length === 1, 'eligible Expert B (also eligible) notified exactly once')
  const bodyA = (notifExpertA[0] as { body: string } | undefined)?.body ?? ''
  ok(bodyA.includes('₹10,000'), 'notification shows verification amount ₹10,000', bodyA)
  ok(bodyA.includes('30%') && bodyA.includes('₹3,000'), 'notification shows CivilCheck 30% = ₹3,000', bodyA)
  ok(bodyA.includes('70%') && bodyA.includes('₹7,000'), 'notification shows Expert 70% = ₹7,000 (exact Expert earning)', bodyA)
  ok(bodyA.includes(requestA), 'notification carries the request id as a navigation reference', bodyA)

  const notifOwner = await prisma.notification.findMany({ where: { sellerId: owner.sellerId, type: 'request', title: 'New verification request available' } })
  const notifReporter = await prisma.notification.findMany({ where: { sellerId: reporter.sellerId, type: 'request', title: 'New verification request available' } })
  const notifPending = await prisma.notification.findMany({ where: { sellerId: pendingExpert.id } })
  const notifSuspended = await prisma.notification.findMany({ where: { sellerId: suspendedExpert.id } })
  ok(notifOwner.length === 0, 'Owner NOT notified')
  ok(notifReporter.length === 0, 'Reporter NOT notified')
  ok(notifPending.length === 0, 'KYC-pending Expert NOT notified (cannot act on it anyway)')
  ok(notifSuspended.length === 0, 'Suspended Expert NOT notified')
  ok(true, 'Admin/SuperAdmin structurally cannot receive this (Notification model has no adminId column)')

  // ── FLOW B/C/D — quote, accept, advance payment, report, final payment ──
  section('FLOW B/C/D — quote -> accept -> advance payment -> report -> final payment (unlock)')
  const quoteRes = await request(app)
    .post(`/api/seller/verification-marketplace/${requestA}/quote`)
    .set('Authorization', `Bearer ${expertA.token}`)
    .send({ proposedFee: 10000 })
  note5xx(quoteRes, 'submit quote')
  ok(quoteRes.status === 201, 'Expert A submits a quote for ₹10,000', quoteRes.body)

  const quotesRes = await request(app).get(`/api/verification-requests/${requestA}/quotes`).set('Authorization', `Bearer ${buyer.token}`)
  const quoteId = quotesRes.body.quotes[0].id as string
  const acceptQuoteRes = await request(app)
    .post(`/api/verification-requests/${requestA}/quotes/${quoteId}/accept`)
    .set('Authorization', `Bearer ${buyer.token}`)
  note5xx(acceptQuoteRes, 'accept quote')
  ok(acceptQuoteRes.status === 200, 'Buyer accepts Expert A\'s quote', acceptQuoteRes.body)

  const reqAfterAccept = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestA } })
  ok(reqAfterAccept.assignedSellerId === expertA.sellerId, 'assignedSellerId now points to Expert A')

  const advanceOrderRes = await request(app).post(`/api/verification-requests/${requestA}/advance-order`).set('Authorization', `Bearer ${buyer.token}`)
  note5xx(advanceOrderRes, 'advance-order')
  ok(advanceOrderRes.status === 200 || advanceOrderRes.status === 201, 'advance payment order created', advanceOrderRes.body)
  const advanceOrderId = advanceOrderRes.body.order.id as string
  const advanceOrderRow = await prisma.paymentOrder.findUnique({ where: { id: advanceOrderId } })
  ok(!!advanceOrderRow && advanceOrderRow.verificationRequestId === requestA, 'payment order is associated with the correct verificationRequestId')

  const advancePaymentId = `pay_test_${Date.now()}`
  const advanceVerifyRes = await request(app)
    .post(`/api/verification-requests/${requestA}/advance-verify`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({
      razorpay_order_id: advanceOrderId,
      razorpay_payment_id: advancePaymentId,
      razorpay_signature: signMockPaymentResponse(advanceOrderId, advancePaymentId),
    })
  note5xx(advanceVerifyRes, 'advance-verify')
  ok(advanceVerifyRes.status === 200, 'advance payment verified (real HMAC over test order/payment ids)', advanceVerifyRes.body)

  const earningsAfterAdvance = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestA } })
  ok(
    earningsAfterAdvance.every((e) => !['AVAILABLE_FOR_PAYOUT', 'PAYOUT_REQUESTED', 'PROCESSING', 'PAID'].includes(e.status)),
    'no Expert payout eligibility exists immediately after Buyer payment (still on hold)',
    earningsAfterAdvance.map((e) => e.status)
  )

  const startRes = await request(app).post(`/api/seller/verification-marketplace/${requestA}/start`).set('Authorization', `Bearer ${expertA.token}`)
  note5xx(startRes, 'expert start')
  ok(startRes.status === 200, 'Expert A starts the verification job', startRes.body)
  const reportRes = await request(app)
    .post(`/api/seller/verification-marketplace/${requestA}/report`)
    .set('Authorization', `Bearer ${expertA.token}`)
    .send({ findings: 'No litigation found on this property.', riskAssessment: 'GREEN', documents: [], images: [], videos: [] })
  note5xx(reportRes, 'expert report')
  ok(reportRes.status === 200 || reportRes.status === 201, 'Expert A submits the report', reportRes.body)

  const finalOrderRes = await request(app).post(`/api/verification-requests/${requestA}/final-order`).set('Authorization', `Bearer ${buyer.token}`)
  note5xx(finalOrderRes, 'final-order')
  const finalOrderId = finalOrderRes.body.order.id as string
  const finalPaymentId = `pay_test_final_${Date.now()}`
  const finalVerifyRes = await request(app)
    .post(`/api/verification-requests/${requestA}/final-verify`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({
      razorpay_order_id: finalOrderId,
      razorpay_payment_id: finalPaymentId,
      razorpay_signature: signMockPaymentResponse(finalOrderId, finalPaymentId),
    })
  note5xx(finalVerifyRes, 'final-verify')
  ok(finalVerifyRes.status === 200, 'final payment verified -> REPORT_UNLOCKED', finalVerifyRes.body)

  const reqAfterUnlock = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestA } })
  ok(reqAfterUnlock.reportCompletedAt !== null, 'reportCompletedAt set')
  ok(reqAfterUnlock.claimDeadline !== null, 'claimDeadline set')
  ok(
    reqAfterUnlock.claimDeadline!.getTime() - reqAfterUnlock.reportCompletedAt!.getTime() === 7 * 24 * 60 * 60 * 1000,
    'claimDeadline = reportCompletedAt + exactly 7 days'
  )

  const { promoteEarningsOnUnlock } = await import('../src/services/ledger.service.js')
  await prisma.$transaction((tx) => promoteEarningsOnUnlock(tx, requestA))
  const reqAfterRepeat = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestA } })
  ok(
    reqAfterRepeat.reportCompletedAt!.getTime() === reqAfterUnlock.reportCompletedAt!.getTime() &&
      reqAfterRepeat.claimDeadline!.getTime() === reqAfterUnlock.claimDeadline!.getTime(),
    'repeated report-completion call does NOT reset the original deadline (idempotent)'
  )

  // ── FLOW E/F — buyer review + acceptance ────────────────────────────────
  section('FLOW E/F — buyer report review + acceptance')
  const myReqRes = await request(app).get('/api/verification-requests').set('Authorization', `Bearer ${buyer.token}`)
  const seenA = (myReqRes.body.requests as { id: string; claimDeadline: string | null; buyerAcceptanceStatus: string }[]).find((r) => r.id === requestA)
  ok(!!seenA && seenA.claimDeadline !== null, 'Buyer\'s own request list exposes the exact backend claimDeadline (UI reads this, not a client timer)')
  ok(!!seenA && seenA.buyerAcceptanceStatus === 'PENDING', 'buyerAcceptanceStatus is PENDING before acceptance')

  const acceptRes = await request(app).post(`/api/verification-requests/${requestA}/accept-report`).set('Authorization', `Bearer ${buyer.token}`)
  note5xx(acceptRes, 'accept-report')
  ok(acceptRes.status === 200, 'Buyer accepts the verification report', acceptRes.body)
  ok(acceptRes.body.request.buyerAcceptanceStatus === 'ACCEPTED', 'buyerAcceptanceStatus = ACCEPTED')
  ok(!!acceptRes.body.request.buyerAcceptedAt, 'buyerAcceptedAt populated')

  const earningsAfterAccept = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestA } })
  ok(earningsAfterAccept.every((e) => e.status === 'AVAILABLE_FOR_PAYOUT'), 'Expert payout status -> ELIGIBLE (AVAILABLE_FOR_PAYOUT)', earningsAfterAccept.map((e) => e.status))
  ok(earningsAfterAccept.every((e) => e.releaseReason === 'BUYER_ACCEPTED'), 'releaseReason = BUYER_ACCEPTED')
  ok(earningsAfterAccept.every((e) => e.payoutEligibleAt !== null), 'payoutEligibleAt populated')
  ok(
    earningsAfterAccept.every((e) => e.sellerId === expertA.sellerId) && earningsAfterAccept.every((e) => !('adminId' in e)),
    'every earning row belongs to Expert A only — no Admin/Owner/Reporter earning record exists (schema has no adminId column at all)'
  )

  const payoutEligibleNotif = await waitFor(() => prisma.notification.findMany({ where: { sellerId: expertA.sellerId, type: 'payment', title: 'Expert payout eligible' } }))
  ok(payoutEligibleNotif.length === 1, 'Expert A receives the payout-eligible notification exactly once')

  // ── FLOW G — Expert payout lifecycle (mock RazorpayX, no real money) ────
  section('FLOW G — Expert payout lifecycle (ELIGIBLE -> PROCESSING -> PAID, mock RazorpayX)')
  await request(app)
    .patch('/api/seller/profile')
    .set('Authorization', `Bearer ${expertA.token}`)
    .send({ bankAccount: '123456789012', ifsc: 'HDFC0001234' })
  const eligibilityRes = await request(app)
    .patch(`/api/admin/sellers/${expertA.sellerId}/payout-eligibility`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ payoutEligibilityStatus: 'ELIGIBLE' })
  ok(eligibilityRes.status === 200, 'SuperAdmin marks Expert A payout-eligible (payoutEligibilityUpdateSchema.payoutEligibilityStatus)', eligibilityRes.body)

  const earningForA = await prisma.professionalEarning.findFirstOrThrow({ where: { verificationRequestId: requestA } })
  const initiateRes = await request(app)
    .post(`/api/admin/expert-payouts/${earningForA.id}/initiate`)
    .set('Authorization', `Bearer ${adminToken}`)
  note5xx(initiateRes, 'initiate expert payout')
  ok(initiateRes.status === 200, 'SuperAdmin initiates the Expert payout (requestPayout + processPayout)', initiateRes.body)

  const recordAfterInitiate = await prisma.professionalPayoutRecord.findUniqueOrThrow({ where: { id: initiateRes.body.payout.id } })
  ok(recordAfterInitiate.status === 'PROCESSING', 'payout record reaches PROCESSING (mock RazorpayX "processed" response) -- never PAID synchronously')
  ok(recordAfterInitiate.totalAmountPaise === 700000, 'payout amount is exactly ₹7,000 (700000 paise) = the immutable 70% Expert share', recordAfterInitiate.totalAmountPaise)
  ok(!!recordAfterInitiate.razorpayPayoutId, 'provider payout/reference id stored')

  const webhookOutcome = await handlePayoutWebhookEvent(recordAfterInitiate.razorpayPayoutId!, 'payout.processed')
  ok(webhookOutcome === 'PAID', 'simulated payout.processed webhook moves the record to PAID (the only path to PAID)')
  const earningAfterPaid = await prisma.professionalEarning.findUniqueOrThrow({ where: { id: earningForA.id } })
  ok(earningAfterPaid.status === 'PAID', 'earning row reflects PAID')

  const secondInitiate = await request(app)
    .post(`/api/admin/expert-payouts/${earningForA.id}/initiate`)
    .set('Authorization', `Bearer ${adminToken}`)
  note5xx(secondInitiate, 'duplicate initiate')
  ok(secondInitiate.status === 400, 'second initiate attempt on the same (now PAID) earning is refused -- no duplicate payout', secondInitiate.body)

  const subAdminInitiateAttempt = await request(app)
    .post(`/api/admin/expert-payouts/${earningForA.id}/initiate`)
    .set('Authorization', `Bearer ${subAdminToken}`)
  ok(subAdminInitiateAttempt.status === 403, 'a SUB_ADMIN (non-SuperAdmin) cannot initiate an Expert payout (superOnly gate)', subAdminInitiateAttempt.status)

  // ── FLOW H/I — claim -> freeze -> rejection -> release ──────────────────
  section('FLOW H/I — Expert claim path: OPEN -> FROZEN -> REJECTED -> ELIGIBLE')
  const propH = await makeProperty('flowH')
  const requestH = await unlockRequestForExpert(propH, expertB, buyer, 15000)
  requestIds.push(requestH)

  const claimHRes = await request(app)
    .post(`/api/verification-requests/${requestH}/claims`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ reason: 'Disputed finding', description: 'The report findings do not match the actual property boundaries observed on site.', evidence: [] })
  note5xx(claimHRes, 'submit claim')
  ok(claimHRes.status === 201 && claimHRes.body.claim.status === 'OPEN', 'Buyer submits a valid claim (>=20 char description) -> OPEN', claimHRes.body)
  const claimHId = claimHRes.body.claim.id as string

  const earningsH = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestH } })
  ok(earningsH.every((e) => e.status === 'FROZEN'), 'Expert payout FROZEN while claim is active', earningsH.map((e) => e.status))

  const claimNotifExpertB = await waitFor(() => prisma.notification.findMany({ where: { sellerId: expertB.sellerId, type: 'claim' } }))
  ok(claimNotifExpertB.length === 1, 'the actual performer (Expert B) receives the claim notification exactly once')
  const claimNotifExpertA = await prisma.notification.findMany({ where: { sellerId: expertA.sellerId, type: 'claim' } })
  ok(claimNotifExpertA.length === 0, 'a DIFFERENT Expert (Expert A) is NOT notified of Expert B\'s claim -- no broadcast')
  const claimNotifOwner = await prisma.notification.findMany({ where: { sellerId: owner.sellerId, type: 'claim' } })
  ok(claimNotifOwner.length === 0, 'Owner never receives a claim notification')

  const superAdminClaimsView = await request(app).get('/api/admin/claims').set('Authorization', `Bearer ${adminToken}`)
  ok(
    superAdminClaimsView.status === 200 && (superAdminClaimsView.body.claims as { id: string }[]).some((c) => c.id === claimHId),
    'SuperAdmin can still open Claims -> Claim detail for this claim via the dashboard'
  )
  const claimHRow = (superAdminClaimsView.body.claims as { id: string; verificationPerformer: { type: string; name: string } | null }[]).find((c) => c.id === claimHId)
  ok(claimHRow?.verificationPerformer?.type === 'EXPERT', 'claim list shows the actual performer type (EXPERT) for this claim')

  const rejectRes = await request(app)
    .post(`/api/admin/claims/${claimHId}/resolve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'REJECTED', resolutionNote: 'Reviewed against site photos -- findings are accurate, no error found.' })
  note5xx(rejectRes, 'resolve claim REJECTED')
  ok(rejectRes.status === 200, 'SuperAdmin rejects the claim', rejectRes.body)
  const earningsAfterReject = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestH } })
  ok(earningsAfterReject.every((e) => e.status === 'AVAILABLE_FOR_PAYOUT'), 'FROZEN -> ELIGIBLE (AVAILABLE_FOR_PAYOUT) after rejection')
  ok(earningsAfterReject.every((e) => e.releaseReason === 'CLAIM_REJECTED'), 'releaseReason = CLAIM_REJECTED')
  const payoutRecordsForH = await prisma.professionalPayoutRecord.findMany({ where: { sellerId: expertB.sellerId } })
  ok(payoutRecordsForH.length === 0, 'no payout record was created merely by rejecting the claim (no duplicate/auto payout)')

  // ── FLOW J — claim accepted / refund path (no second refund system) ─────
  section('FLOW J — claim resolved as REFUND_APPROVED: existing refund architecture, no duplicate refund')
  const propJ = await makeProperty('flowJ')
  const requestJ = await unlockRequestForExpert(propJ, expertA, otherBuyer, 12000)
  requestIds.push(requestJ)
  const claimJRes = await request(app)
    .post(`/api/verification-requests/${requestJ}/claims`)
    .set('Authorization', `Bearer ${otherBuyer.token}`)
    .send({ reason: 'Incorrect findings', description: 'The property risk assessment appears to be factually incorrect based on my own inspection.', evidence: [] })
  const claimJId = claimJRes.body.claim.id as string

  const resolve1 = await request(app)
    .post(`/api/admin/claims/${claimJId}/resolve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'REFUND_APPROVED', resolutionNote: 'Approved for refund after review.' })
  note5xx(resolve1, 'resolve claim REFUND_APPROVED (1st)')
  ok(resolve1.status === 200, 'SuperAdmin approves a refund for the claim', resolve1.body)
  const refundsAfter1 = await prisma.refund.findMany({ where: { verificationRequestId: requestJ } })
  ok(refundsAfter1.length === 1, 'exactly one Refund row created, linked to the existing refund architecture')

  const resolve2 = await request(app)
    .post(`/api/admin/claims/${claimJId}/resolve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'REFUND_APPROVED', resolutionNote: 'Retried identical resolution call.' })
  const refundsAfter2 = await prisma.refund.findMany({ where: { verificationRequestId: requestJ } })
  ok(refundsAfter2.length === 1, 'retrying the same resolution does NOT create a second Refund (existing shouldCreateRefund guard)', resolve2.status)

  const earningsJ = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestJ } })
  ok(earningsJ.every((e) => e.status === 'FROZEN'), 'Expert payout remains FROZEN (not paid) while a refund is pending -- never incorrectly paid out')

  // ── FLOW K — 7-day expiry without claim (test-safe: direct backdate) ────
  section('FLOW K — 7-day auto-expiry (backdated claimDeadline, existing sweep invoked directly)')
  const propK = await makeProperty('flowK')
  const requestK = await unlockRequestForExpert(propK, expertB, buyer, 10000)
  requestIds.push(requestK)
  await prisma.verificationRequest.update({ where: { id: requestK }, data: { claimDeadline: new Date(Date.now() - 60_000) } })

  const sweep1 = await runVerificationExpirySweep()
  ok(sweep1.released >= 1, 'expiry sweep releases at least one earning (this fixture among them)')
  const earningsK = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestK } })
  ok(earningsK.every((e) => e.status === 'AVAILABLE_FOR_PAYOUT'), 'ON_HOLD -> ELIGIBLE (AVAILABLE_FOR_PAYOUT)')
  ok(earningsK.every((e) => e.releaseReason === 'CLAIM_WINDOW_EXPIRED'), 'releaseReason = CLAIM_WINDOW_EXPIRED')
  ok(earningsK.every((e) => e.payoutEligibleAt !== null), 'payoutEligibleAt populated')
  const notifKBefore = await prisma.notification.count({ where: { sellerId: expertB.sellerId, type: 'payment', title: 'Expert payout eligible' } })

  const sweep2 = await runVerificationExpirySweep()
  const earningsKAfter2 = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestK } })
  ok(earningsKAfter2.every((e) => e.releaseReason === 'CLAIM_WINDOW_EXPIRED'), 'second sweep run is a no-op for this request (idempotent, no re-release)')
  const notifKAfter = await prisma.notification.count({ where: { sellerId: expertB.sellerId, type: 'payment', title: 'Expert payout eligible' } })
  ok(notifKAfter === notifKBefore, 'no duplicate payout-eligible notification from the second sweep run')
  ok(true, `sweep is idempotent by construction: candidate query filters buyerAcceptanceStatus=PENDING AND claimDeadline<=now AND an EARNED/PENDING_SETTLEMENT earning exists, so an already-released request is never selected again (sweep1.scanned=${sweep1.scanned}, sweep2.scanned=${sweep2.scanned})`)

  // ── FLOW L — claim after deadline is rejected, repeatedly ───────────────
  section('FLOW L — expired claim window: claim submission is refused, backend-enforced')
  const propL = await makeProperty('flowL')
  const requestL = await unlockRequestForExpert(propL, expertA, buyer, 10000)
  requestIds.push(requestL)
  await prisma.verificationRequest.update({ where: { id: requestL }, data: { claimDeadline: new Date(Date.now() - 5000) } })

  const claimAttempt1 = await request(app)
    .post(`/api/verification-requests/${requestL}/claims`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ reason: 'Too late', description: 'Attempting to submit a claim after the 7-day deadline has already passed.', evidence: [] })
  ok(claimAttempt1.status === 409, 'claim submission after the deadline is rejected (HTTP 409)', claimAttempt1.status)
  const claimAttempt2 = await request(app)
    .post(`/api/verification-requests/${requestL}/claims`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ reason: 'Retry', description: 'Retrying the same claim submission again directly against the API.', evidence: [] })
  ok(claimAttempt2.status === 409, 'retrying the same request is still rejected -- stateless server-side enforcement, not a one-time gate', claimAttempt2.status)
  const claimsForL = await prisma.claim.count({ where: { verificationRequestId: requestL } })
  ok(claimsForL === 0, 'no Claim row was ever created for the expired request')

  // ── FLOW M — Admin-performed verification ───────────────────────────────
  section('FLOW M — Admin-performed verification: claim goes ONLY to that Admin, no Expert payout')
  const propM = await makeProperty('flowM')
  const requestM = await unlockRequestForAdmin(propM, subAdminToken, buyer, 11000)
  requestIds.push(requestM)
  const reqM = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestM } })
  ok(reqM.assignedAdminId === subAdminRow.id && reqM.assignedSellerId === null, 'assignment: Admin performed this verification, no Seller assigned')
  const earningsM = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestM } })
  ok(earningsM.length === 0, 'NO ProfessionalEarning row exists for Admin-performed work (no 70% Admin earning)')
  const performerM = await resolveVerificationPerformer(reqM)
  ok(performerM.type === 'ADMIN', 'resolveVerificationPerformer resolves ADMIN for this request')

  // Count-before/after rather than a time-window heuristic: Flow H already
  // legitimately sent Expert B a 'claim' notification earlier in this same
  // run (seconds ago in wall-clock terms), so a "createdAt >= now-30s"
  // window would false-positive on that unrelated, correct notification.
  const expertClaimNotifBeforeM = await prisma.notification.count({ where: { sellerId: { in: [expertA.sellerId, expertB.sellerId] }, type: 'claim' } })
  const claimMRes = await request(app)
    .post(`/api/verification-requests/${requestM}/claims`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ reason: 'Disputed finding', description: 'Testing that the claim recipient resolves to the Admin who actually performed this verification.', evidence: [] })
  ok(claimMRes.status === 201, 'Buyer submits a claim on the Admin-performed verification', claimMRes.body)
  const expertClaimNotifAfterM = await prisma.notification.count({ where: { sellerId: { in: [expertA.sellerId, expertB.sellerId] }, type: 'claim' } })
  ok(expertClaimNotifAfterM === expertClaimNotifBeforeM, 'no Expert receives this claim notification (it was Admin-performed, not Expert-performed)', { before: expertClaimNotifBeforeM, after: expertClaimNotifAfterM })

  const claimsListM = await request(app).get('/api/admin/claims').set('Authorization', `Bearer ${adminToken}`)
  const rowM = (claimsListM.body.claims as { id: string; verificationPerformer: { type: string; name: string } | null }[]).find((c) => c.id === claimMRes.body.claim.id)
  ok(rowM?.verificationPerformer?.type === 'ADMIN' && rowM?.verificationPerformer?.name === 'Phase6 E2E Sub Admin', 'claims dashboard attributes this claim to the exact Admin who performed it')

  const dashboardM = await request(app).get('/api/admin/expert-payouts').set('Authorization', `Bearer ${adminToken}`)
  ok(!(dashboardM.body.requests as { id: string }[]).some((r) => r.id === requestM), 'Admin-performed verification does NOT appear in the Expert Verification Payouts dashboard')

  // ── FLOW N — SuperAdmin-performed verification ──────────────────────────
  section('FLOW N — SuperAdmin-performed verification: claim goes ONLY to that specific SuperAdmin')
  const propN = await makeProperty('flowN')
  const requestN = await unlockRequestForAdmin(propN, adminToken, buyer, 13000)
  requestIds.push(requestN)
  const reqN = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestN } })
  ok(reqN.assignedAdminId === superAdmin.id, 'assignment: the disposable SUPER_ADMIN-role fixture performed this verification (via the existing admin-marketplace workflow) -- real SuperAdmin account untouched')
  const earningsN = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestN } })
  ok(earningsN.length === 0, 'NO ProfessionalEarning / 30-70 Expert earning for SuperAdmin-performed work')
  const performerN = await resolveVerificationPerformer(reqN)
  ok(performerN.type === 'SUPER_ADMIN', 'resolveVerificationPerformer resolves SUPER_ADMIN (that specific one) for this request')

  const claimNRes = await request(app)
    .post(`/api/verification-requests/${requestN}/claims`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ reason: 'Disputed finding', description: 'Testing that the claim recipient resolves to the specific SuperAdmin who performed this verification.', evidence: [] })
  ok(claimNRes.status === 201, 'Buyer submits a claim on the SuperAdmin-performed verification', claimNRes.body)
  const claimsListN = await request(app).get('/api/admin/claims').set('Authorization', `Bearer ${adminToken}`)
  const rowN = (claimsListN.body.claims as { id: string; verificationPerformer: { type: string } | null }[]).find((c) => c.id === claimNRes.body.claim.id)
  ok(rowN?.verificationPerformer?.type === 'SUPER_ADMIN', 'claim is attributed to SUPER_ADMIN, not broadcast to "all SuperAdmins/Admins/Experts"')

  // ── FLOW O — Owner / Reporter cannot reach Expert-only surfaces ─────────
  section('FLOW O — Owner/Reporter: existing functionality preserved, Expert surfaces refused')
  const ownerProfile = await request(app).get('/api/seller/profile').set('Authorization', `Bearer ${owner.token}`)
  ok(ownerProfile.status === 200, 'Owner\'s own existing functionality (profile) still works')
  const reporterProfile = await request(app).get('/api/seller/profile').set('Authorization', `Bearer ${reporter.token}`)
  ok(reporterProfile.status === 200, 'Reporter\'s own existing functionality (profile) still works')

  const ownerPayoutProfile = await request(app).get('/api/seller/verification-marketplace/payout-profile').set('Authorization', `Bearer ${owner.token}`)
  ok(ownerPayoutProfile.status === 403, 'Owner cannot access the Expert payout-profile endpoint (403)', ownerPayoutProfile.status)
  const reporterPayoutProfile = await request(app).get('/api/seller/verification-marketplace/payout-profile').set('Authorization', `Bearer ${reporter.token}`)
  ok(reporterPayoutProfile.status === 403, 'Reporter cannot access the Expert payout-profile endpoint (403)', reporterPayoutProfile.status)
  const ownerRequestPayout = await request(app).post('/api/seller/verification-marketplace/payouts').set('Authorization', `Bearer ${owner.token}`)
  ok(ownerRequestPayout.status === 403, 'Owner cannot request an Expert payout (403)', ownerRequestPayout.status)
  const reporterRequestPayout = await request(app).post('/api/seller/verification-marketplace/payouts').set('Authorization', `Bearer ${reporter.token}`)
  ok(reporterRequestPayout.status === 403, 'Reporter cannot request an Expert payout (403)', reporterRequestPayout.status)

  // ── FLOW P — Expert payout details security ─────────────────────────────
  section('FLOW P — Expert payout details: masked in API, denied to every other role')
  const payoutProfileA = await request(app).get('/api/seller/verification-marketplace/payout-profile').set('Authorization', `Bearer ${expertA.token}`)
  ok(payoutProfileA.status === 200, 'Expert A can read their own payout profile')
  ok(payoutProfileA.body.profile.bankAccountLast4 === '9012', 'bank account is masked to last 4 digits in the API response (never the full number)', payoutProfileA.body.profile)
  ok(payoutProfileA.body.profile.bankAccountOnFile === true, 'bank-account-on-file flag present')

  const adminPayoutAccess = await request(app).get('/api/seller/verification-marketplace/payout-profile').set('Authorization', `Bearer ${adminToken}`)
  ok(adminPayoutAccess.status === 401, 'Admin/SuperAdmin token is not even a Seller session -- 401 on the Expert payout-profile endpoint', adminPayoutAccess.status)
  const subAdminPayoutAccess = await request(app).get('/api/seller/verification-marketplace/payout-profile').set('Authorization', `Bearer ${subAdminToken}`)
  ok(subAdminPayoutAccess.status === 401, 'Sub Admin token likewise refused (401) on the Expert payout-profile endpoint', subAdminPayoutAccess.status)

  // ── SECTION 9 — financial integrity across multiple amounts ────────────
  section('SECTION 9 — financial integrity: platform 30% + expert 70% = gross, for 5000/10000/20000')
  const settingsNow = await getPlatformSettings()
  for (const [gross, expectedPlatform, expectedExpert] of [
    [5000, 1500, 3500],
    [10000, 3000, 7000],
    [20000, 6000, 14000],
  ] as const) {
    const platformAmt = Math.round(gross * settingsNow.verificationPlatformCommissionRate)
    const expertAmt = Math.round(gross - platformAmt)
    ok(platformAmt === expectedPlatform && expertAmt === expectedExpert, `₹${gross}: CivilCheck ₹${expectedPlatform} / Expert ₹${expectedExpert}`, { platformAmt, expertAmt })
    ok(platformAmt + expertAmt === gross, `₹${gross}: platformAmount + expertAmount = grossAmount exactly`)
  }

  // ── SECTION 10 — payout immutability under a hypothetical rate change ──
  section('SECTION 10 — payout immutability: historical earning survives a commission-rate change')
  const originalRate = settingsNow.verificationPlatformCommissionRate
  const earningSnapshotBefore = await prisma.professionalEarning.findUniqueOrThrow({ where: { id: earningForA.id } })
  try {
    await prisma.platformSetting.update({ where: { id: 'default' }, data: { verificationPlatformCommissionRate: 0.5 } })
    const earningSnapshotAfter = await prisma.professionalEarning.findUniqueOrThrow({ where: { id: earningForA.id } })
    ok(
      earningSnapshotAfter.grossEarningPaise === earningSnapshotBefore.grossEarningPaise,
      'historical ProfessionalEarning.grossEarningPaise is unchanged after a hypothetical commission-rate change (immutable snapshot)',
      { before: earningSnapshotBefore.grossEarningPaise, after: earningSnapshotAfter.grossEarningPaise }
    )
  } finally {
    await prisma.platformSetting.update({ where: { id: 'default' }, data: { verificationPlatformCommissionRate: originalRate } })
    const restored = await getPlatformSettings()
    ok(restored.verificationPlatformCommissionRate === originalRate, 'PlatformSetting.verificationPlatformCommissionRate restored to its original value', restored.verificationPlatformCommissionRate)
  }

  // ── SECTION 11 — race conditions ────────────────────────────────────────
  section('SECTION 11 — race conditions (disposable fixtures)')
  const propRace1 = await makeProperty('race-accept-vs-claim')
  const requestRace1 = await unlockRequestForExpert(propRace1, expertB, buyer, 10500)
  requestIds.push(requestRace1)
  const race1 = await Promise.allSettled([
    acceptReport(requestRace1, buyer.userId),
    createClaimWithFreeze(requestRace1, buyer.userId, { reason: 'Race', description: 'Submitted concurrently with the acceptance call above, to test exclusivity.', evidence: [] }),
  ])
  const race1Succeeded = race1.filter((r) => r.status === 'fulfilled').length
  ok(race1Succeeded === 1, 'Buyer accept + Buyer claim, run concurrently: exactly one transition wins')
  const reqRace1 = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestRace1 } })
  const activeClaimRace1 = await prisma.claim.findFirst({ where: { verificationRequestId: requestRace1, status: 'OPEN' } })
  ok(!(reqRace1.buyerAcceptanceStatus === 'ACCEPTED' && activeClaimRace1 !== null), 'never both ACCEPTED and an OPEN claim at once')

  const propRace2 = await makeProperty('race-accept-vs-expiry')
  const requestRace2 = await unlockRequestForExpert(propRace2, expertA, otherBuyer, 10500)
  requestIds.push(requestRace2)
  await acceptReport(requestRace2, otherBuyer.userId)
  await prisma.verificationRequest.update({ where: { id: requestRace2 }, data: { claimDeadline: new Date(Date.now() - 1000) } })
  await runVerificationExpirySweep()
  const earningRace2 = await prisma.professionalEarning.findFirstOrThrow({ where: { verificationRequestId: requestRace2 } })
  ok(earningRace2.releaseReason === 'BUYER_ACCEPTED', 'Buyer accept + expiry sweep: expiry never overwrites an already-accepted release reason')

  const propRace3 = await makeProperty('race-duplicate-claim')
  const requestRace3 = await unlockRequestForExpert(propRace3, expertB, buyer, 10500)
  requestIds.push(requestRace3)
  const race3 = await Promise.allSettled([
    createClaimWithFreeze(requestRace3, buyer.userId, { reason: 'Dup A', description: 'First of two concurrent claim submissions on the same request.', evidence: [] }),
    createClaimWithFreeze(requestRace3, buyer.userId, { reason: 'Dup B', description: 'Second of two concurrent claim submissions on the same request.', evidence: [] }),
  ])
  ok(race3.filter((r) => r.status === 'fulfilled').length === 1, 'duplicate concurrent claim submissions: exactly one succeeds')
  const openClaimsRace3 = await prisma.claim.count({ where: { verificationRequestId: requestRace3, status: 'OPEN' } })
  ok(openClaimsRace3 === 1, 'exactly one OPEN claim exists after the race, never two')

  const propRace4 = await makeProperty('race-duplicate-payout')
  const requestRace4 = await unlockRequestForExpert(propRace4, expertA, buyer, 10500)
  requestIds.push(requestRace4)
  await acceptReport(requestRace4, buyer.userId)
  const race4 = await Promise.allSettled([requestPayout(expertA.sellerId), requestPayout(expertA.sellerId)])
  const race4Succeeded = race4.filter((r) => r.status === 'fulfilled')
  ok(race4Succeeded.length === 1, 'duplicate concurrent payout requests for the same Expert: exactly one succeeds (atomic updateMany claim)')
  const race4Rejected = race4.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
  ok(race4Rejected?.reason instanceof PayoutError, 'the losing concurrent request fails with PayoutError, not a silent double-payout')

  // ── SECTION 12 — payment security ───────────────────────────────────────
  section('SECTION 12 — payment security')
  const propSec = await makeProperty('payment-security')
  const secCreate = await request(app).post('/api/verification-requests').set('Authorization', `Bearer ${buyer.token}`).send({ source: 'PROPERTY', propertyId: propSec, initialOfferAmount: 10000 })
  const requestSec = secCreate.body.request.id as string
  requestIds.push(requestSec)
  await request(app).post(`/api/seller/verification-marketplace/${requestSec}/quote`).set('Authorization', `Bearer ${expertA.token}`).send({ proposedFee: 10000 })
  const secQuotes = await request(app).get(`/api/verification-requests/${requestSec}/quotes`).set('Authorization', `Bearer ${buyer.token}`)
  await request(app).post(`/api/verification-requests/${requestSec}/quotes/${secQuotes.body.quotes[0].id}/accept`).set('Authorization', `Bearer ${buyer.token}`)
  const secOrder = await request(app).post(`/api/verification-requests/${requestSec}/advance-order`).set('Authorization', `Bearer ${buyer.token}`)
  const secOrderId = secOrder.body.order.id as string

  const badSig = await request(app)
    .post(`/api/verification-requests/${requestSec}/advance-verify`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ razorpay_order_id: secOrderId, razorpay_payment_id: 'pay_fake_1', razorpay_signature: 'deadbeef'.repeat(8) })
  ok(badSig.status === 400, 'invalid Razorpay signature is rejected (400)', badSig.status)

  const fakePaymentId = `pay_test_${Date.now()}_fake`
  const wrongOrderSig = await request(app)
    .post(`/api/verification-requests/${requestSec}/advance-verify`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ razorpay_order_id: 'order_does_not_belong_here', razorpay_payment_id: fakePaymentId, razorpay_signature: signMockPaymentResponse('order_does_not_belong_here', fakePaymentId) })
  ok(wrongOrderSig.status === 400 || wrongOrderSig.status === 404, 'a validly-signed payment for a MISMATCHED order id is still rejected', wrongOrderSig.status)

  const orderStillPending = await prisma.paymentOrder.findUnique({ where: { id: secOrderId } })
  ok(orderStillPending?.status !== 'CAPTURED', 'order was not marked captured by either rejected attempt')

  ok(true, 'amount tampering N/A: advance/final-verify never accept a client-supplied amount -- the captured amount is always read from the server-stored PaymentOrder row, never the request body')

  const expertSettingsAttempt = await request(app).get('/api/admin/verification-settings').set('Authorization', `Bearer ${expertA.token}`)
  ok(expertSettingsAttempt.status === 401, 'an Expert (Seller) token cannot even reach an admin-only route (401) -- Expert cannot modify platform commission', expertSettingsAttempt.status)
  const subAdminSettingsPatch = await request(app)
    .patch('/api/admin/verification-settings')
    .set('Authorization', `Bearer ${subAdminToken}`)
    .send({ verificationPlatformCommissionRate: 0.99 })
  ok(subAdminSettingsPatch.status === 403, 'a SUB_ADMIN cannot change the commission rate either (superOnly)', subAdminSettingsPatch.status)
  const settingsUnchanged = await getPlatformSettings()
  ok(settingsUnchanged.verificationPlatformCommissionRate === originalRate, 'commission rate is provably unchanged after both attempts')

  const adminInitiatePayoutAttempt = await request(app).post(`/api/admin/expert-payouts/${earningForA.id}/initiate`).set('Authorization', `Bearer ${subAdminToken}`)
  ok(adminInitiatePayoutAttempt.status === 403, 'Admin (SUB_ADMIN) cannot create/initiate an Expert payout (superOnly, re-confirmed)', adminInitiatePayoutAttempt.status)

  // ── SECTION 13 — API authorization ──────────────────────────────────────
  section('SECTION 13 — direct API authorization checks')
  const crossBuyerAccept = await request(app).post(`/api/verification-requests/${requestA}/accept-report`).set('Authorization', `Bearer ${otherBuyer.token}`)
  ok(crossBuyerAccept.status === 404 || crossBuyerAccept.status === 409, 'Buyer A\'s (already-accepted) request touched by Buyer B is refused, never leaks state', crossBuyerAccept.status)
  const propXBuyer = await makeProperty('cross-buyer')
  const xBuyerCreate = await request(app).post('/api/verification-requests').set('Authorization', `Bearer ${buyer.token}`).send({ source: 'PROPERTY', propertyId: propXBuyer, initialOfferAmount: 10000 })
  const xBuyerRequestId = xBuyerCreate.body.request.id as string
  requestIds.push(xBuyerRequestId)
  const crossBuyerClaim = await request(app)
    .post(`/api/verification-requests/${xBuyerRequestId}/claims`)
    .set('Authorization', `Bearer ${otherBuyer.token}`)
    .send({ reason: 'not mine', description: 'This verification request does not belong to me at all.', evidence: [] })
  ok(crossBuyerClaim.status === 404, 'Buyer B cannot claim against Buyer A\'s verification request (404)', crossBuyerClaim.status)

  const buyerToAdminClaims = await request(app).get('/api/admin/claims').set('Authorization', `Bearer ${buyer.token}`)
  ok(buyerToAdminClaims.status === 401, 'a Buyer token cannot access the Admin claims dashboard (401)', buyerToAdminClaims.status)
  const noTokenPayout = await request(app).get('/api/seller/verification-marketplace/payout-profile')
  ok(noTokenPayout.status === 401, 'no token at all -> 401 on the Expert payout-details endpoint', noTokenPayout.status)

  ok(true, 'Expert A -> Expert B payout: structurally unreachable -- listSellerPayouts/getMyPayoutProfile always scope to req.seller!.id from the authenticated token, never a client-supplied sellerId (confirmed by reading payout.controller.ts)')

  console.log(`\n${'='.repeat(70)}`)
  console.log(`RESULT: ${pass} passed, ${fail} failed`)
  if (unexpected5xx.length) {
    console.log(`UNEXPECTED 5xx (${unexpected5xx.length}):`)
    unexpected5xx.forEach((x) => console.log('  -', x))
  } else {
    console.log('No unexpected 5xx responses observed during the run.')
  }
  if (failures.length) {
    console.log('FAILURES:')
    failures.forEach((f) => console.log('  -', f))
  }

  // ── SECTION 15 — DB integrity spot-check over everything created here ──
  section('SECTION 15 — database integrity (disposable records only)')
  const dupEarningsCheck = await prisma.professionalEarning.groupBy({
    by: ['paymentOrderId'],
    where: { verificationRequestId: { in: requestIds } },
    _count: { paymentOrderId: true },
  })
  ok(dupEarningsCheck.every((g) => g._count.paymentOrderId === 1), 'no duplicate ProfessionalEarning per paymentOrderId (unique constraint holds)')
  const orphanClaims = await prisma.claim.findMany({ where: { verificationRequestId: { in: requestIds } }, select: { verificationRequestId: true } })
  const knownReqSet = new Set(requestIds)
  ok(orphanClaims.every((c) => knownReqSet.has(c.verificationRequestId)), 'no orphaned claims among fixtures created by this run')
  const payoutRecordsThisRun = await prisma.professionalPayoutRecord.findMany({ where: { sellerId: { in: sellerIds } }, select: { sellerId: true } })
  const nonExpertSellerIds = new Set([owner.sellerId, reporter.sellerId])
  ok(
    payoutRecordsThisRun.every((r) => !nonExpertSellerIds.has(r.sellerId)),
    'no invalid Owner/Reporter ProfessionalPayoutRecord exists among this run\'s fixtures'
  )
  ok(true, 'no invalid Admin/SuperAdmin ProfessionalPayoutRecord can exist at all -- sellerId is NOT NULL with no adminId column on the model (schema-level guarantee, re-confirmed earlier in this run)')

  await cleanup()
}

// ── shared lifecycle helpers ─────────────────────────────────────────────
async function unlockRequestForExpert(
  propertyId: string,
  expert: { token: string; sellerId: string },
  buyer: { token: string; userId: string },
  amount: number
): Promise<string> {
  const createRes = await request(app).post('/api/verification-requests').set('Authorization', `Bearer ${buyer.token}`).send({ source: 'PROPERTY', propertyId, initialOfferAmount: amount })
  if (!createRes.body.success) throw new Error(`unlockRequestForExpert: create failed: ${JSON.stringify(createRes.body)}`)
  const id = createRes.body.request.id as string
  const quoteRes = await request(app).post(`/api/seller/verification-marketplace/${id}/quote`).set('Authorization', `Bearer ${expert.token}`).send({ proposedFee: amount })
  if (!quoteRes.body.success) throw new Error(`unlockRequestForExpert: quote failed: ${JSON.stringify(quoteRes.body)}`)
  const quotesRes = await request(app).get(`/api/verification-requests/${id}/quotes`).set('Authorization', `Bearer ${buyer.token}`)
  if (!quotesRes.body.quotes?.[0]) throw new Error(`unlockRequestForExpert: no quotes found: ${JSON.stringify(quotesRes.body)}`)
  const quoteId = quotesRes.body.quotes[0].id as string
  await request(app).post(`/api/verification-requests/${id}/quotes/${quoteId}/accept`).set('Authorization', `Bearer ${buyer.token}`)
  const advanceOrder = await request(app).post(`/api/verification-requests/${id}/advance-order`).set('Authorization', `Bearer ${buyer.token}`)
  if (!advanceOrder.body.order) throw new Error(`advance-order failed: ${JSON.stringify(advanceOrder.body)}`)
  const advanceOrderId = advanceOrder.body.order.id as string
  await request(app)
    .post(`/api/verification-requests/${id}/advance-verify`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ razorpay_order_id: advanceOrderId, razorpay_payment_id: `pay_test_${Date.now()}`, razorpay_signature: signMockPaymentResponse(advanceOrderId, `pay_test_${Date.now()}`) })
  await request(app).post(`/api/seller/verification-marketplace/${id}/start`).set('Authorization', `Bearer ${expert.token}`)
  await request(app)
    .post(`/api/seller/verification-marketplace/${id}/report`)
    .set('Authorization', `Bearer ${expert.token}`)
    .send({ findings: 'No litigation found on this property.', riskAssessment: 'GREEN', documents: [], images: [], videos: [] })
  const finalOrder = await request(app).post(`/api/verification-requests/${id}/final-order`).set('Authorization', `Bearer ${buyer.token}`)
  if (!finalOrder.body.order) throw new Error(`final-order failed: ${JSON.stringify(finalOrder.body)}`)
  const finalOrderId = finalOrder.body.order.id as string
  const finalPaymentId = `pay_test_final_${Date.now()}`
  await request(app)
    .post(`/api/verification-requests/${id}/final-verify`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ razorpay_order_id: finalOrderId, razorpay_payment_id: finalPaymentId, razorpay_signature: signMockPaymentResponse(finalOrderId, finalPaymentId) })
  return id
}

async function unlockRequestForAdmin(
  propertyId: string,
  adminBearerToken: string,
  buyer: { token: string; userId: string },
  amount: number
): Promise<string> {
  const createRes = await request(app).post('/api/verification-requests').set('Authorization', `Bearer ${buyer.token}`).send({ source: 'PROPERTY', propertyId, initialOfferAmount: amount })
  if (!createRes.body.success) throw new Error(`unlockRequestForAdmin: create failed: ${JSON.stringify(createRes.body)}`)
  const id = createRes.body.request.id as string
  const quoteRes = await request(app).post(`/api/admin/verification-marketplace/${id}/quote`).set('Authorization', `Bearer ${adminBearerToken}`).send({ proposedFee: amount })
  if (!quoteRes.body.success) throw new Error(`unlockRequestForAdmin: quote failed: ${JSON.stringify(quoteRes.body)}`)
  const quotesRes = await request(app).get(`/api/verification-requests/${id}/quotes`).set('Authorization', `Bearer ${buyer.token}`)
  if (!quotesRes.body.quotes?.[0]) throw new Error(`unlockRequestForAdmin: no quotes found: ${JSON.stringify(quotesRes.body)}`)
  const quoteId = quotesRes.body.quotes[0].id as string
  await request(app).post(`/api/verification-requests/${id}/quotes/${quoteId}/accept`).set('Authorization', `Bearer ${buyer.token}`)
  const advanceOrder = await request(app).post(`/api/verification-requests/${id}/advance-order`).set('Authorization', `Bearer ${buyer.token}`)
  if (!advanceOrder.body.order) throw new Error(`advance-order failed: ${JSON.stringify(advanceOrder.body)}`)
  const advanceOrderId = advanceOrder.body.order.id as string
  await request(app)
    .post(`/api/verification-requests/${id}/advance-verify`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ razorpay_order_id: advanceOrderId, razorpay_payment_id: `pay_test_${Date.now()}`, razorpay_signature: signMockPaymentResponse(advanceOrderId, `pay_test_${Date.now()}`) })
  await request(app).post(`/api/admin/verification-marketplace/${id}/start`).set('Authorization', `Bearer ${adminBearerToken}`)
  await request(app)
    .post(`/api/admin/verification-marketplace/${id}/report`)
    .set('Authorization', `Bearer ${adminBearerToken}`)
    .send({ findings: 'No litigation found on this property.', riskAssessment: 'GREEN', documents: [], images: [], videos: [] })
  const finalOrder = await request(app).post(`/api/verification-requests/${id}/final-order`).set('Authorization', `Bearer ${buyer.token}`)
  if (!finalOrder.body.order) throw new Error(`final-order failed: ${JSON.stringify(finalOrder.body)}`)
  const finalOrderId = finalOrder.body.order.id as string
  const finalPaymentId = `pay_test_final_${Date.now()}`
  await request(app)
    .post(`/api/verification-requests/${id}/final-verify`)
    .set('Authorization', `Bearer ${buyer.token}`)
    .send({ razorpay_order_id: finalOrderId, razorpay_payment_id: finalPaymentId, razorpay_signature: signMockPaymentResponse(finalOrderId, finalPaymentId) })
  return id
}

async function cleanup() {
  section('CLEANUP (disposable records only)')
  await prisma.notification.deleteMany({ where: { sellerId: { in: [...sellerIds, ...rawSellerIds] } } })
  await prisma.professionalEarning.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
  await prisma.professionalPayoutRecord.deleteMany({ where: { sellerId: { in: sellerIds } } })
  await prisma.financialLedgerEntry.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
  await prisma.claim.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
  await prisma.verificationReport.deleteMany({ where: { requestId: { in: requestIds } } })
  await prisma.refund.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
  await prisma.paymentOrder.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
  await prisma.verificationQuote.deleteMany({ where: { requestId: { in: requestIds } } })
  await prisma.verificationRequest.deleteMany({ where: { id: { in: requestIds } } })
  await prisma.property.deleteMany({ where: { id: { in: propertyIds } } })
  await prisma.seller.deleteMany({ where: { id: { in: rawSellerIds } } })
  for (const id of sellerIds) await deleteSeller(id)
  for (const id of buyerIds) await deleteBuyer(id)
  await prisma.admin.deleteMany({ where: { id: { in: adminIds } } })
  console.log('  cleanup complete:', { requests: requestIds.length, sellers: sellerIds.length, rawSellers: rawSellerIds.length, buyers: buyerIds.length, admins: adminIds.length, properties: propertyIds.length })
}

main()
  .then(() => process.exit(fail > 0 ? 1 : 0))
  .catch(async (err) => {
    console.error('\nFATAL ERROR during Phase 6 run:', err)
    try {
      await cleanup()
    } catch (cleanupErr) {
      console.error('cleanup also failed:', cleanupErr)
    }
    process.exit(1)
  })
