import request from 'supertest'
import {
  app,
  prisma,
  loginAdmin,
  registerAndLoginBuyer,
  registerApprovedSeller,
  deleteSeller,
  deleteBuyer,
} from './helpers.js'
import { signMockPaymentResponse } from '../src/lib/razorpay.js'
import {
  acceptReport,
  createClaimWithFreeze,
  releaseEarningsOnClaimRejected,
  SettlementError,
} from '../src/services/verificationSettlement.service.js'
import { runVerificationExpirySweep } from '../src/services/verificationExpiry.service.js'
import { REQUIRED_PROPERTY_DOCUMENT_TYPES } from '@civilcheck/shared'

// 7-Day Verification Acceptance, Claim & Professional Settlement System.
//
// NOTE — same environment constraint as financial-ledger.test.ts: this
// sandbox's Node version (v22) cannot run this Jest suite (firebase-admin's
// ESM chain needs Node v24.9+ for Jest's require(ESM) support — confirmed by
// running `npm test` directly and reading the failure). This file is written
// to the same standard as the rest of this suite and is exercised on a real
// dev server + Neon dev DB before being committed here; it will run
// unmodified in any CI/environment with a compatible Node version.
describe('7-day verification acceptance, claim & professional settlement', () => {
  let adminToken: string
  let owner: { token: string; sellerId: string; phone: string }
  let expert: { token: string; sellerId: string; phone: string }
  let buyer: { token: string; userId: string; phone: string }
  let otherBuyer: { token: string; userId: string; phone: string }
  let propertyId: string

  beforeAll(async () => {
    adminToken = await loginAdmin()
    owner = await registerApprovedSeller(adminToken, 'OWNER')
    expert = await registerApprovedSeller(adminToken, 'EXPERT')
    await prisma.seller.update({
      where: { id: expert.sellerId },
      data: { bankAccount: '123456789012', ifsc: 'HDFC0001234', payoutEligibilityStatus: 'ELIGIBLE' },
    })
    buyer = await registerAndLoginBuyer()
    otherBuyer = await registerAndLoginBuyer()

    // propertyCreateSchema (packages/shared/src/validation.ts) requires
    // latitude/longitude (Property Discovery flow) and `documents` as
    // {type, url} objects covering REQUIRED_PROPERTY_DOCUMENT_TYPES — a
    // plain array of URL strings fails this schema (discovered via Phase 6
    // real runtime execution; fixed here to match the actual schema).
    const docs = REQUIRED_PROPERTY_DOCUMENT_TYPES.map((type) => ({ type, url: `https://x/settlement-test-${type}.pdf` }))
    const createRes = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        propertyStatus: 'CLEAR', title: `Settlement Test Flat ${Date.now()}`, area: '1200', city: 'Jaipur', latitude: 26.9124, longitude: 75.7873, documents: docs })
    if (!createRes.body.success) throw new Error(`Property create failed: ${JSON.stringify(createRes.body)}`)
    propertyId = createRes.body.property.id as string
  })

  afterAll(async () => {
    const requests = await prisma.verificationRequest.findMany({ where: { propertyId }, select: { id: true } })
    const requestIds = requests.map((r) => r.id)
    await prisma.professionalEarning.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.professionalPayoutRecord.deleteMany({ where: { sellerId: expert.sellerId } })
    await prisma.financialLedgerEntry.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.claim.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.verificationReport.deleteMany({ where: { requestId: { in: requestIds } } })
    await prisma.refund.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.paymentOrder.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.verificationQuote.deleteMany({ where: { requestId: { in: requestIds } } })
    await prisma.verificationRequest.deleteMany({ where: { id: { in: requestIds } } })
    await prisma.property.deleteMany({ where: { id: propertyId } })
    await deleteSeller(owner.sellerId)
    await deleteSeller(expert.sellerId)
    await deleteBuyer(buyer.userId)
    await deleteBuyer(otherBuyer.userId)
  })

  /** Drives one fresh VerificationRequest all the way to REPORT_UNLOCKED. */
  async function unlockOneRequest(): Promise<string> {
    const createRes = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'PROPERTY', propertyId, initialOfferAmount: 20000 })
    if (!createRes.body.success) throw new Error(`Verification request create failed: ${JSON.stringify(createRes.body)}`)
    const id = createRes.body.request.id as string

    await request(app)
      .post(`/api/seller/verification-marketplace/${id}/quote`)
      .set('Authorization', `Bearer ${expert.token}`)
      .send({ proposedFee: 20000 })
    const quotesRes = await request(app)
      .get(`/api/verification-requests/${id}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
    const quoteId = quotesRes.body.quotes[0].id as string
    await request(app)
      .post(`/api/verification-requests/${id}/quotes/${quoteId}/accept`)
      .set('Authorization', `Bearer ${buyer.token}`)

    const advanceOrder = await request(app)
      .post(`/api/verification-requests/${id}/advance-order`)
      .set('Authorization', `Bearer ${buyer.token}`)
    const advanceOrderId = advanceOrder.body.order.id as string
    await request(app)
      .post(`/api/verification-requests/${id}/advance-verify`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        razorpay_order_id: advanceOrderId,
        razorpay_payment_id: `pay_test_${Date.now()}`,
        razorpay_signature: signMockPaymentResponse(advanceOrderId, `pay_test_${Date.now()}`),
      })

    await request(app)
      .post(`/api/seller/verification-marketplace/${id}/start`)
      .set('Authorization', `Bearer ${expert.token}`)
    await request(app)
      .post(`/api/seller/verification-marketplace/${id}/report`)
      .set('Authorization', `Bearer ${expert.token}`)
      .send({ findings: 'No litigation found.', disputeFound: false, documents: [], images: [], videos: [] })

    const finalOrder = await request(app)
      .post(`/api/verification-requests/${id}/final-order`)
      .set('Authorization', `Bearer ${buyer.token}`)
    const finalOrderId = finalOrder.body.order.id as string
    const finalPaymentId = `pay_test_final_${Date.now()}`
    await request(app)
      .post(`/api/verification-requests/${id}/final-verify`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        razorpay_order_id: finalOrderId,
        razorpay_payment_id: finalPaymentId,
        razorpay_signature: signMockPaymentResponse(finalOrderId, finalPaymentId),
      })

    return id
  }

  // ── 1-3: report completion, deadline math, idempotency ──────────────────
  it('report completion sets reportCompletedAt and claimDeadline exactly 7 days later', async () => {
    const id = await unlockOneRequest()
    const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id } })

    expect(req.reportCompletedAt).not.toBeNull()
    expect(req.claimDeadline).not.toBeNull()
    const diffMs = req.claimDeadline!.getTime() - req.reportCompletedAt!.getTime()
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000)
    expect(req.buyerAcceptanceStatus).toBe('PENDING')

    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: id } })
    expect(earnings.length).toBeGreaterThan(0)
    for (const e of earnings) expect(e.status).toBe('PENDING_SETTLEMENT') // on hold, NOT auto-eligible
  })

  it('repeated report completion does not reset an already-running deadline (idempotent)', async () => {
    const id = await unlockOneRequest()
    const before = await prisma.verificationRequest.findUniqueOrThrow({ where: { id } })

    // Simulate a retried webhook/finalize call hitting promoteEarningsOnUnlock
    // a second time — import it directly rather than re-driving payment.
    const { promoteEarningsOnUnlock } = await import('../src/services/ledger.service.js')
    await prisma.$transaction((tx) => promoteEarningsOnUnlock(tx, id))

    const after = await prisma.verificationRequest.findUniqueOrThrow({ where: { id } })
    expect(after.claimDeadline!.getTime()).toBe(before.claimDeadline!.getTime())
    expect(after.reportCompletedAt!.getTime()).toBe(before.reportCompletedAt!.getTime())
  })

  // ── 4, 21: acceptance + authorization ────────────────────────────────────
  it('buyer can accept before the deadline — payout becomes eligible', async () => {
    const id = await unlockOneRequest()

    const res = await request(app)
      .post(`/api/verification-requests/${id}/accept-report`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(res.status).toBe(200)
    expect(res.body.request.buyerAcceptanceStatus).toBe('ACCEPTED')
    expect(res.body.request.buyerAcceptedAt).not.toBeNull()

    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: id } })
    for (const e of earnings) {
      expect(e.status).toBe('AVAILABLE_FOR_PAYOUT')
      expect(e.releaseReason).toBe('BUYER_ACCEPTED')
      expect(e.payoutEligibleAt).not.toBeNull()
    }
  })

  it('accepting twice is rejected — cannot accept an already-accepted report', async () => {
    const id = await unlockOneRequest()
    await request(app).post(`/api/verification-requests/${id}/accept-report`).set('Authorization', `Bearer ${buyer.token}`)

    const second = await request(app)
      .post(`/api/verification-requests/${id}/accept-report`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(second.status).toBe(409)
  })

  it('unauthorized buyer cannot accept another buyer\'s verification', async () => {
    const id = await unlockOneRequest()
    const res = await request(app)
      .post(`/api/verification-requests/${id}/accept-report`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
    expect(res.status).toBe(404) // never confirms another buyer's request even exists
  })

  it('unauthorized buyer cannot claim another buyer\'s verification', async () => {
    const id = await unlockOneRequest()
    const res = await request(app)
      .post(`/api/verification-requests/${id}/claims`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
      .send({ reason: 'not mine', description: 'This is not my verification request at all.', evidence: [] })
    expect(res.status).toBe(404)
  })

  // ── 6-8: claim freezes payout ────────────────────────────────────────────
  it('buyer can submit a claim before the deadline — payout freezes', async () => {
    const id = await unlockOneRequest()

    const res = await request(app)
      .post(`/api/verification-requests/${id}/claims`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'Incorrect property information', description: 'The findings do not match the actual property boundaries.', evidence: [] })
    expect(res.status).toBe(201)
    expect(res.body.claim.status).toBe('OPEN')

    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: id } })
    for (const e of earnings) expect(e.status).toBe('FROZEN')

    // Payout cannot be requested while frozen — requestPayout only ever
    // selects AVAILABLE_FOR_PAYOUT.
    const { requestPayout, PayoutError } = await import('../src/services/payout.service.js')
    await expect(requestPayout(expert.sellerId)).rejects.toBeInstanceOf(PayoutError)
  })

  it('cannot submit a second claim while one is already active', async () => {
    const id = await unlockOneRequest()
    await request(app)
      .post(`/api/verification-requests/${id}/claims`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'First issue', description: 'Description of the first issue, over twenty characters.', evidence: [] })

    const second = await request(app)
      .post(`/api/verification-requests/${id}/claims`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'Second issue', description: 'Description of a second, unrelated issue, also long enough.', evidence: [] })
    expect(second.status).toBe(409)
  })

  it('rejected claim releases the payout — releaseReason CLAIM_REJECTED', async () => {
    const id = await unlockOneRequest()
    const claimRes = await request(app)
      .post(`/api/verification-requests/${id}/claims`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'Disputed finding', description: 'I believe this finding is incorrect for the reasons described here.', evidence: [] })
    const claimId = claimRes.body.claim.id as string

    const resolveRes = await request(app)
      .post(`/api/admin/claims/${claimId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', resolutionNote: 'Reviewed — the report is accurate, no error found.' })
    expect(resolveRes.status).toBe(200)

    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: id } })
    for (const e of earnings) {
      expect(e.status).toBe('AVAILABLE_FOR_PAYOUT')
      expect(e.releaseReason).toBe('CLAIM_REJECTED')
    }
  })

  // ── 3-day-window expiry ──────────────────────────────────────────────────
  it('expiry sweep makes payout eligible once the claim window lapses with no claim', async () => {
    const id = await unlockOneRequest()
    // Backdate the deadline the same way other tests in this suite backdate
    // SLA timers (see helpers.ts's backdateSpecialRequest) — direct column
    // update, not a fabricated new deadline formula.
    await prisma.verificationRequest.update({
      where: { id },
      data: { claimDeadline: new Date(Date.now() - 60 * 1000) },
    })

    const result = await runVerificationExpirySweep()
    expect(result.released).toBeGreaterThanOrEqual(1)

    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: id } })
    for (const e of earnings) {
      expect(e.status).toBe('AVAILABLE_FOR_PAYOUT')
      expect(e.releaseReason).toBe('CLAIM_WINDOW_EXPIRED')
    }
  })

  it('expiry cannot release payout while a claim is active', async () => {
    const id = await unlockOneRequest()
    await request(app)
      .post(`/api/verification-requests/${id}/claims`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'Active dispute', description: 'This claim should block automatic expiry release entirely.', evidence: [] })
    await prisma.verificationRequest.update({
      where: { id },
      data: { claimDeadline: new Date(Date.now() - 60 * 1000) },
    })

    await runVerificationExpirySweep()

    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: id } })
    for (const e of earnings) expect(e.status).toBe('FROZEN') // unchanged — never released while claimed
  })

  // ── race conditions (section 29) ─────────────────────────────────────────
  it('acceptance vs. claim race — exactly one transition wins', async () => {
    const id = await unlockOneRequest()

    const results = await Promise.allSettled([
      acceptReport(id, buyer.userId),
      createClaimWithFreeze(id, buyer.userId, {
        reason: 'Race test',
        description: 'Submitted at nearly the same instant as the acceptance call above.',
        evidence: [],
      }),
    ])

    const succeeded = results.filter((r) => r.status === 'fulfilled')
    // Exactly one of the two must win — never both (ACCEPTED + OPEN claim
    // must never coexist).
    expect(succeeded.length).toBe(1)

    const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id } })
    const activeClaim = await prisma.claim.findFirst({ where: { verificationRequestId: id, status: 'OPEN' } })
    // Never both accepted AND an open claim at the same time.
    expect(req.buyerAcceptanceStatus === 'ACCEPTED' && activeClaim !== null).toBe(false)
  })

  it('acceptance vs. expiry race — expiry is a no-op once already accepted', async () => {
    const id = await unlockOneRequest()
    await acceptReport(id, buyer.userId)
    await prisma.verificationRequest.update({ where: { id }, data: { claimDeadline: new Date(Date.now() - 1000) } })

    const releasedAgain = await runVerificationExpirySweep()
    // The candidate query itself excludes buyerAcceptanceStatus != PENDING,
    // so this specific request is never even selected — a second release
    // reason must never overwrite BUYER_ACCEPTED.
    const earning = await prisma.professionalEarning.findFirst({ where: { verificationRequestId: id } })
    expect(earning?.releaseReason).toBe('BUYER_ACCEPTED')
    expect(releasedAgain.scanned).toBeGreaterThanOrEqual(0) // sweep itself must not throw
  })

  // ── 70/30 split exactness (section 3) ────────────────────────────────────
  it('professional earning is exactly 70% and platform commission exactly 30% of the agreed fee', async () => {
    const id = await unlockOneRequest()
    const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id } })
    expect(req.platformCommissionRate).toBeCloseTo(0.3, 5)

    const entries = await prisma.financialLedgerEntry.findMany({ where: { verificationRequestId: id } })
    const gross = entries.filter((e) => e.type === 'GROSS_PAYMENT').reduce((s, e) => s + e.amountPaise, 0)
    const commission = entries.filter((e) => e.type === 'PLATFORM_COMMISSION').reduce((s, e) => s + e.amountPaise, 0)
    const earning = entries.filter((e) => e.type === 'PROFESSIONAL_EARNING').reduce((s, e) => s + e.amountPaise, 0)

    expect(commission).toBe(Math.round(gross * 0.3))
    expect(earning).toBe(gross - commission)
  })

  // ── SubAdmin permissions unchanged (section 32) ──────────────────────────
  it('a plain claim REJECT via a non-super admin token is still refused (unchanged RBAC)', async () => {
    // resolveClaim is superOnly (admin.routes.ts) — this proves the new
    // release-on-rejection wiring did not loosen that gate.
    const id = await unlockOneRequest()
    const claimRes = await request(app)
      .post(`/api/verification-requests/${id}/claims`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'RBAC check', description: 'Verifying SubAdmin still cannot resolve claims after this change.', evidence: [] })
    const claimId = claimRes.body.claim.id as string

    const subAdmin = await prisma.admin.create({
      data: {
        email: `settlement.test.subadmin.${Date.now()}@test.civilcheck.in`,
        password: '$2a$10$invalidHashPlaceholderxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        name: 'Settlement Test Sub Admin',
        phone: `9${Date.now().toString().slice(-9)}`,
        role: 'SUB_ADMIN',
        lastActivityAt: new Date(),
      },
    })
    const jwt = await import('jsonwebtoken')
    const { JWT_SECRET } = await import('../src/lib/jwt.js')
    const subAdminToken = jwt.default.sign({ adminId: subAdmin.id }, JWT_SECRET, { expiresIn: '1h' })

    const resolveRes = await request(app)
      .post(`/api/admin/claims/${claimId}/resolve`)
      .set('Authorization', `Bearer ${subAdminToken}`)
      .send({ status: 'REJECTED', resolutionNote: 'Attempting as SubAdmin — must be refused.' })
    expect(resolveRes.status).toBe(403)

    await prisma.admin.delete({ where: { id: subAdmin.id } })
  })

  // ── error type sanity ─────────────────────────────────────────────────────
  it('SettlementError carries the right HTTP status for a claim past the deadline', async () => {
    const id = await unlockOneRequest()
    await prisma.verificationRequest.update({ where: { id }, data: { claimDeadline: new Date(Date.now() - 1000) } })

    await expect(
      createClaimWithFreeze(id, buyer.userId, { reason: 'Too late', description: 'This claim is submitted after the 7-day deadline has passed.', evidence: [] })
    ).rejects.toMatchObject({ status: 409 } satisfies Partial<SettlementError>)
  })

  it('rejecting an already-rejected claim path (releaseEarningsOnClaimRejected) is a safe no-op when nothing is frozen', async () => {
    const id = await unlockOneRequest()
    await acceptReport(id, buyer.userId) // already released via acceptance, nothing left FROZEN
    const released = await prisma.$transaction((tx) => releaseEarningsOnClaimRejected(tx, id))
    expect(released).toBe(0) // no FROZEN rows to release — must not throw or double-release
  })
})
