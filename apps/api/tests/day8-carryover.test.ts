import request from 'supertest'
import {
  app,
  prisma,
  loginAdmin,
  registerApprovedSeller,
  registerAndLoginBuyer,
  createApprovedListing,
  deleteSeller,
  deleteBuyer,
  withTransientRetry,
  ADMIN_EMAIL,
} from './helpers.js'
import { runWeeklySettlement } from '../src/services/settlement.service.js'
import { getSubscriptionMetrics } from '../src/services/analytics.service.js'
import { sweepExpiredFeaturedListings } from '../src/services/subscription.service.js'
import { isTwoFactorEnrollmentOverdue } from '../src/lib/session.js'

// Day 8 — closing out the Day 2/4/6/7 roadmap carry-overs. Each block covers
// one independent feature.
//
// Fixtures are shared across sub-tests (3 sellers + 1 buyer total) rather
// than registered per `it()` — buyerLoginLimiter/sellerLoginLimiter are
// single IP-keyed buckets (10 per 15 min), and this file alone would
// otherwise need 11 registrations, tripping it well before the suite's other
// files get a look-in.
describe('Day 8 carry-over cleanup', () => {
  let adminToken: string
  let sellerA: { token: string; sellerId: string; phone: string } // payout + featured-sweep + churn listing
  let sellerB: { token: string; sellerId: string; phone: string } // auto-match: has a matching-tehsil listing
  let sellerC: { token: string; sellerId: string; phone: string } // auto-match: no matching listing; also manual-assign
  let buyer: { token: string; userId: string; phone: string }

  beforeAll(async () => {
    adminToken = await loginAdmin()
    sellerA = await registerApprovedSeller(adminToken)
    sellerB = await registerApprovedSeller(adminToken)
    sellerC = await registerApprovedSeller(adminToken)
    buyer = await registerAndLoginBuyer()
  })

  afterAll(async () => {
    await deleteSeller(sellerA.sellerId)
    await deleteSeller(sellerB.sellerId)
    await deleteSeller(sellerC.sellerId)
    await deleteBuyer(buyer.userId)
  })

  describe('seller payout ledger for approved special requests', () => {
    it('creates a 70/30 payout row on approve and the weekly settlement picks it up', async () => {
      const specialRequest = await prisma.specialRequest.create({
        data: {
          userId: buyer.userId,
          sellerId: sellerA.sellerId,
          address: 'Payout Test Plot, Sanganer',
          city: 'Jaipur',
          tehsil: 'Sanganer',
          propertyType: 'RESIDENTIAL',
          questions: 'Please verify litigation history for this plot',
          documents: [],
          advanceAmount: 999,
          advancePaid: true,
          status: 'COMPLETED',
        },
      })

      const approveRes = await withTransientRetry(() =>
        request(app)
          .post(`/api/admin/special-requests/${specialRequest.id}/approve`)
          .set('Authorization', `Bearer ${adminToken}`)
      )
      expect(approveRes.body.success).toBe(true)

      const payout = await prisma.specialRequestPayout.findUniqueOrThrow({
        where: { specialRequestId: specialRequest.id },
      })
      expect(payout.sellerId).toBe(sellerA.sellerId)
      expect(payout.amount).toBeCloseTo(699.3, 1) // 70% of 999
      expect(payout.platformCut).toBeCloseTo(299.7, 1) // 30% of 999
      expect(payout.settled).toBe(false)

      // A second approve attempt must not create a second payout row.
      const secondApprove = await request(app)
        .post(`/api/admin/special-requests/${specialRequest.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(secondApprove.body.success).toBe(false)

      // Give the seller bank details so the weekly settlement can actually
      // pick this payout up (registerApprovedSeller doesn't set any).
      await prisma.seller.update({
        where: { id: sellerA.sellerId },
        data: { bankAccount: '000123456789', ifsc: 'HDFC0001234' },
      })

      await runWeeklySettlement()

      const settled = await prisma.specialRequestPayout.findUniqueOrThrow({
        where: { id: payout.id },
      })
      expect(settled.settled).toBe(true)
      expect(settled.settledAt).not.toBeNull()

      await prisma.specialRequestPayout.deleteMany({ where: { id: payout.id } })
      await prisma.specialRequest.deleteMany({ where: { id: specialRequest.id } })
    })
  })

  describe('special-request retry/reopen-checkout endpoint', () => {
    it('reopens checkout for a PENDING, unpaid request', async () => {
      const createRes = await withTransientRetry(() =>
        request(app)
          .post('/api/special-requests')
          .set('Authorization', `Bearer ${buyer.token}`)
          .send({
            address: 'Retry Test Plot, Sanganer',
            city: 'Jaipur',
            tehsil: 'Sanganer',
            propertyType: 'RESIDENTIAL',
            questions: 'Please verify litigation history for this plot',
            advanceAmount: 999,
          })
      )
      expect(createRes.body.success).toBe(true)
      const requestId = createRes.body.requestId as string

      const retryRes = await withTransientRetry(() =>
        request(app)
          .post(`/api/special-requests/${requestId}/retry`)
          .set('Authorization', `Bearer ${buyer.token}`)
      )
      expect(retryRes.body.success).toBe(true)
      expect(retryRes.body.order.id).toBeTruthy()

      // Once paid, retry must refuse.
      await prisma.specialRequest.update({
        where: { id: requestId },
        data: { advancePaid: true, status: 'ASSIGNED' },
      })
      const afterPaidRes = await request(app)
        .post(`/api/special-requests/${requestId}/retry`)
        .set('Authorization', `Bearer ${buyer.token}`)
      expect(afterPaidRes.body.success).toBe(false)

      await prisma.specialRequest.deleteMany({ where: { id: requestId } })
    })
  })

  describe('nearest-qualified-seller-in-tehsil auto-match', () => {
    it('auto-assigns the seller with matching tehsil listing history over one with none', async () => {
      const uniqueTehsil = `TestTehsil-${Date.now()}`

      const listingId = await createApprovedListing(sellerB.token, adminToken, {
        tehsil: uniqueTehsil,
      })

      const specialRequest = await prisma.specialRequest.create({
        data: {
          userId: buyer.userId,
          address: 'Auto-match Test Plot',
          city: 'Jaipur',
          tehsil: uniqueTehsil,
          propertyType: 'RESIDENTIAL',
          questions: 'Please verify litigation history for this plot',
          documents: [],
          advanceAmount: 999,
          advancePaid: true,
          status: 'PENDING',
        },
      })

      const assignRes = await withTransientRetry(() =>
        request(app)
          .post(`/api/admin/special-requests/${specialRequest.id}/assign`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({}) // no sellerId — auto-select
      )
      expect(assignRes.body.success).toBe(true)
      expect(assignRes.body.autoAssigned).toBe(true)
      expect(assignRes.body.matchReason).toContain(uniqueTehsil)

      const updated = await prisma.specialRequest.findUniqueOrThrow({ where: { id: specialRequest.id } })
      expect(updated.sellerId).toBe(sellerB.sellerId)
      expect(updated.sellerId).not.toBe(sellerC.sellerId)

      await prisma.specialRequest.deleteMany({ where: { id: specialRequest.id } })
      await prisma.listing.deleteMany({ where: { id: listingId } })
    })

    it('manual sellerId still works — auto-match is opt-in by omission only', async () => {
      const specialRequest = await prisma.specialRequest.create({
        data: {
          userId: buyer.userId,
          address: 'Manual Assign Test Plot',
          city: 'Jaipur',
          tehsil: 'Sanganer',
          propertyType: 'RESIDENTIAL',
          questions: 'Please verify litigation history for this plot',
          documents: [],
          advanceAmount: 999,
          advancePaid: true,
          status: 'PENDING',
        },
      })

      const assignRes = await withTransientRetry(() =>
        request(app)
          .post(`/api/admin/special-requests/${specialRequest.id}/assign`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ sellerId: sellerC.sellerId })
      )
      expect(assignRes.body.success).toBe(true)
      expect(assignRes.body.autoAssigned).toBe(false)

      await prisma.specialRequest.deleteMany({ where: { id: specialRequest.id } })
    })
  })

  describe('subscriberChurnRate', () => {
    it('is a real number once an Alert is cancelled, not null', async () => {
      const listingId = await createApprovedListing(sellerA.token, adminToken)

      const subscribeRes = await withTransientRetry(() =>
        request(app)
          .post('/api/alerts/subscribe')
          .set('Authorization', `Bearer ${buyer.token}`)
          .send({ listingId })
      )
      expect(subscribeRes.body.success).toBe(true)
      const alertId = subscribeRes.body.alertId as string

      // Backdate createdAt to before this month so it counts as "active at
      // start of month" once cancelled.
      await prisma.$executeRaw`
        UPDATE "Alert" SET "createdAt" = now() - interval '45 days' WHERE id = ${alertId}
      `

      const cancelRes = await withTransientRetry(() =>
        request(app).delete(`/api/alerts/${alertId}`).set('Authorization', `Bearer ${buyer.token}`)
      )
      expect(cancelRes.body.success).toBe(true)

      const metrics = await getSubscriptionMetrics()
      expect(metrics.subscriberChurnRate).not.toBeNull()
      expect(metrics.subscriberChurnRate).toBeGreaterThan(0)
      expect(metrics.monthlyRenewalRate).toBeNull() // still genuinely blocked

      await prisma.alert.deleteMany({ where: { id: alertId } })
      await prisma.listing.deleteMany({ where: { id: listingId } })
    })
  })

  describe('featured-listing expiry sweep', () => {
    it('clears featured on a listing whose featuredUntil has lapsed', async () => {
      const listingId = await createApprovedListing(sellerA.token, adminToken)

      await prisma.listing.update({
        where: { id: listingId },
        data: { featured: true, featuredUntil: new Date(Date.now() - 60_000) },
      })

      await sweepExpiredFeaturedListings()

      const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })
      expect(updated.featured).toBe(false)

      await prisma.listing.deleteMany({ where: { id: listingId } })
    })
  })

  describe('2FA enrollment grace period', () => {
    const ENV_KEY = 'ADMIN_2FA_ENFORCE_GRACE_PERIOD'
    const originalValue = process.env[ENV_KEY]

    afterEach(() => {
      if (originalValue === undefined) delete process.env[ENV_KEY]
      else process.env[ENV_KEY] = originalValue
    })

    it('is a no-op when the env flag is unset (default) — same as production today', () => {
      delete process.env[ENV_KEY]
      const overdueAdmin = { twoFactorEnabled: false, createdAt: new Date(Date.now() - 30 * 86_400_000) }
      expect(isTwoFactorEnrollmentOverdue(overdueAdmin)).toBe(false)
    })

    it('flags an unenrolled admin past the grace window only when the flag is explicitly on', () => {
      process.env[ENV_KEY] = 'true'
      const overdueAdmin = { twoFactorEnabled: false, createdAt: new Date(Date.now() - 10 * 86_400_000) }
      const freshAdmin = { twoFactorEnabled: false, createdAt: new Date(Date.now() - 1 * 86_400_000) }
      const enrolledAdmin = { twoFactorEnabled: true, createdAt: new Date(Date.now() - 30 * 86_400_000) }

      expect(isTwoFactorEnrollmentOverdue(overdueAdmin)).toBe(true)
      expect(isTwoFactorEnrollmentOverdue(freshAdmin)).toBe(false)
      expect(isTwoFactorEnrollmentOverdue(enrolledAdmin)).toBe(false)
    })

    // adminMiddleware exempts /2fa/* via req.path.startsWith('/2fa/') — worth
    // driving over real HTTP, not just unit-testing the pure function, since
    // a wrong path check here would self-lock every admin out of /2fa/setup
    // the moment the flag is turned on, with no way back in.
    //
    // ADMIN_2FA_GRACE_PERIOD_DAYS is read once at process start (same
    // fixed-at-boot convention as ADMIN_SESSION_TIMEOUT_MINUTES), so it can't
    // be flipped per-test — instead this backdates the seed admin's
    // createdAt well past the 7-day default and restores it afterward,
    // rather than relying on the seed admin's real age relative to a fixed
    // boundary (which is time-of-day-dependent and was observed flaking).
    it('over HTTP: blocks ordinary routes but never /2fa/* once the flag is on', async () => {
      const original = await prisma.admin.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })
      await prisma.$executeRaw`
        UPDATE "Admin" SET "createdAt" = now() - interval '30 days' WHERE email = ${ADMIN_EMAIL}
      `
      process.env[ENV_KEY] = 'true'

      try {
        const blocked = await request(app)
          .get('/api/admin/sellers')
          .set('Authorization', `Bearer ${adminToken}`)
        expect(blocked.status).toBe(403)
        expect(blocked.body.code).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED')

        const statusRes = await request(app)
          .get('/api/admin/2fa/status')
          .set('Authorization', `Bearer ${adminToken}`)
        expect(statusRes.status).toBe(200)

        const setupRes = await request(app)
          .post('/api/admin/2fa/setup')
          .set('Authorization', `Bearer ${adminToken}`)
        expect(setupRes.status).not.toBe(403)

        delete process.env[ENV_KEY]

        const restoredAccess = await request(app)
          .get('/api/admin/sellers')
          .set('Authorization', `Bearer ${adminToken}`)
        expect(restoredAccess.status).toBe(200)
      } finally {
        delete process.env[ENV_KEY]
        // /2fa/setup (exercised above) overwrites twoFactorSecret even though
        // 2FA stays disabled — restore both fields so the seed admin comes
        // out of this test byte-for-byte as it went in.
        await prisma.admin.update({
          where: { email: ADMIN_EMAIL },
          data: { createdAt: original.createdAt, twoFactorSecret: original.twoFactorSecret },
        })
      }
    })
  })
})
