import { useState, useEffect } from 'react'
import {
  getSpecialRequests,
  assignSpecialRequest,
  approveSpecialRequest,
  rejectSpecialRequest,
  getSellers,
} from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canManageSpecialRequests } from '../../utils/permissions'
import { Badge, Button, Card, Field, Modal, PageHead, Pagination, ResponsiveTable, StatCard, Tabs, Toast } from '../../components/ui'

// ─── REQUEST MODAL ────────────────────────────────────────────────────────
const RequestModal = ({ request, onClose, onAction, canManage }) => {
  const [sellers, setSellers] = useState([])
  const [selectedSeller, setSelectedSeller] = useState('')
  const [autoAssign, setAutoAssign] = useState(true)
  const [rejectReason, setRejectReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('details')

  useEffect(() => {
    getSellers({ kycStatus: 'APPROVED' }).then((data) => setSellers(data.sellers || [])).catch(() => {})
  }, [])

  const handleAction = async (action) => {
    if (action === 'assign' && !autoAssign && !selectedSeller) {
      alert('Select a seller, or choose auto-assign')
      return
    }
    if (action === 'reject' && !rejectReason.trim()) {
      alert('A rejection reason is required')
      return
    }
    setLoading(true)
    await onAction(action, request.id, autoAssign ? undefined : selectedSeller, rejectReason)
    setLoading(false)
    onClose()
  }

  const statusTone = {
    PENDING: 'amber', ASSIGNED: 'blue', IN_PROGRESS: 'violet',
    COMPLETED: 'blue', APPROVED: 'green', REJECTED: 'red', REFUNDED: 'grey',
  }

  return (
    <Modal open title="Special request" subtitle={<Badge tone={statusTone[request.status] || 'grey'}>{request.status}</Badge>} onClose={onClose}>
      <div style={{ marginBottom: 20 }}>
        <Tabs value={activeTab} onChange={setActiveTab} options={[{ value: 'details', label: '📋 Details' }, { value: 'assign', label: '👤 Assign seller' }]} />
      </div>

      {activeTab === 'details' && (
        <>
          <div className="grid g2" style={{ marginBottom: 18 }}>
            {[
              ['Buyer name', request.user?.name || '—'],
              ['Buyer phone', request.user?.phone || '—'],
              ['Property address', request.address],
              ['City', `${request.city}, ${request.tehsil}`],
              ['Property type', request.propertyType],
              ['Advance paid', `₹${request.advanceAmount.toLocaleString('en-IN')}`],
              ['Assigned to', request.seller?.name || 'Not assigned'],
              ['Created', new Date(request.createdAt).toLocaleDateString('en-IN')],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 18 }}>
            <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Buyer questions</div>
            <div className="card-flat" style={{ padding: 12, fontSize: 13, lineHeight: 1.6 }}>{request.questions}</div>
          </div>

          {request.documents?.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Buyer documents ({request.documents.length})</div>
              {request.documents.map((doc, i) => (
                <div key={i} className="card-flat" style={{ padding: '10px 14px', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Document {i + 1}</span>
                  <a href={doc} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', fontSize: 12 }}>View →</a>
                </div>
              ))}
            </div>
          )}

          {!canManage && (
            <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              🔒 Your role has read-only access to special requests.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {canManage && request.status === 'COMPLETED' && (
              <>
                <Button variant="soft" onClick={() => handleAction('approve')} disabled={loading} style={{ flex: 1 }}>✓ Approve & publish</Button>
                <div style={{ flex: 1 }}>
                  <input className="control" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reject reason…" style={{ marginBottom: 8 }} />
                  <Button variant="danger" block onClick={() => handleAction('reject')} disabled={loading}>✗ Reject + refund</Button>
                </div>
              </>
            )}
            {canManage && (request.status === 'PENDING' || request.status === 'ASSIGNED') && (
              <div style={{ flex: 1 }}>
                <input className="control" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Cancellation reason…" style={{ marginBottom: 8 }} />
                <Button variant="danger" block onClick={() => handleAction('reject')} disabled={loading}>Cancel + refund buyer</Button>
              </div>
            )}
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </>
      )}

      {activeTab === 'assign' && (
        !canManage ? (
          <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
            🔒 Your role has read-only access to assignment.
          </div>
        ) : (
          <>
            <div className="badge blue" style={{ display: 'block', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 13, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              📍 {request.city}, {request.tehsil} — select an expert for this area
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <button onClick={() => setAutoAssign(true)} className={`tab-btn ${autoAssign ? 'on' : ''}`} style={{ flex: 1 }}>✨ Auto-assign (nearest qualified)</button>
              <button onClick={() => setAutoAssign(false)} className={`tab-btn ${!autoAssign ? 'on' : ''}`} style={{ flex: 1 }}>Pick manually</button>
            </div>

            {autoAssign ? (
              <div className="card-flat muted" style={{ padding: 14, marginBottom: 16, fontSize: 12.5, lineHeight: 1.6 }}>
                Ranks approved sellers by prior listings in {request.tehsil} (then {request.city}), then by lowest current workload and rating. You'll see who got picked after assigning.
              </div>
            ) : (
              <>
                <Field label="Select seller">
                  <select className="control" value={selectedSeller} onChange={(e) => setSelectedSeller(e.target.value)}>
                    <option value="">-- Select a seller --</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} — {s.profession} — {s.badge} — {s.accuracyScore}% accuracy</option>
                    ))}
                  </select>
                </Field>

                {selectedSeller && (() => {
                  const seller = sellers.find((s) => s.id === selectedSeller)
                  if (!seller) return null
                  return (
                    <div className="card-flat" style={{ padding: 14, marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>{seller.name}</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }} className="muted">
                        <span>{seller.profession}</span>
                        <span>·</span>
                        <span style={{ color: seller.accuracyScore >= 95 ? 'var(--green)' : 'var(--amber)' }}>{seller.accuracyScore}% accuracy</span>
                        <span>·</span>
                        <span>{seller.totalListings} listings</span>
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            <Button variant="primary" block onClick={() => handleAction('assign')} disabled={loading || (!autoAssign && !selectedSeller)}>
              {loading ? 'Assigning…' : autoAssign ? '✨ Auto-assign' : '👤 Assign to seller'}
            </Button>
          </>
        )
      )}
    </Modal>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────
export default function SpecialRequests() {
  const { admin } = useAuth()
  const canManage = canManageSpecialRequests(admin?.role)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({})
  const LIMIT = 20

  useEffect(() => { loadRequests() }, [statusFilter, page])
  useEffect(() => { loadCounts() }, [])

  const changeFilter = (value) => { setStatusFilter(value); setPage(1) }

  const loadCounts = async () => {
    const statuses = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'APPROVED']
    const results = await Promise.allSettled(statuses.map((st) => getSpecialRequests({ status: st, page: 1, limit: 1 })))
    const next = {}
    results.forEach((r, i) => { if (r.status === 'fulfilled') next[statuses[i]] = r.value.total ?? 0 })
    setCounts(next)
  }

  const loadRequests = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (statusFilter) params.status = statusFilter
      const data = await getSpecialRequests(params)
      setRequests(data.requests || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load special requests')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleAction = async (action, id, sellerId, reason) => {
    try {
      if (action === 'assign') {
        const res = await assignSpecialRequest(id, sellerId)
        showToast(res.autoAssigned ? `✨ Auto-assigned to ${res.seller?.name} — ${res.matchReason}` : `✅ Assigned to ${res.seller?.name}!`)
        loadRequests(); loadCounts()
        return
      }
      if (action === 'approve') await approveSpecialRequest(id)
      if (action === 'reject') await rejectSpecialRequest(id, reason)
      showToast(`✅ Request ${action} successfully!`)
      loadRequests(); loadCounts()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  const statusTone = {
    PENDING: 'amber', ASSIGNED: 'blue', IN_PROGRESS: 'violet',
    COMPLETED: 'blue', APPROVED: 'green', REJECTED: 'red', REFUNDED: 'grey',
  }

  const columns = [
    { key: 'buyer', header: 'Buyer', render: (r) => (<><div style={{ fontWeight: 600 }}>{r.user?.name || '—'}</div><div className="small muted">{r.user?.phone}</div></>) },
    { key: 'property', header: 'Property', render: (r) => (<><div style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.address}>{r.address}</div><div className="small muted">{r.propertyType}</div></>) },
    { key: 'city', header: 'City' },
    { key: 'advanceAmount', header: 'Advance', render: (r) => <span style={{ color: 'var(--amber)', fontWeight: 600 }}>₹{r.advanceAmount.toLocaleString('en-IN')}</span> },
    { key: 'seller', header: 'Assigned to', render: (r) => r.seller?.name || <span className="muted">Not assigned</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status] || 'grey'}>{r.status}</Badge> },
    { key: 'createdAt', header: 'Date', render: (r) => <span className="small muted">{new Date(r.createdAt).toLocaleDateString('en-IN')}</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>{r.status === 'PENDING' ? 'Assign' : 'View'}</Button>
          {canManage && r.status === 'COMPLETED' && (
            <Button size="sm" variant="soft" onClick={async () => { await handleAction('approve', r.id, '', '') }}>Approve</Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHead title="Special requests" subtitle="Custom property research — assign sellers, approve & manage refunds" />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard tone="amber" icon="🕓" value={counts.PENDING ?? '—'} label="Pending" />
        <StatCard tone="blue" icon="👤" value={counts.ASSIGNED ?? '—'} label="Assigned" />
        <StatCard tone="violet" icon="⚙️" value={counts.IN_PROGRESS ?? '—'} label="In progress" />
        <StatCard tone="green" icon="✅" value={counts.APPROVED ?? '—'} label="Approved" />
      </div>

      <select className="control" value={statusFilter} onChange={(e) => changeFilter(e.target.value)} style={{ width: 'auto', marginBottom: 16 }}>
        <option value="">All status</option>
        <option value="PENDING">Pending</option>
        <option value="ASSIGNED">Assigned</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="COMPLETED">Completed (needs review)</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
        <option value="REFUNDED">Refunded</option>
      </select>

      {error ? (
        <div className="badge red" style={{ display: 'block', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>
          ❌ {error} <button onClick={loadRequests} style={{ marginLeft: 10, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
        </div>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : requests}
            getRowKey={(r) => r.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading requests…' : 'No special requests'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="requests" />
        </Card>
      )}

      {selected && <RequestModal request={selected} onClose={() => setSelected(null)} onAction={handleAction} canManage={canManage} />}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
