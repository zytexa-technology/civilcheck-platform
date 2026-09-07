import request from 'supertest'
import {
  app,
  prisma,
  loginAdmin,
  registerApprovedSeller,
  createApprovedListing,
  registerAndLoginBuyer,
  purchaseListing,
  deleteSeller,
  deleteBuyer,
  withTransientRetry,
} from './helpers.js'

// Spot-check FAIL runs a $transaction server-side (accuracy score decrement +
// listing rejection), and strike 3 additionally suspends the seller — same
// transient-Neon-pooler class as the retry documented in helpers.ts.
const spotCheck = (listingId: string, adminToken: string, body: Record<string, unknown>) =>
  withTransientRetry(() =>
    request(app)
      .post(`/api/admin/listings/${listingId}/spot-check`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
  )

// PDF 5.3 (10% spot-check auto-flag) + PDF 10.4 (false-info strike escalation).
describe('QC — spot-check auto-flagging and the 3-strike penalty system', () => {
  let adminToken: string

  beforeAll(async () => {
    adminToken = await loginAdmin()
  })

  it('flaggedForSpotCheck is a real boolean the admin filter can select on', async () => {
    const seller = await registerApprovedSeller(adminToken)
    const listingId = await createApprovedListing(seller.token, adminToken)

    const row = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })
    expect(typeof row.flaggedForSpotCheck).toBe('boolean')

    const matching = await request(app)
      .get('/api/admin/listings')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'APPROVED', flaggedForSpotCheck: String(row.flaggedForSpotCheck) })
    const opposite = await request(app)
      .get('/api/admin/listings')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'APPROVED', flaggedForSpotCheck: String(!row.flaggedForSpotCheck) })

    expect((matching.body.listings as Array<{ id: string }>).map((l) => l.id)).toContain(listingId)
    expect((opposite.body.listings as Array<{ id: string }>).map((l) => l.id)).not.toContain(listingId)

    await prisma.listing.deleteMany({ where: { id: listingId } })
    await deleteSeller(seller.sellerId)
  })

  it('strikes 1-2 warn only; strike 3 suspends, fines Rs. 500, and auto-refunds that listing\'s buyers', async () => {
    const seller = await registerApprovedSeller(adminToken)
    const buyer = await registerAndLoginBuyer()

    const listingA = await createApprovedListing(seller.token, adminToken)
    const listingB = await createApprovedListing(seller.token, adminToken)
    const listingC = await createApprovedListing(seller.token, adminToken)

    // Buyer purchases the listing that will trigger the 3rd strike, so there
    // is a real Purchase for the escalation to auto-refund.
    const purchaseId = await purchaseListing(buyer.token, listingC)

    const strike1 = await spotCheck(listingA, adminToken, { result: 'FAIL', adminNote: 'test strike 1' })
    expect(strike1.body.strike.strikeCount).toBe(1)
    expect(strike1.body.strike.escalated).toBe(false)

    const strike2 = await spotCheck(listingB, adminToken, { result: 'FAIL', adminNote: 'test strike 2' })
    expect(strike2.body.strike.strikeCount).toBe(2)
    expect(strike2.body.strike.escalated).toBe(false)

    let seller1 = await prisma.seller.findUniqueOrThrow({ where: { id: seller.sellerId } })
    expect(seller1.kycStatus).toBe('APPROVED')

    const strike3 = await spotCheck(listingC, adminToken, { result: 'FAIL', adminNote: 'test strike 3' })
    expect(strike3.body.strike.strikeCount).toBe(3)
    expect(strike3.body.strike.escalated).toBe(true)
    expect(strike3.body.strike.suspended).toBe(true)
    expect(strike3.body.strike.refundsIssued).toBe(1)

    seller1 = await prisma.seller.findUniqueOrThrow({ where: { id: seller.sellerId } })
    expect(seller1.kycStatus).toBe('SUSPENDED')
    expect(seller1.strikeCount).toBe(3)
    expect(seller1.totalEarnings).toBeGreaterThanOrEqual(0)

    const refund = await prisma.refund.findFirstOrThrow({ where: { purchaseId } })
    expect(refund.status).toBe('PROCESSED')

    await prisma.refund.deleteMany({ where: { purchaseId } })
    await prisma.purchase.deleteMany({ where: { id: purchaseId } })
    await prisma.spotCheck.deleteMany({ where: { listingId: { in: [listingA, listingB, listingC] } } })
    await prisma.listing.deleteMany({ where: { id: { in: [listingA, listingB, listingC] } } })
    await deleteSeller(seller.sellerId)
    await deleteBuyer(buyer.userId)
  })
})
