import {
  prisma,
  loginAdmin,
  registerApprovedSeller,
  registerAndLoginBuyer,
  backdateSpecialRequest,
  deleteSeller,
  deleteBuyer,
} from './helpers.js'
import {
  autoDeclineOverdueAssignments,
  autoRefundOverdueCompletions,
} from '../src/services/specialRequestSla.service.js'

// PDF 7.9 — 12h accept SLA and 72h completion SLA, exercised directly against
// backdated fixture rows (the sweep reads `updatedAt`, not wall-clock waits —
// same approach as the throwaway verification scripts used in Days 3-6).
describe('special-request SLA sweeps', () => {
  beforeAll(async () => {
    await loginAdmin() // sanity: admin auth still works before these DB-level tests
  })

  it('auto-unassigns a request the seller never accepted within 12 hours', async () => {
    const adminToken = await loginAdmin()
    const seller = await registerApprovedSeller(adminToken)
    const buyer = await registerAndLoginBuyer()

    const specialRequest = await prisma.specialRequest.create({
      data: {
        userId: buyer.userId,
        sellerId: seller.sellerId,
        address: 'SLA Test Plot, Sanganer',
        city: 'Jaipur',
        tehsil: 'Sanganer',
        propertyType: 'RESIDENTIAL',
        questions: 'Please verify litigation history for this plot',
        documents: [],
        advanceAmount: 999,
        advancePaid: true,
        status: 'ASSIGNED',
      },
    })
    await backdateSpecialRequest(specialRequest.id, 13)

    await autoDeclineOverdueAssignments()

    const updated = await prisma.specialRequest.findUniqueOrThrow({ where: { id: specialRequest.id } })
    expect(updated.status).toBe('PENDING')
    expect(updated.sellerId).toBeNull()

    await prisma.specialRequest.deleteMany({ where: { id: specialRequest.id } })
    await deleteSeller(seller.sellerId)
    await deleteBuyer(buyer.userId)
  })

  it('auto-refunds the buyer when a seller never completes research within 72 hours', async () => {
    const adminToken = await loginAdmin()
    const seller = await registerApprovedSeller(adminToken)
    const buyer = await registerAndLoginBuyer()

    const specialRequest = await prisma.specialRequest.create({
      data: {
        userId: buyer.userId,
        sellerId: seller.sellerId,
        address: 'SLA Completion Test Plot, Sanganer',
        city: 'Jaipur',
        tehsil: 'Sanganer',
        propertyType: 'RESIDENTIAL',
        questions: 'Please verify litigation history for this plot',
        documents: [],
        advanceAmount: 999,
        advancePaid: true,
        status: 'IN_PROGRESS',
      },
    })

    // Mirrors what finalizeSpecialRequestAdvance would have written — a PAID
    // advance order the refund path resolves the Razorpay payment id from.
    const orderId = `order_test_sla_${Date.now()}`
    await prisma.paymentOrder.create({
      data: {
        id: orderId,
        userId: buyer.userId,
        kind: 'SPECIAL_REQUEST_ADVANCE',
        specialRequestId: specialRequest.id,
        sellerId: seller.sellerId,
        amount: 99900,
        platformCut: 999,
        sellerCut: 0,
        status: 'PAID',
        paymentId: `pay_test_sla_${Date.now()}`,
      },
    })
    await backdateSpecialRequest(specialRequest.id, 73)

    await autoRefundOverdueCompletions()

    const updated = await prisma.specialRequest.findUniqueOrThrow({ where: { id: specialRequest.id } })
    expect(updated.status).toBe('REFUNDED')

    const refund = await prisma.refund.findFirstOrThrow({ where: { specialRequestId: specialRequest.id } })
    expect(refund.status).toBe('PROCESSED')
    expect(refund.amount).toBe(999)

    await prisma.refund.deleteMany({ where: { specialRequestId: specialRequest.id } })
    await prisma.paymentOrder.deleteMany({ where: { id: orderId } })
    await prisma.specialRequest.deleteMany({ where: { id: specialRequest.id } })
    await deleteSeller(seller.sellerId)
    await deleteBuyer(buyer.userId)
  })
})
