// ─────────────────────────────────────────────────────────────────────────
// Verification Requests — Admin acting as a PARTICIPANT in the Property
// Verification Marketplace (browsing OPEN buyer requests and submitting a
// quote alongside Experts). Mirrors apps/seller's
// expert/VerificationRequests.jsx exactly in behavior — same backend rules,
// same non-binding-PENDING-quote model, same buyer-only accept.
//
// This is distinct from admin OVERSIGHT of the marketplace (list-everything/
// force-cancel/claims review, apps/api's admin.controller.ts) — that has its
// own separate, still-unbuilt frontend surface and is not part of this page.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getVerificationMarketplace,
  getMyVerificationAssignments,
  getVerificationMarketplaceRequest,
  submitVerificationQuote,
} from '../../api/admin.api'
import { canParticipateInVerificationMarketplace } from '../../utils/permissions'
import {
  Card, PageHead, Badge, Button, Field, Modal, Toast,
  ResponsiveTable, LoadingState, EmptyState, ErrorState,
} from '../../components/ui'

const STATUS_BADGE = {
  OPEN: ['amber', 'Open for quotes'],
  ACCEPTED: ['blue', 'Accepted — awaiting advance'],
  ADVANCE_PAYMENT_PENDING: ['blue', 'Awaiting advance payment'],
  ADVANCE_PAID: ['green', 'Advance paid'],
  IN_PROGRESS: ['green', 'In progress'],
  COMPLETED: ['grey', 'Report submitted'],
  FINAL_PAYMENT_PENDING: ['blue', 'Awaiting final payment'],
  FULLY_PAID: ['green', 'Fully paid'],
  REPORT_UNLOCKED: ['green', 'Report unlocked'],
  CANCELLED: ['red', 'Cancelled'],
}

const QUOTE_BADGE = {
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

export default function VerificationRequests() {
  const { admin } = useAuth()
  const canParticipate = canParticipateInVerificationMarketplace(admin?.role)

  const [open, setOpen] = useState(null)
  const [assigned, setAssigned] = useState(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const load = () => {
    setError('')
    Promise.allSettled([getVerificationMarketplace(), getMyVerificationAssignments()]).then(
      ([openRes, assignedRes]) => {
        setOpen(openRes.status === 'fulfilled' ? openRes.value.requests : [])
        setAssigned(assignedRes.status === 'fulfilled' ? assignedRes.value.requests : [])
        if (openRes.status === 'rejected' && assignedRes.status === 'rejected') {
          setError(openRes.reason?.response?.data?.message || 'Could not load verification requests')
        }
      }
    )
  }

  useEffect(load, [])

  const openColumns = [
    { key: 'title', header: 'Property', render: (r) => <b>{propertySummary(r).title}</b> },
    { key: 'location', header: 'Location', render: (r) => propertySummary(r).location },
    { key: 'type', header: 'Type', render: (r) => propertySummary(r).type },
    { key: 'buyerInitialOfferAmount', header: 'Buyer offer', render: (r) => `₹${Number(r.buyerInitialOfferAmount).toLocaleString('en-IN')}` },
    { key: 'createdAt', header: 'Requested', render: (r) => formatDate(r.createdAt) },
    {
      key: 'myQuote',
      header: 'Your quote',
      render: (r) => r.myQuote ? (
        <>
          ₹{Number(r.myQuote.proposedFee).toLocaleString('en-IN')}{' '}
          <Badge tone={(QUOTE_BADGE[r.myQuote.status] || QUOTE_BADGE.PENDING)[0]}>
            {(QUOTE_BADGE[r.myQuote.status] || QUOTE_BADGE.PENDING)[1]}
          </Badge>
        </>
      ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Not quoted yet</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) => <Button size="sm" variant="ghost" onClick={() => setSelectedId(r.id)}>View Request</Button>,
    },
  ]

  const assignedColumns = [
    { key: 'title', header: 'Property', render: (r) => <b>{propertySummary(r).title}</b> },
    { key: 'location', header: 'Location', render: (r) => propertySummary(r).location },
    { key: 'agreedFee', header: 'Agreed fee', render: (r) => r.agreedFee ? `₹${Number(r.agreedFee).toLocaleString('en-IN')}` : '—' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const st = STATUS_BADGE[r.status] || STATUS_BADGE.OPEN
        return <Badge tone={st[0]}>{st[1]}</Badge>
      },
    },
    {
      key: 'actions',
      header: '',
      render: (r) => <Button size="sm" variant="ghost" onClick={() => setSelectedId(r.id)}>View Request</Button>,
    },
  ]

  return (
    <div>
      <PageHead
        title="Verification Requests"
        subtitle="Browse open buyer verification requests and submit a quote. The buyer compares every quote and picks one — this never accepts on their behalf."
      />

      {!canParticipate && (
        <Card style={{ marginBottom: 16, padding: '10px 14px' }}>
          <Badge tone="grey">🔒 Your role has read-only access — Viewers cannot submit a verification quote.</Badge>
        </Card>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <h3 style={{ margin: '20px 0 10px' }}>Open Marketplace</h3>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {open === null ? (
              <LoadingState label="Loading open requests…" />
            ) : (
              <ResponsiveTable
                columns={openColumns}
                rows={open}
                getRowKey={(r) => r.id}
                emptyState={<EmptyState icon="🧾" title="No open requests" description="There are no verification requests open for quotes right now." />}
              />
            )}
          </Card>

          <h3 style={{ margin: '24px 0 10px' }}>My Assignments</h3>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {assigned === null ? (
              <LoadingState label="Loading assignments…" />
            ) : (
              <ResponsiveTable
                columns={assignedColumns}
                rows={assigned}
                getRowKey={(r) => r.id}
                emptyState={<EmptyState icon="🧾" title="No assignments yet" description="Requests you've won will show up here." />}
              />
            )}
          </Card>
        </>
      )}

      <RequestDetailModal
        id={selectedId}
        onClose={() => setSelectedId(null)}
        canQuote={canParticipate}
        onQuoted={() => { load(); showToast('Quote submitted — waiting for the buyer to review it') }}
      />

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}

function RequestDetailModal({ id, onClose, canQuote, onQuoted }) {
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
  const st = request ? (STATUS_BADGE[request.status] || STATUS_BADGE.OPEN) : null
  const canSubmitForm = request?.status === 'OPEN' && !myQuote

  return (
    <Modal open={!!id} title="Verification Request" onClose={onClose}>
      {loadError ? (
        <p style={{ color: 'var(--danger, #c0392b)' }}>{loadError}</p>
      ) : !request ? (
        <LoadingState label="Loading…" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <b style={{ fontSize: 15 }}>{p.title}</b>
              <Badge tone={st[0]}>{st[1]}</Badge>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>{p.location} · {p.type}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Request ID</div>
              <div style={{ fontSize: 13 }}>{request.id}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Requested</div>
              <div style={{ fontSize: 13 }}>{formatDate(request.createdAt)}</div>
            </div>
          </div>

          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Buyer Offer</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>₹{Number(request.buyerInitialOfferAmount).toLocaleString('en-IN')}</div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              This is the buyer's initial budget, not a fixed price — accept it as-is or submit your own charge.
            </p>
          </Card>

          {myQuote ? (
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Your Quote</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>₹{Number(myQuote.proposedFee).toLocaleString('en-IN')}</span>
                <Badge tone={(QUOTE_BADGE[myQuote.status] || QUOTE_BADGE.PENDING)[0]}>
                  {(QUOTE_BADGE[myQuote.status] || QUOTE_BADGE.PENDING)[1]}
                </Badge>
              </div>
              {myQuote.message ? <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>{myQuote.message}</p> : null}
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                Quotes are non-binding offers — only the buyer can accept one, and only one Expert or
                Admin ultimately wins this request.
              </p>
            </Card>
          ) : canSubmitForm ? (
            <div>
              <h4 style={{ marginBottom: 8 }}>Submit Verification Quote</h4>
              {!canQuote ? (
                <p style={{ color: 'var(--danger, #c0392b)', fontSize: 13 }}>
                  Your role does not permit submitting a verification quote.
                </p>
              ) : (
                <>
                  {submitError ? <p style={{ color: 'var(--danger, #c0392b)', fontSize: 13, marginBottom: 8 }}>{submitError}</p> : null}
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
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
                  <Field label="Message" optional>
                    <textarea
                      className="control"
                      rows={3}
                      placeholder="e.g. estimated completion time, approach"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </Field>
                  <Button variant="primary" block onClick={submit} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit Quote'}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
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
