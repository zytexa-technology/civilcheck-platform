// ─────────────────────────────────────────────────────────────────────────
//  expert/VerificationRequests.jsx  —  Property Verification Marketplace,
//  the professional-participant side (Expert quoting).
//
//  Distinct from expert/Dashboard.jsx's "Special Request" workflow (an
//  older, separate money system) and from expert/VerificationEarnings.jsx
//  (payouts on ALREADY-won jobs). This page is the missing middle piece:
//  browse OPEN requests, submit a quote, and see your own quote's status.
//
//  A quote submitted here is a non-binding PENDING offer — only the buyer
//  (Buyer Web) can accept one, which atomically locks the request server-
//  side. Nothing on this page can accept/win a request on the buyer's
//  behalf; there is no such action to build.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getVerificationMarketplace,
  getMyVerificationAssignments,
  getVerificationMarketplaceRequest,
  submitVerificationQuote,
  linkDiscoveredListing,
  getMyListings,
  startVerificationJob,
  submitVerificationReport,
  getVerificationMessages,
  sendVerificationMessage,
  getAssignmentClaims,
} from '../../api/seller.api'
import { Card, PageHead, SectionTitle, Field, Modal, Chip, toast } from '../../components/ui'
import { Icon } from '../../components/Icon'

// ─────────────────────────────────────────────────────────────────────────
//  Property Discovery flow (Phase 4C) — source === 'DISCOVERY' requests
//  extend this same marketplace rather than a separate one. A Discovery
//  request has no existing Listing/Property yet (that's the whole point —
//  the buyer wants CivilCheck to find one), so it carries its own
//  desiredAddress/desiredCity/desiredTehsil/desiredPropertyType/
//  desiredKhasraOrSurvey fields instead. Everything below only ADDS
//  DISCOVERY-aware branches; the LISTING/PROPERTY paths are untouched.
// ─────────────────────────────────────────────────────────────────────────

// Free Google Maps search-pin link (no API key) for the buyer's DESIRED
// location — this is a text description, not a real pin, so it deliberately
// mirrors buyer-web's own address-text fallback rather than claiming a
// precise coordinate the request doesn't have. The actual property's map
// belongs to the linked Listing once one exists, not to this request.
function buildDesiredLocationMapsUrl(req) {
  const query = [req.desiredAddress, req.desiredTehsil, req.desiredCity].filter(Boolean).join(', ')
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// Expert-facing action-oriented status line for a DISCOVERY request —
// distinct from the generic STATUS_CHIP badge below (which stays unchanged
// for every source, including DISCOVERY, as the small top-of-card badge).
// This tells the Expert what THEY should do or expect next.
function discoveryStatusLabel(req, myQuote) {
  if (req.status === 'OPEN') return myQuote ? 'Quote Submitted' : 'Accepting Expert Quotes'
  if (req.status === 'ACCEPTED') return 'Your Quote Accepted'
  if (req.status === 'ADVANCE_PAYMENT_PENDING') return 'Your Quote Accepted'
  if (req.status === 'ADVANCE_PAID') return req.listingId ? 'Property Linked' : 'Find & Link Property'
  if (req.status === 'IN_PROGRESS') return req.listingId ? 'Verification In Progress' : 'Find & Link Property'
  if (req.status === 'COMPLETED') return 'Verification Completed'
  if (req.status === 'FINAL_PAYMENT_PENDING') return 'Verification Completed'
  if (req.status === 'FULLY_PAID' || req.status === 'REPORT_UNLOCKED') return 'Completed'
  if (req.status === 'CANCELLED') return 'Cancelled'
  return req.status
}

// VerificationRequestStatus (Prisma enum) → [chip tone, label]
const STATUS_CHIP = {
  OPEN: ['amber', 'Open for quotes'],
  ACCEPTED: ['blue', 'Accepted — awaiting advance'],
  ADVANCE_PAYMENT_PENDING: ['blue', 'Awaiting advance payment'],
  ADVANCE_PAID: ['green', 'Advance paid'],
  IN_PROGRESS: ['green', 'In progress'],
  COMPLETED: ['ink', 'Report submitted'],
  FINAL_PAYMENT_PENDING: ['blue', 'Awaiting final payment'],
  FULLY_PAID: ['green', 'Fully paid'],
  REPORT_UNLOCKED: ['green', 'Report unlocked'],
  CANCELLED: ['red', 'Cancelled'],
}

// VerificationQuoteStatus (Prisma enum) → [chip tone, label]
const QUOTE_CHIP = {
  PENDING: ['amber', 'Pending'],
  ACCEPTED: ['green', 'Accepted'],
  CLOSED: ['red', 'Closed — not selected'],
}

// RiskBadge (packages/shared enums.ts) — same three values the buyer-side
// report view and the admin claim/report tooling use. Do not invent extra
// values here.
const RISK_OPTIONS = ['GREEN', 'AMBER', 'RED']

// Claim.status (Prisma enum, packages/shared validation.ts's claimCreateSchema
// neighbourhood) → [chip tone, label]. Experts only ever read these — claim
// resolution is SuperAdmin-only, nothing here can change a claim's status.
const CLAIM_STATUS_CHIP = {
  OPEN: ['amber', 'Open'],
  UNDER_REVIEW: ['blue', 'Under review'],
  RESOLVED: ['green', 'Resolved'],
  REJECTED: ['red', 'Rejected'],
  REFUND_APPROVED: ['blue', 'Refund approved'],
  REFUND_PROCESSED: ['green', 'Refund processed'],
}

// A simple comma-separated-URLs text input, split/trim/filter — the same
// pattern buyer-web's own claim form (VerificationRequestDetail.tsx) uses
// for its `evidence: string[]` field, which is shaped identically to this
// report form's documents/images/videos arrays (all z.array(z.url())).
function parseUrlList(text) {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function propertySummary(req) {
  // Property Discovery flow — no Listing/Property exists yet by definition,
  // so this must never fall through to the "no src" placeholder below (that
  // would render a fake "Property" row). Once linkDiscoveredProperty sets
  // listingId, req.listing is populated by the backend and this branch is
  // skipped in favor of the real listing summary, same as LISTING requests.
  if (req.source === 'DISCOVERY' && !req.listing) {
    return {
      title: 'Property Discovery',
      location: [req.desiredTehsil, req.desiredCity].filter(Boolean).join(', ') || req.desiredCity || '—',
      type: req.desiredPropertyType ? req.desiredPropertyType.replace(/_/g, ' ') : '—',
      isDiscovery: true,
    }
  }

  const src = req.listing || req.property
  if (!src) return { title: 'Property', location: '—', type: '—' }
  return {
    title: src.address || src.title || 'Property',
    location: [src.tehsil, src.city].filter(Boolean).join(', ') || '—',
    type: src.propertyType ? src.propertyType.replace(/_/g, ' ') : '—',
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ExpertVerificationRequests() {
  const { seller } = useAuth()
  const kycApproved = seller?.kycStatus === 'APPROVED'

  const [open, setOpen] = useState(null)
  const [assigned, setAssigned] = useState(null)
  const [error, setError] = useState('')
  const [detailTarget, setDetailTarget] = useState(null) // { id } — opens the modal

  const load = () => {
    setError('')
    Promise.allSettled([getVerificationMarketplace(), getMyVerificationAssignments()]).then(
      ([openRes, assignedRes]) => {
        setOpen(openRes.status === 'fulfilled' ? openRes.value.requests : [])
        setAssigned(assignedRes.status === 'fulfilled' ? assignedRes.value.requests : [])
        if (openRes.status === 'rejected' && assignedRes.status === 'rejected') {
          setError('Could not load verification requests — please try again.')
        }
      }
    )
  }

  useEffect(load, [])

  return (
    <>
      <PageHead
        title="Verification Requests"
        subtitle="Browse open buyer verification requests and submit your quote. The buyer compares all quotes and picks one — you'll be notified if you're selected."
      />

      {!kycApproved && (
        <Card style={{ padding: 16, marginBottom: 20, background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
          <div className="dev" style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>
            KYC approval required
          </div>
          <p className="small dev" style={{ color: 'var(--ink)' }}>
            Only KYC-approved Experts can submit a verification quote. You can still browse open
            requests, but quoting is disabled until your KYC is approved.
          </p>
        </Card>
      )}

      {error && (
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <p className="small dev" style={{ color: 'var(--danger)' }}>{error}</p>
        </Card>
      )}

      <SectionTitle>Open Marketplace</SectionTitle>
      <Card style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table className="tbl">
          <thead>
            <tr>{['Property', 'Location', 'Type', 'Buyer offer', 'Requested', 'Your quote', ''].map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {open === null ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }} className="dev">Loading…</td></tr>
            ) : open.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }} className="dev">No open requests right now.</td></tr>
            ) : open.map((r) => {
              const p = propertySummary(r)
              const mq = r.myQuote
              return (
                <tr key={r.id}>
                  <td><b className="dev">{p.isDiscovery ? '🔍 ' : ''}{p.title}</b></td>
                  <td>{p.location}</td>
                  <td>{p.type}</td>
                  <td>₹{Number(r.buyerInitialOfferAmount).toLocaleString('en-IN')}</td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    {mq ? (
                      <>₹{Number(mq.proposedFee).toLocaleString('en-IN')} <Chip tone={(QUOTE_CHIP[mq.status] || QUOTE_CHIP.PENDING)[0]}>{(QUOTE_CHIP[mq.status] || QUOTE_CHIP.PENDING)[1]}</Chip></>
                    ) : (
                      <span className="small muted dev">Not quoted yet</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-light btn-sm" onClick={() => setDetailTarget({ id: r.id })}>View Request</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <SectionTitle>My Assignments</SectionTitle>
      <Card style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>{['Property', 'Location', 'Agreed fee', 'Status', ''].map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {assigned === null ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }} className="dev">Loading…</td></tr>
            ) : assigned.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }} className="dev">You haven't won any verification requests yet.</td></tr>
            ) : assigned.map((r) => {
              const p = propertySummary(r)
              const st = STATUS_CHIP[r.status] || STATUS_CHIP.OPEN
              return (
                <tr key={r.id}>
                  <td><b className="dev">{p.isDiscovery ? '🔍 ' : ''}{p.title}</b></td>
                  <td>{p.location}</td>
                  <td>{r.agreedFee ? `₹${Number(r.agreedFee).toLocaleString('en-IN')}` : '—'}</td>
                  <td><Chip tone={st[0]}>{st[1]}</Chip></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-light btn-sm" onClick={() => setDetailTarget({ id: r.id })}>View Request</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <RequestDetailModal
        id={detailTarget?.id}
        onClose={() => setDetailTarget(null)}
        kycApproved={kycApproved}
        sellerId={seller?.id}
        onQuoted={load}
      />
    </>
  )
}

// Owned listings a valid link candidate — the two statuses that represent a
// real, live listing this Expert authored. Purely a client-side courtesy
// filter (getMyListings today returns no latitude/longitude or "already
// linked elsewhere" flag to filter on precisely) — the backend's
// linkDiscoveredProperty call remains the authoritative check for location
// validity and prior linkage, surfaced via its own 400/409 responses below.
const LINKABLE_LISTING_STATUSES = ['PENDING_REVIEW', 'APPROVED']

function RequestDetailModal({ id, onClose, kycApproved, sellerId, onQuoted }) {
  const [request, setRequest] = useState(null)
  const [myQuote, setMyQuote] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Property Discovery flow (Phase 4C) — "Find & Link Property" sub-flow.
  const [linking, setLinking] = useState(false) // selector open?
  const [myListings, setMyListings] = useState(null)
  const [selectedListingId, setSelectedListingId] = useState('')
  const [confirmingLink, setConfirmingLink] = useState(false)
  const [linkSubmitting, setLinkSubmitting] = useState(false)
  const [linkError, setLinkError] = useState('')

  // Buyer Verification Experience enhancement — "Start Verification" (ADVANCE_PAID → IN_PROGRESS).
  const [startBusy, setStartBusy] = useState(false)
  const [startError, setStartError] = useState('')

  // Buyer Verification Experience enhancement — "Submit Report" (IN_PROGRESS → COMPLETED).
  const [findings, setFindings] = useState('')
  const [riskAssessment, setRiskAssessment] = useState('')
  const [documentsText, setDocumentsText] = useState('')
  const [imagesText, setImagesText] = useState('')
  const [videosText, setVideosText] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')

  // Buyer Verification Experience enhancement — conversation with the buyer,
  // available once this Expert is the assigned professional (mirrors
  // buyer-web's own VerificationRequestDetail.tsx conversation panel).
  const [messages, setMessages] = useState(null)
  const [messagesError, setMessagesError] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [messageBusy, setMessageBusy] = useState(false)
  const [messageError, setMessageError] = useState('')

  // Buyer Verification Experience enhancement — read-only claim visibility,
  // fetched only once the report is unlocked (same gate buyer-web uses for
  // when a claim can even exist).
  const [claims, setClaims] = useState(null)
  const [claimsError, setClaimsError] = useState('')

  useEffect(() => {
    if (!id) return
    let live = true
    setRequest(null)
    setMyQuote(null)
    setLoadError('')
    setAmount('')
    setMessage('')
    setSubmitError('')
    setLinking(false)
    setMyListings(null)
    setSelectedListingId('')
    setConfirmingLink(false)
    setLinkError('')
    setStartBusy(false)
    setStartError('')
    setFindings('')
    setRiskAssessment('')
    setDocumentsText('')
    setImagesText('')
    setVideosText('')
    setReportBusy(false)
    setReportError('')
    setMessages(null)
    setMessagesError('')
    setMessageDraft('')
    setMessageError('')
    setClaims(null)
    setClaimsError('')
    getVerificationMarketplaceRequest(id)
      .then((res) => {
        if (!live) return
        setRequest(res.request)
        setMyQuote(res.myQuote)
        // Prefill with the buyer's own offer — submitting unchanged accepts
        // it; editing it is a counter-offer. Never trust this client-side
        // prefill as validation — the backend accepts any positive amount.
        setAmount(res.myQuote ? '' : String(res.request.buyerInitialOfferAmount))

        // Conversation only exists once a professional is assigned — mirror
        // buyer-web's own gate (assignedSeller present or status !== OPEN)
        // rather than polling a thread that can't exist yet.
        const assignedToMe = sellerId && res.request.assignedSellerId === sellerId
        if (assignedToMe && res.request.status !== 'OPEN') {
          getVerificationMessages(id)
            .then((mres) => { if (live) setMessages(mres.messages) })
            .catch((err) => { if (live) setMessagesError(err?.response?.data?.message || 'Could not load messages.') })
        }

        // Claims can only exist once the report is unlocked — same gate
        // buyer-web uses before it ever calls getMyClaims.
        if (res.request.status === 'REPORT_UNLOCKED') {
          getAssignmentClaims(id)
            .then((cres) => { if (live) setClaims(cres.claims) })
            .catch((err) => { if (live) setClaimsError(err?.response?.data?.message || 'Could not load claims.') })
        }
      })
      .catch((err) => {
        if (!live) return
        setLoadError(err?.response?.data?.message || 'Could not load this request — it may no longer be available.')
      })
    return () => { live = false }
  }, [id, sellerId])

  // Shared refresh after Start/Submit Report succeed — re-fetches full
  // detail (rather than trusting the action endpoint's own partial response)
  // so request.status and any newly-joined data (e.g. report) stay correct,
  // same approach handleLink already uses below.
  const refreshDetail = async () => {
    const detail = await getVerificationMarketplaceRequest(id)
    setRequest(detail.request)
    setMyQuote(detail.myQuote)
    onQuoted?.()
  }

  const handleStart = async () => {
    setStartBusy(true)
    setStartError('')
    try {
      await startVerificationJob(id)
      await refreshDetail()
      toast('Verification started')
    } catch (err) {
      const msg = err?.response?.data?.message
      setStartError(msg || 'Could not start verification. Please try again.')
    } finally {
      setStartBusy(false)
    }
  }

  const handleSubmitReport = async () => {
    if (findings.trim().length < 20) {
      setReportError('Findings must be at least 20 characters.')
      return
    }
    setReportBusy(true)
    setReportError('')
    try {
      await submitVerificationReport(id, {
        findings: findings.trim(),
        riskAssessment: riskAssessment || undefined,
        documents: parseUrlList(documentsText),
        images: parseUrlList(imagesText),
        videos: parseUrlList(videosText),
      })
      await refreshDetail()
      toast('Report submitted — the buyer will be asked for the final payment')
    } catch (err) {
      const status = err?.response?.status
      const msg = err?.response?.data?.message
      if (status === 400) setReportError(msg || 'Please check the report fields and try again.')
      else if (status === 403) setReportError(msg || 'You are not authorized to submit a report for this request.')
      else if (status === 409) setReportError(msg || 'This request is not ready for a report yet.')
      else setReportError(msg || 'Could not submit the report. Please try again.')
    } finally {
      setReportBusy(false)
    }
  }

  const handleSendMessage = async () => {
    if (messageDraft.trim().length === 0) return
    setMessageBusy(true)
    setMessageError('')
    try {
      const res = await sendVerificationMessage(id, messageDraft.trim())
      setMessages((prev) => [...(prev || []), res.message])
      setMessageDraft('')
    } catch (err) {
      setMessageError(err?.response?.data?.message || 'Could not send your message.')
    } finally {
      setMessageBusy(false)
    }
  }

  const submit = async () => {
    const fee = Number(amount)
    if (!fee || fee <= 0) {
      setSubmitError('Enter a valid quote amount.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await submitVerificationQuote(id, { proposedFee: fee, message: message.trim() || undefined })
      setMyQuote(res.quote)
      toast('Quote submitted — waiting for the buyer to review it')
      onQuoted?.()
    } catch (err) {
      const status = err?.response?.status
      const msg = err?.response?.data?.message
      if (status === 409) setSubmitError(msg || 'This request is no longer open for quotes.')
      else if (status === 403) setSubmitError(msg || 'You are not eligible to quote on this request.')
      else if (status === 400) setSubmitError(msg || 'That amount was rejected.')
      else setSubmitError(msg || 'Could not submit your quote. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const openListingSelector = async () => {
    setLinking(true)
    setLinkError('')
    if (myListings === null) {
      try {
        const res = await getMyListings()
        setMyListings((res.listings || []).filter((l) => LINKABLE_LISTING_STATUSES.includes(l.status)))
      } catch {
        setMyListings([])
        setLinkError('Could not load your listings — please try again.')
      }
    }
  }

  const handleLink = async () => {
    if (!selectedListingId) return
    setLinkSubmitting(true)
    setLinkError('')
    try {
      await linkDiscoveredListing(id, selectedListingId)
      // The link endpoint's own response is the plain VerificationRequest row
      // — it doesn't join `listing` (only getVerificationMarketplaceRequest
      // does). Re-fetch the full detail so request.listing is populated and
      // the "Property Linked" card below can actually render the address/
      // city/tehsil/propertyType it needs, instead of showing nothing
      // despite the link having genuinely succeeded.
      const detail = await getVerificationMarketplaceRequest(id)
      setRequest(detail.request)
      setMyQuote(detail.myQuote)
      setLinking(false)
      setConfirmingLink(false)
      toast('Property linked — verification can now proceed')
      onQuoted?.() // reuses the same "refresh the parent lists" callback
    } catch (err) {
      const status = err?.response?.status
      const msg = err?.response?.data?.message
      if (status === 403) setLinkError(msg || 'You are not authorized to perform this action.')
      else if (status === 400) setLinkError(msg || 'Please select a valid property with a location.')
      else if (status === 409) setLinkError(msg || 'Your quote/request has already been submitted or this property is already linked.')
      else if (status === 404) setLinkError(msg || 'Request or property not found.')
      else setLinkError(msg || 'Could not link this property. Please try again.')
    } finally {
      setLinkSubmitting(false)
    }
  }

  const p = request ? propertySummary(request) : null
  const st = request ? (STATUS_CHIP[request.status] || STATUS_CHIP.OPEN) : null
  const canQuote = request?.status === 'OPEN' && !myQuote
  const isAssignedToMe = request && sellerId && request.assignedSellerId === sellerId
  const canLinkProperty =
    request?.source === 'DISCOVERY' &&
    isAssignedToMe &&
    !request.listingId &&
    ['ADVANCE_PAID', 'IN_PROGRESS'].includes(request.status)
  const selectedListing = myListings?.find((l) => l.id === selectedListingId) || null

  return (
    <Modal open={!!id} title="Verification Request" onClose={onClose}>
      {loadError ? (
        <p className="small dev" style={{ color: 'var(--danger)' }}>{loadError}</p>
      ) : !request ? (
        <div className="small muted" style={{ padding: '18px 0', textAlign: 'center' }}>Loading…</div>
      ) : (
        <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <b className="dev" style={{ fontSize: 15 }}>{request.source === 'DISCOVERY' ? '🔍 ' : ''}{p.title}</b>
              <Chip tone={st[0]}>{st[1]}</Chip>
            </div>
            <p className="small muted dev">{p.location} · {p.type}</p>
          </div>

          {/* Property Discovery flow — desired-location detail block. Only
              rendered while no Listing is linked yet; once linkDiscoveredProperty
              sets listingId, request.listing carries the real property and the
              header above already reflects it via propertySummary. */}
          {request.source === 'DISCOVERY' && !request.listing ? (
            <Card style={{ padding: 14 }}>
              <div className="dev" style={{ fontWeight: 700, marginBottom: 10 }}>Property Discovery Request</div>
              <div className="grid g2" style={{ gap: 10 }}>
                <div>
                  <div className="xs muted">Desired Location</div>
                  <div className="small dev">{request.desiredAddress || '—'}</div>
                </div>
                <div>
                  <div className="xs muted">City</div>
                  <div className="small dev">{request.desiredCity || '—'}</div>
                </div>
                {request.desiredTehsil ? (
                  <div>
                    <div className="xs muted">Tehsil</div>
                    <div className="small dev">{request.desiredTehsil}</div>
                  </div>
                ) : null}
                <div>
                  <div className="xs muted">Property Type</div>
                  <div className="small dev">{request.desiredPropertyType ? request.desiredPropertyType.replace(/_/g, ' ') : '—'}</div>
                </div>
                {request.desiredKhasraOrSurvey ? (
                  <div>
                    <div className="xs muted">Khasra / Survey</div>
                    <div className="small dev">{request.desiredKhasraOrSurvey}</div>
                  </div>
                ) : null}
                <div>
                  <div className="xs muted">Status</div>
                  <div className="small dev">{discoveryStatusLabel(request, myQuote)}</div>
                </div>
              </div>
              {buildDesiredLocationMapsUrl(request) ? (
                <a
                  href={buildDesiredLocationMapsUrl(request)}
                  target="_blank"
                  rel="noreferrer"
                  className="small dev"
                  style={{ display: 'inline-block', marginTop: 10, color: 'var(--blue, #2b5c8f)' }}
                >
                  📍 Open desired location in Google Maps ↗
                </a>
              ) : null}
              <p className="xs muted dev" style={{ marginTop: 10 }}>
                This is the buyer's desired location, not an existing property's confirmed address —
                CivilCheck has not found or verified a matching property yet.
              </p>
            </Card>
          ) : null}

          <div className="grid g2" style={{ gap: 10 }}>
            <div>
              <div className="xs muted">Request ID</div>
              <div className="small dev">{request.id}</div>
            </div>
            <div>
              <div className="xs muted">Requested</div>
              <div className="small dev">{formatDate(request.createdAt)}</div>
            </div>
            {request.riskAssessment || request.report?.riskAssessment ? (
              <div>
                <div className="xs muted">Risk assessment</div>
                <div className="small dev">{request.report?.riskAssessment}</div>
              </div>
            ) : null}
          </div>

          <Card style={{ padding: 14, background: 'var(--paper-2)' }}>
            <div className="xs muted" style={{ marginBottom: 4 }}>Buyer Offer</div>
            <div className="dev" style={{ fontSize: 18, fontWeight: 700 }}>₹{Number(request.buyerInitialOfferAmount).toLocaleString('en-IN')}</div>
            <p className="xs muted dev" style={{ marginTop: 4 }}>
              This is the buyer's initial budget, not a fixed price — accept it as-is or submit your own charge.
            </p>
          </Card>

          {myQuote ? (
            <Card style={{ padding: 14 }}>
              <div className="xs muted" style={{ marginBottom: 4 }}>Your Quote</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="dev" style={{ fontSize: 18, fontWeight: 700 }}>₹{Number(myQuote.proposedFee).toLocaleString('en-IN')}</span>
                <Chip tone={(QUOTE_CHIP[myQuote.status] || QUOTE_CHIP.PENDING)[0]}>{(QUOTE_CHIP[myQuote.status] || QUOTE_CHIP.PENDING)[1]}</Chip>
              </div>
              {myQuote.message ? <p className="small muted dev" style={{ marginTop: 6 }}>{myQuote.message}</p> : null}
              <p className="xs muted dev" style={{ marginTop: 8 }}>
                Quotes are non-binding offers — only the buyer can accept one, and only one Expert or
                Admin ultimately wins this request.
              </p>
            </Card>
          ) : canQuote ? (
            <div>
              <SectionTitle>Submit Verification Quote</SectionTitle>
              {!kycApproved ? (
                <p className="small dev" style={{ color: 'var(--danger)' }}>
                  Only KYC-approved Experts can submit a quote.
                </p>
              ) : (
                <>
                  {submitError ? <p className="small dev" style={{ color: 'var(--danger)', marginBottom: 8 }}>{submitError}</p> : null}
                  <p className="xs muted dev" style={{ marginBottom: 8 }}>
                    Submit ₹{Number(request.buyerInitialOfferAmount).toLocaleString('en-IN')} unchanged to accept the
                    buyer's offer, or enter a different amount to counter-offer.
                  </p>
                  <Field label="Your verification charge (₹)" required>
                    <input
                      className="control"
                      type="number"
                      min="1"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </Field>
                  <Field label="Message (optional)" optional>
                    <textarea
                      className="control"
                      rows={3}
                      placeholder="e.g. estimated completion time, approach"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </Field>
                  <button className="btn btn-primary btn-block" onClick={submit} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit Quote'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <p className="small muted dev">
              {request.status === 'OPEN'
                ? 'This request is no longer accepting new quotes.'
                : 'This request has already moved past the quoting stage.'}
            </p>
          )}

          {/* Buyer Verification Experience enhancement — "Start Verification".
              The buyer has paid the 50% advance; nothing in the UI let the
              assigned Expert move the job past ADVANCE_PAID until this. */}
          {isAssignedToMe && request.status === 'ADVANCE_PAID' ? (
            <div>
              <SectionTitle>Start Verification</SectionTitle>
              {startError ? <p className="small dev" style={{ color: 'var(--danger)', marginBottom: 8 }}>{startError}</p> : null}
              <p className="xs muted dev" style={{ marginBottom: 8 }}>
                The buyer's advance payment has been received. Start the job once you begin work on
                this verification.
              </p>
              <button className="btn btn-primary btn-block" onClick={handleStart} disabled={startBusy}>
                {startBusy ? 'Starting…' : 'Start Verification'}
              </button>
            </div>
          ) : null}

          {/* Buyer Verification Experience enhancement — "Submit Report".
              Fields mirror verificationReportCreateSchema exactly: findings
              (required, min 20 chars), riskAssessment (optional RiskBadge
              enum), documents/images/videos (optional URL arrays). */}
          {isAssignedToMe && request.status === 'IN_PROGRESS' ? (
            <div>
              <SectionTitle>Submit Report</SectionTitle>
              {reportError ? <p className="small dev" style={{ color: 'var(--danger)', marginBottom: 8 }}>{reportError}</p> : null}
              <Field label="Findings" required>
                <textarea
                  className="control"
                  rows={5}
                  placeholder="Describe what you found during the verification (minimum 20 characters)."
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                />
              </Field>
              <Field label="Risk assessment" optional>
                <select className="control" value={riskAssessment} onChange={(e) => setRiskAssessment(e.target.value)}>
                  <option value="">— Not specified —</option>
                  {RISK_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Documents (optional)" optional>
                <input
                  className="control"
                  placeholder="Comma-separated URLs to supporting documents"
                  value={documentsText}
                  onChange={(e) => setDocumentsText(e.target.value)}
                />
              </Field>
              <Field label="Images (optional)" optional>
                <input
                  className="control"
                  placeholder="Comma-separated URLs to photos"
                  value={imagesText}
                  onChange={(e) => setImagesText(e.target.value)}
                />
              </Field>
              <Field label="Videos (optional)" optional>
                <input
                  className="control"
                  placeholder="Comma-separated URLs to videos"
                  value={videosText}
                  onChange={(e) => setVideosText(e.target.value)}
                />
              </Field>
              <button className="btn btn-primary btn-block" onClick={handleSubmitReport} disabled={reportBusy}>
                {reportBusy ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          ) : null}

          {/* Property Discovery flow (Phase 4C) — once linked, show the real
              listing; while eligible-but-unlinked, offer the link action. */}
          {request.source === 'DISCOVERY' && request.listing ? (
            <Card style={{ padding: 14, background: 'var(--verified-soft, #e8f5ee)' }}>
              <div className="xs muted" style={{ marginBottom: 4 }}>✅ Property Linked</div>
              <div className="dev" style={{ fontWeight: 700 }}>{request.listing.address}</div>
              <p className="small muted dev" style={{ marginTop: 2 }}>
                {[request.listing.tehsil, request.listing.city].filter(Boolean).join(', ')} ·{' '}
                {request.listing.propertyType ? request.listing.propertyType.replace(/_/g, ' ') : '—'}
              </p>
              <p className="xs muted dev" style={{ marginTop: 8 }}>
                This listing's review status is unchanged by linking — see My Listings for its current
                approval status.
              </p>
            </Card>
          ) : canLinkProperty ? (
            <div>
              <SectionTitle>Find & Link Property</SectionTitle>
              {!linking ? (
                <>
                  <p className="xs muted dev" style={{ marginBottom: 10 }}>
                    Once you've found this property in the field, publish it as a Listing (same flow as
                    any other listing), then link it here.
                  </p>
                  <button className="btn btn-primary btn-block" onClick={openListingSelector}>
                    Property Found / Link Property
                  </button>
                </>
              ) : (
                <>
                  {linkError ? <p className="small dev" style={{ color: 'var(--danger)', marginBottom: 8 }}>{linkError}</p> : null}
                  {myListings === null ? (
                    <div className="small muted" style={{ padding: '14px 0', textAlign: 'center' }}>Loading your listings…</div>
                  ) : myListings.length === 0 ? (
                    <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                      <div className="small muted dev" style={{ marginBottom: 10 }}>
                        You have no eligible listings yet. Publish the property as a Listing first.
                      </div>
                      <button className="btn btn-light btn-sm" onClick={() => setLinking(false)}>Back</button>
                    </div>
                  ) : confirmingLink && selectedListing ? (
                    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p className="small dev">
                        You are linking this property to the buyer's discovery request.
                      </p>
                      <Card style={{ padding: 12 }}>
                        <b className="dev">{selectedListing.address}</b>
                        <p className="xs muted dev" style={{ marginTop: 4 }}>
                          {[selectedListing.tehsil, selectedListing.city].filter(Boolean).join(', ')} ·{' '}
                          {selectedListing.propertyType ? selectedListing.propertyType.replace(/_/g, ' ') : '—'} ·{' '}
                          ₹{Number(selectedListing.price).toLocaleString('en-IN')} · {humanizeStatus(selectedListing.status)}
                        </p>
                      </Card>
                      <div className="row">
                        <button className="btn btn-primary" onClick={handleLink} disabled={linkSubmitting}>
                          {linkSubmitting ? 'Linking…' : 'Confirm — Link This Property'}
                        </button>
                        <button className="btn btn-light" onClick={() => setConfirmingLink(false)} disabled={linkSubmitting}>
                          Back
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {myListings.map((l) => (
                        <div
                          key={l.id}
                          className="card"
                          style={{ padding: 12, cursor: 'pointer', borderColor: selectedListingId === l.id ? 'var(--seal, #B67A12)' : undefined }}
                          onClick={() => setSelectedListingId(l.id)}
                        >
                          <b className="dev" style={{ fontSize: 13 }}>{l.address}</b>
                          <p className="xs muted dev" style={{ marginTop: 4 }}>
                            {[l.tehsil, l.city].filter(Boolean).join(', ')} ·{' '}
                            {l.propertyType ? l.propertyType.replace(/_/g, ' ') : '—'} ·{' '}
                            ₹{Number(l.price).toLocaleString('en-IN')} · {humanizeStatus(l.status)}
                          </p>
                        </div>
                      ))}
                      <div className="row" style={{ marginTop: 4 }}>
                        <button className="btn btn-primary" onClick={() => setConfirmingLink(true)} disabled={!selectedListingId}>
                          Continue
                        </button>
                        <button className="btn btn-light" onClick={() => setLinking(false)}>Cancel</button>
                      </div>
                      <p className="xs muted dev">
                        CivilCheck will confirm this listing has valid location data and isn't already
                        linked elsewhere before finalizing.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}

          {/* Buyer Verification Experience enhancement — conversation with
              the buyer. Only rendered once this Expert is the assigned
              professional and the request has moved past OPEN (mirrors
              buyer-web's own gate: a thread can't exist before assignment). */}
          {isAssignedToMe && request.status !== 'OPEN' ? (
            <div>
              <SectionTitle>Messages with Buyer</SectionTitle>
              {messagesError ? <p className="small dev" style={{ color: 'var(--danger)', marginBottom: 8 }}>{messagesError}</p> : null}
              <Card style={{ padding: 12, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages === null ? (
                  <div className="small muted" style={{ padding: '10px 0', textAlign: 'center' }}>Loading…</div>
                ) : messages.length === 0 ? (
                  <p className="small muted dev" style={{ textAlign: 'center', padding: '10px 0' }}>
                    No messages yet — start the conversation below.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.senderRole === 'PROFESSIONAL' ? 'flex-end' : 'flex-start',
                        background: m.senderRole === 'PROFESSIONAL' ? 'var(--seal-soft, #f6ead0)' : 'var(--paper-2)',
                        borderRadius: 10,
                        padding: '8px 12px',
                        maxWidth: '85%',
                      }}
                    >
                      <div className="small dev">{m.body}</div>
                      <div className="xs muted dev" style={{ marginTop: 4, textAlign: m.senderRole === 'PROFESSIONAL' ? 'right' : 'left' }}>
                        {m.senderRole === 'PROFESSIONAL' ? 'You' : 'Buyer'} · {formatDate(m.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </Card>
              {messageError ? <p className="small dev" style={{ color: 'var(--danger)', marginTop: 8 }}>{messageError}</p> : null}
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                <input
                  className="control"
                  style={{ flex: 1 }}
                  placeholder="Write a message to the buyer…"
                  value={messageDraft}
                  onChange={(e) => setMessageDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !messageBusy) handleSendMessage() }}
                />
                <button className="btn btn-primary" onClick={handleSendMessage} disabled={messageBusy || messageDraft.trim().length === 0}>
                  {messageBusy ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          ) : null}

          {/* Buyer Verification Experience enhancement — read-only claim
              visibility. Experts can see a claim was raised against their
              completed work, but only SuperAdmin can resolve one. */}
          {request.status === 'REPORT_UNLOCKED' ? (
            <div>
              <SectionTitle>Claims</SectionTitle>
              {claimsError ? <p className="small dev" style={{ color: 'var(--danger)', marginBottom: 8 }}>{claimsError}</p> : null}
              {claims === null ? (
                <div className="small muted" style={{ padding: '10px 0', textAlign: 'center' }}>Loading…</div>
              ) : claims.length === 0 ? (
                <p className="small muted dev">No claims have been raised on this request.</p>
              ) : (
                <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {claims.map((c) => {
                    const ct = CLAIM_STATUS_CHIP[c.status] || CLAIM_STATUS_CHIP.OPEN
                    return (
                      <Card key={c.id} style={{ padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <b className="dev" style={{ fontSize: 13 }}>{c.reason}</b>
                          <Chip tone={ct[0]}>{ct[1]}</Chip>
                        </div>
                        <p className="small muted dev" style={{ marginTop: 6 }}>{c.description}</p>
                        {c.resolutionNote ? (
                          <p className="xs dev" style={{ marginTop: 6, color: 'var(--blue, #2b5c8f)' }}>
                            Admin response: {c.resolutionNote}
                          </p>
                        ) : null}
                        <p className="xs muted dev" style={{ marginTop: 6 }}>Raised {formatDate(c.createdAt)}</p>
                      </Card>
                    )
                  })}
                </div>
              )}
              <p className="xs muted dev" style={{ marginTop: 8 }}>
                Only CivilCheck's admin team can review and resolve a claim — there is nothing to action here.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  )
}

function humanizeStatus(status) {
  if (!status) return '—'
  const lower = String(status).replace(/_/g, ' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
