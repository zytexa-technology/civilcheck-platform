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
} from '../../api/seller.api'
import { Card, PageHead, SectionTitle, Field, Modal, Chip, toast } from '../../components/ui'
import { Icon } from '../../components/Icon'

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

function propertySummary(req) {
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
                  <td><b className="dev">{p.title}</b></td>
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
                  <td><b className="dev">{p.title}</b></td>
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
        onQuoted={load}
      />
    </>
  )
}

function RequestDetailModal({ id, onClose, kycApproved, onQuoted }) {
  const [request, setRequest] = useState(null)
  const [myQuote, setMyQuote] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!id) return
    let live = true
    setRequest(null)
    setMyQuote(null)
    setLoadError('')
    setAmount('')
    setMessage('')
    setSubmitError('')
    getVerificationMarketplaceRequest(id)
      .then((res) => {
        if (!live) return
        setRequest(res.request)
        setMyQuote(res.myQuote)
        // Prefill with the buyer's own offer — submitting unchanged accepts
        // it; editing it is a counter-offer. Never trust this client-side
        // prefill as validation — the backend accepts any positive amount.
        setAmount(res.myQuote ? '' : String(res.request.buyerInitialOfferAmount))
      })
      .catch((err) => {
        if (!live) return
        setLoadError(err?.response?.data?.message || 'Could not load this request — it may no longer be available.')
      })
    return () => { live = false }
  }, [id])

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

  const p = request ? propertySummary(request) : null
  const st = request ? (STATUS_CHIP[request.status] || STATUS_CHIP.OPEN) : null
  const canQuote = request?.status === 'OPEN' && !myQuote

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
              <b className="dev" style={{ fontSize: 15 }}>{p.title}</b>
              <Chip tone={st[0]}>{st[1]}</Chip>
            </div>
            <p className="small muted dev">{p.location} · {p.type}</p>
          </div>

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
        </div>
      )}
    </Modal>
  )
}
