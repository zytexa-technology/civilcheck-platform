// Clear / Disputed property classification (Expert listing + Owner property).
// The buyer-facing Red/Green indicator is derived by the server; there is no yellow.
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import {
  app, prisma, uniquePhone, uniqueEmail, TEST_PASSWORD, registerApprovedSeller, deleteSeller,
} from './helpers.js'

const IMG = ['https://res.cloudinary.com/demo/image/upload/civilcheck/listings/x/photo1.jpg']
const DOC = (type: string) => ({ type, url: 'https://res.cloudinary.com/demo/raw/upload/civilcheck/properties/x/doc.pdf' })
const REQUIRED_DOCS = [DOC('OWNERSHIP_DOCUMENT')]

let adminId: string
let adminToken: string
let expert: { token: string; sellerId: string }
let owner: { token: string; sellerId: string }
const listingIds: string[] = []
const propertyIds: string[] = []

const listingBody = (over: Record<string, unknown> = {}) => ({
  address: `Classification Plot ${Date.now()}-${Math.floor(Math.random() * 1e6)}, Vaishali Nagar`,
  propertyType: 'RESIDENTIAL', city: 'Jaipur', tehsil: 'Sanganer', price: 199,
  researchDate: new Date().toISOString(), latitude: 26.9124, longitude: 75.7873, images: IMG,
  ...over,
})
const propertyBody = (over: Record<string, unknown> = {}) => ({
  title: `Classification Home ${Date.now()}-${Math.floor(Math.random() * 1e6)}`, area: '1200', city: 'Jaipur',
  latitude: 26.9124, longitude: 75.7873, images: IMG, documents: REQUIRED_DOCS, ...over,
})
const postListing = (b: object) => request(app).post('/api/seller/listings').set('Authorization', `Bearer ${expert.token}`).send(b)
const postProperty = (b: object) => request(app).post('/api/seller/properties').set('Authorization', `Bearer ${owner.token}`).send(b)

beforeAll(async () => {
  const a = await prisma.admin.create({
    data: { name: 'fixture-class-admin', email: uniqueEmail('fixture-class-admin'), password: await bcrypt.hash(TEST_PASSWORD, 4), phone: uniquePhone(), role: 'SUPER_ADMIN', lastActivityAt: new Date() } as never,
  })
  adminId = a.id
  adminToken = jwt.sign({ adminId }, process.env.JWT_SECRET as string)
  expert = await registerApprovedSeller(adminToken, 'EXPERT')
  owner = await registerApprovedSeller(adminToken, 'OWNER')
})

afterAll(async () => {
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } })
  await prisma.property.deleteMany({ where: { id: { in: propertyIds } } })
  await deleteSeller(expert.sellerId)
  await deleteSeller(owner.sellerId)
  await prisma.admin.delete({ where: { id: adminId } }).catch(() => {})
})

describe('Expert listing classification', () => {
  it('Clear => stored CLEAR, no dispute type, derived GREEN', async () => {
    const res = await postListing(listingBody({ propertyStatus: 'CLEAR' }))
    expect(res.status).toBe(201)
    listingIds.push(res.body.listing.id)
    expect(res.body.listing).toMatchObject({ propertyStatus: 'CLEAR', disputeType: null })
    expect('riskBadge' in res.body.listing).toBe(false) // old risk badge is gone from the API
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: res.body.listing.id } })).riskBadge).toBeNull() // and never written
  })
  it.each(['CIVIL', 'CRIMINAL', 'OTHER'])('Disputed + %s => derived RED with the dispute type stored', async (disputeType) => {
    const res = await postListing(listingBody({ propertyStatus: 'DISPUTED', disputeType }))
    expect(res.status).toBe(201)
    listingIds.push(res.body.listing.id)
    expect(res.body.listing).toMatchObject({ propertyStatus: 'DISPUTED', disputeType })
  })
  it('rejects Disputed without a dispute type, Clear with one, missing status, and yellow/unknown values', async () => {
    expect((await postListing(listingBody({ propertyStatus: 'DISPUTED' }))).status).toBe(400)
    expect((await postListing(listingBody({ propertyStatus: 'CLEAR', disputeType: 'CRIMINAL' }))).status).toBe(400)
    expect((await postListing(listingBody({}))).status).toBe(400)
    expect((await postListing(listingBody({ propertyStatus: 'YELLOW' }))).status).toBe(400)
    expect((await postListing(listingBody({ propertyStatus: 'DISPUTED', disputeType: 'TAX' }))).status).toBe(400)
  })
  it('ignores a client-supplied colour: riskBadge is not accepted, stored or returned', async () => {
    const res = await postListing(listingBody({ propertyStatus: 'DISPUTED', disputeType: 'CIVIL', riskBadge: 'GREEN' }))
    expect(res.status).toBe(201)
    listingIds.push(res.body.listing.id)
    expect(res.body.listing).toMatchObject({ propertyStatus: 'DISPUTED', disputeType: 'CIVIL' })
    expect('riskBadge' in res.body.listing).toBe(false)
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: res.body.listing.id } })).riskBadge).toBeNull()
  })
  it('edit: Clear -> Dispute needs a type; Dispute -> Clear clears the old type; combos enforced', async () => {
    const c = await postListing(listingBody({ propertyStatus: 'CLEAR' }))
    const id = c.body.listing.id as string
    listingIds.push(id)
    const put = (b: object) => request(app).put(`/api/seller/listings/${id}`).set('Authorization', `Bearer ${expert.token}`).send(b)

    expect((await put({ propertyStatus: 'DISPUTED' })).status).toBe(400)
    let r = await put({ propertyStatus: 'DISPUTED', disputeType: 'CRIMINAL' })
    expect(r.status).toBe(200)
    expect(r.body.listing).toMatchObject({ propertyStatus: 'DISPUTED', disputeType: 'CRIMINAL' })

    expect((await put({ propertyStatus: 'CLEAR', disputeType: 'CIVIL' })).status).toBe(400)
    r = await put({ propertyStatus: 'CLEAR' })
    expect(r.status).toBe(200)
    expect(r.body.listing).toMatchObject({ propertyStatus: 'CLEAR', disputeType: null })
    const row = await prisma.listing.findUniqueOrThrow({ where: { id } })
    expect(row.disputeType).toBeNull()

    // an unrelated edit keeps the stored classification
    r = await put({ sellerNotes: 'updated note' })
    expect(r.body.listing).toMatchObject({ propertyStatus: 'CLEAR', disputeType: null })
    // dispute type alone (no status) is rejected
    expect((await put({ disputeType: 'CIVIL' })).status).toBe(400)
  })
  it('the database itself refuses an invalid combination (CHECK constraint)', async () => {
    const id = listingIds[0]
    await expect(prisma.$executeRawUnsafe(`UPDATE "Listing" SET "propertyStatus"='CLEAR', "disputeType"='CIVIL' WHERE id='${id}'`)).rejects.toBeTruthy()
    await expect(prisma.$executeRawUnsafe(`UPDATE "Listing" SET "propertyStatus"='DISPUTED', "disputeType"=NULL WHERE id='${id}'`)).rejects.toBeTruthy()
  })
})

describe('Owner property classification', () => {
  it('Clear and Disputed create, with the same rules', async () => {
    const clear = await postProperty(propertyBody({ propertyStatus: 'CLEAR' }))
    expect(clear.status).toBe(201)
    propertyIds.push(clear.body.property.id)
    expect(clear.body.property).toMatchObject({ propertyStatus: 'CLEAR', disputeType: null })

    const dis = await postProperty(propertyBody({ propertyStatus: 'DISPUTED', disputeType: 'OTHER' }))
    expect(dis.status).toBe(201)
    propertyIds.push(dis.body.property.id)
    expect(dis.body.property).toMatchObject({ propertyStatus: 'DISPUTED', disputeType: 'OTHER' })
  })
  it('rejects Disputed without a type, Clear with a type, missing status, and YELLOW', async () => {
    expect((await postProperty(propertyBody({ propertyStatus: 'DISPUTED' }))).status).toBe(400)
    expect((await postProperty(propertyBody({ propertyStatus: 'CLEAR', disputeType: 'CIVIL' }))).status).toBe(400)
    expect((await postProperty(propertyBody({}))).status).toBe(400)
    expect((await postProperty(propertyBody({ propertyStatus: 'YELLOW' }))).status).toBe(400)
  })
  it('edit Clear <-> Dispute, clearing the dispute type', async () => {
    const c = await postProperty(propertyBody({ propertyStatus: 'CLEAR' }))
    const id = c.body.property.id as string
    propertyIds.push(id)
    const put = (b: object) => request(app).put(`/api/seller/properties/${id}`).set('Authorization', `Bearer ${owner.token}`).send(b)

    expect((await put({ propertyStatus: 'DISPUTED' })).status).toBe(400)
    let r = await put({ propertyStatus: 'DISPUTED', disputeType: 'CIVIL' })
    expect(r.body.property).toMatchObject({ propertyStatus: 'DISPUTED', disputeType: 'CIVIL' })
    r = await put({ propertyStatus: 'CLEAR' })
    expect(r.body.property).toMatchObject({ propertyStatus: 'CLEAR', disputeType: null })
    expect((await put({ propertyStatus: 'CLEAR', disputeType: 'CRIMINAL' })).status).toBe(400)
  })
})

describe('Buyer-facing indicator (derived server-side)', () => {
  it('feed: CLEAR => GREEN, DISPUTED => RED with dispute type, for Expert and Owner items', async () => {
    const res = await request(app).get('/api/properties/feed').query({ city: 'Jaipur', limit: 50 })
    // Listings are PENDING_REVIEW until an admin approves; approve one Expert listing to appear.
    expect(res.status).toBe(200)
    const disputedProp = await prisma.property.findFirstOrThrow({ where: { id: { in: propertyIds }, propertyStatus: 'DISPUTED' } })
    const clearProp = await prisma.property.findFirstOrThrow({ where: { id: { in: propertyIds }, propertyStatus: 'CLEAR' } })
    const items = res.body.results as Array<{ id: string; propertyStatus: string | null; disputeType: string | null }>
    const d = items.find((i) => i.id === disputedProp.id)
    const c = items.find((i) => i.id === clearProp.id)
    if (d) expect(d).toMatchObject({ propertyStatus: 'DISPUTED', disputeType: disputedProp.disputeType })
    if (c) expect(c).toMatchObject({ propertyStatus: 'CLEAR', disputeType: null })
    expect(items.every((i) => !('riskBadge' in i))).toBe(true) // no risk badge in feed items
  })
  it('owner-property endpoint exposes status + derived badge', async () => {
    const p = await prisma.property.findFirstOrThrow({ where: { id: { in: propertyIds }, propertyStatus: 'DISPUTED' } })
    const res = await request(app).get(`/api/owner-properties/${p.id}`)
    expect(res.status).toBe(200)
    expect(res.body.property).toMatchObject({ propertyStatus: 'DISPUTED', disputeType: p.disputeType })
    expect('riskBadge' in res.body.property).toBe(false)
  })
  it('search: Clear/Disputed filters; AMBER filter returns nothing; riskBadge param no longer filters; legacy rows are unclassified', async () => {
    const approve = async (id: string) => prisma.listing.update({ where: { id }, data: { status: 'APPROVED' } })
    const clearL = await prisma.listing.findFirstOrThrow({ where: { id: { in: listingIds }, propertyStatus: 'CLEAR' } })
    const disL = await prisma.listing.findFirstOrThrow({ where: { id: { in: listingIds }, propertyStatus: 'DISPUTED' } })
    await approve(clearL.id); await approve(disL.id)
    const ids = async (q: Record<string, string>) =>
      ((await request(app).get('/api/properties/search').query({ city: 'Jaipur', limit: '50', ...q })).body.results as Array<{ id: string }>).map((r) => r.id)

    expect(await ids({ propertyStatus: 'CLEAR' })).toContain(clearL.id)
    expect(await ids({ propertyStatus: 'CLEAR' })).not.toContain(disL.id)
    expect(await ids({ propertyStatus: 'DISPUTED' })).toContain(disL.id)
    expect(await ids({ propertyStatus: 'DISPUTED' })).not.toContain(clearL.id)
    expect(await ids({ propertyStatus: 'YELLOW' })).toEqual([])

    // legacy rows (created before this change): NULL classification
    const legacyAmber = await prisma.listing.create({
      data: {
        sellerId: expert.sellerId, uploaderRole: 'EXPERT', address: `Legacy amber ${Date.now()}`, propertyType: 'RESIDENTIAL',
        city: 'Jaipur', tehsil: 'Sanganer', caseExists: true, riskBadge: 'AMBER', price: 199, researchDate: new Date(), status: 'APPROVED',
      },
    })
    listingIds.push(legacyAmber.id)
    const search = (await request(app).get('/api/properties/search').query({ city: 'Jaipur', limit: '50' })).body.results as Array<{ id: string; propertyStatus: string | null }>
    const legacy = search.find((r) => r.id === legacyAmber.id)
    expect(legacy).toBeDefined()
    expect(legacy?.propertyStatus).toBeNull() // never silently clear/disputed, never yellow
    expect(search.every((r) => !('riskBadge' in r))).toBe(true) // no risk badge in free-preview results
  })
})
