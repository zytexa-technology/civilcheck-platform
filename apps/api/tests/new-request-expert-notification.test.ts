import request from 'supertest'
import {
  app,
  prisma,
  loginAdmin,
  registerAndLoginBuyer,
  registerApprovedSeller,
  deleteSeller,
  deleteBuyer,
  uniquePhone,
  uniqueEmail,
} from './helpers.js'
import { REQUIRED_PROPERTY_DOCUMENT_TYPES } from '@civilcheck/shared'

// New Open Verification Request — Expert notification fan-out.
//
// Completely separate concern from claim notification (see
// expert-only-payout-role-model.test.ts): this one is an intentional
// broadcast, but ONLY to eligible Experts — never Owner, Reporter, Admin, or
// SuperAdmin. Eligibility reuses the same kycStatus === 'APPROVED' gate
// submitQuote itself enforces, not a new matching engine (there is no
// location/specialization matching for VerificationRequest anywhere in this
// codebase).
//
// Same environment constraint as the rest of this suite: this sandbox's
// Node version (v22) cannot run Jest here (firebase-admin's ESM chain needs
// Node v24.9+). Written to the same standard and exercised against a real
// dev server + Neon dev DB during implementation.
describe('New open verification request — eligible Expert notification', () => {
  let adminToken: string
  let owner: { token: string; sellerId: string; phone: string }
  let reporter: { token: string; sellerId: string; phone: string }
  let expertA: { token: string; sellerId: string; phone: string }
  let expertB: { token: string; sellerId: string; phone: string }
  let pendingExpertId: string
  let suspendedExpertId: string
  let buyer: { token: string; userId: string; phone: string }
  let propertyId: string

  // notifySeller's in-app write (sendInApp) is fire-and-forget from the
  // controller (`void (async () => {...})()` in createRequest) — the HTTP
  // response intentionally does not wait for the whole Expert fan-out to
  // finish, exactly as notifyBuyer's own fire-and-forget call above it never
  // has. Tests poll briefly instead of assuming synchronous delivery.
  async function waitForNotification(sellerId: string, timeoutMs = 4000): Promise<{ id: string; body: string }[]> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const rows = await prisma.notification.findMany({
        where: { sellerId, type: 'request', title: 'New verification request available' },
        select: { id: true, body: true },
      })
      if (rows.length > 0 || Date.now() > deadline) return rows
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }

  beforeAll(async () => {
    adminToken = await loginAdmin()
    owner = await registerApprovedSeller(adminToken, 'OWNER')
    reporter = await registerApprovedSeller(adminToken, 'REPORTER')
    expertA = await registerApprovedSeller(adminToken, 'EXPERT')
    expertB = await registerApprovedSeller(adminToken, 'EXPERT')

    // Case B — an Expert whose KYC never reached APPROVED (still PENDING).
    // Created directly (no register+verify+admin-approve flow) since the
    // point of this fixture is to never call the approve step.
    const pending = await prisma.seller.create({
      data: {
        phone: uniquePhone(),
        name: 'Pending KYC Expert',
        email: uniqueEmail('pending-expert'),
        profession: 'LAWYER',
        partnerRole: 'EXPERT',
        kycStatus: 'PENDING',
      },
    })
    pendingExpertId = pending.id

    // Case C — an Expert whose KYC was later suspended.
    const suspended = await prisma.seller.create({
      data: {
        phone: uniquePhone(),
        name: 'Suspended Expert',
        email: uniqueEmail('suspended-expert'),
        profession: 'LAWYER',
        partnerRole: 'EXPERT',
        kycStatus: 'SUSPENDED',
      },
    })
    suspendedExpertId = suspended.id

    buyer = await registerAndLoginBuyer()

    // propertyCreateSchema requires latitude/longitude and `documents` as
    // {type, url} objects — a plain URL-string array fails validation
    // (discovered via Phase 6 real runtime execution).
    const docs = REQUIRED_PROPERTY_DOCUMENT_TYPES.map((type) => ({ type, url: `https://x/new-request-notify-test-${type}.pdf` }))
    const createRes = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: `New Request Notify Test Flat ${Date.now()}`, area: '1200', city: 'Jaipur', latitude: 26.9124, longitude: 75.7873, documents: docs })
    if (!createRes.body.success) throw new Error(`Property create failed: ${JSON.stringify(createRes.body)}`)
    propertyId = createRes.body.property.id as string
  })

  afterAll(async () => {
    const requests = await prisma.verificationRequest.findMany({ where: { propertyId }, select: { id: true } })
    const requestIds = requests.map((r) => r.id)
    await prisma.notification.deleteMany({
      where: {
        sellerId: { in: [owner.sellerId, reporter.sellerId, expertA.sellerId, expertB.sellerId, pendingExpertId, suspendedExpertId] },
      },
    })
    await prisma.verificationQuote.deleteMany({ where: { requestId: { in: requestIds } } })
    await prisma.verificationRequest.deleteMany({ where: { id: { in: requestIds } } })
    await prisma.property.deleteMany({ where: { id: propertyId } })
    await prisma.seller.deleteMany({ where: { id: { in: [pendingExpertId, suspendedExpertId] } } })
    await deleteSeller(owner.sellerId)
    await deleteSeller(reporter.sellerId)
    await deleteSeller(expertA.sellerId)
    await deleteSeller(expertB.sellerId)
    await deleteBuyer(buyer.userId)
  })

  it('Case A/B/C/D/F — only ACTIVE, KYC-APPROVED Experts are notified, with the exact backend earning breakdown', async () => {
    const createRes = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'PROPERTY', propertyId, initialOfferAmount: 20000 })
    expect(createRes.status).toBe(201)
    const requestId = createRes.body.request.id as string

    const configRes = await request(app).get('/api/verification-requests/config')
    const { platformCommissionPercent, expertCommissionPercent } = configRes.body

    // Case A — eligible Experts ARE notified.
    const notifiedA = await waitForNotification(expertA.sellerId)
    const notifiedB = await waitForNotification(expertB.sellerId)
    expect(notifiedA.length).toBe(1)
    expect(notifiedB.length).toBe(1)

    // Case F — content contains the amount, the exact 30/70 split, and a
    // navigation reference (the request id).
    const body = notifiedA[0]!.body
    expect(body).toContain('₹20,000')
    expect(body).toContain(`${platformCommissionPercent}%`)
    expect(body).toContain(`${expertCommissionPercent}%`)
    expect(body).toContain(requestId)
    const expectedExpertShare = Math.round(20000 - Math.round((20000 * platformCommissionPercent) / 100))
    expect(body).toContain(`₹${expectedExpertShare.toLocaleString('en-IN')}`)

    // Case D — Owner/Reporter are never notified (Partner is a portal, not
    // an Expert-payout/notification role).
    const ownerNotified = await prisma.notification.findMany({ where: { sellerId: owner.sellerId, type: 'request', title: 'New verification request available' } })
    const reporterNotified = await prisma.notification.findMany({ where: { sellerId: reporter.sellerId, type: 'request', title: 'New verification request available' } })
    expect(ownerNotified.length).toBe(0)
    expect(reporterNotified.length).toBe(0)

    // Case B/C — an Expert whose KYC is not APPROVED (PENDING or SUSPENDED)
    // is never notified, since they could not act on it (submitQuote itself
    // would refuse them) — never a broadcast wider than who can actually work.
    const pendingNotified = await prisma.notification.findMany({ where: { sellerId: pendingExpertId } })
    const suspendedNotified = await prisma.notification.findMany({ where: { sellerId: suspendedExpertId } })
    expect(pendingNotified.length).toBe(0)
    expect(suspendedNotified.length).toBe(0)

    // Admin/SuperAdmin structurally cannot receive this at all — the
    // Notification model has no adminId column (see notification.service.ts's
    // notifySuperAdmins comment): there is no code path here that could ever
    // reach an Admin/SuperAdmin, confirming section 4's "do not notify
    // Owner/Reporter/Admin/SuperAdmin" without needing a runtime assertion
    // against a recipient type the schema cannot represent.
  })

  it('Case E — a retried/duplicate create for the same buyer+property never produces a duplicate notification', async () => {
    const before = await waitForNotification(expertA.sellerId, 500)
    expect(before.length).toBe(1) // from the previous test's request, still the only one

    const retryRes = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'PROPERTY', propertyId, initialOfferAmount: 20000 })
    // createVerificationRequest's own dedupe guard refuses a second active
    // request for the same buyer+property — so the notify fan-out is never
    // even reached a second time.
    expect(retryRes.status).toBe(409)

    await new Promise((resolve) => setTimeout(resolve, 300))
    const after = await prisma.notification.findMany({
      where: { sellerId: expertA.sellerId, type: 'request', title: 'New verification request available' },
    })
    expect(after.length).toBe(1) // unchanged — no duplicate
  })
})
