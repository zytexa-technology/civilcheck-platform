// ─────────────────────────────────────────────────────────────────────────────
// Property Verification Marketplace domain logic (Phase 3).
//
// The buyer-facing/professional-facing/admin controllers stay thin — request
// creation, the race-safe quote/accept, report submission, and cancellation
// all live here so there is exactly one code path for each state transition.
// Payment mechanics (Razorpay order creation, idempotent finalize) live in
// payment.service.ts, following the existing split this codebase already
// uses for SpecialRequest (specialRequest.controller.ts calls
// payment.service.ts; the assignment/lifecycle logic stays in the controller
// for that older feature, but for this one it's centralized here instead,
// since "first acceptance wins" needs a single, carefully-reviewed
// implementation, not one copied across multiple call sites).
// ─────────────────────────────────────────────────────────────────────────────
import type {
  Listing,
  Property,
  VerificationQuote,
  VerificationRequest,
  VerificationRequestStatus,
} from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { round2 } from './payment.service.js'
import { getPlatformSettings } from './platformSettings.service.js'
import { recordCancellationLedgerEntries } from './ledger.service.js'

export class VerificationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'VerificationError'
    this.status = status
  }
}

// Either an admin or a seller acted — never both, mirroring the DB's own
// quotedByAdminId/quotedBySellerId XOR.
export type ProfessionalActor = { adminId: string; sellerId?: undefined } | { sellerId: string; adminId?: undefined }

// ─────────────────────────────────────────────────────────────────────────────
// CREATE — buyer requests verification of an existing Listing or Property.
//
// `initialOfferAmount` is the buyer's own budget/offer, NOT a payment and
// NOT a fee — nothing is charged here (Buyer Experience redesign
// correction, 2026-09-05). It must merely clear the platform's floor
// (PlatformSetting.minVerificationFee, snapshotted onto `minFee` same as
// before); a provider is free to accept it as-is or counter with any other
// amount — see submitVerificationQuote, which no longer compares a quote
// against minFee at all.
// ─────────────────────────────────────────────────────────────────────────────
export async function createVerificationRequest(
  userId: string,
  input: { source: 'LISTING' | 'PROPERTY'; listingId?: string; propertyId?: string; initialOfferAmount: number }
): Promise<VerificationRequest> {
  let listing: Listing | null = null
  let property: Property | null = null
  let uploaderRole: string

  if (input.source === 'LISTING') {
    listing = await prisma.listing.findUnique({ where: { id: input.listingId! } })
    if (!listing || listing.status !== 'APPROVED') {
      throw new VerificationError('This listing is not available for verification', 404)
    }
    uploaderRole = listing.uploaderRole
  } else {
    property = await prisma.property.findUnique({ where: { id: input.propertyId! } })
    if (!property || property.status !== 'APPROVED') {
      throw new VerificationError('This property is not available for verification', 404)
    }
    uploaderRole = property.uploaderRole
  }

  // One active (not CANCELLED/REPORT_UNLOCKED-terminal-irrelevant) request per
  // buyer per property avoids the marketplace filling up with duplicate asks
  // for the same target from the same buyer.
  const existing = await prisma.verificationRequest.findFirst({
    where: {
      userId,
      listingId: listing?.id,
      propertyId: property?.id,
      status: { notIn: ['CANCELLED', 'REPORT_UNLOCKED'] },
    },
  })
  if (existing) {
    throw new VerificationError('You already have an active verification request for this property', 409)
  }

  const settings = await getPlatformSettings()

  if (input.initialOfferAmount < settings.minVerificationFee) {
    throw new VerificationError(
      `Your offer must be at least ₹${settings.minVerificationFee.toLocaleString('en-IN')}`,
      400
    )
  }

  return prisma.verificationRequest.create({
    data: {
      userId,
      source: input.source,
      listingId: listing?.id,
      propertyId: property?.id,
      uploaderRole: uploaderRole as VerificationRequest['uploaderRole'],
      minFee: settings.minVerificationFee,
      buyerInitialOfferAmount: input.initialOfferAmount,
      status: 'OPEN',
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE — a professional's proposed fee is an OFFER, not an acceptance. It is
// created PENDING and simply sits alongside any other PENDING quotes on the
// same request until the buyer reviews them and picks one (see
// acceptVerificationQuote below). This is a deliberate product decision
// (Buyer Experience redesign, 2026-09-04) superseding the marketplace's
// original "first submission wins" design — the buyer must be able to
// compare competing prices before committing, per the brief's negotiation
// flow (§10). The atomic "only one provider can ultimately win" guarantee
// (brief §11) is enforced instead at accept time, by the same
// updateMany({ where: { status: 'OPEN' } }) race-safe claim pattern this file
// already used here — just moved to run when the BUYER acts, not the
// professional.
//
// A quote is deliberately NOT floored at request.minFee/buyerInitialOfferAmount
// (correction, 2026-09-05) — a provider may accept the buyer's offer as-is,
// counter higher, or counter LOWER (undercutting to win the job is a
// legitimate negotiation move that benefits the buyer). The only backend-
// enforced constraint on the amount is that it's a positive number
// (verificationQuoteCreateSchema); there is no upper bound either.
// ─────────────────────────────────────────────────────────────────────────────
export async function submitVerificationQuote(
  requestId: string,
  actor: ProfessionalActor,
  input: { proposedFee: number; message?: string }
): Promise<VerificationQuote> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new VerificationError('Verification request not found', 404)

  if (request.status !== 'OPEN') {
    // Not a race — the request was already accepted/cancelled well before
    // this call started (or a stray late submission slipped in right as
    // another provider was accepted; acceptVerificationQuote's own request-
    // level lock is what actually protects the request, this is just a fast
    // fail for the common case). Fail fast without touching the DB further.
    throw new VerificationError('This request is no longer open for quotes', 409)
  }

  return prisma.verificationQuote.create({
    data: {
      requestId,
      quotedByAdminId: actor.adminId ?? null,
      quotedBySellerId: actor.sellerId ?? null,
      proposedFee: input.proposedFee,
      message: input.message ?? null,
      status: 'PENDING',
    },
  })
}

// Buyer-facing read of the quotes on their own request — used to render the
// "Expert A — ₹15,000 / Expert B — ₹12,000" comparison list.
export async function getQuotesForRequest(
  requestId: string,
  userId: string
): Promise<(VerificationQuote & { quotedBySeller: { name: string; badge: string; profession: string } | null })[]> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
  if (!request || request.userId !== userId) {
    throw new VerificationError('Verification request not found', 404)
  }

  return prisma.verificationQuote.findMany({
    where: { requestId, status: 'PENDING' },
    include: { quotedBySeller: { select: { name: true, badge: true, profession: true } } },
    orderBy: { proposedFee: 'asc' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFESSIONAL SIDE — single-request detail, used by the Expert/Admin
// "View Request" screen. Deliberately does NOT return the list of competing
// quotes (that stays buyer-only via getQuotesForRequest) — only this actor's
// OWN quote, if any. A professional must never see another professional's
// price or identity; the marketplace's whole "compare and pick" step belongs
// to the buyer alone (brief §10/§11).
//
// Visible when: the request is still OPEN (any eligible professional may
// browse it to decide whether to quote) OR this actor is the one already
// assigned to it (post-acceptance — mirrors getMyAssignments' own
// visibility rule). Anything else (someone else's assignment, a request
// this actor never touched) is a 404, not a 403 — same "don't reveal
// existence" pattern the buyer-side endpoints already use.
// ─────────────────────────────────────────────────────────────────────────────
export async function getMarketplaceRequestDetail(requestId: string, actor: ProfessionalActor) {
  const request = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    include: {
      listing: { select: { address: true, city: true, tehsil: true, propertyType: true, riskBadge: true } },
      property: { select: { title: true, city: true, tehsil: true, address: true, propertyType: true } },
      report: true,
    },
  })
  if (!request) throw new VerificationError('Verification request not found', 404)

  const isAssignedToMe =
    (actor.sellerId && request.assignedSellerId === actor.sellerId) ||
    (actor.adminId && request.assignedAdminId === actor.adminId)
  if (request.status !== 'OPEN' && !isAssignedToMe) {
    throw new VerificationError('Verification request not found', 404)
  }

  // "Most recent" is the wrong tiebreaker here: nothing stops the same
  // professional from submitting more than one quote on a request (no
  // uniqueness constraint — see submitVerificationQuote's own comment), and
  // acceptVerificationQuote closes every one of a professional's OTHER
  // PENDING quotes as a side effect of accepting a different one of theirs.
  // Picking "most recent" would then show CLOSED for a professional who
  // actually won. ACCEPTED must win the tiebreak whenever it exists.
  const myQuotes = await prisma.verificationQuote.findMany({
    where: {
      requestId,
      ...(actor.sellerId ? { quotedBySellerId: actor.sellerId } : { quotedByAdminId: actor.adminId }),
    },
    orderBy: { createdAt: 'desc' },
  })
  const myQuote = myQuotes.find((q) => q.status === 'ACCEPTED') ?? myQuotes[0] ?? null

  // Buyer identity is only ever shown once this actor is actually assigned —
  // same restraint getMyAssignments already applies; an OPEN request (not
  // yet won by anyone) never exposes who's asking.
  const buyer = isAssignedToMe
    ? await prisma.user.findUnique({ where: { id: request.userId }, select: { name: true, phone: true } })
    : null

  return { request, myQuote, buyer }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPT — the buyer picks one PENDING quote. This is where "only one
// provider can ultimately win" (brief §11) is actually enforced, atomically,
// server-side: the same single `updateMany({ where: { status: 'OPEN' } })`
// claim this file always used, just triggered by the buyer's accept call
// instead of a professional's quote submission. Postgres serializes
// concurrent UPDATEs on the same row, so a double-click / two-tab accept
// attempt on the same request can only ever succeed once.
// ─────────────────────────────────────────────────────────────────────────────
export interface AcceptQuoteResult {
  request: VerificationRequest
  quote: VerificationQuote
  closedQuotes: VerificationQuote[]
}

export async function acceptVerificationQuote(
  requestId: string,
  userId: string,
  quoteId: string
): Promise<AcceptQuoteResult> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
  if (!request || request.userId !== userId) {
    throw new VerificationError('Verification request not found', 404)
  }
  if (request.status !== 'OPEN') {
    throw new VerificationError('This request is no longer open for quotes', 409)
  }

  const quote = await prisma.verificationQuote.findUnique({ where: { id: quoteId } })
  if (!quote || quote.requestId !== requestId || quote.status !== 'PENDING') {
    throw new VerificationError('This quote is no longer available', 409)
  }

  const settings = await getPlatformSettings()
  const advanceAmount = round2(quote.proposedFee * 0.5)
  const finalAmount = round2(quote.proposedFee - advanceAmount)

  return prisma.$transaction(async (tx) => {
    const claim = await tx.verificationRequest.updateMany({
      where: { id: requestId, status: 'OPEN' },
      data: {
        status: 'ACCEPTED',
        assignedAdminId: quote.quotedByAdminId ?? null,
        assignedSellerId: quote.quotedBySellerId ?? null,
        agreedFee: quote.proposedFee,
        platformCommissionRate: settings.verificationPlatformCommissionRate,
        advanceAmount,
        finalAmount,
        acceptedQuoteId: quote.id,
      },
    })
    if (claim.count === 0) {
      // Lost a race against another accept call, or the request's status
      // moved on between the read above and now.
      throw new VerificationError('This request was just accepted or cancelled — please refresh', 409)
    }

    const acceptedQuote = await tx.verificationQuote.update({
      where: { id: quoteId },
      data: { status: 'ACCEPTED' },
    })

    // Close every other still-PENDING quote — they lost. Fetched back (not
    // just updateMany's count) so the controller can notify each losing
    // professional by id.
    const losingQuotes = await tx.verificationQuote.findMany({
      where: { requestId, id: { not: quoteId }, status: 'PENDING' },
    })
    if (losingQuotes.length > 0) {
      await tx.verificationQuote.updateMany({
        where: { id: { in: losingQuotes.map((q) => q.id) } },
        data: { status: 'CLOSED' },
      })
    }

    const updatedRequest = await tx.verificationRequest.findUniqueOrThrow({ where: { id: requestId } })
    return { request: updatedRequest, quote: acceptedQuote, closedQuotes: losingQuotes }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE — assigned professional starts work, then submits findings
// ─────────────────────────────────────────────────────────────────────────────

function assertAssigned(request: VerificationRequest, actor: ProfessionalActor): void {
  const isAssignedAdmin = actor.adminId && request.assignedAdminId === actor.adminId
  const isAssignedSeller = actor.sellerId && request.assignedSellerId === actor.sellerId
  if (!isAssignedAdmin && !isAssignedSeller) {
    throw new VerificationError('You are not the professional assigned to this request', 403)
  }
}

export async function startVerification(
  requestId: string,
  actor: ProfessionalActor
): Promise<VerificationRequest> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new VerificationError('Verification request not found', 404)
  assertAssigned(request, actor)

  const claim = await prisma.verificationRequest.updateMany({
    where: { id: requestId, status: 'ADVANCE_PAID' },
    data: { status: 'IN_PROGRESS' },
  })
  if (claim.count === 0) {
    throw new VerificationError('Verification can only start once the advance payment is confirmed', 409)
  }

  return prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestId } })
}

export interface SubmitReportInput {
  findings: string
  riskAssessment?: 'GREEN' | 'AMBER' | 'RED'
  documents: string[]
  images: string[]
  videos: string[]
}

export async function submitVerificationReport(
  requestId: string,
  actor: ProfessionalActor,
  input: SubmitReportInput
) {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new VerificationError('Verification request not found', 404)
  assertAssigned(request, actor)

  if (request.status !== 'IN_PROGRESS') {
    throw new VerificationError('A report can only be submitted while verification is IN_PROGRESS', 409)
  }

  // Snapshot property identity/location at submission time — the report is
  // evidence of what was verified, and must not silently change if the
  // source Listing/Property is edited later (same reasoning as
  // Listing.uploaderRole and every other "frozen at X time" field in this
  // codebase).
  let propertyAddress: string
  let propertyCity: string | null = null
  let propertyTehsil: string | null = null
  let latitude: number | null = null
  let longitude: number | null = null

  if (request.listingId) {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: request.listingId } })
    propertyAddress = listing.address
    propertyCity = listing.city
    propertyTehsil = listing.tehsil
    latitude = listing.latitude
    longitude = listing.longitude
  } else {
    const property = await prisma.property.findUniqueOrThrow({ where: { id: request.propertyId! } })
    propertyAddress = property.address ?? property.title
    propertyCity = property.city
    propertyTehsil = property.tehsil
    latitude = property.latitude
    longitude = property.longitude
  }

  return prisma.$transaction(async (tx) => {
    const report = await tx.verificationReport.create({
      data: {
        requestId,
        propertyAddress,
        propertyCity,
        propertyTehsil,
        latitude,
        longitude,
        findings: input.findings,
        riskAssessment: input.riskAssessment ?? null,
        documents: input.documents,
        images: input.images,
        videos: input.videos,
      },
    })

    await tx.verificationRequest.update({
      where: { id: requestId },
      data: { status: 'COMPLETED' },
    })

    return report
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCELLATION — buyer-initiated, at any point before the report is unlocked.
//
// A single configurable-rate rule (PlatformSetting.cancellationFeeRateAfter
// Acceptance) covers both "before acceptance" and "after acceptance" per the
// brief: if nothing has been paid yet (OPEN/ACCEPTED/ADVANCE_PAYMENT_PENDING
// with no captured payment), `paidAmount` is 0 and the fee is naturally 0 —
// cancellation is free. Once an advance has actually been captured, the fee
// is a configurable fraction of what was paid, never a hardcoded number.
// ─────────────────────────────────────────────────────────────────────────────
const CANCELLABLE_STATUSES: VerificationRequestStatus[] = [
  'OPEN',
  'ACCEPTED',
  'ADVANCE_PAYMENT_PENDING',
  'ADVANCE_PAID',
  'IN_PROGRESS',
  'COMPLETED',
  'FINAL_PAYMENT_PENDING',
]

export interface CancelResult {
  request: VerificationRequest
  paidAmount: number
  cancellationFee: number
  refundAmount: number
}

export async function cancelVerificationRequest(
  requestId: string,
  userId: string,
  reason: string
): Promise<CancelResult> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
  if (!request || request.userId !== userId) {
    throw new VerificationError('Verification request not found', 404)
  }
  return executeCancellation(request, reason)
}

// Admin oversight force-cancel (admin.controller.ts) — same core logic, no
// buyer-ownership check since the route middleware already establishes admin
// authority. Kept as a separate exported entry point rather than an
// "isAdmin" flag on cancelVerificationRequest, so the buyer-facing function's
// signature can never accidentally be called without an ownership check.
export async function adminForceCancelVerificationRequest(
  requestId: string,
  reason: string
): Promise<CancelResult> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
  if (!request) {
    throw new VerificationError('Verification request not found', 404)
  }
  return executeCancellation(request, reason)
}

async function executeCancellation(request: VerificationRequest, reason: string): Promise<CancelResult> {
  const requestId = request.id
  if (!CANCELLABLE_STATUSES.includes(request.status)) {
    throw new VerificationError(
      request.status === 'CANCELLED'
        ? 'This request has already been cancelled'
        : 'This request can no longer be cancelled — it has been fully paid and unlocked. Raise a claim instead.',
      400
    )
  }

  const paidOrders = await prisma.paymentOrder.findMany({
    where: { verificationRequestId: requestId, status: 'PAID' },
  })
  const paidAmount = round2(paidOrders.reduce((sum, o) => sum + o.amount / 100, 0))

  const settings = await getPlatformSettings()
  const cancellationFee = paidAmount > 0 ? round2(paidAmount * settings.cancellationFeeRateAfterAcceptance) : 0
  const refundAmount = round2(paidAmount - cancellationFee)

  const updated = await prisma.$transaction(async (tx) => {
    const claim = await tx.verificationRequest.updateMany({
      where: { id: requestId, status: { in: CANCELLABLE_STATUSES } },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancellationFee,
        cancellationRefund: refundAmount,
      },
    })
    if (claim.count === 0) {
      // Lost a race against another cancellation call, or the status moved
      // on (e.g. the report was just unlocked) between the read above and now.
      throw new VerificationError('This request could not be cancelled — its status just changed', 409)
    }

    await tx.verificationQuote.updateMany({
      where: { requestId, status: 'PENDING' },
      data: { status: 'CLOSED' },
    })

    if (refundAmount > 0) {
      await tx.refund.create({
        data: {
          verificationRequestId: requestId,
          userId: request.userId,
          amount: refundAmount,
          reason: `Verification request cancelled — ${reason}`,
          status: 'PENDING',
        },
      })
    }

    const cancelledRequest = await tx.verificationRequest.findUniqueOrThrow({ where: { id: requestId } })

    // Financial ledger (Phase 4B) — the platform's retained cancellation
    // fee is recorded the moment cancellation happens, independent of when
    // the Refund row above actually gets processed (that's a separate admin
    // action, same as every other Refund in this codebase).
    await recordCancellationLedgerEntries(tx, cancelledRequest, cancellationFee)

    return cancelledRequest
  })

  logger.info(
    `[verification] request ${requestId} (buyer ${request.userId}) cancelled — paid ₹${paidAmount}, ` +
      `fee ₹${cancellationFee}, refund ₹${refundAmount}`
  )

  return { request: updated, paidAmount, cancellationFee, refundAmount }
}
