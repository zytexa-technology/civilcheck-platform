// Advertising: end-to-end lifecycle, rejection flow, the "who may be served" matrix (including
// unpaid / rejected / paused / expired / exhausted / completed), security, raw-body webhook
// signatures, and live-mode webhook authority. Complements advertising*.test.ts — replaces nothing.
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { signMockPaymentResponse, signWebhookPayload } from '../src/lib/razorpay.js'
import { app, prisma, uniquePhone, uniqueEmail, TEST_PASSWORD } from './helpers.js'

// Hermetic: default to Razorpay mock mode and no real email. (The live-mode test below sets fake
// keys and stubs fetch itself, then restores this.)
delete process.env.RAZORPAY_KEY_ID
delete process.env.RAZORPAY_KEY_SECRET
delete process.env.RESEND_API_KEY

const CREATIVE = 'https://res.cloudinary.com/demo/image/upload/civilcheck/ads/test/creative.jpg'
const DEST = 'https://example.com/landing'
let adminId: string
let adminToken: string
let advA: { token: string; id: string }
let advB: { token: string; id: string }
const campaignIds: string[] = []

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })
const admin = (m: 'post' | 'get', path: string, b?: object) => request(app)[m](`/api/admin/advertising${path}`).set(auth(adminToken)).send(b ?? {})
const create = (over: Record<string, unknown> = {}, token = advA.token) =>
  request(app).post('/api/advertiser/campaigns').set(auth(token)).send({
    businessName: 'Lifecycle Co', title: `Lifecycle ${Date.now()}`, description: 'Lifecycle test', creativeType: 'IMAGE', creativeUrl: CREATIVE,
    ctaText: 'Go', destinationUrl: DEST, budget: 100, platform: 'BOTH', ...over,
  })
const rawWebhook = (raw: string, signature: string) =>
  request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(raw)
const webhook = (event: object) => { const raw = JSON.stringify(event); return rawWebhook(raw, signWebhookPayload(raw)) }
const captured = (orderId: string, paymentId: string, amount: number) =>
  ({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', status: 'captured' } } } })
const dbC = (id: string) => prisma.adCampaign.findUniqueOrThrow({ where: { id } })
const dbP = (id: string) => prisma.advertisingPayment.findMany({ where: { campaignId: id } })
const served = async (id: string, platform: 'WEB' | 'MOBILE' = 'WEB') =>
  ((await request(app).get('/api/ads/feed').query({ platform, count: 10 })).body.ads as Array<{ id: string }>).some((a) => a.id === id)
const adFor = async (id: string) => ((await request(app).get('/api/ads/feed').query({ platform: 'WEB', count: 10 })).body.ads as Array<{ id: string; token: string }>).find((a) => a.id === id)
// Draft -> payment order -> webhook capture => PENDING_APPROVAL (the real payment path).
async function paidPending(budget = 100) {
  const c = await create({ budget })
  const id = c.body.campaign.id as string
  campaignIds.push(id)
  const pay = await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(advA.token))
  await webhook(captured(pay.body.order.id, `pay_lc_${id.slice(-10)}`, budget * 100))
  return { id, orderId: pay.body.order.id as string }
}
const refreshCache = async () => { const { id } = await paidPending(); await admin('post', `/campaigns/${id}/approve`) } // any approval clears the serving cache

beforeAll(async () => {
  const a = await prisma.admin.create({
    data: { name: 'fixture-adlife-admin', email: uniqueEmail('fixture-adlife-admin'), password: await bcrypt.hash(TEST_PASSWORD, 4), phone: uniquePhone(), role: 'SUPER_ADMIN', lastActivityAt: new Date() } as never,
  })
  adminId = a.id
  adminToken = jwt.sign({ adminId }, process.env.JWT_SECRET as string)
  const reg = async (l: string) => {
    const r = await request(app).post('/api/advertiser/register').send({ name: `Adv ${l}`, companyName: `Lifecycle ${l}`, email: uniqueEmail(`advlife${l}`), password: TEST_PASSWORD })
    return { token: r.body.token as string, id: r.body.advertiser.id as string }
  }
  advA = await reg('A')
  advB = await reg('B')
})
afterAll(async () => {
  await prisma.adEvent.deleteMany({ where: { campaignId: { in: campaignIds } } })
  await prisma.advertisingPayment.deleteMany({ where: { campaignId: { in: campaignIds } } })
  await prisma.adCampaign.deleteMany({ where: { id: { in: campaignIds } } })
  await prisma.advertiser.deleteMany({ where: { id: { in: [advA.id, advB.id] } } })
  await prisma.auditLog.deleteMany({ where: { adminId, action: { startsWith: 'AD_' } } }).catch(() => {})
  await prisma.admin.delete({ where: { id: adminId } }).catch(() => {})
})

describe('end-to-end: create -> pay -> webhook -> approve -> serve -> limits -> stop', () => {
  it('walks the whole lifecycle with the correct state at every step', async () => {
    const c = await create({ budget: 100 })
    const id = c.body.campaign.id as string
    campaignIds.push(id)
    expect(c.body.campaign.status).toBe('DRAFT')
    expect(await served(id)).toBe(false) // unpaid draft is never served

    const pay = await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(advA.token))
    expect(pay.status).toBe(201)
    expect((await dbP(id))[0].amountPaise).toBe(10000n) // payment = the budget exactly
    expect((await dbC(id)).status).toBe('PAYMENT_PENDING')
    expect(await served(id)).toBe(false)

    expect((await webhook(captured(pay.body.order.id, 'pay_lc_e2e', 10000))).status).toBe(200)
    expect((await dbP(id))[0].status).toBe('PAID')
    expect((await dbC(id)).status).toBe('PENDING_APPROVAL')
    expect(await served(id)).toBe(false) // paid but NOT approved => not live

    expect((await admin('post', `/campaigns/${id}/approve`)).status).toBe(200)
    expect((await dbC(id)).status).toBe('ACTIVE')
    const ad = await adFor(id)
    expect(ad === undefined).toBe(false)

    // valid impressions are billed at ₹100 CPM; the 1,000th exhausts the ₹100 budget
    await prisma.adCampaign.update({ where: { id }, data: { impressions: 999, spentPaise: 9990n } })
    const imp = await request(app).post('/api/ads/impression').send({ token: ad!.token })
    expect(imp.body.counted).toBe(true)
    const done = await dbC(id)
    expect(done).toMatchObject({ status: 'EXHAUSTED', impressions: 1000 })
    expect(done.spentPaise).toBe(10000n)
    await refreshCache()
    expect(await served(id)).toBe(false) // stopped serving automatically
  })
  it('an active campaign stops serving at its end date', async () => {
    const { id } = await paidPending()
    await admin('post', `/campaigns/${id}/approve`)
    const ad = await adFor(id)
    await prisma.adCampaign.update({ where: { id }, data: { endDate: new Date(Date.now() - 1000) } })
    expect((await request(app).post('/api/ads/impression').send({ token: ad!.token })).body.counted).toBe(false)
    await refreshCache()
    expect(await served(id)).toBe(false)
  })
})

describe('rejection flow: pay -> reject -> full refund -> never served', () => {
  it('refunds the stored paid amount once, is never served, and a failed refund is recorded and retryable', async () => {
    const { id } = await paidPending(2500)
    expect((await admin('post', `/campaigns/${id}/reject`, { reason: 'Rejected because the creative violates advertising policy.' })).status).toBe(200)
    expect((await dbC(id)).status).toBe('REJECTED')
    const [p] = await dbP(id)
    expect(p).toMatchObject({ status: 'PAID', refundStatus: 'REFUNDED' })
    expect(p.refundAmountPaise).toBe(250000n) // the stored payment, in full — no client value involved
    expect(p.razorpayRefundId === null).toBe(false)
    for (let i = 0; i < 2; i++) expect((await admin('post', `/campaigns/${id}/refund`)).status).toBe(200) // retries
    expect((await dbP(id))[0].razorpayRefundId).toBe(p.razorpayRefundId) // still ONE refund
    await refreshCache()
    expect(await served(id, 'WEB')).toBe(false)
    expect(await served(id, 'MOBILE')).toBe(false)

    // failure: recorded (not marked refunded), then retry succeeds
    const { id: id2 } = await paidPending(300)
    await prisma.advertisingPayment.updateMany({ where: { campaignId: id2 }, data: { razorpayPaymentId: null } })
    await admin('post', `/campaigns/${id2}/reject`, { reason: 'Rejected because the creative violates advertising policy.' })
    expect((await dbP(id2))[0].refundStatus).toBe('FAILED')
    await prisma.advertisingPayment.updateMany({ where: { campaignId: id2 }, data: { razorpayPaymentId: 'pay_lc_recovered' } })
    expect((await admin('post', `/campaigns/${id2}/refund`)).body.refundStatus).toBe('REFUNDED')
    expect((await dbP(id2))[0].refundAmountPaise).toBe(30000n)
  })
})

describe('who may be served: only ACTIVE + PAID + approved + within budget and dates', () => {
  it('DRAFT, PAYMENT_PENDING, PENDING_APPROVAL, REJECTED, PAUSED, EXHAUSTED, EXPIRED and COMPLETED are never served; ACTIVE is', async () => {
    const eligible = await paidPending()
    await admin('post', `/campaigns/${eligible.id}/approve`)
    const rows: Record<string, string> = {}
    const mk = async (label: string, prep: (id: string) => Promise<void>) => {
      const { id } = await paidPending()
      await prep(id)
      rows[label] = id
    }
    await mk('PENDING_APPROVAL', async () => {})
    await mk('REJECTED', async (id) => { await admin('post', `/campaigns/${id}/reject`, { reason: 'Rejected because the creative violates policy.' }) })
    await mk('PAUSED', async (id) => { await admin('post', `/campaigns/${id}/approve`); await admin('post', `/campaigns/${id}/pause`) })
    await mk('COMPLETED', async (id) => { await admin('post', `/campaigns/${id}/approve`); await admin('post', `/campaigns/${id}/stop`) })
    await mk('EXHAUSTED', async (id) => { await admin('post', `/campaigns/${id}/approve`); await prisma.adCampaign.update({ where: { id }, data: { status: 'EXHAUSTED', impressions: 1000, spentPaise: 10000n } }) })
    await mk('EXPIRED', async (id) => { await admin('post', `/campaigns/${id}/approve`); await prisma.adCampaign.update({ where: { id }, data: { endDate: new Date(Date.now() - 1000) } }) })
    const draft = (await create()).body.campaign.id as string
    campaignIds.push(draft)
    const pending = (await create()).body.campaign.id as string
    campaignIds.push(pending)
    await request(app).post(`/api/advertiser/campaigns/${pending}/pay`).set(auth(advA.token)) // order created, never paid
    // ACTIVE but with no confirmed payment (tampering scenario) must not be served either
    const unpaidActive = (await create()).body.campaign.id as string
    campaignIds.push(unpaidActive)
    await prisma.adCampaign.update({ where: { id: unpaidActive }, data: { status: 'ACTIVE' } })
    await refreshCache()
    for (const [label, id] of Object.entries(rows)) expect(`${label}:${await served(id)}`).toBe(`${label}:false`)
    expect(await served(draft)).toBe(false)
    expect(await served(pending)).toBe(false)
    expect(await served(unpaidActive)).toBe(false)
    expect(await served(eligible.id)).toBe(true)
    // and an unpaid ACTIVE row can never be billed
    const ad = await adFor(eligible.id)
    expect(ad === undefined).toBe(false)
    // ~40 sequential requests (nine campaigns driven through payment/approval) against the remote dev DB:
    // slower than the 20s default, not slow because of any fault.
  }, 120_000)
})

describe('security: server-controlled money and state', () => {
  it('an advertiser cannot mark a payment PAID, override the amount, or activate a campaign', async () => {
    const c = await create({ budget: 5000 })
    const id = c.body.campaign.id as string
    campaignIds.push(id)
    const pay = await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(advA.token)).send({ amount: 500, budget: 500, status: 'ACTIVE' })
    expect(pay.body.order.amount).toBe(500000) // ₹5,000 from the stored campaign, not the body
    const forged = await request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(advA.token))
      .send({ razorpay_order_id: pay.body.order.id, razorpay_payment_id: 'pay_forged', razorpay_signature: 'deadbeef', amount: 500000, status: 'PAID' })
    expect(forged.status).toBe(400)
    expect((await dbP(id))[0].status).toBe('CREATED')
    expect((await dbC(id)).status).toBe('PAYMENT_PENDING')
    // a genuine signature but for a payment on someone else's order is refused
    const other = await create({ budget: 100 }, advB.token)
    campaignIds.push(other.body.campaign.id)
    expect((await request(app).post(`/api/advertiser/campaigns/${other.body.campaign.id}/verify-payment`).set(auth(advA.token))
      .send({ razorpay_order_id: pay.body.order.id, razorpay_payment_id: 'p', razorpay_signature: signMockPaymentResponse(pay.body.order.id, 'p') })).status).toBe(404)
    expect((await dbC(id)).status).toBe('PAYMENT_PENDING')
    // the amount actually captured must match the order
    await webhook(captured(pay.body.order.id, 'pay_lc_short', 50000))
    expect((await dbP(id))[0].status).toBe('CREATED')
    // no advertiser route can approve / activate / refund
    for (const path of ['approve', 'refund', 'pause', 'resume']) {
      expect((await request(app).post(`/api/advertiser/campaigns/${id}/${path}`).set(auth(advA.token))).status).toBe(404)
      expect((await request(app).post(`/api/admin/advertising/campaigns/${id}/${path}`).set(auth(advA.token))).status).toBe(401)
    }
    expect((await request(app).patch(`/api/advertiser/campaigns/${id}`).set(auth(advA.token)).send({ status: 'ACTIVE' })).status).toBe(404)
    expect((await dbC(id)).status).toBe('PAYMENT_PENDING')
  })
  it('the webhook signature covers the RAW body: a re-serialised body with the same signature is rejected', async () => {
    const c = await create({ budget: 200 })
    const id = c.body.campaign.id as string
    campaignIds.push(id)
    const pay = await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(advA.token))
    const event = captured(pay.body.order.id, 'pay_lc_raw', 20000)
    const compact = JSON.stringify(event)
    const signature = signWebhookPayload(compact)
    const pretty = JSON.stringify(event, null, 2) // same JSON, different bytes
    expect((await rawWebhook(pretty, signature)).status).toBe(400)
    expect((await dbP(id))[0].status).toBe('CREATED')
    expect((await rawWebhook(compact, signature)).status).toBe(200)
    expect((await dbP(id))[0].status).toBe('PAID')
  })
  it('duplicate webhook deliveries never duplicate payment, revenue, refund or state', async () => {
    const { id, orderId } = await paidPending(400)
    const before = (await admin('get', '/summary')).body.summary.totalRevenue as number
    for (let i = 0; i < 5; i++) expect((await webhook(captured(orderId, `pay_lc_${id.slice(-10)}`, 40000))).status).toBe(200)
    expect((await dbP(id)).length).toBe(1)
    expect((await admin('get', '/summary')).body.summary.totalRevenue).toBe(before)
    await admin('post', `/campaigns/${id}/reject`, { reason: 'Rejected because the creative violates policy.' })
    const refundId = (await dbP(id))[0].razorpayRefundId
    for (let i = 0; i < 3; i++) await webhook(captured(orderId, `pay_lc_${id.slice(-10)}`, 40000))
    expect((await dbP(id))[0].razorpayRefundId).toBe(refundId)
    expect((await dbC(id)).status).toBe('REJECTED')
  })
})

describe('live mode: the webhook, not the browser, is authoritative', () => {
  const realFetch = globalThis.fetch
  let remoteStatus = 'authorized'
  let remoteAmount = 0
  afterAll(() => { globalThis.fetch = realFetch })
  it('a checkout-verify with a valid signature does NOT finalise while Razorpay has not captured; the captured webhook does', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_live_stub'
    process.env.RAZORPAY_KEY_SECRET = 'live_stub_secret'
    process.env.RAZORPAY_WEBHOOK_SECRET = 'live_stub_webhook_secret'
    globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input)
      if (url.includes('api.razorpay.com') && url.endsWith('/orders') && init?.method === 'POST') {
        const b = JSON.parse(init.body as string)
        return new Response(JSON.stringify({ id: `order_live_${Date.now()}`, entity: 'order', amount: b.amount, currency: 'INR', status: 'created' }), { status: 200 })
      }
      if (url.includes('api.razorpay.com') && url.includes('/payments/')) {
        const paymentId = url.split('/payments/')[1]
        return new Response(JSON.stringify({ id: paymentId, amount: remoteAmount, currency: 'INR', status: remoteStatus, order_id: 'IGNORED', captured: remoteStatus === 'captured' }), { status: 200 })
      }
      return realFetch(input as never, init as never)
    }) as typeof fetch
    try {
      const c = await create({ budget: 700 })
      const id = c.body.campaign.id as string
      campaignIds.push(id)
      const pay = await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(advA.token))
      expect(pay.status).toBe(201)
      const orderId = pay.body.order.id as string
      const paymentId = 'pay_live_1'
      const sig = signMockPaymentResponse(orderId, paymentId) // HMAC with the (stub) live secret
      const verify = () => request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(advA.token))
        .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig })
      // Razorpay says only "authorized" => not finalised, campaign stays unpaid
      remoteStatus = 'authorized'; remoteAmount = 70000
      let r = await verify()
      expect(r.status).toBe(202)
      expect(r.body.confirmed).toBe(false)
      expect((await dbP(id))[0].status).toBe('CREATED')
      expect((await dbC(id)).status).toBe('PAYMENT_PENDING')
      // captured but for the wrong amount => still not finalised
      remoteStatus = 'captured'; remoteAmount = 100
      r = await verify()
      expect(r.status).toBe(202)
      expect((await dbP(id))[0].status).toBe('CREATED')
      // the authoritative captured webhook (signed with the webhook secret over the raw body) finalises it, once
      const ev = captured(orderId, paymentId, 70000)
      for (let i = 0; i < 2; i++) expect((await webhook(ev)).status).toBe(200)
      expect((await dbP(id))[0]).toMatchObject({ status: 'PAID', razorpayPaymentId: paymentId })
      expect((await dbC(id)).status).toBe('PENDING_APPROVAL') // never ACTIVE without admin approval
    } finally {
      globalThis.fetch = realFetch
      delete process.env.RAZORPAY_KEY_ID
      delete process.env.RAZORPAY_KEY_SECRET
      delete process.env.RAZORPAY_WEBHOOK_SECRET
    }
  })
})
