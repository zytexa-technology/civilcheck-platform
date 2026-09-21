// Paid Legal Verification Report: detailed findings, NO Green/Amber/Red assessment.
// Also proves the property-listing Red/Green alert is a separate, unchanged concept.
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import {
  app, prisma, uniquePhone, uniqueEmail, TEST_PASSWORD, registerApprovedSeller, registerAndLoginBuyer, deleteSeller, deleteBuyer,
} from './helpers.js'

let adminId: string
let expert: { token: string; sellerId: string }
let owner: { token: string; sellerId: string }
let buyer: { token: string; userId: string }
let listingId: string
let ownerPropertyId: string
let requestId: string
const IMG = ['https://res.cloudinary.com/demo/image/upload/civilcheck/listings/x/photo1.jpg']

beforeAll(async () => {
  const a = await prisma.admin.create({
    data: { name: 'fixture-report-admin', email: uniqueEmail('fixture-report-admin'), password: await bcrypt.hash(TEST_PASSWORD, 4), phone: uniquePhone(), role: 'SUPER_ADMIN', lastActivityAt: new Date() } as never,
  })
  adminId = a.id
  const adminToken = jwt.sign({ adminId }, process.env.JWT_SECRET as string)
  expert = await registerApprovedSeller(adminToken, 'EXPERT')
  owner = await registerApprovedSeller(adminToken, 'OWNER')
  buyer = await registerAndLoginBuyer()

  // Property listing alert (kept): Expert uploads DISPUTED + CRIMINAL; Owner uploads DISPUTED + CIVIL.
  const l = await request(app).post('/api/seller/listings').set('Authorization', `Bearer ${expert.token}`).send({
    address: `Report Plot ${Date.now()}, Vaishali Nagar`, propertyType: 'RESIDENTIAL', city: 'Jaipur', tehsil: 'Sanganer',
    propertyStatus: 'DISPUTED', disputeType: 'CRIMINAL', price: 199, researchDate: new Date().toISOString(),
    latitude: 26.9, longitude: 75.8, images: IMG,
  })
  listingId = l.body.listing.id
  const p = await request(app).post('/api/seller/properties').set('Authorization', `Bearer ${owner.token}`).send({
    title: `Report Home ${Date.now()}`, area: '1000', city: 'Jaipur', latitude: 26.9, longitude: 75.8, images: IMG,
    propertyStatus: 'DISPUTED', disputeType: 'CIVIL',
    documents: ['OWNERSHIP_DOCUMENT'].map((type) => ({ type, url: 'https://res.cloudinary.com/demo/raw/upload/x/doc.pdf' })),
  })
  ownerPropertyId = p.body.property.id

  // A paid request already IN_PROGRESS and assigned to the Expert (payment steps are covered by verification-marketplace tests).
  const r = await prisma.verificationRequest.create({
    data: {
      userId: buyer.userId, source: 'LISTING', listingId, uploaderRole: 'EXPERT', minFee: 100,
      buyerInitialOfferAmount: 1000, status: 'IN_PROGRESS', assignedSellerId: expert.sellerId,
    } as never,
  })
  requestId = r.id
})

afterAll(async () => {
  await prisma.verificationReport.deleteMany({ where: { requestId } })
  await prisma.verificationRequest.deleteMany({ where: { id: requestId } })
  await prisma.listing.deleteMany({ where: { id: listingId } })
  await prisma.property.deleteMany({ where: { id: ownerPropertyId } })
  await deleteSeller(expert.sellerId)
  await deleteSeller(owner.sellerId)
  await deleteBuyer(buyer.userId)
  await prisma.admin.delete({ where: { id: adminId } }).catch(() => {})
})

const submit = (b: object) =>
  request(app).post(`/api/seller/verification-marketplace/${requestId}/report`).set('Authorization', `Bearer ${expert.token}`).send({ documents: [], images: [], videos: [], ...b })

describe('property listing alert is unchanged (separate from the report)', () => {
  it('Expert DISPUTED + CRIMINAL listing => RED / Criminal; Owner DISPUTED + CIVIL => RED / Civil', async () => {
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })
    expect(l).toMatchObject({ propertyStatus: 'DISPUTED', disputeType: 'CRIMINAL' })
    const res = await request(app).get(`/api/owner-properties/${ownerPropertyId}`)
    expect(res.body.property).toMatchObject({ propertyStatus: 'DISPUTED', disputeType: 'CIVIL' })
  })
})

describe('verification report submission (Expert)', () => {
  it('no Green/Amber/Red selection is required — but disputeFound is', async () => {
    expect((await submit({ findings: 'Detailed findings of at least twenty characters.' })).status).toBe(400)
  })
  it('a dispute needs a dispute type; no dispute must not carry one', async () => {
    expect((await submit({ findings: 'Detailed findings of at least twenty characters.', disputeFound: true })).status).toBe(400)
    expect((await submit({ findings: 'Detailed findings of at least twenty characters.', disputeFound: false, disputeType: 'CIVIL' })).status).toBe(400)
    expect((await submit({ findings: 'Detailed findings of at least twenty characters.', disputeFound: true, disputeType: 'TAX' })).status).toBe(400)
  })
  it('stores detailed findings; a legacy riskAssessment in the body is ignored', async () => {
    const res = await submit({
      disputeFound: true, disputeType: 'CIVIL', disputeNature: 'Ownership dispute', caseCategory: 'Title suit',
      caseNumber: 'CS/123/2022', courtName: 'District Court, Jaipur', disputeStartYear: 2022, disputeStatus: 'ACTIVE',
      currentStatusNotes: 'Hearing pending', partiesInvolved: 'A vs B', titleFindings: 'Title chain incomplete',
      resolutionOutlook: 'Settlement talks under way', expertRemarks: 'Do not proceed before clearance',
      findings: 'Detailed expert findings about the dispute on this property.', riskAssessment: 'RED',
    })
    expect(res.status).toBe(201)
    expect(res.body.report.riskAssessment).toBeUndefined()
    const row = await prisma.verificationReport.findUniqueOrThrow({ where: { requestId } })
    expect(row).toMatchObject({
      disputeFound: true, disputeType: 'CIVIL', disputeNature: 'Ownership dispute', caseCategory: 'Title suit',
      caseNumber: 'CS/123/2022', courtName: 'District Court, Jaipur', disputeStartYear: 2022, disputeStatus: 'ACTIVE',
      currentStatusNotes: 'Hearing pending', partiesInvolved: 'A vs B', titleFindings: 'Title chain incomplete',
      resolutionOutlook: 'Settlement talks under way', expertRemarks: 'Do not proceed before clearance',
      riskAssessment: null,
    })
  })
})

describe('buyer views the completed report', () => {
  it('locked until unlocked; then shows detailed findings and NO risk badge', async () => {
    const locked = await request(app).get(`/api/verification-requests/${requestId}/report`).set('Authorization', `Bearer ${buyer.token}`)
    expect(locked.status).toBe(403)

    await prisma.verificationRequest.update({ where: { id: requestId }, data: { status: 'REPORT_UNLOCKED' } })
    const res = await request(app).get(`/api/verification-requests/${requestId}/report`).set('Authorization', `Bearer ${buyer.token}`)
    expect(res.status).toBe(200)
    expect(res.body.report).toMatchObject({ disputeFound: true, disputeType: 'CIVIL', caseNumber: 'CS/123/2022', disputeStartYear: 2022, expertRemarks: 'Do not proceed before clearance' })
    expect('riskAssessment' in res.body.report).toBe(false)

    const detail = await request(app).get(`/api/verification-requests/${requestId}`).set('Authorization', `Bearer ${buyer.token}`)
    expect(detail.body.request.report).toMatchObject({ disputeFound: true, disputeType: 'CIVIL' })
    expect('riskAssessment' in detail.body.request.report).toBe(false)

    // Nothing in the paid report flow carries any risk colour: buyer detail, report, and the Expert's request view.
    const expertView = await request(app).get(`/api/seller/verification-marketplace/${requestId}`).set('Authorization', `Bearer ${expert.token}`)
    expect(expertView.status).toBe(200)
    for (const body of [res.body, detail.body, expertView.body]) {
      for (const word of ['riskBadge', 'riskAssessment', 'AMBER']) {
        const at = JSON.stringify(body).indexOf(word)
        expect(at === -1 ? 'absent' : JSON.stringify(body).slice(Math.max(0, at - 40), at + 40)).toBe('absent')
      }
    }
    // ...while the request's listing still carries its alert (the separate property-listing system)
    expect(expertView.body.request.listing).toMatchObject({ propertyStatus: 'DISPUTED', disputeType: 'CRIMINAL' })
  })
  it('a no-dispute report clears every dispute-specific field', async () => {
    await prisma.verificationReport.deleteMany({ where: { requestId } })
    await prisma.verificationRequest.update({ where: { id: requestId }, data: { status: 'IN_PROGRESS' } })
    const res = await submit({
      disputeFound: false, caseNumber: 'should be dropped', courtName: 'dropped', titleFindings: 'Clean title chain',
      findings: 'No dispute was found after checking court and revenue records.',
    })
    expect(res.status).toBe(201)
    const row = await prisma.verificationReport.findUniqueOrThrow({ where: { requestId } })
    expect(row).toMatchObject({ disputeFound: false, disputeType: null, caseNumber: null, courtName: null, titleFindings: 'Clean title chain' })
  })
})
