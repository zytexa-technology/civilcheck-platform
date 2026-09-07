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
} from './helpers.js'

// PDF 7.8 / 16 — buyer reviews (with Badge auto-recalculation) and the buyer
// "report outdated" flag + admin resolve/dismiss dashboard.
describe('reviews, rating-driven badge recalculation, and report flags', () => {
  let adminToken: string

  beforeAll(async () => {
    adminToken = await loginAdmin()
  })

  it('recalculates avgRating and Badge across multiple reviews from different buyers', async () => {
    const seller = await registerApprovedSeller(adminToken)
    const buyer1 = await registerAndLoginBuyer()
    const buyer2 = await registerAndLoginBuyer()

    const listing1 = await createApprovedListing(seller.token, adminToken)
    const listing2 = await createApprovedListing(seller.token, adminToken)

    const purchase1 = await purchaseListing(buyer1.token, listing1)
    const review1 = await request(app)
      .post(`/api/purchases/${purchase1}/review`)
      .set('Authorization', `Bearer ${buyer1.token}`)
      .send({ rating: 5, comment: 'Excellent report' })
    expect(review1.status).toBe(201)

    let sellerRow = await prisma.seller.findUniqueOrThrow({ where: { id: seller.sellerId } })
    expect(sellerRow.avgRating).toBe(5)
    expect(sellerRow.badge).toBe('PLATINUM')

    // Duplicate review on the same purchase is rejected.
    const dup = await request(app)
      .post(`/api/purchases/${purchase1}/review`)
      .set('Authorization', `Bearer ${buyer1.token}`)
      .send({ rating: 3 })
    expect(dup.status).toBe(400)

    const purchase2 = await purchaseListing(buyer2.token, listing2)
    const review2 = await request(app)
      .post(`/api/purchases/${purchase2}/review`)
      .set('Authorization', `Bearer ${buyer2.token}`)
      .send({ rating: 1 })
    expect(review2.status).toBe(201)

    sellerRow = await prisma.seller.findUniqueOrThrow({ where: { id: seller.sellerId } })
    expect(sellerRow.avgRating).toBe(3)
    expect(sellerRow.reviewCount).toBe(2)
    expect(sellerRow.badge).toBe('SILVER')

    await prisma.review.deleteMany({ where: { sellerId: seller.sellerId } })
    await prisma.purchase.deleteMany({ where: { id: { in: [purchase1, purchase2] } } })
    await prisma.listing.deleteMany({ where: { id: { in: [listing1, listing2] } } })
    await deleteSeller(seller.sellerId)
    await deleteBuyer(buyer1.userId)
    await deleteBuyer(buyer2.userId)
  })

  it('lets a buyer flag their unlocked report and an admin resolve or dismiss it', async () => {
    const seller = await registerApprovedSeller(adminToken)
    const buyer = await registerAndLoginBuyer()
    const listing = await createApprovedListing(seller.token, adminToken)
    const purchaseId = await purchaseListing(buyer.token, listing)

    // A buyer who never purchased the report cannot flag it.
    const otherBuyer = await registerAndLoginBuyer()
    const unauthorizedFlag = await request(app)
      .post(`/api/purchases/${purchaseId}/flag`)
      .set('Authorization', `Bearer ${otherBuyer.token}`)
      .send({ reason: 'This report looks outdated to me' })
    expect(unauthorizedFlag.status).toBe(404)

    const flagRes = await request(app)
      .post(`/api/purchases/${purchaseId}/flag`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ reason: 'Case status changed since this report was issued' })
    expect(flagRes.status).toBe(201)
    expect(flagRes.body.flag.status).toBe('PENDING')
    const flagId = flagRes.body.flag.id as string

    const listRes = await request(app)
      .get('/api/admin/report-flags')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'PENDING' })
    expect((listRes.body.flags as Array<{ id: string }>).map((f) => f.id)).toContain(flagId)

    const resolveRes = await request(app)
      .post(`/api/admin/report-flags/${flagId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ adminNote: 'Confirmed outdated, seller notified to update' })
    expect(resolveRes.status).toBe(200)

    const flagRow = await prisma.reportFlag.findUniqueOrThrow({ where: { id: flagId } })
    expect(flagRow.status).toBe('RESOLVED')

    // Resolving again fails — only PENDING flags can be actioned.
    const resolveAgain = await request(app)
      .post(`/api/admin/report-flags/${flagId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(resolveAgain.status).toBe(400)

    await prisma.reportFlag.deleteMany({ where: { id: flagId } })
    await prisma.purchase.deleteMany({ where: { id: purchaseId } })
    await prisma.listing.deleteMany({ where: { id: listing } })
    await deleteSeller(seller.sellerId)
    await deleteBuyer(buyer.userId)
    await deleteBuyer(otherBuyer.userId)
  })
})
