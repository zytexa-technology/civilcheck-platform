import { useState, useEffect } from 'react'
import { getReportFlags, resolveReportFlag, dismissReportFlag } from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canQcListings } from '../../utils/permissions'
import { Badge, Button, Card, ErrorState, Field, Modal, PageHead, Pagination, ResponsiveTable, Toast } from '../../components/ui'

// ─── FLAG ACTION MODAL ─────────────────────────────────────────────────────
const FlagModal = ({ flag, onClose, onAction, canManage }) => {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAction = async (action) => {
    setLoading(true)
    await onAction(action, flag.id, note)
    setLoading(false)
    onClose()
  }

  return (
    <Modal open title="Report flag" onClose={onClose} footer={
      canManage && flag.status === 'PENDING' ? (
        <>
          <Button variant="danger" onClick={() => handleAction('dismiss')} disabled={loading}>✗ Dismiss</Button>
          <Button variant="soft" onClick={() => handleAction('resolve')} disabled={loading}>✓ Resolve — flag was legitimate</Button>
        </>
      ) : (
        <Button variant="ghost" block onClick={onClose}>Close</Button>
      )
    }>
      <div className="card-flat" style={{ padding: 16, marginBottom: 20 }}>
        {[
          ['Reported by', flag.user?.name || flag.user?.phone || '—'],
          ['Listing', flag.listing?.address || '—'],
          ['City / tehsil', [flag.listing?.city, flag.listing?.tehsil].filter(Boolean).join(', ') || '—'],
          ['Listing status', flag.listing?.status || '—'],
          ['Reason', flag.reason],
          ['Status', flag.status],
          ['Flagged on', new Date(flag.createdAt).toLocaleDateString('en-IN')],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13, gap: 12 }}>
            <span className="muted" style={{ flexShrink: 0 }}>{label}</span>
            <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
          </div>
        ))}
        {flag.adminNote && (
          <div style={{ paddingTop: 9, fontSize: 13 }}>
            <span className="muted">Admin note</span>
            <div style={{ marginTop: 4 }}>{flag.adminNote}</div>
          </div>
        )}
      </div>

      {!canManage && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Your role has read-only access to report flags.
        </div>
      )}

      {canManage && flag.status === 'PENDING' && (
        <Field label="Admin note" optional>
          <textarea className="control" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Note…" />
        </Field>
      )}
    </Modal>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────
export default function ReportFlags() {
  const { admin } = useAuth()
  const canManage = canQcListings(admin?.role)
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20

  useEffect(() => { load() }, [statusFilter, page])

  const changeFilter = (value) => { setStatusFilter(value); setPage(1) }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getReportFlags({ status: statusFilter, page, limit: LIMIT })
      setFlags(data.flags || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load report flags')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleAction = async (action, id, note) => {
    try {
      if (action === 'resolve') await resolveReportFlag(id, note)
      if (action === 'dismiss') await dismissReportFlag(id, note)
      showToast(`✅ Flag ${action === 'resolve' ? 'resolved' : 'dismissed'}!`)
      load()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  const statusTone = { PENDING: 'amber', RESOLVED: 'green', DISMISSED: 'grey' }

  const columns = [
    { key: 'createdAt', header: 'Flagged on', render: (f) => <span className="small muted">{new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span> },
    { key: 'user', header: 'Reported by', render: (f) => (<><div style={{ fontWeight: 600 }}>{f.user?.name || 'Anonymous'}</div><div className="small muted">+91 {f.user?.phone}</div></>) },
    { key: 'listing', header: 'Listing', render: (f) => <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.listing?.address || '—'}</div> },
    { key: 'reason', header: 'Reason', render: (f) => <div className="muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.reason}</div> },
    { key: 'status', header: 'Status', render: (f) => <Badge tone={statusTone[f.status] || 'grey'}>{f.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (f) => canManage && f.status === 'PENDING' ? (
        <Button size="sm" variant="soft" onClick={() => setSelected(f)}>Review</Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setSelected(f)}>View</Button>
      ),
    },
  ]

  return (
    <div>
      <PageHead title="Report flags" subtitle="Buyer-submitted 'outdated / inaccurate' flags on live listings" />

      <select className="control" value={statusFilter} onChange={(e) => changeFilter(e.target.value)} style={{ width: 'auto', marginBottom: 16 }}>
        <option value="PENDING">Pending</option>
        <option value="RESOLVED">Resolved</option>
        <option value="DISMISSED">Dismissed</option>
      </select>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : flags}
            getRowKey={(f) => f.id}
            emptyState={<div style={{ padding: 40, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading report flags…' : `No ${statusFilter.toLowerCase()} flags`}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="flags" />
        </Card>
      )}

      {selected && <FlagModal flag={selected} onClose={() => setSelected(null)} onAction={handleAction} canManage={canManage} />}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
