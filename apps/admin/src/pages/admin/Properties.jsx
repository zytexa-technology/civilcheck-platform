import { useState, useEffect } from 'react'
import { getProperties, approveProperty, rejectProperty, suspendProperty, unsuspendProperty, deleteProperty } from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canQcListings, canDeleteProperties } from '../../utils/permissions'
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
  Toast,
} from '../../components/ui'

// Audit 2026-09-01 (Admin Document Type Visibility) — machine key → friendly
// label for the 8 mandatory Owner-property document types (mirrors
// REQUIRED_PROPERTY_DOCUMENT_TYPES in packages/shared/src/validation.ts).
// Optional/extra documents were never machine keys to begin with (the
// seller UI sends their own human label, e.g. "NOC") so they just display
// their `type` as-is — no entry needed here for those.
const REQUIRED_DOC_LABELS = {
  SALE_DEED: 'Sale Deed',
  REGISTRY: 'Registry',
  KHATA: 'Khata',
  MUTATION: 'Mutation',
  PROPERTY_TAX_RECEIPT: 'Property Tax Receipt',
  ELECTRICITY_BILL: 'Electricity Bill',
  OWNER_AADHAAR: 'Owner Aadhaar',
  PAN_CARD: 'PAN Card',
}

const DetailGrid = ({ items }) => (
  <div className="grid g2" style={{ marginBottom: 16 }}>
    {items.map(([label, value]) => (
      <div key={label}>
        <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
      </div>
    ))}
  </div>
)

// ─── PROPERTY DETAIL MODAL ────────────────────────────────────────────────
const PropertyModal = ({ property, onClose, onAction, canManage, canDelete }) => {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleAction = async (action) => {
    if ((action === 'reject' || action === 'suspend') && !reason.trim()) {
      alert(`A ${action === 'reject' ? 'rejection' : 'suspension'} reason is required`)
      return
    }
    setLoading(true)
    await onAction(action, property.id, reason)
    setLoading(false)
    onClose()
  }

  return (
    <Modal open title="Property review" onClose={onClose} size="lg">
      <DetailGrid items={[
        ['Title', property.title],
        ['Area', `${property.area} sq.ft`],
        ['Age', property.age || '—'],
        ['City', property.city || '—'],
        ['Type', property.propertyType],
        ['Health score', `${property.health}/100`],
        ['Uploaded by', property.uploaderRole || '—'],
        ['Owner', property.seller?.name || '—'],
        ['Owner badge', property.seller?.badge || '—'],
      ]} />

      {property.documents?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Supporting documents ({property.documents.length})</div>
          {property.documents.map((doc, i) => {
            // Pre-migration rows stored documents as plain URL strings (no
            // type was ever captured for them) — those still render safely,
            // just without a real name. A post-migration row is
            // { type, url }; `type` is a required-doc machine key (shown via
            // the friendly label map) or an optional doc's own free-text
            // label (shown as-is).
            const isLegacy = typeof doc === 'string'
            const url = isLegacy ? doc : doc?.url
            const label = isLegacy
              ? 'Document (legacy)'
              : (REQUIRED_DOC_LABELS[doc?.type] || doc?.type || `Document ${i + 1}`)
            return (
              <div key={i} className="card-flat" style={{ padding: '10px 14px', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{label}</span>
                {typeof url === 'string' && url.startsWith('http') ? (
                  <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', fontSize: 12 }}>View →</a>
                ) : (
                  <span className="small muted">pre-upload record (no file)</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!canManage && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Your role has read-only access to property review.
        </div>
      )}

      {canManage && (property.status === 'PENDING' || property.status === 'APPROVED') && (
        <Field label={property.status === 'APPROVED' ? 'Suspension reason' : 'Rejection reason'} hint="Required if you reject/suspend.">
          <input className="control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" />
        </Field>
      )}

      <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {canManage && property.status === 'PENDING' && (
          <>
            <Button variant="soft" onClick={() => handleAction('approve')} disabled={loading} style={{ flex: 1 }}>✓ Approve</Button>
            <Button variant="danger" onClick={() => handleAction('reject')} disabled={loading} style={{ flex: 1 }}>✗ Reject</Button>
          </>
        )}
        {canManage && property.status === 'APPROVED' && (
          <Button variant="danger" onClick={() => handleAction('suspend')} disabled={loading} style={{ flex: 1 }}>⛔ Suspend</Button>
        )}
        {canManage && property.status === 'SUSPENDED' && (
          <Button variant="soft" onClick={() => handleAction('unsuspend')} disabled={loading} style={{ flex: 1 }}>↺ Lift suspension</Button>
        )}
        {canDelete && property.status !== 'DELETED' && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={loading}>🗑 Delete</Button>
        )}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Delete this property?"
        description={`"${property.title}" will be soft-deleted — it stays attributable for records, but buyers can no longer find it. This cannot be undone from the UI.`}
        confirmLabel="Delete property"
        loading={loading}
        onConfirm={() => handleAction('delete')}
        onClose={() => setConfirmDelete(false)}
      />
    </Modal>
  )
}

// ─── MAIN PROPERTIES PAGE ─────────────────────────────────────────────────
export default function Properties() {
  const { admin } = useAuth()
  const canManage = canQcListings(admin?.role)
  const canDelete = canDeleteProperties(admin?.role)
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20

  useEffect(() => { loadProperties() }, [statusFilter, page])

  const changeFilter = (setter) => (value) => { setter(value); setPage(1) }

  const loadProperties = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (statusFilter) params.status = statusFilter
      const data = await getProperties(params)
      setProperties(data.properties || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load properties')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleAction = async (action, id, reason) => {
    try {
      if (action === 'approve') await approveProperty(id)
      if (action === 'reject') await rejectProperty(id, reason)
      if (action === 'suspend') await suspendProperty(id, reason)
      if (action === 'unsuspend') await unsuspendProperty(id)
      if (action === 'delete') await deleteProperty(id)
      showToast(`✅ Property ${action}d successfully!`)
      loadProperties()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  const filtered = properties.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()) || (p.city || '').toLowerCase().includes(search.toLowerCase())
  )

  const statusTone = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', SUSPENDED: 'red', DRAFT: 'grey', DELETED: 'grey' }

  const columns = [
    {
      key: 'title',
      header: 'Property',
      render: (p) => (<><div style={{ fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div><div className="small muted" style={{ marginTop: 2 }}>{p.city || '—'} · {p.area} sq.ft</div></>),
    },
    {
      key: 'uploader',
      header: 'Uploaded by',
      render: (p) => (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{p.seller?.name || '—'} <Badge tone="grey">{p.uploaderRole || '—'}</Badge></div>
          <div className="small muted">{p.seller?.badge}</div>
        </>
      ),
    },
    { key: 'propertyType', header: 'Type' },
    { key: 'health', header: 'Health', render: (p) => `${p.health}/100` },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={statusTone[p.status] || 'grey'}>{p.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={() => setSelected(p)}>Review</Button>
          {canManage && p.status === 'PENDING' && <Button size="sm" variant="soft" onClick={() => handleAction('approve', p.id, '')}>Approve</Button>}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHead title="Owner properties" subtitle="Property Owner self-published listings — approve, reject or suspend. (Reporter content is separate — see Reporter Posts.)" />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search title or city…" style={{ flex: 1, minWidth: 220 }} />
        <select className="control" value={statusFilter} onChange={(e) => changeFilter(setStatusFilter)(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DRAFT">Draft</option>
          <option value="DELETED">Deleted</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={loadProperties} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : filtered}
            getRowKey={(p) => p.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading properties…' : 'No properties found'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="properties" />
        </Card>
      )}

      {selected && <PropertyModal property={selected} onClose={() => setSelected(null)} onAction={handleAction} canManage={canManage} canDelete={canDelete} />}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
