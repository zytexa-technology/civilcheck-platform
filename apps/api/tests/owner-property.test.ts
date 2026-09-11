import request from 'supertest'
import { REQUIRED_PROPERTY_DOCUMENT_TYPES } from '@civilcheck/shared'
import { app, prisma, loginAdmin, registerApprovedSeller, deleteSeller } from './helpers.js'

describe('owner properties (self-published, buyer-facing)', () => {
  let adminToken: string
  let sellerId: string
  let propertyId: string
  const uniqueMarker = `Zytexa${Date.now()}`

  beforeAll(async () => {
    adminToken = await loginAdmin()
    const seller = await registerApprovedSeller(adminToken, 'OWNER')
    sellerId = seller.sellerId

    const createRes = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        title: `${uniqueMarker} Flat`,
        area: '1200',
        age: '5 yrs',
        city: 'Jaipur',
        // createProperty requires all 8 mandatory document TYPES, each
        // present exactly once (audit 2026-09-01, finding #1) — a flat
        // count/list of URLs is no longer enough.
        documents: REQUIRED_PROPERTY_DOCUMENT_TYPES.map((type, i) => ({
          type,
          url: `https://res.cloudinary.com/demo/image/upload/civilcheck/properties/x/secret${i}.pdf`,
        })),
      })
    if (!createRes.body.success) throw new Error(`Property create failed: ${JSON.stringify(createRes.body)}`)
    propertyId = createRes.body.property.id as string
  })

  afterAll(async () => {
    await prisma.property.deleteMany({ where: { id: propertyId } })
    await deleteSeller(sellerId)
  })

  // Direct-publish business rule — Owner listing no longer waits on Admin/
  // Super Admin approval (property-owner.controller.ts creates it already
  // APPROVED); it must be buyer-visible immediately, without exposing
  // documents or a "Verified" claim. Property VERIFICATION remains a
  // separate, unchanged, opt-in Buyer flow (see verification.service.ts).
  it('is immediately visible and searchable to buyers after submission, without exposing documents or a Verified claim', async () => {
    const detailRes = await request(app).get(`/api/owner-properties/${propertyId}`)
    expect(detailRes.status).toBe(200)
    expect(detailRes.body.property.id).toBe(propertyId)
    expect(detailRes.body.property.title).toBe(`${uniqueMarker} Flat`)
    expect(detailRes.body.property.documents).toBeUndefined()
    // Direct-publish is not a CivilCheck "Verified" claim (see the corrected
    // Reporter/Owner architecture requirement) — Property VERIFICATION is
    // the separate flow that actually earns that claim.
    expect(JSON.stringify(detailRes.body)).not.toMatch(/verified/i)

    const searchRes = await request(app)
      .get('/api/owner-properties/search')
      .query({ query: uniqueMarker })
    expect(searchRes.status).toBe(200)
    const ids = (searchRes.body.results as Array<{ id: string; documents?: unknown }>).map((p) => p.id)
    expect(ids).toContain(propertyId)
    expect(searchRes.body.results[0].documents).toBeUndefined()
  })

  it('rejects an admin approval attempt on an already-published property', async () => {
    const res = await request(app)
      .post(`/api/admin/properties/${propertyId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

// Audit 2026-09-01 finding: approveProperty/rejectProperty only checked "not
// already at the target status" — a DELETED/APPROVED/SUSPENDED property
// could be pushed straight to APPROVED or REJECTED via a direct API call.
// Fixed to an atomic `status: 'PENDING'` condition; these cover every
// invalid-transition case that fix closes, plus the two valid transitions.
describe('admin property status transitions (only PENDING can be approved/rejected)', () => {
  let adminToken: string
  let sellerId: string
  let pendingId: string
  let approvedId: string
  let rejectedId: string
  let suspendedId: string
  let deletedId: string

  const docs = (marker: string) =>
    REQUIRED_PROPERTY_DOCUMENT_TYPES.map((type, i) => ({
      type,
      url: `https://res.cloudinary.com/demo/image/upload/civilcheck/properties/transitions/${marker}-${type}-${i}.pdf`,
    }))

  const createOne = async (sellerToken: string, title: string) => {
    const res = await request(app)
      .post('/api/seller/properties')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title, area: '1000', documents: docs(title) })
    return res.body.property.id as string
  }

  // Direct-publish business rule — property-owner.controller.ts now creates
  // every property already APPROVED, so PENDING is no longer reachable via
  // the public API. It remains a legitimate status this admin guard logic
  // must still handle correctly (e.g. a pre-existing legacy row), so this
  // test seeds it with a direct DB write — the same technique this file's
  // sibling auth.test.ts already uses (forceKnownOtp) to reach a state the
  // real API can no longer produce — and then drives the real admin
  // approve/reject endpoints against it exactly as before.
  const forcePending = async (id: string) => {
    await prisma.property.update({ where: { id }, data: { status: 'PENDING' } })
  }

  beforeAll(async () => {
    adminToken = await loginAdmin()
    const seller = await registerApprovedSeller(adminToken, 'OWNER')
    sellerId = seller.sellerId
    const marker = `Transition${Date.now()}`

    pendingId = await createOne(seller.token, `${marker} PENDING`)
    approvedId = await createOne(seller.token, `${marker} APPROVED`)
    rejectedId = await createOne(seller.token, `${marker} REJECTED`)
    suspendedId = await createOne(seller.token, `${marker} SUSPENDED`)
    deletedId = await createOne(seller.token, `${marker} DELETED`)

    // approvedId / suspendedId / deletedId are already APPROVED straight out
    // of createOne (direct-publish) — no separate approve step needed.
    await forcePending(pendingId)
    await forcePending(rejectedId)
    await request(app).post(`/api/admin/properties/${rejectedId}/reject`).set('Authorization', `Bearer ${adminToken}`).send({ reason: 'setup' })
    await request(app).post(`/api/admin/properties/${suspendedId}/suspend`).set('Authorization', `Bearer ${adminToken}`).send({ reason: 'setup' })
    await request(app).delete(`/api/admin/properties/${deletedId}`).set('Authorization', `Bearer ${adminToken}`)
  })

  afterAll(async () => {
    await prisma.property.deleteMany({ where: { id: { in: [pendingId, approvedId, rejectedId, suspendedId, deletedId] } } })
    await deleteSeller(sellerId)
  })

  it('PENDING -> REJECTED is allowed', async () => {
    const res = await request(app)
      .post(`/api/admin/properties/${pendingId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'test' })
    expect(res.status).toBe(200)
    expect((await prisma.property.findUnique({ where: { id: pendingId } }))?.status).toBe('REJECTED')
  })

  it('APPROVED -> REJECTED is blocked (suspend is the supported path instead)', async () => {
    const res = await request(app)
      .post(`/api/admin/properties/${approvedId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'test' })
    expect(res.status).toBe(400)
    expect((await prisma.property.findUnique({ where: { id: approvedId } }))?.status).toBe('APPROVED')
  })

  it('DELETED -> APPROVED is blocked', async () => {
    const res = await request(app)
      .post(`/api/admin/properties/${deletedId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(400)
    expect((await prisma.property.findUnique({ where: { id: deletedId } }))?.status).toBe('DELETED')
  })

  it('DELETED -> REJECTED is blocked', async () => {
    const res = await request(app)
      .post(`/api/admin/properties/${deletedId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'test' })
    expect(res.status).toBe(400)
    expect((await prisma.property.findUnique({ where: { id: deletedId } }))?.status).toBe('DELETED')
  })

  it('SUSPENDED -> APPROVED is blocked (unsuspend goes to PENDING first)', async () => {
    const res = await request(app)
      .post(`/api/admin/properties/${suspendedId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(400)
    expect((await prisma.property.findUnique({ where: { id: suspendedId } }))?.status).toBe('SUSPENDED')
  })

  it('SUSPENDED -> REJECTED is blocked', async () => {
    const res = await request(app)
      .post(`/api/admin/properties/${suspendedId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'test' })
    expect(res.status).toBe(400)
    expect((await prisma.property.findUnique({ where: { id: suspendedId } }))?.status).toBe('SUSPENDED')
  })

  it('already-REJECTED -> REJECTED is blocked (idempotency)', async () => {
    const res = await request(app)
      .post(`/api/admin/properties/${rejectedId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'test' })
    expect(res.status).toBe(400)
    expect((await prisma.property.findUnique({ where: { id: rejectedId } }))?.status).toBe('REJECTED')
  })
})
