// Owner Add Property: a single mandatory Ownership Document replaces the old
// Required (Sale Deed / Electricity Bill / Aadhaar) + Optional document sets.
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { app, prisma, uniquePhone, uniqueEmail, TEST_PASSWORD, registerApprovedSeller, deleteSeller } from './helpers.js'

const URL1 = 'https://res.cloudinary.com/demo/raw/upload/civilcheck/properties/x/ownership-1.pdf'
const URL2 = 'https://res.cloudinary.com/demo/raw/upload/civilcheck/properties/x/ownership-2.pdf'
const OLD_DOC = { type: 'SALE_DEED', url: 'https://res.cloudinary.com/demo/raw/upload/civilcheck/properties/x/sale.pdf' }

let adminId: string
let owner: { token: string; sellerId: string }
const ids: string[] = []

const body = (over: Record<string, unknown> = {}) => ({
  title: `Ownership Home ${Date.now()}-${Math.floor(Math.random() * 1e6)}`, area: '1000', city: 'Jaipur',
  latitude: 26.9, longitude: 75.8, propertyStatus: 'CLEAR', ...over,
})
const create = (b: object) => request(app).post('/api/seller/properties').set('Authorization', `Bearer ${owner.token}`).send(b)
const put = (id: string, b: object) => request(app).put(`/api/seller/properties/${id}`).set('Authorization', `Bearer ${owner.token}`).send(b)

beforeAll(async () => {
  const a = await prisma.admin.create({
    data: { name: 'fixture-own-admin', email: uniqueEmail('fixture-own-admin'), password: await bcrypt.hash(TEST_PASSWORD, 4), phone: uniquePhone(), role: 'SUPER_ADMIN', lastActivityAt: new Date() } as never,
  })
  adminId = a.id
  owner = await registerApprovedSeller(jwt.sign({ adminId }, process.env.JWT_SECRET as string), 'OWNER')
})
afterAll(async () => {
  await prisma.property.deleteMany({ where: { id: { in: ids } } })
  await deleteSeller(owner.sellerId)
  await prisma.admin.delete({ where: { id: adminId } }).catch(() => {})
})

describe('ownership document is required on create', () => {
  it('rejects a property with no documents at all', async () => {
    const res = await create(body({ documents: [] }))
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Ownership document is required.')
    const res2 = await create(body())
    expect(res2.status).toBe(400)
    expect(res2.body.message).toBe('Ownership document is required.')
  })
  it('the old Required documents alone no longer satisfy it', async () => {
    const res = await create(body({ documents: [OLD_DOC] }))
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Ownership document is required.')
  })
  it('rejects two ownership documents, a non-https URL, and a malformed entry', async () => {
    expect((await create(body({ documents: [{ type: 'OWNERSHIP_DOCUMENT', url: URL1 }, { type: 'OWNERSHIP_DOCUMENT', url: URL2 }] }))).status).toBe(400)
    expect((await create(body({ documents: [{ type: 'OWNERSHIP_DOCUMENT', url: 'http://insecure.example/x.pdf' }] }))).status).toBe(400)
    expect((await create(body({ documents: [{ type: 'OWNERSHIP_DOCUMENT', url: 'not-a-url' }] }))).status).toBe(400)
  })
  it('nothing was created by the failed attempts', async () => {
    expect(await prisma.property.count({ where: { sellerId: owner.sellerId } })).toBe(0)
  })
})

describe('creation with an ownership document', () => {
  let id: string
  it('succeeds and persists the document against the property', async () => {
    const res = await create(body({ documents: [{ type: 'OWNERSHIP_DOCUMENT', url: URL1 }] }))
    expect(res.status).toBe(201)
    id = res.body.property.id
    ids.push(id)
    const row = await prisma.property.findUniqueOrThrow({ where: { id } })
    expect(row.documents).toEqual([{ type: 'OWNERSHIP_DOCUMENT', url: URL1 }])
    expect(row.status).toBe('APPROVED')
  })
  it('keeps it when listed by the owner and still serves the property to buyers without exposing it', async () => {
    const mine = await request(app).get('/api/seller/properties').set('Authorization', `Bearer ${owner.token}`)
    const found = (mine.body.properties as Array<{ id: string; documents: unknown }>).find((p) => p.id === id)
    expect(found?.documents).toEqual([{ type: 'OWNERSHIP_DOCUMENT', url: URL1 }])
    const pub = await request(app).get(`/api/owner-properties/${id}`)
    expect(pub.status).toBe(200)
    expect(JSON.stringify(pub.body).includes('ownership-1.pdf')).toBe(false)
  })
  it('extra/legacy document types alongside it are still accepted (not required)', async () => {
    const res = await create(body({ documents: [{ type: 'OWNERSHIP_DOCUMENT', url: URL1 }, OLD_DOC] }))
    expect(res.status).toBe(201)
    ids.push(res.body.property.id)
  })
})

describe('edit', () => {
  it('replaces the ownership document and keeps other stored documents', async () => {
    const c = await create(body({ documents: [{ type: 'OWNERSHIP_DOCUMENT', url: URL1 }, OLD_DOC] }))
    const id = c.body.property.id as string
    ids.push(id)
    expect((await put(id, { ownershipDocumentUrl: URL2 })).status).toBe(200)
    const row = await prisma.property.findUniqueOrThrow({ where: { id } })
    expect(row.documents).toEqual([OLD_DOC, { type: 'OWNERSHIP_DOCUMENT', url: URL2 }])
    expect((await put(id, { ownershipDocumentUrl: 'http://x.example/a.pdf' })).status).toBe(400)
  })
  it('an existing property without one (legacy) can still be edited without re-uploading, and can add one', async () => {
    const legacy = await prisma.property.create({
      data: { sellerId: owner.sellerId, uploaderRole: 'OWNER', title: `Legacy ${Date.now()}`, area: '900', documents: [OLD_DOC], status: 'APPROVED' } as never,
    })
    ids.push(legacy.id)
    expect((await put(legacy.id, { area: '950' })).status).toBe(200)
    expect((await prisma.property.findUniqueOrThrow({ where: { id: legacy.id } })).documents).toEqual([OLD_DOC])
    expect((await put(legacy.id, { ownershipDocumentUrl: URL1 })).status).toBe(200)
    expect((await prisma.property.findUniqueOrThrow({ where: { id: legacy.id } })).documents).toEqual([OLD_DOC, { type: 'OWNERSHIP_DOCUMENT', url: URL1 }])
  })
})
