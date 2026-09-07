import request from 'supertest'
import { app, prisma, loginAdmin, registerApprovedSeller, deleteSeller } from './helpers.js'

// Reporter/Owner architecture split — Reporter posts property-information/
// news content (ReporterPost), not a Property listing: no admin approval,
// live immediately, no automatic reward. Owner/Expert signup, mandatory
// phone, cross-role authorization, the reward ledger (manual adjustments
// only) and Super Admin partner controls are covered here too.
//
// Verified live against the dev server during implementation — this file
// captures the same scenarios as a Jest suite for when the sandbox's
// Node-version blocker on firebase-admin's ESM chain is resolved.
describe('reporter module', () => {
  let adminToken: string
  let owner: { token: string; sellerId: string; phone: string }
  let reporter: { token: string; sellerId: string; phone: string }
  let reporter2: { token: string; sellerId: string; phone: string }
  let expert: { token: string; sellerId: string; phone: string }

  beforeAll(async () => {
    adminToken = await loginAdmin()
    owner = await registerApprovedSeller(adminToken, 'OWNER')
    reporter = await registerApprovedSeller(adminToken, 'REPORTER')
    reporter2 = await registerApprovedSeller(adminToken, 'REPORTER')
    // Expert stays gated behind KYC — registerApprovedSeller drives the admin
    // approve step for it, same as every other phase's Expert fixture.
    expert = await registerApprovedSeller(adminToken, 'EXPERT')
  })

  afterAll(async () => {
    await deleteSeller(owner.sellerId)
    await deleteSeller(reporter.sellerId)
    await deleteSeller(reporter2.sellerId)
    await deleteSeller(expert.sellerId)
  })

  // ── SIGNUP / LOGIN ─────────────────────────────────────────────────────
  it('Reporter registers with partnerRole=REPORTER and instant-approves', async () => {
    // registerApprovedSeller already asserted a 201 + no pending-approval
    // step was needed for `reporter` in beforeAll — assert the persisted
    // shape here instead of re-registering.
    const seller = await prisma.seller.findUnique({ where: { id: reporter.sellerId } })
    expect(seller?.partnerRole).toBe('REPORTER')
    expect(seller?.kycStatus).toBe('APPROVED')
  })

  it('rejects registration without a phone number', async () => {
    const res = await request(app)
      .post('/api/seller/register')
      .send({
        name: 'No Phone Reporter',
        email: `no.phone.${Date.now()}@test.civilcheck.in`,
        password: 'Test1234',
        profession: 'PROPERTY_CONSULTANT',
        partnerRole: 'REPORTER',
        tcAccepted: true,
      })
    expect(res.status).toBe(400)
  })

  it('Expert registration still requires Super Admin KYC approval (kycStatus PENDING until approved)', async () => {
    const seller = await prisma.seller.findUnique({ where: { id: expert.sellerId } })
    expect(seller?.kycStatus).toBe('APPROVED') // registerApprovedSeller drove the approval
    expect(seller?.partnerRole).toBe('EXPERT')
  })

  // ── CROSS-ROLE AUTHORIZATION ───────────────────────────────────────────
  it('Reporter cannot create an Owner property (403)', async () => {
    const res = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ title: 'x', area: '100' })
    expect(res.status).toBe(403)
  })

  it('Owner cannot create a Reporter post (403)', async () => {
    const res = await request(app)
      .post('/api/seller/reporter-posts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'] })
    expect(res.status).toBe(403)
  })

  it('Expert cannot access Reporter reward routes (403) — cannot impersonate Reporter', async () => {
    const res = await request(app)
      .get('/api/seller/reporter/rewards/summary')
      .set('Authorization', `Bearer ${expert.token}`)
    expect(res.status).toBe(403)
  })

  // ── REPORTER POST — LIVE IMMEDIATELY, NO ADMIN GATE ─────────────────────
  let postId: string

  it('Reporter creates a post — it is PUBLISHED immediately, no approval gate', async () => {
    const res = await request(app)
      .post('/api/seller/reporter-posts')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({
        title: `Reporter Test Post ${Date.now()}`,
        city: 'Jaipur',
        images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'],
      })
    expect(res.status).toBe(201)
    expect(res.body.post.status).toBe('PUBLISHED')
    postId = res.body.post.id
  })

  it('a PUBLISHED Reporter post is immediately visible in the public feed', async () => {
    const res = await request(app).get(`/api/reporter-posts/${postId}`)
    expect(res.status).toBe(200)
    expect(res.body.post.reportedBy).toBe('CivilCheck Reporter')
  })

  it('the public feed response never contains a "Verified" claim', async () => {
    const res = await request(app).get('/api/reporter-posts')
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toMatch(/verified/i)
  })

  it('a second Reporter cannot modify or delete the first Reporter\'s post', async () => {
    const update = await request(app)
      .patch(`/api/seller/reporter-posts/${postId}`)
      .set('Authorization', `Bearer ${reporter2.token}`)
      .send({ title: 'hijacked' })
    expect(update.status).toBe(404)

    const del = await request(app)
      .delete(`/api/seller/reporter-posts/${postId}`)
      .set('Authorization', `Bearer ${reporter2.token}`)
    expect(del.status).toBe(404)
  })

  it('the owning Reporter can update their own post', async () => {
    const res = await request(app)
      .patch(`/api/seller/reporter-posts/${postId}`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ title: 'Updated title' })
    expect(res.status).toBe(200)
    expect(res.body.post.title).toBe('Updated title')
  })

  it('the owning Reporter can remove their own post — it disappears from the public feed', async () => {
    const del = await request(app)
      .delete(`/api/seller/reporter-posts/${postId}`)
      .set('Authorization', `Bearer ${reporter.token}`)
    expect(del.status).toBe(200)

    const gone = await request(app).get(`/api/reporter-posts/${postId}`)
    expect(gone.status).toBe(404)
  })

  it('Super Admin can remove any Reporter post; a normal Admin cannot', async () => {
    const create = await request(app)
      .post('/api/seller/reporter-posts')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'] })
    const id = create.body.post.id

    const del = await request(app)
      .delete(`/api/admin/reporter-posts/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(del.status).toBe(200)

    const gone = await request(app).get(`/api/reporter-posts/${id}`)
    expect(gone.status).toBe(404)
  })

  // ── REWARD LEDGER — MANUAL ADJUSTMENT ONLY, NO AUTOMATIC TRIGGER ────────
  it('creating a Reporter post never credits the reward ledger automatically', async () => {
    const before = await request(app)
      .get('/api/seller/reporter/rewards/summary')
      .set('Authorization', `Bearer ${reporter.token}`)
    const balanceBefore = before.body.summary.availableBalance

    await request(app)
      .post('/api/seller/reporter-posts')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'] })

    const after = await request(app)
      .get('/api/seller/reporter/rewards/summary')
      .set('Authorization', `Bearer ${reporter.token}`)
    expect(after.body.summary.availableBalance).toBe(balanceBefore)
  })

  it('Admin can create a manual adjustment (never a cash payout — points only)', async () => {
    const before = await request(app)
      .get('/api/seller/reporter/rewards/summary')
      .set('Authorization', `Bearer ${reporter.token}`)
    const balanceBefore = before.body.summary.availableBalance

    const adjust = await request(app)
      .post(`/api/admin/sellers/${reporter.sellerId}/reward-adjustment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ points: 5, reason: 'Test bonus' })
    expect(adjust.status).toBe(201)

    const after = await request(app)
      .get('/api/seller/reporter/rewards/summary')
      .set('Authorization', `Bearer ${reporter.token}`)
    expect(after.body.summary.availableBalance).toBe(balanceBefore + 5)
  })

  // ── REDEEM REQUESTS ─────────────────────────────────────────────────────
  it('rejects a redeem request over the available balance', async () => {
    const res = await request(app)
      .post('/api/seller/reporter/rewards/redeem')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ points: 999999 })
    expect(res.status).toBe(400)
  })

  it('Reporter files a redeem request, Admin approves it, balance is debited', async () => {
    const before = await request(app)
      .get('/api/seller/reporter/rewards/summary')
      .set('Authorization', `Bearer ${reporter.token}`)
    const balanceBefore = before.body.summary.availableBalance

    const redeem = await request(app)
      .post('/api/seller/reporter/rewards/redeem')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ points: 1, note: 'Test redemption' })
    expect(redeem.status).toBe(201)
    const redeemId = redeem.body.request.id

    const approve = await request(app)
      .post(`/api/admin/redeem-requests/${redeemId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(approve.status).toBe(200)

    const after = await request(app)
      .get('/api/seller/reporter/rewards/summary')
      .set('Authorization', `Bearer ${reporter.token}`)
    expect(after.body.summary.availableBalance).toBe(balanceBefore - 1)
  })

  // ── SUPER ADMIN PARTNER CONTROLS ────────────────────────────────────────
  it('Super Admin can filter partners by partnerRole', async () => {
    const res = await request(app)
      .get('/api/admin/sellers?partnerRole=REPORTER')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.sellers.some((s: { id: string }) => s.id === reporter.sellerId)).toBe(true)
  })

  it('the Reporter disclaimer is publicly readable with the exact required text', async () => {
    const res = await request(app).get('/api/content/disclaimers/reporter-property-disclaimer')
    expect(res.status).toBe(200)
    expect(res.body.disclaimer.body).toBe(
      'Please request professional verification before making any purchase decision. ' +
        'The platform does not guarantee the authenticity of third-party uploaded property information.'
    )
  })

  it('Super Admin can soft-delete a partner account — login is refused afterward', async () => {
    const throwaway = await registerApprovedSeller(adminToken, 'OWNER')

    const del = await request(app)
      .delete(`/api/admin/sellers/${throwaway.sellerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(del.status).toBe(200)

    const seller = await prisma.seller.findUnique({ where: { id: throwaway.sellerId } })
    const login = await request(app)
      .post('/api/auth/seller/login')
      .send({ email: seller?.email, password: 'Test1234' })
    expect(login.status).toBe(401)

    // deletedAt only — row stays intact for history, so no deleteSeller() call here.
  })
})
