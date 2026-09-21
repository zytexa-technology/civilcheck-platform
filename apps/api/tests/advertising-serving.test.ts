// Advertising: which campaign states are (and are not) served to buyers on Web and Mobile.
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { signWebhookPayload } from '../src/lib/razorpay.js'
import { app, prisma, uniquePhone, uniqueEmail, TEST_PASSWORD } from './helpers.js'

delete process.env.RAZORPAY_KEY_ID
delete process.env.RAZORPAY_KEY_SECRET
delete process.env.RESEND_API_KEY // emails are logged, never really sent, from tests

const CREATIVE = 'https://res.cloudinary.com/demo/image/upload/civilcheck/ads/test/creative.jpg'
let adminId: string
let adminToken: string
let adv: { token: string; id: string }
const campaignIds: string[] = []

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })
const admin = (path: string, b?: object) => request(app).post(`/api/admin/advertising${path}`).set(auth(adminToken)).send(b ?? {})
const webhook = (event: object) => {
  const raw = JSON.stringify(event)
  return request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', signWebhookPayload(raw)).send(raw)
}
// Creates a campaign and takes it to PENDING_APPROVAL through the authoritative webhook.
async function pending(platform = 'BOTH') {
  const c = await request(app).post('/api/advertiser/campaigns').set(auth(adv.token)).send({
    businessName: 'Serving Test Co', title: `Serve ${Date.now()}`, description: 'Serving test', creativeType: 'IMAGE', creativeUrl: CREATIVE,
    ctaText: 'Go', destinationUrl: 'https://example.com', budget: 100, platform,
  })
  const id = c.body.campaign.id as string
  campaignIds.push(id)
  const pay = await request(app).post(`/api/advertiser/campaigns/${id}/pay`).set(auth(adv.token))
  await webhook({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_sv_${id.slice(-8)}`, order_id: pay.body.order.id, amount: 10000 } } } })
  return id
}
const served = async (id: string, platform: 'WEB' | 'MOBILE' = 'WEB') =>
  ((await request(app).get('/api/ads/feed').query({ platform, count: 10 })).body.ads as Array<{ id: string }>).some((a) => a.id === id)
const status = async (id: string) => (await prisma.adCampaign.findUniqueOrThrow({ where: { id } })).status

beforeAll(async () => {
  const a = await prisma.admin.create({
    data: { name: 'fixture-adserve-admin', email: uniqueEmail('fixture-adserve-admin'), password: await bcrypt.hash(TEST_PASSWORD, 4), phone: uniquePhone(), role: 'SUPER_ADMIN', lastActivityAt: new Date() } as never,
  })
  adminId = a.id
  adminToken = jwt.sign({ adminId }, process.env.JWT_SECRET as string)
  const r = await request(app).post('/api/advertiser/register').send({ name: 'Serve Adv', companyName: 'Serve Co', email: uniqueEmail('advserve'), password: TEST_PASSWORD })
  adv = { token: r.body.token, id: r.body.advertiser.id }
})
afterAll(async () => {
  await prisma.adEvent.deleteMany({ where: { campaignId: { in: campaignIds } } })
  await prisma.advertisingPayment.deleteMany({ where: { campaignId: { in: campaignIds } } })
  await prisma.adCampaign.deleteMany({ where: { id: { in: campaignIds } } })
  await prisma.advertiser.deleteMany({ where: { id: adv.id } })
  await prisma.auditLog.deleteMany({ where: { adminId, action: { startsWith: 'AD_' } } }).catch(() => {})
  await prisma.admin.delete({ where: { id: adminId } }).catch(() => {})
})

describe('which campaigns buyers are shown', () => {
  it('an ACTIVE approved campaign is served on Web and Mobile', async () => {
    const id = await pending()
    expect(await status(id)).toBe('PENDING_APPROVAL')
    expect((await admin(`/campaigns/${id}/approve`)).status).toBe(200)
    expect(await served(id, 'WEB')).toBe(true)
    expect(await served(id, 'MOBILE')).toBe(true)
  })
  it('a PENDING_APPROVAL campaign is NOT served', async () => {
    const id = await pending()
    expect(await served(id)).toBe(false)
  })
  it('a REJECTED campaign is NOT served', async () => {
    const id = await pending()
    expect((await admin(`/campaigns/${id}/reject`, { reason: 'Rejected because the creative violates policy.' })).status).toBe(200)
    expect(await status(id)).toBe('REJECTED')
    expect(await served(id)).toBe(false)
    expect(await served(id, 'MOBILE')).toBe(false)
  })
  it('a PAUSED campaign is NOT served, and is served again once resumed', async () => {
    const id = await pending()
    await admin(`/campaigns/${id}/approve`)
    expect((await admin(`/campaigns/${id}/pause`)).status).toBe(200)
    expect(await served(id)).toBe(false)
    expect((await admin(`/campaigns/${id}/resume`)).status).toBe(200)
    expect(await served(id)).toBe(true)
  })
  it('an EXHAUSTED campaign is NOT served', async () => {
    const id = await pending()
    await admin(`/campaigns/${id}/approve`)
    await prisma.adCampaign.update({ where: { id }, data: { impressions: 1000, spentPaise: 10000n, status: 'EXHAUSTED' } })
    const other = await pending()
    await admin(`/campaigns/${other}/approve`) // any approval also refreshes the serving cache
    expect(await served(id)).toBe(false)
  })
  it('an EXPIRED campaign (end date passed) is NOT served', async () => {
    const id = await pending()
    await admin(`/campaigns/${id}/approve`)
    await prisma.adCampaign.update({ where: { id }, data: { endDate: new Date(Date.now() - 1000) } })
    const other = await pending()
    await admin(`/campaigns/${other}/approve`)
    expect(await served(id)).toBe(false)
  })
  it('a STOPPED (completed) campaign is NOT served', async () => {
    const id = await pending()
    await admin(`/campaigns/${id}/approve`)
    expect((await admin(`/campaigns/${id}/stop`)).status).toBe(200)
    expect(await served(id)).toBe(false)
  })
  it('a WEB-only campaign is not served to Mobile and vice versa', async () => {
    const web = await pending('WEB')
    const mob = await pending('MOBILE')
    await admin(`/campaigns/${web}/approve`)
    await admin(`/campaigns/${mob}/approve`)
    expect(await served(web, 'WEB')).toBe(true)
    expect(await served(web, 'MOBILE')).toBe(false)
    expect(await served(mob, 'MOBILE')).toBe(true)
    expect(await served(mob, 'WEB')).toBe(false)
  })
  it('the feed never returns the raw destination URL, only a tracking path; ads are not properties', async () => {
    const id = await pending()
    await admin(`/campaigns/${id}/approve`)
    const res = await request(app).get('/api/ads/feed').query({ platform: 'WEB', count: 10 })
    expect(JSON.stringify(res.body).includes('example.com')).toBe(false)
    expect(res.body.ads.every((a: { clickPath: string }) => a.clickPath.startsWith('/ads/click?t='))).toBe(true)
    expect(res.body.interval >= 2).toBe(true)
    const feed = await request(app).get('/api/properties/feed').query({ limit: 50 })
    expect(JSON.stringify(feed.body).includes(id)).toBe(false) // never injected into the property feed data
  })
})
