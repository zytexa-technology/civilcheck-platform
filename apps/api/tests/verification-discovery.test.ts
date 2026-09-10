import request from 'supertest'
import {
  app,
  prisma,
  loginAdmin,
  registerAndLoginBuyer,
  registerApprovedSeller,
  createApprovedListing,
  deleteSeller,
  deleteBuyer,
} from './helpers.js'
import { signMockPaymentResponse } from '../src/lib/razorpay.js'

// Property Discovery flow (Step 4B) — VerificationRequest source=DISCOVERY.
//
// IMPORTANT: Phase 4A's schema migrations (the DISCOVERY enum value, the
// desired* columns, the widened CHECK constraints) are DELIBERATELY NOT
// applied to this shared dev database yet (see the Step 4A/4B reports) — no
// migration was run as part of Phase 4B either. Every test below that
// actually needs to CREATE a real source=DISCOVERY row is therefore
// expected to fail against the current live schema with a Postgres-level
// error (unknown column / invalid enum label), not a code defect. Those
// tests are grouped into their own `describe` block below so a single
// `beforeAll` failure clearly identifies all of them as migration-blocked,
// rather than producing 15 independently confusing failures.
//
// Tests that do NOT require an actual DISCOVERY row to exist (Zod-level
// rejection, and the untouched LISTING/PROPERTY regression paths) run
// against the current schema exactly as-is and are expected to PASS.
describe('property discovery — request creation validation (no DB dependency)', () => {
  let buyer: { token: string; userId: string; phone: string }

  beforeAll(async () => {
    buyer = await registerAndLoginBuyer()
  })

  afterAll(async () => {
    await deleteBuyer(buyer.userId)
  })

  it('rejects DISCOVERY with no desired-location fields at all (Zod, before any DB call)', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'DISCOVERY', initialOfferAmount: 15000 })
    expect(res.status).toBe(400)
  })

  it('rejects DISCOVERY missing only desiredPropertyType (Zod, before any DB call)', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        source: 'DISCOVERY',
        initialOfferAmount: 15000,
        desiredAddress: 'Plot 12, Vaishali Nagar',
        desiredCity: 'Jaipur',
        desiredTehsil: 'Sanganer',
      })
    expect(res.status).toBe(400)
  })

  it('rejects DISCOVERY that also sets listingId (Zod, before any DB call)', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        source: 'DISCOVERY',
        initialOfferAmount: 15000,
        listingId: '00000000-0000-7000-8000-000000000000',
        desiredAddress: 'Plot 12, Vaishali Nagar',
        desiredCity: 'Jaipur',
        desiredTehsil: 'Sanganer',
        desiredPropertyType: 'RESIDENTIAL',
      })
    expect(res.status).toBe(400)
  })
})

describe('property discovery — existing LISTING/PROPERTY regression (unchanged code path)', () => {
  let adminToken: string
  let owner: { token: string; sellerId: string; phone: string }
  let expert: { token: string; sellerId: string; phone: string }
  let buyer: { token: string; userId: string; phone: string }
  let listingId: string
  let propertyId: string

  beforeAll(async () => {
    adminToken = await loginAdmin()
    owner = await registerApprovedSeller(adminToken, 'OWNER')
    expert = await registerApprovedSeller(adminToken, 'EXPERT')
    buyer = await registerAndLoginBuyer()
    listingId = await createApprovedListing(expert.token, adminToken)

    const docs = Array.from({ length: 8 }, (_, i) => `https://res.cloudinary.com/demo/image/upload/civilcheck/properties/x/doc${i}.pdf`)
    const propRes = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: `Discovery Regression Flat ${Date.now()}`,
        area: '1000',
        city: 'Jaipur',
        propertyType: 'RESIDENTIAL',
        latitude: 26.9,
        longitude: 75.8,
        documents: docs,
      })
    propertyId = propRes.body.property.id as string
    await request(app).post(`/api/admin/properties/${propertyId}/approve`).set('Authorization', `Bearer ${adminToken}`)
  })

  afterAll(async () => {
    await prisma.verificationReport.deleteMany({ where: { request: { OR: [{ listingId }, { propertyId }] } } })
    await prisma.paymentOrder.deleteMany({ where: { verificationRequest: { OR: [{ listingId }, { propertyId }] } } })
    await prisma.verificationQuote.deleteMany({ where: { request: { OR: [{ listingId }, { propertyId }] } } })
    await prisma.verificationRequest.deleteMany({ where: { OR: [{ listingId }, { propertyId }] } })
    await prisma.property.deleteMany({ where: { id: propertyId } })
    await prisma.listing.deleteMany({ where: { id: listingId } })
    await deleteSeller(owner.sellerId)
    await deleteSeller(expert.sellerId)
    await deleteBuyer(buyer.userId)
  })

  it('LISTING-source request still creates successfully (existing behavior unchanged)', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'LISTING', listingId })
    expect(res.status).toBe(201)
    expect(res.body.request.source).toBe('LISTING')
    expect(res.body.request.status).toBe('OPEN')
  })

  it('PROPERTY-source request still creates successfully (existing behavior unchanged)', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'PROPERTY', propertyId })
    expect(res.status).toBe(201)
    expect(res.body.request.source).toBe('PROPERTY')
    expect(res.body.request.status).toBe('OPEN')
  })

  it('LISTING request still rejects a missing listingId (existing behavior unchanged)', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'LISTING', initialOfferAmount: 15000 })
    expect(res.status).toBe(400)
  })

  it('Admin can still submit a quote on a LISTING request (existing behavior unchanged — Admin is not Expert-restricted outside DISCOVERY)', async () => {
    const reqRes = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'LISTING', listingId })
    const reqId = reqRes.body.request.id as string

    const quoteRes = await request(app)
      .post(`/api/admin/verification-marketplace/${reqId}/quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ proposedFee: 12000 })
    expect(quoteRes.status).toBe(201)

    await prisma.verificationQuote.deleteMany({ where: { requestId: reqId } })
    await prisma.verificationRequest.deleteMany({ where: { id: reqId } })
  })
})

describe('property discovery — full DISCOVERY lifecycle (REQUIRES Phase 4A migration to be applied)', () => {
  let adminToken: string
  let expertWinner: { token: string; sellerId: string; phone: string }
  let expertLoser: { token: string; sellerId: string; phone: string }
  let owner: { token: string; sellerId: string; phone: string }
  let buyer: { token: string; userId: string; phone: string }
  let otherBuyer: { token: string; userId: string; phone: string }
  let requestId: string | undefined

  const desired = {
    desiredAddress: `Plot ${Date.now()}, Vaishali Nagar`,
    desiredCity: 'Jaipur',
    desiredTehsil: 'Sanganer',
    desiredPropertyType: 'RESIDENTIAL',
    desiredKhasraOrSurvey: '230',
  }

  beforeAll(async () => {
    adminToken = await loginAdmin()
    expertWinner = await registerApprovedSeller(adminToken, 'EXPERT')
    expertLoser = await registerApprovedSeller(adminToken, 'EXPERT')
    owner = await registerApprovedSeller(adminToken, 'OWNER')
    buyer = await registerAndLoginBuyer()
    otherBuyer = await registerAndLoginBuyer()

    // This is the call expected to fail against the unmigrated schema — see
    // this file's header comment. If it throws, every `it()` below reports
    // the same underlying beforeAll failure, which is the clear signal
    // this test run is blocked on the (intentionally) unapplied migration.
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'DISCOVERY', initialOfferAmount: 15000, ...desired })
    if (res.status !== 201) {
      throw new Error(
        `DISCOVERY request creation failed (status ${res.status}): ${JSON.stringify(res.body)} — ` +
          `expected if Phase 4A migrations are not applied to this database yet.`
      )
    }
    requestId = res.body.request.id as string
  })

  afterAll(async () => {
    if (requestId) {
      await prisma.verificationReport.deleteMany({ where: { requestId } })
      await prisma.paymentOrder.deleteMany({ where: { verificationRequestId: requestId } })
      await prisma.verificationQuote.deleteMany({ where: { requestId } })
      await prisma.verificationRequest.deleteMany({ where: { id: requestId } })
    }
    await deleteSeller(expertWinner.sellerId)
    await deleteSeller(expertLoser.sellerId)
    await deleteSeller(owner.sellerId)
    await deleteBuyer(buyer.userId)
    await deleteBuyer(otherBuyer.userId)
  })

  it('A. DISCOVERY create succeeds with no listing/property target', () => {
    expect(requestId).toBeTruthy()
  })

  it('E. duplicate active DISCOVERY (same buyer, same normalized location+type) is rejected', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        source: 'DISCOVERY',
        initialOfferAmount: 15000,
        ...desired,
        desiredAddress: `  ${desired.desiredAddress.toUpperCase()}  `, // same, just whitespace/case-varied
      })
    expect(res.status).toBe(409)
  })

  it('G. an Expert sees the OPEN DISCOVERY request in the marketplace with desired-location fields, no crash on null listing/property', async () => {
    const res = await request(app)
      .get('/api/seller/verification-marketplace')
      .set('Authorization', `Bearer ${expertWinner.token}`)
    expect(res.status).toBe(200)
    const row = res.body.requests.find((r: { id: string }) => r.id === requestId)
    expect(row).toBeTruthy()
    expect(row.listing).toBeNull()
    expect(row.property).toBeNull()
    expect(row.desiredAddress).toBe(desired.desiredAddress)
    expect(row.desiredCity).toBe(desired.desiredCity)
  })

  it('H. a non-Expert (Owner) cannot submit a quote on a DISCOVERY request', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/quote`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ proposedFee: 12000 })
    expect(res.status).toBe(403)
  })

  it('Admin cannot submit a quote on a DISCOVERY request (Expert-only, unlike LISTING/PROPERTY)', async () => {
    const res = await request(app)
      .post(`/api/admin/verification-marketplace/${requestId}/quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ proposedFee: 12000 })
    expect(res.status).toBe(403)
  })

  let winningQuoteId: string
  let losingQuoteId: string

  it('I. an Expert can submit one quote', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/quote`)
      .set('Authorization', `Bearer ${expertWinner.token}`)
      .send({ proposedFee: 20000, message: 'I know this area well.' })
    expect(res.status).toBe(201)
    winningQuoteId = res.body.quote.id
  })

  it('J. the same Expert submitting a second quote is rejected (DISCOVERY-only rule)', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/quote`)
      .set('Authorization', `Bearer ${expertWinner.token}`)
      .send({ proposedFee: 25000 })
    expect(res.status).toBe(409)
  })

  it('K. buyer can view their own DISCOVERY request', async () => {
    const res = await request(app)
      .get(`/api/verification-requests/${requestId}`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(res.status).toBe(200)
  })

  it('L. another buyer cannot access this DISCOVERY request', async () => {
    const res = await request(app)
      .get(`/api/verification-requests/${requestId}`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
    expect(res.status).toBe(404)
  })

  it('a second Expert also quotes, so acceptance has a loser to close', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/quote`)
      .set('Authorization', `Bearer ${expertLoser.token}`)
      .send({ proposedFee: 18000 })
    expect(res.status).toBe(201)
    losingQuoteId = res.body.quote.id
  })

  it('M. buyer accepts a quote — 50/50 split frozen', async () => {
    const res = await request(app)
      .post(`/api/verification-requests/${requestId}/quotes/${winningQuoteId}/accept`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(res.status).toBe(200)
    expect(res.body.request.status).toBe('ACCEPTED')
    expect(res.body.request.advanceAmount).toBeCloseTo(10000)
    expect(res.body.request.finalAmount).toBeCloseTo(10000)
  })

  it('N. the losing quote is closed', async () => {
    const quote = await prisma.verificationQuote.findUniqueOrThrow({ where: { id: losingQuoteId } })
    expect(quote.status).toBe('CLOSED')
  })

  let discoveredListingId: string
  let otherExpertListingId: string

  it('buyer pays the 50% advance', async () => {
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

  it('sets up a Listing created by the losing Expert, to prove cross-Expert linking is rejected', async () => {
    otherExpertListingId = await createApprovedListing(expertLoser.token, adminToken)
  })

  it('O. + P. the losing Expert cannot link a property (not the assigned professional)', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/discovered-listing`)
      .set('Authorization', `Bearer ${expertLoser.token}`)
      .send({ listingId: otherExpertListingId })
    expect(res.status).toBe(403)
  })

  it('Q. the assigned (winning) Expert cannot link a Listing owned by a different Expert', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/discovered-listing`)
      .set('Authorization', `Bearer ${expertWinner.token}`)
      .send({ listingId: otherExpertListingId })
    expect(res.status).toBe(403)
  })

  it('R. a listing without valid latitude/longitude cannot be linked', async () => {
    const noLocationListingId = await createApprovedListing(expertWinner.token, adminToken)
    // Force-clear coordinates directly — Step 2's own create-time validation
    // requires them, so this simulates a legacy pre-Step-2 row rather than
    // going through the (now-blocking) create API.
    await prisma.listing.update({ where: { id: noLocationListingId }, data: { latitude: null, longitude: null } })

    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/discovered-listing`)
      .set('Authorization', `Bearer ${expertWinner.token}`)
      .send({ listingId: noLocationListingId })
    expect(res.status).toBe(400)

    await prisma.listing.deleteMany({ where: { id: noLocationListingId } })
  })

  it('U. report cannot be submitted before a property is linked', async () => {
    // start verification first — allowed even before linking, per Phase 4B design
    const startRes = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/start`)
      .set('Authorization', `Bearer ${expertWinner.token}`)
    expect(startRes.status).toBe(200)

    const reportRes = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/report`)
      .set('Authorization', `Bearer ${expertWinner.token}`)
      .send({ findings: 'Attempting to submit before a property is linked.', documents: [], images: [], videos: [] })
    expect(reportRes.status).toBe(409)
  })

  it('S. the assigned Expert links a valid, self-owned Listing successfully', async () => {
    discoveredListingId = await createApprovedListing(expertWinner.token, adminToken, {
      address: `Discovered Property ${Date.now()}, Vaishali Nagar`,
      propertyType: 'RESIDENTIAL',
      latitude: 26.9124,
      longitude: 75.7873,
    })
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/discovered-listing`)
      .set('Authorization', `Bearer ${expertWinner.token}`)
      .send({ listingId: discoveredListingId })
    expect(res.status).toBe(200)
    expect(res.body.request.listingId).toBe(discoveredListingId)
  })

  it('T. a second link attempt fails safely (already linked)', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/discovered-listing`)
      .set('Authorization', `Bearer ${expertWinner.token}`)
      .send({ listingId: discoveredListingId })
    expect(res.status).toBe(409)
  })

  it('V. report can now be submitted after the listing is linked', async () => {
    const res = await request(app)
      .post(`/api/seller/verification-marketplace/${requestId}/report`)
      .set('Authorization', `Bearer ${expertWinner.token}`)
      .send({ findings: 'No active litigation found on public record for this discovered property.', riskAssessment: 'GREEN', documents: [], images: [], videos: [] })
    expect(res.status).toBe(201)

    const detail = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestId } })
    expect(detail.status).toBe('COMPLETED')
  })

  it('buyer pays the remaining 50% — report unlocks (existing payment/ledger machinery, untouched)', async () => {
    const orderRes = await request(app)
      .post(`/api/verification-requests/${requestId}/final-order`)
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(orderRes.status).toBe(201)
    const orderId = orderRes.body.order.id as string
    const paymentId = `pay_test_final_${Date.now()}`
    const signature = signMockPaymentResponse(orderId, paymentId)
    const verifyRes = await request(app)
      .post(`/api/verification-requests/${requestId}/final-verify`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature })
    expect(verifyRes.status).toBe(200)
    expect(verifyRes.body.request.status).toBe('REPORT_UNLOCKED')

    // Ledger/earning rows exist exactly as they would for a LISTING/PROPERTY
    // request — confirms no duplicated/parallel payout path was created.
    const earnings = await prisma.professionalEarning.findMany({ where: { verificationRequestId: requestId } })
    expect(earnings.length).toBe(2) // advance + final leg
    expect(earnings.every((e) => e.sellerId === expertWinner.sellerId)).toBe(true)
  })

  it('F. after this request reaches a terminal state, the buyer CAN create a new DISCOVERY request for the same location', async () => {
    const res = await request(app)
      .post('/api/verification-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ source: 'DISCOVERY', initialOfferAmount: 15000, ...desired })
    expect(res.status).toBe(201)
    const newId = res.body.request.id as string
    await prisma.verificationRequest.deleteMany({ where: { id: newId } })
  })
})
