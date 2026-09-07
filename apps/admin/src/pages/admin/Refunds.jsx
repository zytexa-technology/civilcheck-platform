import { useState, useEffect } from 'react'
import { getRefunds, processRefund, rejectRefund, searchPurchases, createRefund } from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canManageRefunds } from '../../utils/permissions'
import { Badge, Button, Card, ErrorState, Field, Modal, PageHead, Pagination, ResponsiveTable, StatCard, Toast } from '../../components/ui'

// ─── REFUND ACTION MODAL ──────────────────────────────────────────────────
const RefundModal = ({ refund, onClose, onAction, canManage }) => {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAction = async (action) => {
    if (action === 'reject' && !note.trim()) {
      alert('A rejection reason is required')
      return
    }
    setLoading(true)
    await onAction(action, refund.id, note)
    setLoading(false)
    onClose()
  }

  return (
    <Modal open title={`Refund — ${refund.refundRef}`} onClose={onClose} footer={
      canManage && refund.status === 'PENDING' ? (
        <>
          <Button variant="danger" onClick={() => handleAction('reject')} disabled={loading}>✗ Reject</Button>
          <Button variant="soft" onClick={() => handleAction('process')} disabled={loading}>✓ Full refund — ₹{refund.amount.toLocaleString('en-IN')}</Button>
        </>
      ) : (
        <Button variant="ghost" block onClick={onClose}>Close</Button>
      )
    }>
      <div className="card-flat" style={{ padding: 16, marginBottom: 20 }}>
        {[
          ['Buyer', refund.buyer?.name || refund.buyer?.phone || '—'],
          ['Property', refund.listing?.address || '—'],
          ['Amount', `₹${refund.amount.toLocaleString('en-IN')}`],
          ['Reason', refund.reason],
          ['Status', refund.status],
          ['Date', new Date(refund.createdAt).toLocaleDateString('en-IN')],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span className="muted">{label}</span>
            <span style={{ fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      {!canManage && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Your role has read-only access to refunds.
        </div>
      )}

      {canManage && (
        <Field label="Admin note" hint={refund.status === 'PENDING' ? 'Required to reject.' : undefined}>
          <textarea className="control" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Note…" />
        </Field>
      )}
    </Modal>
  )
}

// ─── NEW REFUND MODAL ─────────────────────────────────────────────────────
// Manual refund creation — createRefund needs a specific purchaseId, so this
// searches for one by buyer phone or listing address first.
const NewRefundModal = ({ onClose, onCreated }) => {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [searchErr, setSearchErr] = useState('')
  const [picked, setPicked] = useState(null)
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)

  const isPhone = /^\d{4,}$/.test(query.trim())

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchErr('')
    setResults(null)
    try {
      const params = isPhone ? { phone: query.trim() } : { address: query.trim() }
      const data = await searchPurchases(params)
      setResults(data.purchases || [])
    } catch (err) {
      setSearchErr(err.response?.data?.message || 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const submit = async () => {
    if (!picked || !reason.trim()) return
    setCreating(true)
    try {
      await createRefund({ purchaseId: picked.id, reason: reason.trim(), amount: amount ? Number(amount) : undefined })
      onCreated()
    } catch (err) {
      setSearchErr(err.response?.data?.message || 'Failed to create the refund')
      setCreating(false)
    }
  }

  return (
    <Modal open title="New refund" onClose={onClose}>
      {!picked ? (
        <>
          <Field label="Find purchase" hint="Buyer phone (digits) or listing address.">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="control"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="e.g. 9876543210 or Vaishali Nagar"
              />
              <Button variant="soft" onClick={runSearch} disabled={searching || !query.trim()}>{searching ? '…' : 'Search'}</Button>
            </div>
          </Field>

          {searchErr && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>❌ {searchErr}</p>}
          {results && results.length === 0 && <p className="muted small" style={{ textAlign: 'center', padding: 20 }}>No purchases found</p>}
          {results && results.map((p) => (
            <div
              key={p.id}
              onClick={() => !p.hasActiveRefund && setPicked(p)}
              className="card-flat"
              style={{ padding: 12, marginBottom: 8, cursor: p.hasActiveRefund ? 'not-allowed' : 'pointer', opacity: p.hasActiveRefund ? 0.5 : 1 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
                <span>{p.buyerName} — {p.buyerPhone}</span>
                <span style={{ color: 'var(--gold)' }}>₹{p.amountPaid.toLocaleString('en-IN')}</span>
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>
                {p.property}, {p.city} · {new Date(p.createdAt).toLocaleDateString('en-IN')}
                {p.hasActiveRefund && ' · already has a pending/processed refund'}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="card-flat" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{picked.buyerName} — {picked.buyerPhone}</div>
            <div className="small muted" style={{ marginTop: 4 }}>{picked.property}, {picked.city}</div>
            <div className="small muted" style={{ marginTop: 2 }}>Paid: ₹{picked.amountPaid.toLocaleString('en-IN')}</div>
            <button onClick={() => setPicked(null)} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--blue)', fontSize: 12, cursor: 'pointer', padding: 0 }}>← Choose a different purchase</button>
          </div>

          <Field label="Reason" required>
            <input className="control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" />
          </Field>
          <Field label="Amount" optional hint={`Leave blank for full ₹${picked.amountPaid.toLocaleString('en-IN')} refund.`}>
            <input className="control" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`Full amount: ₹${picked.amountPaid.toLocaleString('en-IN')}`} />
          </Field>

          {searchErr && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>❌ {searchErr}</p>}

          <Button variant="danger" block onClick={submit} disabled={creating || !reason.trim()}>
            {creating ? 'Creating…' : `Create refund${amount ? ` — ₹${amount}` : ''}`}
          </Button>
        </>
      )}
    </Modal>
  )
}

// ─── MAIN REFUNDS PAGE ────────────────────────────────────────────────────
export default function Refunds() {
  const { admin } = useAuth()
  const canManage = canManageRefunds(admin?.role)
  const [refunds, setRefunds] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [showNewRefund, setShowNewRefund] = useState(false)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20

  useEffect(() => { loadRefunds() }, [statusFilter, page])

  const changeFilter = (value) => { setStatusFilter(value); setPage(1) }

  const loadRefunds = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (statusFilter) params.status = statusFilter
      const data = await getRefunds(params)
      setRefunds(data.refunds || [])
      setStats(data.stats || {})
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load refunds')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleAction = async (action, id, note) => {
    try {
      if (action === 'process') await processRefund(id, note)
      if (action === 'reject') await rejectRefund(id, note)
      showToast(`✅ Refund ${action === 'process' ? 'processed' : 'rejected'} successfully!`)
      loadRefunds()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  const statusTone = { PENDING: 'amber', PROCESSED: 'green', REJECTED: 'red' }

  const columns = [
    { key: 'refundRef', header: 'Request ID', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }} className="muted">{r.refundRef}</span> },
    { key: 'buyer', header: 'Buyer', render: (r) => (<><div style={{ fontWeight: 600 }}>{r.buyer?.name || 'Anonymous'}</div><div className="small muted">+91 {r.buyer?.phone}</div></>) },
    { key: 'listing', header: 'Listing', render: (r) => <div title={r.listing?.address || ''} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.listing?.address || '—'}</div> },
    { key: 'amount', header: 'Amount', render: (r) => <span style={{ color: 'var(--amber)', fontWeight: 700 }}>₹{r.amount.toLocaleString('en-IN')}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <div title={r.reason || ''} className="muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</div> },
    { key: 'createdAt', header: 'Requested on', render: (r) => <span className="small muted">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status] || 'grey'}>{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => canManage && r.status === 'PENDING' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="soft" onClick={() => setSelected(r)}>Full refund</Button>
          <Button size="sm" variant="danger" onClick={() => setSelected(r)}>Reject</Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>View</Button>
      ),
    },
  ]

  return (
    <div>
      <PageHead
        title="Refund management"
        subtitle="Issue full/partial refunds within 7 days of purchase via Razorpay"
        right={canManage && <Button variant="primary" onClick={() => setShowNewRefund(true)}>+ New refund</Button>}
      />

      <div className="grid g3" style={{ marginBottom: 20 }}>
        <StatCard tone="red" icon="⏳" value={stats.pending || 0} label="Pending requests" />
        <StatCard tone="green" icon="↩️" value={`₹${(stats.totalRefunded || 0).toLocaleString('en-IN')}`} label="Refunded (MTD)" />
        <StatCard tone="blue" icon="✅" value={stats.processed || 0} label="Processed" />
      </div>

      <select className="control" value={statusFilter} onChange={(e) => changeFilter(e.target.value)} style={{ width: 'auto', marginBottom: 16 }}>
        <option value="">All refunds</option>
        <option value="PENDING">Pending</option>
        <option value="PROCESSED">Processed</option>
        <option value="REJECTED">Rejected</option>
      </select>

      {error ? (
        <ErrorState message={error} onRetry={loadRefunds} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : refunds}
            getRowKey={(r) => r.id}
            emptyState={<div style={{ padding: 40, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading refunds…' : statusFilter ? `No ${statusFilter} refunds` : 'No refund requests yet'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="refunds" />
        </Card>
      )}

      {selected && <RefundModal refund={selected} onClose={() => setSelected(null)} onAction={handleAction} canManage={canManage} />}
      {showNewRefund && (
        <NewRefundModal
          onClose={() => setShowNewRefund(false)}
          onCreated={() => { setShowNewRefund(false); showToast('✅ Refund created!'); loadRefunds() }}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
