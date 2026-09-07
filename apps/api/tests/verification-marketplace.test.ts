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

// Phase 3 — Property Verification Marketplace: request creation, the
// race-safe first-acceptance-wins quote flow, the 50/50 payment state
// machine, report locking, cancellation, claims, and authorization.
describe('verification marketplace (Phase 3)', () => {
  let adminToken: string
  let owner: { token: string; sellerId: string; phone: string }
  let expertA: { token: string; sellerId: string; phone: string }
  let expertB: { token: string; sellerId: string; phone: string }
  let buyer: { token: string; userId: string; phone: string }
  let otherBuyer: { token: string; userId: string; phone: string }
  let propertyId: string

  beforeAll(async () => {
    adminToken = await loginAdmin()
    owner = await registerApprovedSeller(adminToken, 'OWNER')
    expertA = await registerApprovedSeller(adminToken, 'EXPERT')
    expertB = await registerApprovedSeller(adminToken, 'EXPERT')
    buyer = await registerAndLoginBuyer()
    otherBuyer = await registerAndLoginBuyer()

    // A real, approved Property to run verification requests against.
    const docs = Array.from({ length: 8 }, (_, i) => `https://res.cloudinary.com/demo/image/upload/civilcheck/properties/x/doc${i}.pdf`)
    const createRes = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: `VMTest Flat ${Date.now()}`, area: '1000', city: 'Jaipur', documents: docs })
    propertyId = createRes.body.property.id as string

    await request(app)
      .post(`/api/admin/properties/${propertyId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
  })

  afterAll(async () => {
    await prisma.claim.deleteMany({ where: { verificationRequest: { propertyId } } })
    await prisma.verificationReport.deleteMany({ where: { request: { propertyId } } })
    await prisma.refund.deleteMany({ where: { verificationRequest: { propertyId } } })
    await prisma.paymentOrder.deleteMany({ where: { verificationRequest: { propertyId } } })
    await prisma.verificationQuote.deleteMany({ where: { request: { propertyId } } })
    await prisma.verificationRequest.deleteMany({ where: { propertyId } })
    await prisma.property.deleteMany({ where: { id: propertyId } })
    await deleteSeller(owner.sellerId)
    await deleteSeller(expertA.sellerId)
    await deleteSeller(expertB.sellerId)
    await deleteBuyer(buyer.userId)
    await deleteBuyer(otherBuyer.userId)
  })

  it('rejects a verification request for a source that is not APPROVED', async () => {
    const pendingRes = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Not Approved Yet', area: '500', documents: Array.from({ length: 8 }, (_, i) => `https://x/${i}.pdf`) })
    const pendingId = pendingRes.body.property.id as string

    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'PROPERTY', propertyId: pendingId })
    expect(res.status).toBe(404)

    await prisma.property.deleteMany({ where: { id: pendingId } })
  })

  let requestId: string

  it('buyer creates a verification request — minFee frozen at the platform minimum', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'PROPERTY', propertyId })
    expect(res.status).toBe(201)
    requestId = res.body.request.id
    expect(res.body.request.status).toBe('OPEN')
    expect(res.body.request.minFee).toBeGreaterThanOrEqual(10000)
  })

  it('buyer isolation — another buyer cannot see or act on this request', async () => {
    const getRes = await request(app)
      .get(`/api/verification-requests/${requestId}`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
    expect(getRes.status).toBe(404)

    const cancelRes = await request(app)
      .post(`/api/verification-requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
      .send({ reason: 'not mine to cancel, this should fail' })
    expect(cancelRes.status).toBe(404)
  })

  it('a quote below the minimum fee is rejected', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/quote`)
      .set('Authorization', `Bearer ${expertA.token}`)
      .send({ proposedFee: 500 })
    expect(res.status).toBe(400)
  })

  it('an Owner (not an Expert) cannot submit a quote', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/quote`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ proposedFee: 12000 })
    expect(res.status).toBe(403)
  })

  let quoteAId: string
  let quoteBId: string

  it('two Experts submit competing quotes — both sit PENDING, neither auto-accepts', async () => {
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/seller/verification-marketplace/${requestId}/quote`)
        .set('Authorization', `Bearer ${expertA.token}`)
        .send({ proposedFee: 12000 }),
      request(app)
        .post(`/api/seller/verification-marketplace/${requestId}/quote`)
        .set('Authorization', `Bearer ${expertB.token}`)
        .send({ proposedFee: 15000 }),
    ])

    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)
    expect(resA.body.quote.status).toBe('PENDING')
    expect(resB.body.quote.status).toBe('PENDING')
    quoteAId = resA.body.quote.id
    quoteBId = resB.body.quote.id

    // Request itself is untouched — still OPEN, nobody assigned yet.
    const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestId } })
    expect(req.status).toBe('OPEN')
    expect(req.assignedSellerId).toBeNull()
  })

  it('buyer sees both competing quotes, cheapest first', async () => {
    const res = await request(app)
      .get(`/api/verification-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.quotes[0].proposedFee).toBeLessThanOrEqual(res.body.quotes[1].proposedFee)
  })

  it('another buyer cannot see this buyer\'s quotes', async () => {
    const res = await request(app)
      .get(`/api/verification-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
    expect(res.status).toBe(404)
  })

  it('buyer accepts Expert A\'s quote — atomically locks the request, closes the other quote', async () => {
    // Race two accept attempts (Expert A's quote, then Expert B's quote) —
    // only the first to land against the still-OPEN request may win.
    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/verification-requests/${requestId}/quotes/${quoteAId}/accept`)
        .set('Authorization', `Bearer ${buyer.token}`),
      request(app)
        .post(`/api/verification-requests/${requestId}/quotes/${quoteBId}/accept`)
        .set('Authorization', `Bearer ${buyer.token}`),
    ])
    const outcomes = [first.status, second.status]
    expect(outcomes.filter((s) => s === 200)).toHaveLength(1)
    expect(outcomes.filter((s) => s !== 200)).toHaveLength(1)

    const winnerRes = first.status === 200 ? first : second
    expect(winnerRes.body.request.status).toBe('ACCEPTED')
    expect(winnerRes.body.request.assignedSellerId).toBeTruthy()

    // DB-level confirmation: exactly one ACCEPTED quote, exactly one CLOSED.
    const quotes = await prisma.verificationQuote.findMany({ where: { requestId } })
    expect(quotes.filter((q) => q.status === 'ACCEPTED')).toHaveLength(1)
    expect(quotes.filter((q) => q.status === 'CLOSED')).toHaveLength(1)
  })

  it('a third Expert can no longer quote once the request is ACCEPTED', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/quote`)
      .set('Authorization', `Bearer ${expertA.token}`)
      .send({ proposedFee: 20000 })
    expect(res.status).toBe(409)
  })

  let winnerToken: string

  it('starting verification before the advance is paid is rejected', async () => {
    const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestId } })
    winnerToken = req.assignedSellerId === expertA.sellerId ? expertA.token : expertB.token

    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/start`)
      .set('Authorization', `Bearer ${winnerToken}`)
    expect(res.status).toBe(409)
  })

  it('the losing Expert cannot start or submit a report — not the assigned professional', async () => {
    const req = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestId } })
    const loserToken = req.assignedSellerId === expertA.sellerId ? expertB.token : expertA.token

    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/start`)
      .set('Authorization', `Bearer ${loserToken}`)
    expect(res.status).toBe(403)
  })

  it('buyer pays the 50% advance — request moves to ADVANCE_PAID', async () => {
    const orderRes = await request(app)
      .post(`/api/verification-requests/${requestId}/advance-order`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(orderRes.status).toBe(201)
    const orderId = orderRes.body.order.id as string

    const paymentId = `pay_test_${Date.now()}`
    const signature = signMockPaymentResponse(orderId, paymentId)
    const verifyRes = await request(app)
      .post(`/api/verification-requests/${requestId}/advance-verify`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature })

    expect(verifyRes.status).toBe(200)
    expect(verifyRes.body.request.status).toBe('ADVANCE_PAID')
  })

  it('assigned professional starts verification — IN_PROGRESS', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/start`)
      .set('Authorization', `Bearer ${winnerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.request.status).toBe('IN_PROGRESS')
  })

  it('report content is locked until the report is unlocked by full payment', async () => {
    const submitRes = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/report`)
      .set('Authorization', `Bearer ${winnerToken}`)
      .send({ findings: 'No active litigation found on public record for this property.', riskAssessment: 'GREEN', documents: [], images: [], videos: [] })
    expect(submitRes.status).toBe(201)

    const detailRes = await request(app)
      .get(`/api/verification-requests/${requestId}`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(detailRes.body.request.status).toBe('COMPLETED')
    expect(detailRes.body.request.reportAvailable).toBe(true)
    expect(detailRes.body.request.report).toBeNull() // exists, but not yet visible

    const reportRes = await request(app)
      .get(`/api/verification-requests/${requestId}/report`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(reportRes.status).toBe(403)
  })

  it('buyer pays the remaining 50% — report unlocks', async () => {
    const orderRes = await request(app)
      .post(`/api/verification-requests/${requestId}/final-order`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(orderRes.status).toBe(201)
    const orderId = orderRes.body.order.id as string

    const paymentId = `pay_test_${Date.now()}`
    const signature = signMockPaymentResponse(orderId, paymentId)
    const verifyRes = await request(app)
      .post(`/api/verification-requests/${requestId}/final-verify`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature })

    expect(verifyRes.status).toBe(200)
    expect(verifyRes.body.request.status).toBe('REPORT_UNLOCKED')

    const reportRes = await request(app)
      .get(`/api/verification-requests/${requestId}/report`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(reportRes.status).toBe(200)
    expect(reportRes.body.report.findings).toContain('litigation')
  })

  it('buyer raises a claim after report delivery — foundation only, no auto-refund', async () => {
    const res = await request(app)
      .post(`/api/verification-requests/${requestId}/claims`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'Incomplete findings', description: 'The report does not mention the pending encumbrance I found separately.' })
    expect(res.status).toBe(201)
    expect(res.body.claim.status).toBe('OPEN')

    const adminListRes = await request(app)
      .get('/api/admin/claims')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(adminListRes.status).toBe(200)
    expect((adminListRes.body.claims as Array<{ id: string }>).some((c) => c.id === res.body.claim.id)).toBe(true)

    const resolveRes = await request(app)
      .post(`/api/admin/claims/${res.body.claim.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'UNDER_REVIEW', resolutionNote: 'Reviewing the buyer-supplied evidence.' })
    expect(resolveRes.status).toBe(200)
    expect(resolveRes.body.claim.status).toBe('UNDER_REVIEW')
  })

  it('cancellation before any payment is free', async () => {
    const createRes = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${otherBuyer.token}`)
      .send({ source: 'PROPERTY', propertyId })
    const freeReqId = createRes.body.request.id as string

    const cancelRes = await request(app)
      .post(`/api/verification-requests/${freeReqId}/cancel`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
      .send({ reason: 'Changed my mind before any professional responded' })

    expect(cancelRes.status).toBe(200)
    expect(cancelRes.body.cancellationFee).toBe(0)
    expect(cancelRes.body.refundAmount).toBe(0)
    expect(cancelRes.body.request.status).toBe('CANCELLED')

    await prisma.verificationRequest.deleteMany({ where: { id: freeReqId } })
  })

  it('cancelling an already-cancelled request is rejected', async () => {
    const createRes = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${otherBuyer.token}`)
      .send({ source: 'PROPERTY', propertyId })
    const reqId = createRes.body.request.id as string

    await request(app)
      .post(`/api/verification-requests/${reqId}/cancel`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
      .send({ reason: 'First cancellation, should succeed' })

    const secondCancel = await request(app)
      .post(`/api/verification-requests/${reqId}/cancel`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
      .send({ reason: 'Second cancellation, should fail' })
    expect(secondCancel.status).toBe(400)

    await prisma.verificationRequest.deleteMany({ where: { id: reqId } })
  })

  it('admin oversight — force-cancel and platform settings are Super-Admin gated and functional', async () => {
    const createRes = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${otherBuyer.token}`)
      .send({ source: 'PROPERTY', propertyId })
    const reqId = createRes.body.request.id as string

    const forceCancelRes = await request(app)
      .post(`/api/admin/verification-requests/${reqId}/force-cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Admin intervention test — property under separate legal review' })
    expect(forceCancelRes.status).toBe(200)
    expect(forceCancelRes.body.request.status).toBe('CANCELLED')

    const settingsRes = await request(app)
      .get('/api/admin/verification-settings')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(settingsRes.status).toBe(200)
    expect(settingsRes.body.settings.minVerificationFee).toBeGreaterThanOrEqual(10000)

    await prisma.verificationRequest.deleteMany({ where: { id: reqId } })
  })

  it('rejects a verification request without a valid buyer token', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .send({ source: 'PROPERTY', propertyId })
    expect(res.status).toBe(401)
  })
})
