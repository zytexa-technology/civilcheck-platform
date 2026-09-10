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
  Prisma,
  Property,
  PropertyType,
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
export interface CreateVerificationRequestInput {
  source: 'LISTING' | 'PROPERTY' | 'DISCOVERY'
  listingId?: string
  propertyId?: string
  initialOfferAmount: number
  // Property Discovery flow (Step 4B) — only meaningful when source is
  // DISCOVERY; ignored otherwise.
  desiredAddress?: string
  desiredCity?: string
  desiredTehsil?: string
  desiredPropertyType?: PropertyType
  desiredKhasraOrSurvey?: string
}

export async function createVerificationRequest(
  userId: string,
  input: CreateVerificationRequestInput
): Promise<VerificationRequest> {
  // Property Discovery flow (Step 4B) — a DISCOVERY request has no existing
  // Listing/Property to look up or dedupe against, so it's branched out
  // early into its own function rather than threading a third case through
  // the LISTING/PROPERTY lookup-and-validate logic below, which must stay
  // exactly as it was for those two sources (unchanged in this diff).
  if (input.source === 'DISCOVERY') {
    return createDiscoveryVerificationRequest(userId, input)
  }

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
// CREATE — Property Discovery flow (Step 4B). The buyer wants a property
// that doesn't exist on CivilCheck yet, so there is no Listing/Property to
// look up or attach — only a description of what they want found.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeLocationText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

interface DesiredLocation {
  address: string
  city: string
  tehsil: string
  propertyType: PropertyType
}

// DISCOVERY dedupe rule — the general "same property" guard above (used for
// LISTING/PROPERTY) has no listingId/propertyId to key on here, since
// nothing exists yet. Instead: one buyer may not have two ACTIVE DISCOVERY
// requests describing the same desired location + property type. "Active"
// reuses this codebase's own existing definition of the term (status NOT IN
// CANCELLED/REPORT_UNLOCKED — the exact same set the LISTING/PROPERTY guard
// above already excludes), not a new status. Comparison is deliberately
// conservative and dependency-free: trim + collapse repeated whitespace +
// lowercase on address/city/tehsil, plus an exact match on the enum
// propertyType — no fuzzy matching, no geocoding, so it only catches
// genuine near-identical resubmissions, never two buyers' (or one buyer's
// two different) legitimately distinct requests for a similar-sounding area.
async function assertNoActiveDiscoveryDuplicate(
  tx: Prisma.TransactionClient,
  userId: string,
  desired: DesiredLocation
): Promise<void> {
  const activeDiscoveryRequests = await tx.verificationRequest.findMany({
    where: {
      userId,
      source: 'DISCOVERY',
      status: { notIn: ['CANCELLED', 'REPORT_UNLOCKED'] },
    },
    select: { desiredAddress: true, desiredCity: true, desiredTehsil: true, desiredPropertyType: true },
  })

  const normalizedAddress = normalizeLocationText(desired.address)
  const normalizedCity = normalizeLocationText(desired.city)
  const normalizedTehsil = normalizeLocationText(desired.tehsil)

  const isDuplicate = activeDiscoveryRequests.some(
    (r) =>
      r.desiredPropertyType === desired.propertyType &&
      normalizeLocationText(r.desiredAddress ?? '') === normalizedAddress &&
      normalizeLocationText(r.desiredCity ?? '') === normalizedCity &&
      normalizeLocationText(r.desiredTehsil ?? '') === normalizedTehsil
  )

  if (isDuplicate) {
    throw new VerificationError(
      'You already have an active property discovery request for this location and property type',
      409
    )
  }
}

async function createDiscoveryVerificationRequest(
  userId: string,
  input: CreateVerificationRequestInput
): Promise<VerificationRequest> {
  if (!input.desiredAddress || !input.desiredCity || !input.desiredTehsil || !input.desiredPropertyType) {
    throw new VerificationError(
      'desiredAddress, desiredCity, desiredTehsil and desiredPropertyType are all required for a DISCOVERY request',
      400
    )
  }

  const settings = await getPlatformSettings()
  if (input.initialOfferAmount < settings.minVerificationFee) {
    throw new VerificationError(
      `Your offer must be at least ₹${settings.minVerificationFee.toLocaleString('en-IN')}`,
      400
    )
  }

  const desired: DesiredLocation = {
    address: input.desiredAddress,
    city: input.desiredCity,
    tehsil: input.desiredTehsil,
    propertyType: input.desiredPropertyType,
  }

  // Best-effort race narrowing, not a full guarantee (Step 4B adds no
  // schema change, so there is no unique index to make this fully atomic —
  // see this function's mention in the Phase 4B report). Running the
  // duplicate check and the insert inside one transaction keeps them on the
  // same DB session rather than two independent round trips, which narrows
  // — but, under Postgres's default READ COMMITTED isolation, does not
  // eliminate — the window where two concurrent submissions could both
  // pass the check before either commits. A true guarantee would need a
  // partial unique index on normalized desired* columns, which is a schema
  // change out of this phase's scope.
  return prisma.$transaction(async (tx) => {
    await assertNoActiveDiscoveryDuplicate(tx, userId, desired)

    return tx.verificationRequest.create({
      data: {
        userId,
        source: 'DISCOVERY',
        minFee: settings.minVerificationFee,
        buyerInitialOfferAmount: input.initialOfferAmount,
        status: 'OPEN',
        desiredAddress: desired.address.trim(),
        desiredCity: desired.city.trim(),
        desiredTehsil: desired.tehsil.trim(),
        desiredPropertyType: desired.propertyType,
        desiredKhasraOrSurvey: input.desiredKhasraOrSurvey?.trim() || null,
      },
    })
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

  // Property Discovery flow (Step 4B) — a DISCOVERY request is a bigger ask
  // than verifying something that already exists (the winning professional
  // has to actually go find and publish the property, via their own New
  // Listing flow, before verification can even start), so eligibility here
  // is narrower than the general marketplace: Expert only (no Admin — the
  // discovery flow's later linkDiscoveredProperty step requires a Listing
  // the professional created themselves, which an Admin never does), and
  // only one quote per professional. This is intentionally NOT applied to
  // LISTING/PROPERTY, where the same professional may already submit more
  // than one quote today (see this function's own comment above — no
  // uniqueness constraint, a deliberate existing design, not a bug) and
  // Admin may already quote (existing, unchanged behavior).
  if (request.source === 'DISCOVERY') {
    if (!actor.sellerId) {
      throw new VerificationError('Only an Expert can submit a quote on a property discovery request', 403)
    }
    const seller = await prisma.seller.findUnique({
      where: { id: actor.sellerId },
      select: { partnerRole: true },
    })
    if (seller?.partnerRole !== 'EXPERT') {
      throw new VerificationError('Only Experts can submit a quote on a property discovery request', 403)
    }
    const existingOwnQuote = await prisma.verificationQuote.findFirst({
      where: { requestId, quotedBySellerId: actor.sellerId },
    })
    if (existingOwnQuote) {
      throw new VerificationError('You have already submitted a quote for this request', 409)
    }
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
//
// Property Discovery flow (Step 4B) — no DISCOVERY-specific branch is
// needed here: `request` already carries desiredAddress/desiredCity/
// desiredTehsil/desiredPropertyType/desiredKhasraOrSurvey as plain columns
// (Prisma returns every scalar field unless `select` narrows it, and this
// query uses `include`, which only adds relations on top), and the
// `listing`/`property` includes below resolve to `null` — not a thrown
// error — for a DISCOVERY request with nothing linked yet. Once
// linkDiscoveredProperty sets listingId, the exact same `listing` include
// starts resolving to the real Listing summary automatically. Forcing an
// explicit if/else branch here would just reproduce what Prisma already
// does safely.
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

// ─────────────────────────────────────────────────────────────────────────────
// LINK — Property Discovery flow (Step 4B). The assigned Expert has found
// the property and published it as a real Listing via the existing, normal
// New Listing flow (apps/seller's NewListing.jsx → POST /api/seller/
// listings, untouched by this phase). This endpoint only records that
// Listing's id onto the request — it never creates a Listing, never creates
// a Property, never approves anything. From this point on, the request is
// indistinguishable from a LISTING-source request to every downstream step
// (startVerification, submitVerificationReport, both payment legs, the
// ledger, the payout) — none of which are touched here.
// ─────────────────────────────────────────────────────────────────────────────
const DISCOVERY_LINKABLE_STATUSES: VerificationRequestStatus[] = ['ADVANCE_PAID', 'IN_PROGRESS']

export interface LinkDiscoveredPropertyResult {
  request: VerificationRequest
}

export async function linkDiscoveredProperty(
  requestId: string,
  actor: ProfessionalActor,
  listingId: string
): Promise<LinkDiscoveredPropertyResult> {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new VerificationError('Verification request not found', 404)

  // Deliberately stricter than assertAssigned above: only the assigned
  // SELLER may link a property, never an assigned Admin. The discovery flow
  // requires the professional to have created the Listing themselves via
  // the seller-only New Listing flow — an Admin account has no such
  // Listing to ever legitimately own.
  if (!actor.sellerId || request.assignedSellerId !== actor.sellerId) {
    throw new VerificationError('You are not the Expert assigned to this request', 403)
  }

  if (request.source !== 'DISCOVERY') {
    throw new VerificationError('Only a property discovery request can have a discovered listing linked to it', 400)
  }
  // Structurally unreachable today — a DISCOVERY row can never carry a
  // propertyId (Phase 4A's VerificationRequest_discovery_no_property CHECK
  // constraint) — guarded directly anyway rather than trusted implicitly,
  // matching this codebase's existing defense-in-depth style elsewhere
  // (e.g. specialRequest.controller.ts's acceptRequest/submitRequest KYC
  // re-checks).
  if (request.propertyId != null) {
    throw new VerificationError('This request already targets a Property and cannot be linked to a Listing', 409)
  }
  if (request.listingId != null) {
    throw new VerificationError('A property has already been linked to this request', 409)
  }
  if (!DISCOVERY_LINKABLE_STATUSES.includes(request.status)) {
    throw new VerificationError(
      'A discovered property can only be linked once the advance payment has been confirmed',
      409
    )
  }

  const seller = await prisma.seller.findUnique({
    where: { id: actor.sellerId },
    select: { partnerRole: true, kycStatus: true },
  })
  if (seller?.partnerRole !== 'EXPERT' || seller?.kycStatus !== 'APPROVED') {
    throw new VerificationError('Only a KYC-approved Expert can link a discovered property', 403)
  }

  const listing = await prisma.listing.findUnique({ where: { id: listingId } })
  if (!listing) {
    throw new VerificationError('Listing not found', 404)
  }
  if (listing.sellerId !== actor.sellerId) {
    throw new VerificationError('You can only link a listing you created yourself', 403)
  }
  // Step 2 already requires latitude/longitude at Listing creation time, so
  // this only ever fires for a legacy pre-Step-2 listing — checked directly
  // rather than trusted, same reasoning as the propertyId guard above.
  if (listing.latitude == null || listing.longitude == null) {
    throw new VerificationError('This listing has no latitude/longitude on file and cannot be linked', 400)
  }
  // A Listing already linked to a DIFFERENT verification request would mean
  // two buyers being sold the same "we found your property" outcome from
  // one real-world listing — never a valid state for the discovery flow.
  const linkedElsewhere = await prisma.verificationRequest.findFirst({
    where: { listingId, id: { not: requestId } },
  })
  if (linkedElsewhere) {
    throw new VerificationError('This listing is already linked to a different verification request', 409)
  }

  // Atomic claim — only a request that is STILL exactly this unlinked,
  // linkable state gets the update, so two concurrent link attempts (same
  // request, same or different listingId) can never both succeed.
  const claim = await prisma.verificationRequest.updateMany({
    where: {
      id: requestId,
      status: { in: DISCOVERY_LINKABLE_STATUSES },
      listingId: null,
      propertyId: null,
    },
    data: { listingId },
  })
  if (claim.count === 0) {
    throw new VerificationError('This request was already linked or its status changed — please refresh', 409)
  }

  return { request: await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestId } }) }
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

  // Property Discovery flow (Step 4B) — a DISCOVERY request has neither
  // target until linkDiscoveredProperty sets listingId. This is the guard
  // that must exist regardless of source: no target, no report, since the
  // snapshot logic just below requires exactly one of listingId/propertyId
  // to actually read from.
  if (request.listingId == null && request.propertyId == null) {
    throw new VerificationError(
      'A discovered property must be linked to this request before a report can be submitted',
      409
    )
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
