import { useState, useEffect } from 'react'
import {
  getListings,
  approveListing,
  rejectListing,
  spotCheckListing,
  deleteListing,
  getAnalyticsOverview,
} from '../../api/admin.api'
import { getRiskBreakdown } from '../../api/auth.api'
import { useAuth } from '../../context/AuthContext'
import { canQcListings, canDeleteListings } from '../../utils/permissions'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Field,
  Modal,
  PageHead,
  Pagination,
  ResponsiveTable,
  SearchInput,
  StatCard,
  Tabs,
  Toast,
} from '../../components/ui'

// Property alert = the Owner/Expert-declared propertyStatus (Clear / Disputed). No risk badge.
const STATUS_DOT = { DISPUTED: 'var(--red)', CLEAR: 'var(--green)' }
const STATUS_LABEL = { CLEAR: 'Clear', DISPUTED: 'Disputed' }
const DISPUTE_LABEL = { CIVIL: 'Civil', CRIMINAL: 'Criminal', OTHER: 'Other' }
const StatusDot = ({ status, disputeType }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[status] || 'var(--muted)', display: 'inline-block', flexShrink: 0 }} />
    {STATUS_LABEL[status] ? `${STATUS_LABEL[status]}${status === 'DISPUTED' && disputeType ? ` · ${DISPUTE_LABEL[disputeType]}` : ''}` : 'Unclassified (legacy)'}
  </span>
)

const DetailGrid = ({ items }) => (
  <div className="grid g2" style={{ marginBottom: 16 }}>
    {items.map(([label, value, color]) => (
      <div key={label}>
        <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: color || 'var(--text)' }}>{value}</div>
      </div>
    ))}
  </div>
)

// ─── LISTING DETAIL MODAL ─────────────────────────────────────────────────
const ListingModal = ({ listing, onClose, onAction, canManage, canDelete }) => {
  const [reason, setReason] = useState('')
  const [spotNote, setSpotNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('details')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleAction = async (action) => {
    if (action === 'reject' && !reason.trim()) {
      alert('A rejection reason is required')
      return
    }
    setLoading(true)
    await onAction(action, listing.id, reason, spotNote)
    setLoading(false)
    onClose()
  }

  const statusColor = { DISPUTED: 'var(--red)', CLEAR: 'var(--green)' }

  return (
    <Modal open title="Expert post review" onClose={onClose} size="lg">
      <div style={{ marginBottom: 20 }}>
        <Tabs value={activeTab} onChange={setActiveTab} options={[{ value: 'details', label: 'Details' }, { value: 'spot-check', label: 'Spot check' }]} />
      </div>

      {activeTab === 'details' && (
        <>
          <DetailGrid items={[
            ['Address', listing.address],
            ['City', `${listing.city}, ${listing.tehsil}`],
            ['Property type', listing.propertyType],
            ['Property status', listing.propertyStatus === 'DISPUTED' ? `Disputed (${({ CIVIL: 'Civil', CRIMINAL: 'Criminal', OTHER: 'Other' })[listing.disputeType] || '—'})` : listing.propertyStatus === 'CLEAR' ? 'Clear' : 'Unclassified (legacy)', statusColor[listing.propertyStatus]],
            ['Case exists', listing.caseExists ? 'Yes' : 'No'],
            ['Case type', listing.caseType || '—'],
            ['Case status', listing.caseStatus || '—'],
            ['Court name', listing.courtName || '—'],
            ['Loan default', listing.loanDefault ? 'Yes' : 'No'],
            ['Price', `₹${listing.price.toLocaleString('en-IN')}`],
            ['Partner', listing.seller?.name || '—'],
            ['Partner badge', listing.seller?.badge || '—'],
          ]} />

          {listing.documents?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Supporting documents ({listing.documents.length})</div>
              {listing.documents.map((doc, i) => (
                <div key={i} className="card-flat" style={{ padding: '10px 14px', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Document {i + 1}</span>
                  <a href={doc} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', fontSize: 12 }}>View →</a>
                </div>
              ))}
            </div>
          )}

          {!canManage && (
            <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              🔒 Your role has read-only access to Expert post QC.
            </div>
          )}

          {canManage && listing.status === 'PENDING_REVIEW' && (
            <Field label="Rejection reason" hint="Required if you reject.">
              <input className="control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" />
            </Field>
          )}

          <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {canManage && listing.status === 'PENDING_REVIEW' && (
              <>
                <Button variant="soft" onClick={() => handleAction('approve')} disabled={loading} style={{ flex: 1 }}>✓ Approve & publish</Button>
                <Button variant="danger" onClick={() => handleAction('reject')} disabled={loading} style={{ flex: 1 }}>✗ Reject</Button>
              </>
            )}
            {canManage && listing.status === 'APPROVED' && (
              <Button variant="danger" onClick={() => handleAction('reject')} disabled={loading} style={{ flex: 1 }}>Remove post</Button>
            )}
            {canDelete && listing.status !== 'DELETED' && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={loading}>🗑 Delete</Button>
            )}
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </>
      )}

      {activeTab === 'spot-check' && (
        <>
          <div className="badge amber" style={{ display: 'block', padding: 14, borderRadius: 8, marginBottom: 20, fontSize: 12.5, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
            ⚠️ Spot check — verify that the documents and case information are correct.
          </div>
          {!canManage ? (
            <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              🔒 Your role has read-only access to spot checks.
            </div>
          ) : (
            <>
              <Field label="Admin note">
                <textarea className="control" value={spotNote} onChange={(e) => setSpotNote(e.target.value)} rows={3} placeholder="Spot check observations…" />
              </Field>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="soft" onClick={() => handleAction('spotpass')} disabled={loading} style={{ flex: 1 }}>✓ Pass — information is correct</Button>
                <Button variant="danger" onClick={() => handleAction('spotfail')} disabled={loading} style={{ flex: 1 }}>✗ Fail — remove + penalize</Button>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Delete this Expert post?"
        description={`"${listing.address}" will be soft-deleted — purchase/payment history stays intact for records, but users can no longer find or unlock it. This cannot be undone from the UI.`}
        confirmLabel="Delete post"
        loading={loading}
        onConfirm={() => handleAction('delete')}
        onClose={() => setConfirmDelete(false)}
      />
    </Modal>
  )
}

// ─── MAIN LISTINGS PAGE ───────────────────────────────────────────────────
export default function Listings() {
  const { admin } = useAuth()
  const canManage = canQcListings(admin?.role)
  const canDelete = canDeleteListings(admin?.role)
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('PENDING_REVIEW')
  const [riskFilter, setRiskFilter] = useState('')
  const [spotCheckFilter, setSpotCheckFilter] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState(null)
  const [risk, setRisk] = useState(null)
  const LIMIT = 20

  useEffect(() => { loadCounts() }, [])

  const loadCounts = async () => {
    const [ov, rb] = await Promise.allSettled([getAnalyticsOverview(), getRiskBreakdown()])
    if (ov.status === 'fulfilled') setCounts(ov.value.overview?.listings || null)
    if (rb.status === 'fulfilled') setRisk(rb.value.data || null)
  }

  const statusCount = (status) => risk?.find((r) => r.status === status)?.count ?? '—'

  useEffect(() => { loadListings() }, [statusFilter, riskFilter, spotCheckFilter, page])

  const changeFilter = (setter) => (value) => { setter(value); setPage(1) }

  const loadListings = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (statusFilter) params.status = statusFilter
      if (riskFilter) params.propertyStatus = riskFilter
      if (spotCheckFilter) params.flaggedForSpotCheck = 'true'
      const data = await getListings(params)
      setListings(data.listings || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load Expert posts')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleAction = async (action, id, reason, spotNote) => {
    try {
      if (action === 'approve') await approveListing(id)
      if (action === 'reject') await rejectListing(id, reason)
      if (action === 'spotpass') await spotCheckListing(id, 'PASS', spotNote)
      if (action === 'spotfail') await spotCheckListing(id, 'FAIL', spotNote)
      if (action === 'delete') await deleteListing(id)
      showToast(`✅ Expert post ${action} successfully!`)
      loadListings()
      loadCounts()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  const filtered = listings.filter((l) =>
    l.address.toLowerCase().includes(search.toLowerCase()) || l.city.toLowerCase().includes(search.toLowerCase())
  )

  const statusTone = { PENDING_REVIEW: 'amber', APPROVED: 'green', REJECTED: 'red', UNPUBLISHED: 'grey' }

  const columns = [
    {
      key: 'property',
      header: 'Property',
      render: (l) => (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.address}</div>
            {l.flaggedForSpotCheck && <Badge tone="amber">🔍 QC</Badge>}
          </div>
          <div className="small muted" style={{ marginTop: 2 }}>{l.city}, {l.tehsil}</div>
        </>
      ),
    },
    { key: 'seller', header: 'Partner', render: (l) => (<><div>{l.seller?.name || '—'}</div><div className="small muted">{l.seller?.badge}</div></>) },
    { key: 'propertyType', header: 'Type' },
    { key: 'propertyStatus', header: 'Property status', render: (l) => <StatusDot status={l.propertyStatus} disputeType={l.disputeType} /> },
    { key: 'price', header: 'Price', render: (l) => <span style={{ color: 'var(--amber)', fontWeight: 600 }}>₹{l.price.toLocaleString('en-IN')}</span> },
    { key: 'status', header: 'Status', render: (l) => <Badge tone={statusTone[l.status] || 'grey'}>{l.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (l) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={() => setSelected(l)}>Review</Button>
          {canManage && l.status === 'PENDING_REVIEW' && (
            <Button size="sm" variant="soft" onClick={() => handleAction('approve', l.id, '', '')}>Approve</Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHead title="Expert posts" subtitle="Case-report listings posted by Experts — approve, reject or suspend, and spot-check. (Owner/Reporter content is separate — see Owner Properties / Reporter Posts.)" />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard tone="grey" icon="🏠" value={counts?.total ?? '—'} label="Total Expert posts" />
        <StatCard tone="amber" icon="🕓" value={counts?.pendingReview ?? '—'} label="Pending review" />
        <StatCard tone="green" icon="✅" value={counts?.approved ?? '—'} label="Approved" />
        <StatCard tone="red" icon="🔴" value={statusCount('DISPUTED')} label="Disputed (approved)" />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Filter this page by address or city…" style={{ flex: 1, minWidth: 220 }} />
        <select className="control" value={statusFilter} onChange={(e) => changeFilter(setStatusFilter)(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All status</option>
          <option value="PENDING_REVIEW">Pending review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="UNPUBLISHED">Unpublished</option>
        </select>
        <select className="control" value={riskFilter} onChange={(e) => changeFilter(setRiskFilter)(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All status</option>
          <option value="DISPUTED">🔴 Disputed</option>
          <option value="CLEAR">🟢 Clear</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', fontSize: 13 }} className="muted">
          <input type="checkbox" checked={spotCheckFilter} onChange={(e) => changeFilter(setSpotCheckFilter)(e.target.checked)} />
          🔍 Flagged for spot-check only
        </label>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={loadListings} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : filtered}
            getRowKey={(l) => l.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading Expert posts…' : 'No Expert posts found'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="Expert posts" />
        </Card>
      )}

      {selected && <ListingModal listing={selected} onClose={() => setSelected(null)} onAction={handleAction} canManage={canManage} canDelete={canDelete} />}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
