import request from 'supertest'
import {
  app,
  prisma,
  loginAdmin,
  registerApprovedSeller,
  createApprovedListing,
  registerAndLoginBuyer,
  deleteSeller,
  deleteBuyer,
} from './helpers.js'

describe('property search (Postgres FTS)', () => {
  let adminToken: string
  let sellerPhone: string
  let sellerId: string
  let listingId: string
  const uniqueMarker = `Zytexa${Date.now()}`

  beforeAll(async () => {
    adminToken = await loginAdmin()
    const seller = await registerApprovedSeller(adminToken)
    sellerId = seller.sellerId
    sellerPhone = seller.phone
    listingId = await createApprovedListing(seller.token, adminToken, {
      address: `${uniqueMarker} Colony, Sanganer`,
      city: 'Jaipur',
      tehsil: 'Sanganer',
    })
  })

  afterAll(async () => {
    await prisma.reportFlag.deleteMany({ where: { listingId } })
    await prisma.review.deleteMany({ where: { listingId } })
    await prisma.spotCheck.deleteMany({ where: { listingId } })
    await prisma.purchase.deleteMany({ where: { listingId } })
    await prisma.listing.deleteMany({ where: { id: listingId } })
    await deleteSeller(sellerId)
    void sellerPhone
  })

  it('finds the listing by its address text via full-text search', async () => {
    const res = await request(app).get('/api/properties/search').query({ query: uniqueMarker })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const ids = (res.body.results as Array<{ id: string }>).map((l) => l.id)
    expect(ids).toContain(listingId)
  })

  it('logs the search against the authenticated buyer', async () => {
    const buyer = await registerAndLoginBuyer()

    const searchRes = await request(app)
      .get('/api/properties/search')
      .set('Authorization', `Bearer ${buyer.token}`)
      .query({ query: uniqueMarker })
    expect(searchRes.status).toBe(200)

    const historyRes = await request(app)
      .get('/api/properties/searches')
      .set('Authorization', `Bearer ${buyer.token}`)
    expect(historyRes.status).toBe(200)
    expect(historyRes.body.searches).toEqual(
      expect.arrayContaining([expect.objectContaining({ query: uniqueMarker })])
    )

    await deleteBuyer(buyer.userId)
  })
})
