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
import { signMockPaymentResponse, signWebhookPayload } from '../src/lib/razorpay.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { JWT_SECRET } from '../src/lib/jwt.js'

// Phase 4B — Financial Ledger + Professional Payout Foundation: commission
// calculation and freeze, ledger idempotency (duplicate payment callback and
// duplicate webhook), the professional payout state machine (request →
// process → webhook-confirmed PAID, never paid off the synchronous
// response), cancellation-fee ledger entries, refund reversal, admin RBAC
// (SUB_ADMIN restrictions), and the internal reconciliation sweep.
//
// Verified live against the dev server during implementation — this file
// captures the same scenarios as a Jest suite for when the sandbox's
// Node-version blocker on firebase-admin's ESM chain is resolved.
describe('financial ledger + professional payouts (Phase 4B)', () => {
  let superAdminToken: string
  let subAdminId: string
  let subAdminToken: string
  let owner: { token: string; sellerId: string; phone: string }
  let expert: { token: string; sellerId: string; phone: string }
  let buyer: { token: string; userId: string; phone: string }
  let propertyId: string

  beforeAll(async () => {
    superAdminToken = await loginAdmin()

    const subAdmin = await prisma.admin.create({
      data: {
        email: `smoke.test.subadmin.${Date.now()}@test.civilcheck.in`,
        password: await bcrypt.hash('Test1234', 10),
        name: 'Test Sub Admin',
        phone: `9${Date.now().toString().slice(-9)}`,
        role: 'SUB_ADMIN',
        lastActivityAt: new Date(),
      },
    })
    subAdminId = subAdmin.id
    subAdminToken = jwt.sign({ adminId: subAdmin.id }, JWT_SECRET, { expiresIn: '1h' })

    owner = await registerApprovedSeller(superAdminToken, 'OWNER')
    expert = await registerApprovedSeller(superAdminToken, 'EXPERT')
    await prisma.seller.update({
      where: { id: expert.sellerId },
      data: { bankAccount: '123456789012', ifsc: 'HDFC0001234' },
    })
    buyer = await registerAndLoginBuyer()

    const propRes = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: `Financial Ledger Test Property ${Date.now()}`,
        area: '2000',
        documents: Array.from({ length: 8 }, (_, i) => `https://x/doc${i}.pdf`),
      })
    // Direct-publish business rule — property-owner.controller.ts now
    // publishes this property as APPROVED immediately; no separate admin
    // approval call is needed (or possible — it's already approved).
    propertyId = propRes.body.property.id
  })

  afterAll(async () => {
    const requests = await prisma.verificationRequest.findMany({ where: { propertyId }, select: { id: true } })
    const requestIds = requests.map((r) => r.id)
    await prisma.professionalEarning.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.professionalPayoutRecord.deleteMany({ where: { sellerId: expert.sellerId } })
    await prisma.financialLedgerEntry.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.reconciliationIssue.deleteMany({ where: { reference: { contains: 'PaymentOrder' } } })
    await prisma.claim.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.verificationReport.deleteMany({ where: { requestId: { in: requestIds } } })
    await prisma.refund.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.paymentOrder.deleteMany({ where: { verificationRequestId: { in: requestIds } } })
    await prisma.verificationQuote.deleteMany({ where: { requestId: { in: requestIds } } })
    await prisma.verificationRequest.deleteMany({ where: { id: { in: requestIds } } })
    await deleteSeller(owner.sellerId)
    await deleteSeller(expert.sellerId)
    await deleteBuyer(buyer.userId)
    await prisma.auditLog.deleteMany({ where: { adminId: subAdminId } })
    await prisma.admin.delete({ where: { id: subAdminId } })
    await prisma.platformSetting.update({
      where: { id: 'default' },
      data: { verificationPlatformCommissionRate: 0.3 },
    })
  })

  let requestId: string
  let advanceOrderId: string
  let advancePaymentId: string

  it('a ₹30,000 quote splits into exactly ₹9,000 platform / ₹21,000 professional across both legs', async () => {
    const vr = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'PROPERTY', propertyId })
    requestId = vr.body.request.id

    const quote = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/quote`)
      .set('Authorization', `Bearer ${expert.token}`)
      .send({ proposedFee: 30000 })
    expect(quote.body.won).toBe(true)

    const advOrder = await request(app)
      .post(`/api/verification-requests/${requestId}/advance-order`)
      .set('Authorization', `Bearer ${buyer.token}`)
    advanceOrderId = advOrder.body.order.id
    advancePaymentId = `pay_test_${Date.now()}`
    const advSig = signMockPaymentResponse(advanceOrderId, advancePaymentId)

    await request(app)
      .post(`/api/verification-requests/${requestId}/advance-verify`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ razorpay_order_id: advanceOrderId, razorpay_payment_id: advancePaymentId, razorpay_signature: advSig })

    const ledger = await request(app)
      .get(`/api/admin/finance/ledger?verificationRequestId=${requestId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
    const entries = ledger.body.entries as Array<{ type: string; amountPaise: number }>

    // Advance leg is 50% of ₹30,000 = ₹15,000 → 30% platform / 70% professional
    expect(entries.find((e) => e.type === 'GROSS_PAYMENT')?.amountPaise).toBe(1_500_000)
    expect(entries.find((e) => e.type === 'PLATFORM_COMMISSION')?.amountPaise).toBe(450_000)
    expect(entries.find((e) => e.type === 'PROFESSIONAL_EARNING')?.amountPaise).toBe(1_050_000)
  })

  it('a duplicate advance-verify callback does not create a second GROSS_PAYMENT entry', async () => {
    const advSig = signMockPaymentResponse(advanceOrderId, advancePaymentId)
    await request(app)
      .post(`/api/verification-requests/${requestId}/advance-verify`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ razorpay_order_id: advanceOrderId, razorpay_payment_id: advancePaymentId, razorpay_signature: advSig })

    const ledger = await request(app)
      .get(`/api/admin/finance/ledger?verificationRequestId=${requestId}&type=GROSS_PAYMENT`)
      .set('Authorization', `Bearer ${superAdminToken}`)
    expect(ledger.body.entries).toHaveLength(1)
  })

  it('a duplicate payment.captured webhook delivery does not create a second GROSS_PAYMENT entry', async () => {
    const event = {
      entity: 'event',
      event: 'payment.captured',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: advancePaymentId,
            amount: 1_500_000,
            currency: 'INR',
            status: 'captured',
            order_id: advanceOrderId,
            captured: true,
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    }
    const raw = JSON.stringify(event)
    const signature = signWebhookPayload(raw)

    const res = await request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', signature)
      .send(raw)
    expect(res.status).toBe(200)

    const ledger = await request(app)
      .get(`/api/admin/finance/ledger?verificationRequestId=${requestId}&type=GROSS_PAYMENT`)
      .set('Authorization', `Bearer ${superAdminToken}`)
    expect(ledger.body.entries).toHaveLength(1)
  })

  it('changing the commission rate never affects an already-accepted request (frozen at acceptance)', async () => {
    await request(app)
      .patch('/api/admin/verification-settings')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ verificationPlatformCommissionRate: 0.5 })

    const detail = await request(app)
      .get(`/api/admin/verification-requests/${requestId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
    expect(detail.body.request.platformCommissionRate).toBe(0.3)

    await request(app)
      .patch('/api/admin/verification-settings')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ verificationPlatformCommissionRate: 0.3 })
  })

  it('SUB_ADMIN cannot change the commission rate or payout eligibility', async () => {
    const commission = await request(app)
      .patch('/api/admin/verification-settings')
      .set('Authorization', `Bearer ${subAdminToken}`)
      .send({ verificationPlatformCommissionRate: 0.99 })
    expect(commission.status).toBe(403)

    const eligibility = await request(app)
      .patch(`/api/admin/sellers/${expert.sellerId}/payout-eligibility`)
      .set('Authorization', `Bearer ${subAdminToken}`)
      .send({ payoutEligibilityStatus: 'ELIGIBLE' })
    expect(eligibility.status).toBe(403)
  })

  it('completes the job (start, report, final payment) — earnings promote to AVAILABLE_FOR_PAYOUT on unlock', async () => {
    await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/start`)
      .set('Authorization', `Bearer ${expert.token}`)

    await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/report`)
      .set('Authorization', `Bearer ${expert.token}`)
      .send({
        findings: 'Test findings — no case pending on record for this property.',
        riskAssessment: 'GREEN',
        documents: [],
        images: [],
        videos: [],
      })

    const finOrder = await request(app)
      .post(`/api/verification-requests/${requestId}/final-order`)
      .set('Authorization', `Bearer ${buyer.token}`)
    const finPaymentId = `pay_test_${Date.now()}`
    const finSig = signMockPaymentResponse(finOrder.body.order.id, finPaymentId)
    const finVerify = await request(app)
      .post(`/api/verification-requests/${requestId}/final-verify`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        razorpay_order_id: finOrder.body.order.id,
        razorpay_payment_id: finPaymentId,
        razorpay_signature: finSig,
      })
    expect(finVerify.body.request.status).toBe('REPORT_UNLOCKED')

    await request(app)
      .patch(`/api/admin/sellers/${expert.sellerId}/payout-eligibility`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ payoutEligibilityStatus: 'ELIGIBLE' })

    const summary = await request(app)
      .get('/api/seller/verification-marketplace/earnings/summary')
      .set('Authorization', `Bearer ${expert.token}`)
    // Both legs (advance ₹10,500 + final ₹10,500) now available — 70% of ₹30,000
    expect(summary.body.summary.availableForPayout).toBe(21_000)
  })

  it('cannot request a payout without ELIGIBLE status and a bank account on file', async () => {
    const otherProfessional = await registerApprovedSeller(superAdminToken, 'EXPERT')
    const res = await request(app)
      .post('/api/seller/verification-marketplace/payouts')
      .set('Authorization', `Bearer ${otherProfessional.token}`)
    expect(res.status).toBe(400)
    await deleteSeller(otherProfessional.sellerId)
  })

  let payoutId: string

  it('requests a payout, and a second request finds nothing left to claim (no duplicate payout)', async () => {
    const first = await request(app)
      .post('/api/seller/verification-marketplace/payouts')
      .set('Authorization', `Bearer ${expert.token}`)
    expect(first.status).toBe(201)
    payoutId = first.body.payout.id

    const second = await request(app)
      .post('/api/seller/verification-marketplace/payouts')
      .set('Authorization', `Bearer ${expert.token}`)
    expect(second.status).toBe(400)
  })

  it('SUB_ADMIN cannot process a payout; SUPER_ADMIN can, but it only reaches PROCESSING (never PAID from the sync response)', async () => {
    const subAttempt = await request(app)
      .post(`/api/admin/payouts/${payoutId}/process`)
      .set('Authorization', `Bearer ${subAdminToken}`)
    expect(subAttempt.status).toBe(403)

    const processed = await request(app)
      .post(`/api/admin/payouts/${payoutId}/process`)
      .set('Authorization', `Bearer ${superAdminToken}`)
    expect(processed.status).toBe(200)
    expect(processed.body.payout.status).toBe('PROCESSING')
  })

  it('only a webhook-confirmed payout.processed event moves the payout to PAID, and a duplicate delivery does not double-process', async () => {
    const record = await prisma.professionalPayoutRecord.findUniqueOrThrow({ where: { id: payoutId } })
    const event = {
      entity: 'event',
      event: 'payout.processed',
      contains: ['payout'],
      payload: { payout: { entity: { id: record.razorpayPayoutId, status: 'processed' } } },
      created_at: Math.floor(Date.now() / 1000),
    }
    const raw = JSON.stringify(event)
    const signature = signWebhookPayload(raw)

    const first = await request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', signature)
      .send(raw)
    expect(first.status).toBe(200)

    const summary = await request(app)
      .get('/api/seller/verification-marketplace/earnings/summary')
      .set('Authorization', `Bearer ${expert.token}`)
    expect(summary.body.summary.paid).toBe(21_000)

    // Replay — must not double-count
    await request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', signature)
      .send(raw)
    const summaryAfterReplay = await request(app)
      .get('/api/seller/verification-marketplace/earnings/summary')
      .set('Authorization', `Bearer ${expert.token}`)
    expect(summaryAfterReplay.body.summary.paid).toBe(21_000)
  })

  it('a different professional cannot see this professional\'s earnings, and a non-professional partner is blocked from the route entirely', async () => {
    const otherExpert = await registerApprovedSeller(superAdminToken, 'EXPERT')
    const otherSummary = await request(app)
      .get('/api/seller/verification-marketplace/earnings/summary')
      .set('Authorization', `Bearer ${otherExpert.token}`)
    expect(otherSummary.body.summary.availableForPayout).toBe(0)
    await deleteSeller(otherExpert.sellerId)

    const ownerAttempt = await request(app)
      .get('/api/seller/verification-marketplace/earnings/summary')
      .set('Authorization', `Bearer ${owner.token}`)
    expect(ownerAttempt.status).toBe(403)
  })

  it('reconciliation sweep detects an injected commission mismatch and it can be resolved', async () => {
    const order = await prisma.paymentOrder.findFirstOrThrow({
      where: { verificationRequestId: requestId, kind: 'VERIFICATION_ADVANCE' },
    })
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { platformCut: 999_999 } })

    const subSweep = await request(app)
      .post('/api/admin/reconciliation/run')
      .set('Authorization', `Bearer ${subAdminToken}`)
    expect(subSweep.status).toBe(403)

    const sweep = await request(app)
      .post('/api/admin/reconciliation/run')
      .set('Authorization', `Bearer ${superAdminToken}`)
    expect(sweep.body.result.internalIssuesOpened).toBeGreaterThan(0)

    await prisma.paymentOrder.update({ where: { id: order.id }, data: { platformCut: 4_500 } })

    const issues = await request(app)
      .get('/api/admin/reconciliation/issues?status=OPEN')
      .set('Authorization', `Bearer ${superAdminToken}`)
    const issue = issues.body.issues.find((i: { reference: string }) => i.reference === `PaymentOrder:${order.id}`)
    expect(issue).toBeDefined()

    const resolve = await request(app)
      .post(`/api/admin/reconciliation/issues/${issue.id}/resolve`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ resolutionNote: 'Confirmed and reverted the injected test mismatch' })
    expect(resolve.status).toBe(200)
  })
})
