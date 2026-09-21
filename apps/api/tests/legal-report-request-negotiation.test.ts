// "Request for Legal Reports" (formerly Custom Research): buyer-defined price (min ₹2,499, no max),
// Expert accept / counter, buyer accepts, then the EXISTING 50% + 50% payment flow on the agreed price.
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { signMockPaymentResponse } from '../src/lib/razorpay.js'
import {
  app, prisma, uniquePhone, uniqueEmail, TEST_PASSWORD, registerApprovedSeller, registerAndLoginBuyer, deleteSeller, deleteBuyer,
} from './helpers.js'

let adminId: string
let buyer: { token: string; userId: string }
let otherBuyer: { token: string; userId: string }
let expertA: { token: string; sellerId: string }
let expertB: { token: string; sellerId: string }
const requestIds: string[] = []
let seq = 0

const body = (offer: number, over: Record<string, unknown> = {}) => ({
  source: 'DISCOVERY', initialOfferAmount: offer,
  desiredAddress: `Legal Report Plot ${Date.now()}-${++seq}, Vaishali Nagar`, desiredCity: 'Jaipur', desiredTehsil: 'Sanganer',
  desiredPropertyType: 'RESIDENTIAL', questions: 'Is there any pending litigation on this plot?', ...over,
})
const create = (offer: number, over: Record<string, unknown> = {}, token = buyer.token) =>
  request(app).post('/api/verification-requests').set('Authorization', `Bearer ${token}`).send(body(offer, over))
const quote = (id: string, fee: number, token: string) =>
  request(app).post(`/api/seller/verification-marketplace/${id}/quote`).set('Authorization', `Bearer ${token}`).send({ proposedFee: fee })

beforeAll(async () => {
  const a = await prisma.admin.create({
    data: { name: 'fixture-lr-admin', email: uniqueEmail('fixture-lr-admin'), password: await bcrypt.hash(TEST_PASSWORD, 4), phone: uniquePhone(), role: 'SUPER_ADMIN', lastActivityAt: new Date() } as never,
  })
  adminId = a.id
  const adminToken = jwt.sign({ adminId }, process.env.JWT_SECRET as string)
  buyer = await registerAndLoginBuyer()
  otherBuyer = await registerAndLoginBuyer()
  expertA = await registerApprovedSeller(adminToken, 'EXPERT')
  expertB = await registerApprovedSeller(adminToken, 'EXPERT')
})

afterAll(async () => {
  // Every dependant of the requests (the advance payment creates earnings/ledger rows) must go first.
  const w = { in: requestIds }
  await prisma.professionalEarning.deleteMany({ where: { verificationRequestId: w } })
  await prisma.financialLedgerEntry.deleteMany({ where: { verificationRequestId: w } })
  await prisma.claim.deleteMany({ where: { verificationRequestId: w } })
  await prisma.verificationReport.deleteMany({ where: { requestId: w } })
  await prisma.refund.deleteMany({ where: { verificationRequestId: w } })
  await prisma.verificationMessage.deleteMany({ where: { verificationRequestId: w } })
  await prisma.paymentOrder.deleteMany({ where: { verificationRequestId: w } })
  await prisma.verificationQuote.deleteMany({ where: { requestId: { in: requestIds } } })
  await prisma.verificationRequest.updateMany({ where: { id: { in: requestIds } }, data: { acceptedQuoteId: null } })
  await prisma.verificationRequest.deleteMany({ where: { id: { in: requestIds } } })
  await deleteSeller(expertA.sellerId)
  await deleteSeller(expertB.sellerId)
  await deleteBuyer(buyer.userId)
  await deleteBuyer(otherBuyer.userId)
  await prisma.admin.delete({ where: { id: adminId } }).catch(() => {})
})

describe('buyer-defined price (minimum ₹2,499, no maximum)', () => {
  it('the config exposes the floor', async () => {
    const res = await request(app).get('/api/verification-requests/config')
    expect(res.body.legalReportMinAmount).toBe(2499)
  })
  it('₹2,498 is rejected with the clear message', async () => {
    const res = await create(2498)
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body).includes('Minimum legal report request amount is ₹2,499.')).toBe(true)
    const low = await create(1)
    expect(low.status).toBe(400)
  })
  it('₹2,499, ₹5,000 and very large amounts are accepted (no maximum)', async () => {
    for (const offer of [2499, 5000, 10000, 100000, 5000000]) {
      const res = await create(offer)
      expect(res.status).toBe(201)
      requestIds.push(res.body.request.id)
      expect(res.body.request.buyerInitialOfferAmount).toBe(offer)
      expect(res.body.request.status).toBe('OPEN')
    }
  })
  it('the offer and the buyer\'s questions are saved on the request', async () => {
    const row = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestIds[0] } })
    expect(row.buyerInitialOfferAmount).toBe(2499)
    expect(row.minFee).toBe(2499)
    expect(row.questions).toBe('Is there any pending litigation on this plot?')
    expect(row.agreedFee).toBeNull() // nothing agreed yet
  })
  it('a request with no offer is rejected', async () => {
    const res = await request(app).post('/api/verification-requests').set('Authorization', `Bearer ${buyer.token}`).send({ ...body(0), initialOfferAmount: undefined })
    expect(res.status).toBe(400)
  })
})

describe('Expert accepts or counters; buyer accepts; existing 50% + 50% payments use the agreed price', () => {
  let counterReqId: string
  let counterQuoteId: string
  let acceptReqId: string

  it('nothing can be paid before a price is agreed', async () => {
    const res = await create(3500)
    acceptReqId = res.body.request.id
    requestIds.push(acceptReqId)
    const pay = await request(app).post(`/api/verification-requests/${acceptReqId}/advance-order`).set('Authorization', `Bearer ${buyer.token}`)
    expect(pay.status === 201).toBe(false)
  })
  it('an Expert counter-offer below ₹2,499 is rejected; there is no maximum', async () => {
    expect((await quote(acceptReqId, 2000, expertA.token)).status).toBe(400)
    const high = await create(4500)
    counterReqId = high.body.request.id
    requestIds.push(counterReqId)
    const big = await quote(counterReqId, 250000, expertB.token)
    expect(big.status).toBe(201)
    await prisma.verificationQuote.deleteMany({ where: { id: big.body.quote.id } })
  })
  it('Expert accepts the buyer\'s offer as-is: the buyer accepts it, agreed price = the offer, 50% advance', async () => {
    const q = await quote(acceptReqId, 3500, expertA.token)
    expect(q.status).toBe(201)
    const acc = await request(app).post(`/api/verification-requests/${acceptReqId}/quotes/${q.body.quote.id}/accept`).set('Authorization', `Bearer ${buyer.token}`)
    expect(acc.status).toBe(200)
    const row = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: acceptReqId } })
    expect(row).toMatchObject({ status: 'ACCEPTED', agreedFee: 3500, advanceAmount: 1750, finalAmount: 1750 })
  })
  it('Expert counters ₹6,000 against a ₹4,500 offer; the buyer sees both and accepts; final agreed = ₹6,000', async () => {
    const q = await quote(counterReqId, 6000, expertB.token)
    expect(q.status).toBe(201)
    counterQuoteId = q.body.quote.id
    const seen = await request(app).get(`/api/verification-requests/${counterReqId}/quotes`).set('Authorization', `Bearer ${buyer.token}`)
    expect(seen.body.quotes[0].proposedFee).toBe(6000)
    const detail = await request(app).get(`/api/verification-requests/${counterReqId}`).set('Authorization', `Bearer ${buyer.token}`)
    expect(detail.body.request.buyerInitialOfferAmount).toBe(4500)

    // only the request's own buyer can accept
    expect((await request(app).post(`/api/verification-requests/${counterReqId}/quotes/${counterQuoteId}/accept`).set('Authorization', `Bearer ${otherBuyer.token}`)).status).toBe(404)
    const acc = await request(app).post(`/api/verification-requests/${counterReqId}/quotes/${counterQuoteId}/accept`).set('Authorization', `Bearer ${buyer.token}`)
    expect(acc.status).toBe(200)
    const row = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: counterReqId } })
    expect(row).toMatchObject({ status: 'ACCEPTED', agreedFee: 6000, advanceAmount: 3000, finalAmount: 3000 })
  })
  it('the existing advance payment charges 50% of the agreed price; the remaining 50% follows unchanged', async () => {
    const orderRes = await request(app).post(`/api/verification-requests/${counterReqId}/advance-order`).set('Authorization', `Bearer ${buyer.token}`)
    expect(orderRes.status).toBe(201)
    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderRes.body.order.id } })
    expect(order.amount).toBe(300000) // stored in paise: ₹3,000 = 50% of the agreed ₹6,000
    const paymentId = `pay_test_${Date.now()}`
    const verify = await request(app)
      .post(`/api/verification-requests/${counterReqId}/advance-verify`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ razorpay_order_id: order.id, razorpay_payment_id: paymentId, razorpay_signature: signMockPaymentResponse(order.id, paymentId) })
    expect(verify.status).toBe(200)
    expect(verify.body.request.status).toBe('ADVANCE_PAID')
    // verification workflow continues after agreement (the assigned Expert can start)
    const start = await request(app).post(`/api/seller/verification-marketplace/${counterReqId}/start`).set('Authorization', `Bearer ${expertB.token}`)
    expect(start.status).toBe(200)
    expect(start.body.request.status).toBe('IN_PROGRESS')
  })
})

describe('earlier Custom Research requests stay readable', () => {
  it('a legacy fixed-plan request (Basic/Standard/Deep dive amounts) still loads for its buyer', async () => {
    const legacy = await prisma.specialRequest.create({
      data: { userId: buyer.userId, address: `Legacy ${Date.now()}`, city: 'Jaipur', tehsil: 'Sanganer', propertyType: 'RESIDENTIAL', questions: 'legacy plan request', documents: [], advanceAmount: 2499, status: 'PENDING' },
    })
    try {
      const res = await request(app).get(`/api/special-requests/${legacy.id}`).set('Authorization', `Bearer ${buyer.token}`)
      expect(res.status).toBe(200)
      expect(JSON.stringify(res.body).includes('legacy plan request')).toBe(true)
    } finally {
      await prisma.specialRequest.delete({ where: { id: legacy.id } })
    }
  })
})
