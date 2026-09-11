import request from 'supertest'
import { REQUIRED_PROPERTY_DOCUMENT_TYPES } from '@civilcheck/shared'
import { app, prisma, loginAdmin, registerApprovedSeller, deleteSeller } from './helpers.js'

// Phase 2 — Property System foundation: uploaderRole attribution, media
// (images/videos), location fields, the unified feed, and role-gated
// authorization on both Listing (Expert) and Property (Owner) creation.
describe('property system (Phase 2)', () => {
  let adminToken: string
  let expertSellerId: string
  let ownerSellerId: string
  let expert: { token: string; sellerId: string; phone: string }
  let owner: { token: string; sellerId: string; phone: string }
  let listingId: string
  let propertyId: string
  const marker = `PropSys${Date.now()}`

  beforeAll(async () => {
    adminToken = await loginAdmin()
    expert = await registerApprovedSeller(adminToken, 'EXPERT')
    owner = await registerApprovedSeller(adminToken, 'OWNER')
    expertSellerId = expert.sellerId
    ownerSellerId = owner.sellerId
  })

  afterAll(async () => {
    if (listingId) await prisma.listing.deleteMany({ where: { id: listingId } })
    if (propertyId) await prisma.property.deleteMany({ where: { id: propertyId } })
    await deleteSeller(expertSellerId)
    await deleteSeller(ownerSellerId)
  })

  it('createListing snapshots uploaderRole=EXPERT and stores images/videos', async () => {
    const res = await request(app)
      .post('/api/seller/listings')
      .set('Authorization', `Bearer ${expert.token}`)
      .send({
        address: `${marker} Plot, Vaishali Nagar`,
        propertyType: 'RESIDENTIAL',
        city: 'Jaipur',
        tehsil: 'Sanganer',
        caseExists: false,
        price: 199,
        researchDate: new Date().toISOString(),
        latitude: 26.9124,
        longitude: 75.7873,
        images: ['https://res.cloudinary.com/demo/image/upload/civilcheck/listings/x/photo1.jpg'],
        videos: ['https://res.cloudinary.com/demo/video/upload/civilcheck/listings/x/walkthrough.mp4'],
      })
    expect(res.status).toBe(201)
    listingId = res.body.listing.id as string
    expect(res.body.listing.uploaderRole).toBe('EXPERT')
    expect(res.body.listing.images).toHaveLength(1)
    expect(res.body.listing.videos).toHaveLength(1)
  })

  it('an OWNER cannot create a Listing (403 — role-gated)', async () => {
    const res = await request(app)
      .post('/api/seller/listings')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        address: `${marker} Owner-attempt`,
        propertyType: 'RESIDENTIAL',
        city: 'Jaipur',
        tehsil: 'Sanganer',
        caseExists: false,
        price: 199,
        researchDate: new Date().toISOString(),
      })
    expect(res.status).toBe(403)
  })

  it('createProperty snapshots uploaderRole=OWNER and stores address/location/media', async () => {
    const res = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: `${marker} Flat`,
        area: '1200',
        city: 'Jaipur',
        tehsil: 'Sanganer',
        address: `${marker} Colony, Jaipur`,
        latitude: 26.9,
        longitude: 75.8,
        images: ['https://res.cloudinary.com/demo/image/upload/civilcheck/properties/x/photo1.jpg'],
        videos: [],
        documents: REQUIRED_PROPERTY_DOCUMENT_TYPES.map((type, i) => ({
          type,
          url: `https://res.cloudinary.com/demo/image/upload/civilcheck/properties/x/doc${i}.pdf`,
        })),
      })
    expect(res.status).toBe(201)
    propertyId = res.body.property.id as string
    expect(res.body.property.uploaderRole).toBe('OWNER')
    expect(res.body.property.address).toBe(`${marker} Colony, Jaipur`)
    expect(res.body.property.images).toHaveLength(1)
  })

  it('an EXPERT cannot create a Property (403 — role-gated)', async () => {
    const res = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${expert.token}`)
      .send({ title: 'Expert-attempt', area: '1000' })
    expect(res.status).toBe(403)
  })

  it('buyer-facing Listing preview exposes uploadedBy, mapUrl, images and videos', async () => {
    const approveRes = await request(app)
      .post(`/api/admin/listings/${listingId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(approveRes.body.success).toBe(true)

    const detailRes = await request(app).get(`/api/properties/${listingId}`)
    expect(detailRes.status).toBe(200)
    expect(detailRes.body.property.uploadedBy).toBe('EXPERT')
    expect(detailRes.body.property.images).toHaveLength(1)
    expect(detailRes.body.property.videos).toHaveLength(1)
    expect(detailRes.body.property.mapUrl).toBe('https://www.google.com/maps?q=26.9124,75.7873')
  })

  // Direct-publish business rule — createProperty (property-owner.controller.ts)
  // already publishes Owner properties as APPROVED, so there is no separate
  // admin-approve step to drive here anymore; the property is buyer-visible
  // immediately after the earlier createProperty test.
  it('buyer-facing owner-property detail exposes uploadedBy, mapUrl and media, never documents', async () => {
    const detailRes = await request(app).get(`/api/owner-properties/${propertyId}`)
    expect(detailRes.status).toBe(200)
    expect(detailRes.body.property.uploadedBy).toBe('OWNER')
    expect(detailRes.body.property.mapUrl).toBe('https://www.google.com/maps?q=26.9,75.8')
    expect(detailRes.body.property.images).toHaveLength(1)
    expect(detailRes.body.property.documents).toBeUndefined()
  })

  it('the unified feed returns both the approved Listing and the approved Property, correctly tagged', async () => {
    const res = await request(app).get('/api/properties/feed').query({ city: 'Jaipur', limit: 50 })
    expect(res.status).toBe(200)

    const items = res.body.results as Array<{ id: string; source: string; riskBadge: string | null; uploadedBy: string }>
    const listingItem = items.find((i) => i.id === listingId)
    const propertyItem = items.find((i) => i.id === propertyId)

    expect(listingItem).toBeDefined()
    expect(listingItem?.source).toBe('EXPERT_REPORT')
    expect(listingItem?.uploadedBy).toBe('EXPERT')
    expect(listingItem?.riskBadge).not.toBeNull()

    expect(propertyItem).toBeDefined()
    expect(propertyItem?.source).toBe('OWNER_LISTING')
    expect(propertyItem?.uploadedBy).toBe('OWNER')
    expect(propertyItem?.riskBadge).toBeNull()
  })
})
