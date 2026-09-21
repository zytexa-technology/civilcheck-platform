// Advertising: Razorpay webhook (authoritative payment confirmation), idempotency, payment
// failure, and the full refund for a PAID + NOT-STARTED + REJECTED campaign.
// Complements advertising.test.ts (campaign/serving/billing) — nothing there is replaced.
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { signMockPaymentResponse, signWebhookPayload } from '../src/lib/razorpay.js'
import { app, prisma, uniquePhone, uniqueEmail, TEST_PASSWORD } from './helpers.js'

// Hermetic: never talk to the real Razorpay from tests — use the built-in mock order/refund mode
// (allowed because NODE_ENV=test). Keys are read per call, so removing them here is enough.
delete process.env.RAZORPAY_KEY_ID
delete process.env.RAZORPAY_KEY_SECRET
delete process.env.RESEND_API_KEY // notification emails are logged, never really sent, from tests

const CREATIVE = 'https://res.cloudinary.com/demo/image/upload/civilcheck/ads/test/creative.jpg'
let adminId: string
let adminToken: string
let advA: { token: string; id: string }
let advB: { token: string; id: string }
const campaignIds: string[] = []

const body = (over: Record<string, unknown> = {}) => ({
  businessName: 'Pay Test Co', title: 'Payment test', description: 'Test ad', creativeType: 'IMAGE', creativeUrl: CREATIVE,
  ctaText: 'Go', destinationUrl: 'https://example.com', budget: 1000, platform: 'BOTH', ...over,
})
const auth = (t: string) => ({ Authorization: `Bearer ${t}` })
const create = (b: object, token = advA.token) => request(app).post('/api/advertiser/campaigns').set(auth(token)).send(b)
const admin = (m: 'post' | 'get', path: string, b?: object) => request(app)[m](`/api/admin/advertising${path}`).set(auth(adminToken)).send(b ?? {})
async function register(label: string) {
  const res = await request(app).post('/api/advertiser/register').send({ name: `Adv ${label}`, companyName: `Company ${label}`, email: uniqueEmail(`advp${label}`), password: TEST_PASSWORD })
  return { token: res.body.token as string, id: res.body.advertiser.id as string }
}
const webhook = (event: object, signature?: string) => {
  const raw = JSON.stringify(event)
  return request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', signature ?? signWebhookPayload(raw)).send(raw)
}
const captured = (orderId: string, paymentId: string, amount: number) => ({
  event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', status: 'captured' } } },
})
async function draftWithOrder(budget: number) {
  const c = await create(body({ budget }))
  const id = c.body.campaign.id as string
  campaignIds.push(id)
  const pay = await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(advA.token))
  return { id, orderId: pay.body.order.id as string }
}
async function paidPending(budget: number) {
  const { id, orderId } = await draftWithOrder(budget)
  const paymentId = `pay_t_${Date.now()}${Math.floor(Math.random() * 1e6)}`
  const r = await request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(advA.token))
    .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signMockPaymentResponse(orderId, paymentId) })
  if (r.status !== 200) throw new Error(`verify failed ${r.status}`)
  return id
}
const revenue = async () => (await admin('get', '/summary')).body.summary.totalRevenue as number
const dbCampaign = (id: string) => prisma.adCampaign.findUniqueOrThrow({ where: { id } })
const dbPayments = (id: string) => prisma.advertisingPayment.findMany({ where: { campaignId: id } })
const reject = (id: string) => admin('post', `/campaigns/${id}/reject`, { reason: 'Rejected because the creative violates advertising policy.' })

beforeAll(async () => {
  const a = await prisma.admin.create({
    data: { name: 'fixture-adpay-admin', email: uniqueEmail('fixture-adpay-admin'), password: await bcrypt.hash(TEST_PASSWORD, 4), phone: uniquePhone(), role: 'SUPER_ADMIN', lastActivityAt: new Date() } as never,
  })
  adminId = a.id
  adminToken = jwt.sign({ adminId }, process.env.JWT_SECRET as string)
  advA = await register('A')
  advB = await register('B')
})
afterAll(async () => {
  await prisma.adEvent.deleteMany({ where: { campaignId: { in: campaignIds } } })
  await prisma.advertisingPayment.deleteMany({ where: { campaignId: { in: campaignIds } } })
  await prisma.adCampaign.deleteMany({ where: { id: { in: campaignIds } } })
  await prisma.advertiser.deleteMany({ where: { id: { in: [advA.id, advB.id] } } })
  await prisma.auditLog.deleteMany({ where: { adminId, action: { startsWith: 'AD_' } } }).catch(() => {})
  await prisma.admin.delete({ where: { id: adminId } }).catch(() => {})
})

describe('Razorpay webhook for advertising payments', () => {
  it('rejects a missing or invalid signature and changes nothing', async () => {
    const { id, orderId } = await draftWithOrder(400)
    const ev = captured(orderId, 'pay_wh_bad', 40000)
    expect((await webhook(ev, 'deadbeef')).status).toBe(400)
    expect((await request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').send(JSON.stringify(ev))).status).toBe(400)
    expect((await dbCampaign(id)).status).toBe('PAYMENT_PENDING')
    expect((await dbPayments(id))[0].status).toBe('CREATED')
  })
  it('a valid payment.captured marks the payment PAID and moves the campaign to PENDING_APPROVAL — never live', async () => {
    const before = await revenue()
    const { id, orderId } = await draftWithOrder(400)
    expect((await webhook(captured(orderId, 'pay_wh_ok', 40000))).status).toBe(200)
    expect((await dbCampaign(id)).status).toBe('PENDING_APPROVAL')
    expect((await dbPayments(id))[0]).toMatchObject({ status: 'PAID', razorpayPaymentId: 'pay_wh_ok' })
    expect(await revenue()).toBe(before + 400)
  })
  it('the same webhook delivered repeatedly is idempotent: one payment, revenue once, an approved campaign is not reset', async () => {
    const { id, orderId } = await draftWithOrder(600)
    const before = await revenue()
    const ev = captured(orderId, 'pay_wh_dup', 60000)
    for (let i = 0; i < 3; i++) expect((await webhook(ev)).status).toBe(200)
    expect((await dbPayments(id)).length).toBe(1)
    expect(await revenue()).toBe(before + 600)
    expect((await admin('post', `/campaigns/${id}/approve`)).status).toBe(200)
    expect((await webhook(ev)).status).toBe(200) // late duplicate after approval
    const c = await dbCampaign(id)
    expect(c.status).toBe('ACTIVE')
    expect(c.spentPaise).toBe(0n)
    expect(await revenue()).toBe(before + 600)
    const vr = await request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(advA.token))
      .send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_wh_dup', razorpay_signature: 'anything' })
    expect(vr.status).toBe(200) // frontend verify after the webhook is harmless
    expect((await dbPayments(id)).length).toBe(1)
  })
  it('a webhook racing a checkout-verify finalises the payment exactly once', async () => {
    const { id, orderId } = await draftWithOrder(300)
    const before = await revenue()
    const paymentId = 'pay_wh_race'
    const rs = await Promise.all([
      webhook(captured(orderId, paymentId, 30000)),
      request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(advA.token))
        .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signMockPaymentResponse(orderId, paymentId) }),
      webhook(captured(orderId, paymentId, 30000)),
    ])
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200])
    expect((await dbPayments(id)).filter((p) => p.status === 'PAID').length).toBe(1)
    expect((await dbCampaign(id)).status).toBe('PENDING_APPROVAL')
    expect(await revenue()).toBe(before + 300)
  })
  it('an amount that does not match the order is NOT finalised', async () => {
    const { id, orderId } = await draftWithOrder(500)
    expect((await webhook(captured(orderId, 'pay_wh_short', 100))).status).toBe(200)
    expect((await dbCampaign(id)).status).toBe('PAYMENT_PENDING')
    expect((await dbPayments(id))[0].status).toBe('CREATED')
  })
  it('payment.failed leaves the campaign unpaid, is never revenue, and the same order can still succeed later', async () => {
    const { id, orderId } = await draftWithOrder(250)
    const before = await revenue()
    expect((await webhook({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_wh_f', order_id: orderId } } } })).status).toBe(200)
    expect((await dbPayments(id))[0].status).toBe('FAILED')
    expect((await dbCampaign(id)).status).toBe('PAYMENT_PENDING')
    expect(await revenue()).toBe(before)
    const list = await request(app).get('/api/advertiser/campaigns').set(auth(advA.token))
    expect(list.body.campaigns.find((c: { id: string }) => c.id === id).paymentStatus).toBe('FAILED')
    expect((await webhook(captured(orderId, 'pay_wh_retry', 25000))).status).toBe(200)
    expect((await dbCampaign(id)).status).toBe('PENDING_APPROVAL')
    expect(await revenue()).toBe(before + 250)
  })
  it('an unknown order is acknowledged and ignored', async () => {
    expect((await webhook(captured('order_does_not_exist', 'pay_x', 100))).status).toBe(200)
  })
  it('a late captured event does not move a rejected campaign backwards', async () => {
    const { id, orderId } = await draftWithOrder(200)
    await webhook(captured(orderId, 'pay_wh_late', 20000))
    await reject(id)
    expect((await webhook(captured(orderId, 'pay_wh_late', 20000))).status).toBe(200)
    expect((await dbCampaign(id)).status).toBe('REJECTED')
  })
})

describe('advertising refunds', () => {
  it('rejecting a paid, never-started campaign refunds the FULL payment, calculated by the server', async () => {
    const id = await paidPending(5000)
    expect((await reject(id)).status).toBe(200)
    const [pay] = await dbPayments(id)
    expect(pay.refundStatus).toBe('REFUNDED')
    expect(pay.refundAmountPaise).toBe(500000n)
    expect(pay.razorpayRefundId === null).toBe(false)
    expect(pay.refundedAt === null).toBe(false)
    const mine = await request(app).get(`/api/advertiser/campaigns/${id}`).set(auth(advA.token))
    expect(mine.body.campaign.refund).toMatchObject({ status: 'REFUNDED', amount: 5000 })
    expect(JSON.stringify(mine.body).includes('razorpayRefundId')).toBe(false)
    const row = (await admin('get', '/campaigns?status=REJECTED&limit=50')).body.campaigns.find((x: { id: string }) => x.id === id)
    expect(row).toMatchObject({ paymentStatus: 'PAID', paidAmount: 5000, refund: { status: 'REFUNDED', amount: 5000 } })
  })
  it('a duplicate refund is impossible: retries and racing retries never create a second refund', async () => {
    const id = await paidPending(700)
    await reject(id)
    const [first] = await dbPayments(id)
    const rs = await Promise.all([admin('post', `/campaigns/${id}/refund`), admin('post', `/campaigns/${id}/refund`), admin('post', `/campaigns/${id}/refund`)])
    for (const r of rs) expect(r.status).toBe(200)
    const [after] = await dbPayments(id)
    expect(after.razorpayRefundId).toBe(first.razorpayRefundId)
    expect(after.refundStatus).toBe('REFUNDED')
    expect(after.refundAmountPaise).toBe(70000n)
  })
  it('a refund failure is recorded (admin-visible), does not undo the rejection, and can be retried successfully', async () => {
    const id = await paidPending(900)
    await prisma.advertisingPayment.updateMany({ where: { campaignId: id }, data: { razorpayPaymentId: null } })
    expect((await reject(id)).status).toBe(200)
    expect((await dbCampaign(id)).status).toBe('REJECTED')
    const [failed] = await dbPayments(id)
    expect(failed.refundStatus).toBe('FAILED')
    expect(failed.razorpayRefundId).toBeNull()
    const adminRow = (await admin('get', '/campaigns?status=REJECTED&limit=50')).body.campaigns.find((x: { id: string }) => x.id === id)
    expect(adminRow.refund.status).toBe('FAILED')
    expect(typeof adminRow.refund.error).toBe('string')
    const mine = await request(app).get(`/api/advertiser/campaigns/${id}`).set(auth(advA.token))
    expect(mine.body.campaign.refund.status).toBe('FAILED')
    expect('error' in mine.body.campaign.refund).toBe(false)
    await prisma.advertisingPayment.updateMany({ where: { campaignId: id }, data: { razorpayPaymentId: 'pay_recovered' } })
    expect((await admin('post', `/campaigns/${id}/refund`)).body.refundStatus).toBe('REFUNDED')
    expect((await dbPayments(id))[0].refundAmountPaise).toBe(90000n)
  })
  it('only PAID + NOT STARTED + REJECTED is refundable: active / stopped / already-served campaigns are not', async () => {
    const live = await paidPending(400)
    expect((await admin('post', `/campaigns/${live}/approve`)).status).toBe(200)
    expect((await admin('post', `/campaigns/${live}/refund`)).status).toBe(409)
    await admin('post', `/campaigns/${live}/stop`)
    expect((await dbPayments(live))[0].refundStatus).toBe('NOT_REQUIRED')
    const stopped = (await admin('get', '/campaigns?status=COMPLETED&limit=50')).body.campaigns.find((x: { id: string }) => x.id === live)
    expect(stopped.remaining).toBe(400) // unused budget stays visible; not refunded automatically
    const served = await paidPending(300)
    await reject(served)
    await prisma.adCampaign.update({ where: { id: served }, data: { impressions: 5, spentPaise: 50n } })
    await prisma.advertisingPayment.updateMany({ where: { campaignId: served }, data: { refundStatus: 'FAILED' } })
    expect((await admin('post', `/campaigns/${served}/refund`)).status).toBe(409)
  })
  it('advertisers cannot request, choose or change any refund / payment / approval value', async () => {
    const id = await paidPending(350)
    await reject(id)
    expect((await request(app).post(`/api/advertiser/campaigns/${id}/refund`).set(auth(advA.token)).send({ refundAmount: 999999 })).status).toBe(404)
    expect((await request(app).post(`/api/admin/advertising/campaigns/${id}/refund`).set(auth(advA.token)).send({ refundAmount: 999999 })).status).toBe(401)
    expect((await request(app).post(`/api/admin/advertising/campaigns/${id}/refund`).set(auth(advB.token))).status).toBe(401)
    const c = await create(body({ paymentStatus: 'PAID', refundStatus: 'REFUNDED', refundAmount: 1, status: 'ACTIVE', spent: 0, remaining: 99999999, cpm: 1, clicks: 50, impressions: 50 }))
    campaignIds.push(c.body.campaign.id)
    expect(await dbCampaign(c.body.campaign.id)).toMatchObject({ status: 'DRAFT', impressions: 0, clicks: 0, cpmPaise: 10000 })
    expect((await dbPayments(c.body.campaign.id)).length).toBe(0)
    expect((await request(app).get(`/api/advertiser/campaigns/${id}`).set(auth(advB.token))).status).toBe(404)
    expect((await request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(advB.token))
      .send({ razorpay_order_id: 'x', razorpay_payment_id: 'y', razorpay_signature: 'z' })).status).toBe(404)
  })
  it('the refund.processed webhook completes a refund pending at the provider (idempotently)', async () => {
    const id = await paidPending(220)
    await reject(id)
    await prisma.advertisingPayment.updateMany({ where: { campaignId: id }, data: { refundStatus: 'PROCESSING', refundedAt: null } })
    const [pay] = await dbPayments(id)
    const ev = { event: 'refund.processed', payload: { refund: { entity: { id: pay.razorpayRefundId, payment_id: pay.razorpayPaymentId } } } }
    for (let i = 0; i < 2; i++) expect((await webhook(ev)).status).toBe(200)
    expect((await dbPayments(id))[0].refundStatus).toBe('REFUNDED')
  })
})
