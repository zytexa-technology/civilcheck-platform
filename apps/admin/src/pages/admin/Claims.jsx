// ─────────────────────────────────────────────────────────────────────────
// Claims — SuperAdmin dispute-resolution oversight (Buyer Verification
// Experience enhancement). A buyer raises a Claim once their verification
// report is unlocked; this page is where an admin reviews it and moves it
// through its status machine. Mirrors Refunds.jsx's structure (stats row,
// status filter, paginated table, detail modal with a resolve form).
//
// Resolving a claim is SUPER_ADMIN only (see canResolveClaims in
// utils/permissions.js) — a SUB_ADMIN can open a claim and read it, same
// read-only pattern Refunds.jsx already uses for canManageRefunds. Setting
// status: 'REFUND_APPROVED' for the first time atomically creates a linked
// Refund row server-side — actually moving money still happens on the
// existing, unmodified Refunds page (process/reject), never here.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getClaims, resolveClaim } from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canResolveClaims } from '../../utils/permissions'
import { Badge, Button, Card, ErrorState, Field, Modal, PageHead, Pagination, ResponsiveTable, StatCard, Toast } from '../../components/ui'

const STATUS_TONE = {
  OPEN: 'amber',
  UNDER_REVIEW: 'blue',
  RESOLVED: 'green',
  REJECTED: 'red',
  REFUND_APPROVED: 'violet',
  REFUND_PROCESSED: 'green',
}

// Every non-OPEN state a claim can be moved into — matches
// apps/api's claimResolutionSchema exactly (OPEN is only ever the starting
// state, never a resolution target).
const RESOLUTION_STATUSES = ['UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'REFUND_APPROVED', 'REFUND_PROCESSED']
const TERMINAL_STATUSES = ['RESOLVED', 'REJECTED', 'REFUND_PROCESSED']

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── CLAIM DETAIL / RESOLVE MODAL ──────────────────────────────────────────
const ClaimModal = ({ claim, onClose, onResolved, canResolve }) => {
  const navigate = useNavigate()
  const [status, setStatus] = useState(RESOLUTION_STATUSES[0])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const isTerminal = TERMINAL_STATUSES.includes(claim.status)

  const submit = async () => {
    if (note.trim().length < 5) {
      setErr('Resolution note must be at least 5 characters')
      return
    }
    setSubmitting(true)
    setErr('')
    try {
      const res = await resolveClaim(claim.id, { status, resolutionNote: note.trim() })
      onResolved(res)
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not resolve this claim')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      title={`Claim — ${claim.id.slice(0, 8)}`}
      onClose={onClose}
      footer={
        canResolve && !isTerminal ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>Close</Button>
            <Button variant="primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Resolving…' : 'Resolve claim'}
            </Button>
          </>
        ) : (
          <Button variant="ghost" block onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="card-flat" style={{ padding: 16, marginBottom: 20 }}>
        {[
          ['Buyer', claim.user?.name || claim.user?.phone || '—'],
          ['Phone', claim.user?.phone ? `+91 ${claim.user.phone}` : '—'],
          ['Verification request', claim.verificationRequest?.id || claim.verificationRequestId],
          ['Request status', claim.verificationRequest?.status || '—'],
          ['Agreed fee', claim.verificationRequest?.agreedFee ? `₹${Number(claim.verificationRequest.agreedFee).toLocaleString('en-IN')}` : '—'],
          ['Reason', claim.reason],
          ['Status', claim.status],
          ['Raised on', formatDate(claim.createdAt)],
          ...(claim.resolvedAt ? [['Resolved on', formatDate(claim.resolvedAt)]] : []),
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13, gap: 12 }}>
            <span className="muted">{label}</span>
            <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>

      {claim.description && (
        <Field label="Description">
          <p className="card-flat" style={{ padding: 12, fontSize: 13, lineHeight: 1.6, margin: 0 }}>{claim.description}</p>
        </Field>
      )}

      {claim.evidence?.length > 0 && (
        <Field label={`Evidence (${claim.evidence.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {claim.evidence.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--blue)', wordBreak: 'break-all' }}>
                🔗 {url}
              </a>
            ))}
          </div>
        </Field>
      )}

      {claim.resolutionNote && (
        <Field label="Resolution note">
          <p className="card-flat" style={{ padding: 12, fontSize: 13, lineHeight: 1.6, margin: 0 }}>{claim.resolutionNote}</p>
        </Field>
      )}

      {isTerminal && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginTop: 4, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          This claim has already reached a final status ({claim.status}).
        </div>
      )}

      {!canResolve && !isTerminal && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginTop: 4, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Your role has read-only access to claims. Only a Super Admin can resolve one.
        </div>
      )}

      {canResolve && !isTerminal && (
        <>
          <Field label="New status" required>
            <select className="control" value={status} onChange={(e) => setStatus(e.target.value)}>
              {RESOLUTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {status === 'REFUND_APPROVED' && (
              <div className="small muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
                Approving a refund here creates a linked Refund record — process it from the Refunds page.
              </div>
            )}
          </Field>
          <Field label="Resolution note" required hint="Minimum 5 characters — visible to whoever reviews this claim later.">
            <textarea className="control" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What was decided and why…" />
          </Field>
          {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 4 }}>❌ {err}</p>}
        </>
      )}

      {canResolve && (
        <button
          onClick={() => navigate('/dashboard/refunds')}
          style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--blue)', fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          → Go to Refunds page
        </button>
      )}
    </Modal>
  )
}

// ─── MAIN CLAIMS PAGE ───────────────────────────────────────────────────────
export default function Claims() {
  const { admin } = useAuth()
  const canResolve = canResolveClaims(admin?.role)
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ open: 0, underReview: 0, total: 0 })
  const LIMIT = 20

  useEffect(() => { loadClaims() }, [statusFilter, page])
  useEffect(() => { loadCounts() }, [])

  const changeFilter = (value) => { setStatusFilter(value); setPage(1) }

  const loadClaims = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (statusFilter) params.status = statusFilter
      const data = await getClaims(params)
      setClaims(data.claims || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load claims')
    } finally {
      setLoading(false)
    }
  }

  const loadCounts = async () => {
    try {
      const [openRes, reviewRes, allRes] = await Promise.all([
        getClaims({ status: 'OPEN', limit: 1 }),
        getClaims({ status: 'UNDER_REVIEW', limit: 1 }),
        getClaims({ limit: 1 }),
      ])
      setCounts({ open: openRes.total || 0, underReview: reviewRes.total || 0, total: allRes.total || 0 })
    } catch {
      // stat cards are a convenience — a failed count fetch shouldn't block the page
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const handleResolved = (res) => {
    setSelected(null)
    if (res.refund) {
      showToast(`✅ Claim resolved — a refund of ₹${Number(res.refund.amount).toLocaleString('en-IN')} was created. Process it from the Refunds page.`)
    } else {
      showToast(`✅ ${res.message || 'Claim updated'}`)
    }
    loadClaims()
    loadCounts()
  }

  const columns = [
    { key: 'buyer', header: 'Buyer', render: (c) => (<><div style={{ fontWeight: 600 }}>{c.user?.name || 'Anonymous'}</div><div className="small muted">+91 {c.user?.phone}</div></>) },
    { key: 'reason', header: 'Reason', render: (c) => <div title={c.reason || ''} className="muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.reason}</div> },
    {
      key: 'request',
      header: 'Verification request',
      render: (c) => (
        <>
          <div style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{(c.verificationRequest?.id || c.verificationRequestId || '').slice(0, 8)}</div>
          <div className="small muted">{c.verificationRequest?.agreedFee ? `₹${Number(c.verificationRequest.agreedFee).toLocaleString('en-IN')}` : '—'}</div>
        </>
      ),
    },
    { key: 'status', header: 'Status', render: (c) => <Badge tone={STATUS_TONE[c.status] || 'grey'}>{c.status}</Badge> },
    { key: 'createdAt', header: 'Raised on', render: (c) => <span className="small muted">{formatDate(c.createdAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => <Button size="sm" variant="ghost" onClick={() => setSelected(c)}>View</Button>,
    },
  ]

  return (
    <div>
      <PageHead
        title="Claims"
        subtitle="Review and resolve disputes buyers raise after a verification report unlocks"
      />

      <div className="grid g3" style={{ marginBottom: 20 }}>
        <StatCard tone="amber" icon="⚖️" value={counts.open} label="Open claims" />
        <StatCard tone="blue" icon="🔎" value={counts.underReview} label="Under review" />
        <StatCard tone="grey" icon="🗂️" value={counts.total} label="All claims" />
      </div>

      {!canResolve && (
        <Card style={{ marginBottom: 16, padding: '10px 14px' }}>
          <Badge tone="grey">🔒 Your role has read-only access — only a Super Admin can resolve a claim.</Badge>
        </Card>
      )}

      <select className="control" value={statusFilter} onChange={(e) => changeFilter(e.target.value)} style={{ width: 'auto', marginBottom: 16 }}>
        <option value="">All claims</option>
        <option value="OPEN">Open</option>
        <option value="UNDER_REVIEW">Under review</option>
        <option value="RESOLVED">Resolved</option>
        <option value="REJECTED">Rejected</option>
        <option value="REFUND_APPROVED">Refund approved</option>
        <option value="REFUND_PROCESSED">Refund processed</option>
      </select>

      {error ? (
        <ErrorState message={error} onRetry={loadClaims} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : claims}
            getRowKey={(c) => c.id}
            emptyState={<div style={{ padding: 40, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading claims…' : statusFilter ? `No ${statusFilter} claims` : 'No claims raised yet'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="claims" />
        </Card>
      )}

      {selected && (
        <ClaimModal
          claim={selected}
          onClose={() => setSelected(null)}
          onResolved={handleResolved}
          canResolve={canResolve}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
