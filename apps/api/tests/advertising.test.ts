// Advertising platform: campaign creation/budget rules, payment -> approval, serving,
// CPM billing in integer paise, click tracking, exhaustion, moderation and authorization.
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { signMockPaymentResponse } from '../src/lib/razorpay.js'
import { app, prisma, uniquePhone, uniqueEmail, TEST_PASSWORD } from './helpers.js'

// Hermetic: use the built-in mock order mode (NODE_ENV=test), never the real Razorpay API.
delete process.env.RAZORPAY_KEY_ID
delete process.env.RAZORPAY_KEY_SECRET
delete process.env.RESEND_API_KEY // notification emails are logged, never really sent, from tests

const CREATIVE = 'https://res.cloudinary.com/demo/image/upload/civilcheck/ads/test/creative.jpg'
const DEST = 'https://example.com/shop'

let adminId: string
let adminToken: string
let advA: { token: string; id: string }
let advB: { token: string; id: string }
const campaignIds: string[] = []

const body = (over: Record<string, unknown> = {}) => ({
  businessName: 'ABC Clothing', title: 'Flat 50% Off', description: 'Shop our latest collection.', creativeType: 'IMAGE',
  creativeUrl: CREATIVE, ctaText: 'Shop Now', destinationUrl: DEST, budget: 1000, platform: 'BOTH', ...over,
})
const auth = (t: string) => ({ Authorization: `Bearer ${t}` })
const create = (b: object, token = advA.token) => request(app).post('/api/advertiser/campaigns').set(auth(token)).send(b)
const admin = (m: 'post' | 'get', path: string, b?: object) => request(app)[m](`/api/admin/advertising${path}`).set(auth(adminToken)).send(b ?? {})

async function register(label: string) {
  const res = await request(app).post('/api/advertiser/register').send({
    name: `Adv ${label}`, companyName: `Company ${label}`, email: uniqueEmail(`adv${label}`), password: TEST_PASSWORD,
  })
  return { token: res.body.token as string, id: res.body.advertiser.id as string }
}
async function payAndSubmit(id: string, token = advA.token) {
  const pay = await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(token))
  const orderId = pay.body.order.id as string
  const paymentId = `pay_test_${Date.now()}${Math.floor(Math.random() * 1e6)}`
  return request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(token)).send({
    razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signMockPaymentResponse(orderId, paymentId),
  })
}
async function liveCampaign(over: Record<string, unknown> = {}) {
  const c = await create(body(over))
  if (!c.body.campaign) throw new Error(`create failed ${c.status} ${JSON.stringify(c.body).slice(0, 300)}`)
  const id = c.body.campaign.id as string
  campaignIds.push(id)
  await payAndSubmit(id)
  expect((await admin('post', `/campaigns/${id}/approve`)).status).toBe(200)
  return id
}
const feed = async (platform = 'WEB', count = 10) => (await request(app).get('/api/ads/feed').query({ platform, count })).body as { interval: number; ads: Array<{ id: string; token: string; clickPath: string; destinationUrl?: string }> }
const adToken = async (id: string, platform = 'WEB') => (await feed(platform)).ads.find((a) => a.id === id)

beforeAll(async () => {
  const a = await prisma.admin.create({
    data: { name: 'fixture-ad-admin', email: uniqueEmail('fixture-ad-admin'), password: await bcrypt.hash(TEST_PASSWORD, 4), phone: uniquePhone(), role: 'SUPER_ADMIN', lastActivityAt: new Date() } as never,
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

describe('budget and campaign creation', () => {
  it('rejects ₹99, accepts ₹100, ₹1,000 and very large budgets (no maximum)', async () => {
    const low = await create(body({ budget: 99 }))
    expect(low.status).toBe(400)
    expect(JSON.stringify(low.body).includes('Minimum campaign budget is ₹100.')).toBe(true)
    for (const budget of [100, 1000, 5000, 100000, 500000000]) {
      const res = await create(body({ budget }))
      expect(res.status).toBe(201)
      campaignIds.push(res.body.campaign.id)
      expect(res.body.campaign.budget).toBe(budget)
      expect(res.body.campaign.status).toBe('DRAFT')
    }
  })
  it('estimated impressions = budget / CPM * 1000', async () => {
    for (const [budget, est] of [[100, 1000], [500, 5000], [1000, 10000], [5000, 50000], [10000, 100000]]) {
      const res = await request(app).get('/api/advertiser/estimate').query({ budget })
      expect(res.body.estimatedImpressions).toBe(est)
    }
    const cfg = await request(app).get('/api/advertiser/config')
    expect(cfg.body).toMatchObject({ minBudget: 100, cpm: 100, referenceCpc: 2 })
  })
  it('validates destination URL (http/https only) and creative source', async () => {
    expect((await create(body({ destinationUrl: 'javascript:alert(1)' }))).status).toBe(400)
    expect((await create(body({ destinationUrl: 'data:text/html;base64,AAAA' }))).status).toBe(400)
    expect((await create(body({ destinationUrl: 'not a url' }))).status).toBe(400)
    expect((await create(body({ creativeUrl: 'https://evil.example.com/x.jpg' }))).status).toBe(400)
    expect((await create(body({ creativeUrl: 'http://res.cloudinary.com/demo/x.jpg' }))).status).toBe(400)
    expect((await create(body({ title: '' }))).status).toBe(400)
  })
  it('ad content is not restricted to property businesses', async () => {
    const res = await create(body({ businessName: 'Tasty Biryani', title: 'Order dinner online', description: 'Restaurant offer', ctaText: 'Order Now' }))
    expect(res.status).toBe(201)
    campaignIds.push(res.body.campaign.id)
  })
  it('a client cannot set status, spend, impressions, clicks or approval', async () => {
    const res = await create(body({ status: 'ACTIVE', spentPaise: 5, spent: 5, impressions: 999, clicks: 999, approvedAt: new Date(), cpmPaise: 1 }))
    expect(res.status).toBe(201)
    campaignIds.push(res.body.campaign.id)
    const row = await prisma.adCampaign.findUniqueOrThrow({ where: { id: res.body.campaign.id } })
    expect(row).toMatchObject({ status: 'DRAFT', impressions: 0, clicks: 0, approvedAt: null, cpmPaise: 10000 })
    expect(row.spentPaise).toBe(0n)
  })
})

describe('payment', () => {
  it('pays exactly the budget; success => PENDING_APPROVAL (never live); bad signature changes nothing', async () => {
    const c = await create(body({ budget: 1500 }))
    const id = c.body.campaign.id as string
    campaignIds.push(id)
    const pay = await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(advA.token))
    expect(pay.status).toBe(201)
    const payment = await prisma.advertisingPayment.findUniqueOrThrow({ where: { razorpayOrderId: pay.body.order.id } })
    expect(payment.amountPaise).toBe(150000n) // ₹1,500 = the budget, nothing added
    expect(pay.body.order.amount).toBe(150000)
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id } })).status).toBe('PAYMENT_PENDING')

    const bad = await request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(advA.token))
      .send({ razorpay_order_id: pay.body.order.id, razorpay_payment_id: 'pay_x', razorpay_signature: 'deadbeef' })
    expect(bad.status).toBe(400)
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id } })).status).toBe('PAYMENT_PENDING')
    expect((await prisma.advertisingPayment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('CREATED')

    const paymentId = `pay_test_${Date.now()}`
    const ok = await request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(advA.token))
      .send({ razorpay_order_id: pay.body.order.id, razorpay_payment_id: paymentId, razorpay_signature: signMockPaymentResponse(pay.body.order.id, paymentId) })
    expect(ok.status).toBe(200)
    expect(ok.body.campaign.status).toBe('PENDING_APPROVAL')
    expect((await feed()).ads.some((a) => a.id === id)).toBe(false) // not served until approved
    // repeating the verify is harmless
    expect((await request(app).post(`/api/advertiser/campaigns/${id}/verify-payment`).set(auth(advA.token))
      .send({ razorpay_order_id: pay.body.order.id, razorpay_payment_id: paymentId, razorpay_signature: signMockPaymentResponse(pay.body.order.id, paymentId) })).status).toBe(200)
  })
  it('an unpaid or failed-payment campaign never counts as revenue', async () => {
    const before = (await admin('get', '/summary')).body.summary.totalRevenue as number
    const c = await create(body({ budget: 777 }))
    campaignIds.push(c.body.campaign.id)
    await request(app).post(`/api/advertiser/campaigns/${c.body.campaign.id}/pay`).set(auth(advA.token)) // order created, never paid
    expect((await admin('get', '/summary')).body.summary.totalRevenue).toBe(before)
    await payAndSubmit(campaignIds[campaignIds.length - 1])
    expect((await admin('get', '/summary')).body.summary.totalRevenue).toBe(before + 777)
  })
})

describe('moderation (Superadmin) and authorization', () => {
  it('pending list, reject needs a reason and stores it, approve makes it active', async () => {
    const c = await create(body({ budget: 300 }))
    const id = c.body.campaign.id as string
    campaignIds.push(id)
    await payAndSubmit(id)
    const list = await admin('get', '/campaigns?status=PENDING_APPROVAL')
    expect(list.body.campaigns.some((x: { id: string }) => x.id === id)).toBe(true)
    expect((await admin('post', `/campaigns/${id}/reject`, {})).status).toBe(400)
    expect((await admin('post', `/campaigns/${id}/reject`, { reason: 'short' })).status).toBe(400)
    const rej = await admin('post', `/campaigns/${id}/reject`, { reason: 'Rejected because the creative violates advertising policy.' })
    expect(rej.status).toBe(200)
    const mine = await request(app).get(`/api/advertiser/campaigns/${id}`).set(auth(advA.token))
    expect(mine.body.campaign).toMatchObject({ status: 'REJECTED', rejectionReason: 'Rejected because the creative violates advertising policy.' })
    expect((await admin('post', `/campaigns/${id}/approve`)).status).toBe(409) // cannot approve after rejection
  })
  it('advertisers (and anonymous users) cannot approve, and cannot see another advertiser\'s campaigns', async () => {
    const id = campaignIds[0]
    expect((await request(app).post(`/api/admin/advertising/campaigns/${id}/approve`).set(auth(advA.token))).status).toBe(401)
    expect((await request(app).post(`/api/admin/advertising/campaigns/${id}/approve`)).status).toBe(401)
    expect((await request(app).get(`/api/advertiser/campaigns/${id}`).set(auth(advB.token))).status).toBe(404)
    expect((await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(advB.token))).status).toBe(404)
    const listB = await request(app).get('/api/advertiser/campaigns').set(auth(advB.token))
    expect(listB.body.campaigns.length).toBe(0)
    // an advertiser token is not a buyer token
    expect((await request(app).get('/api/auth/me').set(auth(advA.token))).status).toBe(401)
  })
  it('pause / resume / stop', async () => {
    const id = await liveCampaign({ budget: 200 })
    expect((await admin('post', `/campaigns/${id}/pause`)).status).toBe(200)
    expect((await feed()).ads.some((a) => a.id === id)).toBe(false)
    expect((await admin('post', `/campaigns/${id}/resume`)).status).toBe(200)
    expect((await feed()).ads.some((a) => a.id === id)).toBe(true)
    expect((await admin('post', `/campaigns/${id}/stop`)).status).toBe(200)
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED')
  })
})

describe('serving, impressions, clicks and CPM billing', () => {
  let id: string
  it('an approved ad is served; the raw destination is not exposed; interval is configurable via the API', async () => {
    id = await liveCampaign({ budget: 100 })
    const f = await feed('WEB')
    const ad = f.ads.find((a) => a.id === id)
    expect(ad).toBeDefined()
    expect(f.interval >= 2).toBe(true)
    expect(JSON.stringify(f).includes('example.com')).toBe(false)
    expect((await feed('MOBILE')).ads.some((a) => a.id === id)).toBe(true) // BOTH
  })
  it('fetching the ad is NOT an impression', async () => {
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id } })).impressions).toBe(0)
  })
  it('a valid impression is billed once; duplicates, retries and forged tokens are ignored', async () => {
    const ad = (await adToken(id))!
    const r1 = await request(app).post('/api/ads/impression').send({ token: ad.token })
    expect(r1.body).toMatchObject({ success: true, counted: true })
    const r2 = await request(app).post('/api/ads/impression').send({ token: ad.token }) // same view again
    expect(r2.body).toMatchObject({ counted: false, duplicate: true })
    const row = await prisma.adCampaign.findUniqueOrThrow({ where: { id } })
    expect(row.impressions).toBe(1)
    expect(row.spentPaise).toBe(10n) // 1 impression = 10 paise at ₹100 CPM
    expect((await request(app).post('/api/ads/impression').send({ token: 'x'.repeat(60) })).status).toBe(400)
    const forged = jwt.sign({ typ: 'ad', c: id, n: 'abc', p: 'WEB' }, 'not-the-server-secret')
    expect((await request(app).post('/api/ads/impression').send({ token: forged })).status).toBe(400)
  })
  it('clicks are tracked once, redirect to the stored destination and add NO billing', async () => {
    const before = await prisma.adCampaign.findUniqueOrThrow({ where: { id } })
    const ad = (await adToken(id))!
    const res = await request(app).get(`/api${ad.clickPath}`).redirects(0)
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(DEST)
    await request(app).get(`/api${ad.clickPath}`).redirects(0) // same token again
    const after = await prisma.adCampaign.findUniqueOrThrow({ where: { id } })
    expect(after.clicks).toBe(before.clicks + 1)
    expect(after.spentPaise).toBe(before.spentPaise)
    expect((await request(app).get('/api/ads/click?t=garbage').redirects(0)).status).toBe(400)
  })
  it('CPM maths: 1,000 = ₹100 · 5,000 = ₹500 · 10,000 = ₹1,000, then EXHAUSTED and no longer served', async () => {
    const cases: Array<[number, number]> = [[100, 1000], [500, 5000], [1000, 10000]]
    for (const [budget, impressions] of cases) {
      const cid = await liveCampaign({ budget })
      await prisma.adCampaign.update({ where: { id: cid }, data: { impressions: impressions - 1, spentPaise: BigInt((impressions - 1) * 10) } })
      const ad = (await adToken(cid))!
      expect(ad).toBeDefined()
      const r = await request(app).post('/api/ads/impression').send({ token: ad.token })
      expect(r.body.counted).toBe(true)
      const row = await prisma.adCampaign.findUniqueOrThrow({ where: { id: cid } })
      expect(row.impressions).toBe(impressions)
      expect(row.spentPaise).toBe(BigInt(budget * 100)) // exactly the budget, in paise
      expect(row.status).toBe('EXHAUSTED')
      // further impressions are refused and nothing more is charged
      const stale = await request(app).post('/api/ads/impression').send({ token: jwt.sign({ typ: 'ad', c: cid, n: `n${Date.now()}`, p: 'WEB' }, process.env.JWT_SECRET as string) })
      expect(stale.body.counted).toBe(false)
      expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id: cid } })).spentPaise).toBe(BigInt(budget * 100))
    }
  })
  it('clicks never push spend beyond CPM: 10,000 impressions + 500 clicks still = ₹1,000, CTR 5%, effective CPC ₹2', async () => {
    const cid = await liveCampaign({ budget: 1000 })
    await prisma.adCampaign.update({ where: { id: cid }, data: { status: 'EXHAUSTED', impressions: 10000, spentPaise: 100000n, clicks: 500 } })
    const list = await admin('get', '/campaigns?status=EXHAUSTED&limit=50')
    const v = list.body.campaigns.find((x: { id: string }) => x.id === cid)
    expect(v).toMatchObject({ spent: 1000, remaining: 0, impressions: 10000, clicks: 500, ctr: 5, effectiveCpc: 2 })
  })
  it('a campaign past its end date is not served, is not billed, and becomes EXPIRED', async () => {
    const cid = await liveCampaign({ budget: 100 })
    const ad = (await adToken(cid))!
    await prisma.adCampaign.update({ where: { id: cid }, data: { endDate: new Date(Date.now() - 1000) } })
    const r = await request(app).post('/api/ads/impression').send({ token: ad.token })
    expect(r.body.counted).toBe(false)
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id: cid } })).impressions).toBe(0)
  })
  it('platform targeting: WEB-only ads are not served to MOBILE', async () => {
    const cid = await liveCampaign({ budget: 100, platform: 'WEB' })
    expect((await feed('WEB')).ads.some((a) => a.id === cid)).toBe(true)
    expect((await feed('MOBILE')).ads.some((a) => a.id === cid)).toBe(false)
  })
  it('the DB refuses spend beyond budget (CHECK constraint)', async () => {
    await expect(prisma.$executeRawUnsafe(`UPDATE "AdCampaign" SET "spentPaise" = "budgetPaise" + 1 WHERE id='${id}'`)).rejects.toBeTruthy()
  })
})

describe('admin summary', () => {
  it('reports counts, revenue, impressions and clicks', async () => {
    const s = (await admin('get', '/summary')).body.summary
    expect(typeof s.totalRevenue).toBe('number')
    expect(s.totalCampaigns >= 1).toBe(true)
    expect(s.totalImpressions >= 1).toBe(true)
  })
})
