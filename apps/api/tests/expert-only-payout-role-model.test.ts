import request from 'supertest'
import jwt from 'jsonwebtoken'
import {
  app,
  prisma,
  loginAdmin,
  registerAndLoginBuyer,
  registerApprovedSeller,
  deleteSeller,
  deleteBuyer,
  ADMIN_EMAIL,
} from './helpers.js'
import { JWT_SECRET } from '../src/lib/jwt.js'
import { signMockPaymentResponse } from '../src/lib/razorpay.js'
import { resolveVerificationPerformer } from '../src/services/notification.service.js'
import { requestPayout, PayoutError } from '../src/services/payout.service.js'
import { REQUIRED_PROPERTY_DOCUMENT_TYPES } from '@civilcheck/shared'

// Role-model correction: CLAIM RECIPIENT (whoever actually performed the
// verification — Expert, Admin, or SuperAdmin) and EXPERT 30/70 PAYOUT
// BENEFICIARY are two completely separate concepts. This suite proves they
// stay separate: an Admin- or SuperAdmin-performed verification must never
// create a ProfessionalEarning row, must never appear in the Expert
// Verification Payouts dashboard, and must still route its claim
// notification/claim-list "performed by" field to the actual performer
// (never to "all Admins"/"all SuperAdmins", never Expert-only).
//
// Same environment constraint as financial-ledger.test.ts /
// verification-acceptance-claim-settlement.test.ts: this sandbox's Node
// version (v22) cannot run Jest here (firebase-admin's ESM chain needs Node
// v24.9+). Written to the same standard and exercised against a real dev
// server + Neon dev DB during implementation.
describe('Expert-only payout role model — claim recipient vs. payout beneficiary', () => {
  let adminToken: string
  let superAdminId: string
  let subAdmin: { id: string; token: string }
  let owner: { token: string; sellerId: string; phone: string }
  let expert: { token: string; sellerId: string; phone: string }
  let buyer: { token: string; userId: string; phone: string }
  let propertyId: string
  const requestIds: string[] = []

  beforeAll(async () => {
    adminToken = await loginAdmin()
    const superAdmin = await prisma.admin.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })
    superAdminId = superAdmin.id

    const created = await prisma.admin.create({
      data: {
        email: `roletest.subadmin.${Date.now()}@test.civilcheck.in`,
        password: '$2a$10$invalidHashPlaceholderxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        name: 'Role Model Test Sub Admin',
        phone: `9${Date.now().toString().slice(-9)}`,
        role: 'SUB_ADMIN',
        lastActivityAt: new Date(),
      },
    })
    subAdmin = { id: created.id, token: jwt.sign({ adminId: created.id }, JWT_SECRET, { expiresIn: '1h' }) }

    owner = await registerApprovedSeller(adminToken, 'OWNER')
    expert = await registerApprovedSeller(adminToken, 'EXPERT')
    await prisma.seller.update({
      where: { id: expert.sellerId },
      data: { bankAccount: '123456789012', ifsc: 'HDFC0001234', payoutEligibilityStatus: 'ELIGIBLE' },
    })
    buyer = await registerAndLoginBuyer()

    // propertyCreateSchema requires latitude/longitude and `documents` as
    // {type, url} objects — a plain URL-string array fails validation
    // (discovered via Phase 6 real runtime execution).
    const docs = REQUIRED_PROPERTY_DOCUMENT_TYPES.map((type) => ({ type, url: `https://x/role-model-test-${type}.pdf` }))
    const createRes = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        propertyStatus: 'CLEAR', title: `Role Model Test Flat ${Date.now()}`, area: '1200', city: 'Jaipur', latitude: 26.9124, longitude: 75.7873, documents: docs })
    if (!createRes.body.success) throw new Error(`Property create failed: ${JSON.stringify(createRes.body)}`)
    propertyId = createRes.body.property.id as string
  })

  afterAll(async () => {
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
    await prisma.admin.delete({ where: { id: subAdmin.id } }) // only the fixture Sub Admin — never the real SuperAdmin row
    await deleteSeller(owner.sellerId)
    await deleteSeller(expert.sellerId)
    await deleteBuyer(buyer.userId)
  })

  /**
   * Drives one fresh VerificationRequest all the way to REPORT_UNLOCKED,
   * with the quote/start/report leg performed by whichever actor's token is
   * passed in — the Expert's own seller token, a Sub Admin's admin token, or
   * the real SuperAdmin's admin token, mirroring the three "who actually
   * performed it" cases the spec calls out (Case A/B/C).
   */
  async function unlockOneRequest(performerToken: string, performerKind: 'seller' | 'admin'): Promise<string> {
    const createRes = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'PROPERTY', propertyId, initialOfferAmount: 20000 })
    if (!createRes.body.success) throw new Error(`Verification request create failed: ${JSON.stringify(createRes.body)}`)
    const id = createRes.body.request.id as string
    requestIds.push(id)

    const quoteBase = performerKind === 'seller' ? '/api/seller/verification-marketplace' : '/api/admin/verification-marketplace'
    await request(app)
      .post(`${quoteBase}/${id}/quote`)
      .set('Authorization', `Bearer ${performerToken}`)
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

    await request(app).post(`${quoteBase}/${id}/start`).set('Authorization', `Bearer ${performerToken}`)
    await request(app)
      .post(`${quoteBase}/${id}/report`)
      .set('Authorization', `Bearer ${performerToken}`)
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

  // ── baseline: Expert-performed work still creates the Expert payout ────────
  it('Case A — Expert-performed verification creates a ProfessionalEarning and resolves as EXPERT', async () => {
    const id = await unlockOneRequest(expert.token, 'seller')
    const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id } })

    expect(req.assignedSellerId).toBe(expert.sellerId)
    expect(req.assignedAdminId).toBeNull()

    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: id } })
    expect(earnings.length).toBeGreaterThan(0)
    expect(earnings.every((e) => e.sellerId === expert.sellerId)).toBe(true)

    const performer = await resolveVerificationPerformer(req)
    expect(performer.type).toBe('EXPERT')
    if (performer.type === 'EXPERT') expect(performer.seller.id).toBe(expert.sellerId)

    const dashboard = await request(app)
      .get('/api/admin/expert-payouts')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(dashboard.body.requests.some((r: { id: string }) => r.id === id)).toBe(true)
  })

  // ── Case B — Admin (Sub Admin) performs the verification ────────────────────
  it('Case B — Admin-performed verification creates NO ProfessionalEarning and resolves as ADMIN', async () => {
    const id = await unlockOneRequest(subAdmin.token, 'admin')
    const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id } })

    expect(req.assignedAdminId).toBe(subAdmin.id)
    expect(req.assignedSellerId).toBeNull()
    // The 7-day window still opens for an Admin-performed verification (the
    // buyer's acceptance/claim rights are unaffected by who performed it) —
    // only the *payout* side is Expert-only.
    expect(req.reportCompletedAt).not.toBeNull()
    expect(req.claimDeadline).not.toBeNull()

    // NON-NEGOTIABLE: no Expert payout beneficiary exists for Admin-performed work.
    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: id } })
    expect(earnings.length).toBe(0)

    const performer = await resolveVerificationPerformer(req)
    expect(performer.type).toBe('ADMIN')
    if (performer.type === 'ADMIN' || performer.type === 'SUPER_ADMIN') expect(performer.admin.id).toBe(subAdmin.id)

    // Admin-handled verification MUST NOT appear as an Expert payout (section 31).
    const dashboard = await request(app)
      .get('/api/admin/expert-payouts')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(dashboard.body.requests.some((r: { id: string }) => r.id === id)).toBe(false)

    // Claim recipient is still the actual performer — a claim on Admin's
    // work must show up as "performed by" that Admin, not as Expert-only.
    const claimRes = await request(app)
      .post(`/api/verification-requests/${id}/claims`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'Disputed finding', description: 'Testing that the claim recipient resolves to the Admin who performed this work.', evidence: [] })
    expect(claimRes.status).toBe(201)

    const claimsRes = await request(app)
      .get('/api/admin/claims')
      .set('Authorization', `Bearer ${adminToken}`)
    const row = claimsRes.body.claims.find((c: { verificationRequest?: { id: string } }) => c.verificationRequest?.id === id)
    expect(row).toBeDefined()
    expect(row.verificationPerformer).toEqual({ type: 'ADMIN', name: 'Role Model Test Sub Admin' })
  })

  // ── Case C — SuperAdmin directly performs the verification ──────────────────
  it('Case C — SuperAdmin-performed verification creates NO ProfessionalEarning and resolves as SUPER_ADMIN', async () => {
    const id = await unlockOneRequest(adminToken, 'admin')
    const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id } })

    expect(req.assignedAdminId).toBe(superAdminId)
    expect(req.assignedSellerId).toBeNull()

    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: id } })
    expect(earnings.length).toBe(0)

    const performer = await resolveVerificationPerformer(req)
    expect(performer.type).toBe('SUPER_ADMIN')
    if (performer.type === 'ADMIN' || performer.type === 'SUPER_ADMIN') expect(performer.admin.id).toBe(superAdminId)

    const dashboard = await request(app)
      .get('/api/admin/expert-payouts')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(dashboard.body.requests.some((r: { id: string }) => r.id === id)).toBe(false)

    // A claim on this one must resolve to THIS SuperAdmin specifically, not
    // "every SuperAdmin" — the whole point of resolveVerificationPerformer
    // over notifySuperAdmins.
    const claimRes = await request(app)
      .post(`/api/verification-requests/${id}/claims`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'Disputed finding', description: 'Testing that the claim recipient resolves to the specific SuperAdmin who performed this work.', evidence: [] })
    expect(claimRes.status).toBe(201)

    const claimsRes = await request(app)
      .get('/api/admin/claims')
      .set('Authorization', `Bearer ${adminToken}`)
    const row = claimsRes.body.claims.find((c: { verificationRequest?: { id: string } }) => c.verificationRequest?.id === id)
    expect(row).toBeDefined()
    expect(row.verificationPerformer.type).toBe('SUPER_ADMIN')
  })

  // ── payout beneficiary validation (section 57) ───────────────────────────────
  it('a non-Expert seller (OWNER) can never receive an Expert payout even if directly requested', async () => {
    await expect(requestPayout(owner.sellerId)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('Only an Expert'),
    } satisfies Partial<PayoutError>)
  })

  // ── config endpoint — no hardcoded 30/70 anywhere in the frontend ───────────
  it('the public marketplace config endpoint is the single source of the commission split (no hardcoding)', async () => {
    const res = await request(app).get('/api/verification-requests/config')
    expect(res.status).toBe(200)
    expect(typeof res.body.minVerificationFee).toBe('number')
    expect(typeof res.body.platformCommissionPercent).toBe('number')
    expect(typeof res.body.expertCommissionPercent).toBe('number')
    expect(res.body.platformCommissionPercent + res.body.expertCommissionPercent).toBeCloseTo(100, 5)
  })
})
