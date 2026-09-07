import { useState, useEffect } from 'react'
import { getBuyers, deleteBuyer } from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canDeleteUsers } from '../../utils/permissions'
import { Badge, Button, Card, ConfirmDialog, ErrorState, Modal, PageHead, ResponsiveTable, SearchInput, StatCard, Toast } from '../../components/ui'

// ─── BUYER DETAIL MODAL ───────────────────────────────────────────────────
const BuyerModal = ({ buyer, onClose, onDeleted, canManage }) => {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDeleted(buyer.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      open
      title={buyer.name || 'Anonymous'}
      subtitle={`+91 ${buyer.phone}`}
      onClose={onClose}
      footer={
        <>
          {canManage && (
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={deleting}>🗑 Delete account</Button>
          )}
          <Button variant="ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</Button>
        </>
      }
    >
      <div className="grid g3" style={{ marginBottom: 20 }}>
        {[
          { label: 'Reports bought', value: buyer.totalPurchases, color: 'var(--blue)' },
          { label: 'Total spent', value: `₹${buyer.totalSpent.toLocaleString('en-IN')}`, color: 'var(--green)' },
          { label: 'Active alerts', value: buyer.activeAlerts, color: 'var(--amber)' },
        ].map((s) => (
          <div key={s.label} className="card-flat" style={{ padding: 14, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--disp)', fontSize: 19, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div className="small muted" style={{ marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card-flat" style={{ padding: 16 }}>
        {[
          ['Phone', buyer.phone || '—'],
          ['Email', buyer.email || '—'],
          ['Registered', new Date(buyer.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })],
          ['Buyer ID', buyer.id],
        ].map(([label, value], i, all) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i === all.length - 1 ? 'none' : '1px solid var(--border)', fontSize: 13 }}>
            <span className="muted">{label}</span>
            <span style={{ fontWeight: 500, fontFamily: label === 'Buyer ID' ? 'monospace' : 'inherit', fontSize: label === 'Buyer ID' ? 11 : 13 }}>{value}</span>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Delete this buyer's profile?"
        description={`"${buyer.name || buyer.phone}" will be soft-deleted — their purchase/payment history stays intact for records, but they can no longer log in. This cannot be undone from the UI.`}
        confirmLabel="Delete account"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </Modal>
  )
}

// ─── MAIN BUYERS PAGE ─────────────────────────────────────────────────────
export default function Buyers() {
  const { admin } = useAuth()
  const canManage = canDeleteUsers(admin?.role)
  const [buyers, setBuyers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ totalPurchases: 0, totalSpent: 0, activeAlerts: 0 })
  const [toast, setToast] = useState('')
  const LIMIT = 15

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleDeleteBuyer = async (id) => {
    try {
      await deleteBuyer(id)
      showToast('✅ Buyer account deleted')
      loadBuyers()
    } catch (err) {
      showToast(`❌ Error: ${err.response?.data?.message || 'Something went wrong'}`)
      throw err
    }
  }

  useEffect(() => { loadBuyers() }, [page])

  const loadBuyers = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getBuyers({ page, limit: LIMIT })
      setBuyers(data.buyers || [])
      setTotal(data.total || 0)
      setStats(data.stats || { totalPurchases: 0, totalSpent: 0, activeAlerts: 0 })
    } catch {
      setError('Failed to load buyers')
    } finally {
      setLoading(false)
    }
  }

  const filtered = buyers.filter((b) =>
    (b.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.phone || '').includes(search) ||
    (b.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(total / LIMIT)

  const columns = [
    {
      key: 'buyer',
      header: 'Buyer',
      render: (b) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--blue-dim)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13, color: 'var(--blue)', flexShrink: 0 }}>
            {(b.name || b.phone || 'B')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{b.name || 'Anonymous'}</div>
            <div className="small muted">+91 {b.phone}</div>
          </div>
        </div>
      ),
    },
    { key: 'createdAt', header: 'Registered', render: (b) => new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
    { key: 'totalPurchases', header: 'Reports bought', render: (b) => <span style={{ fontWeight: 600, color: b.totalPurchases > 0 ? 'var(--blue)' : 'var(--muted)' }}>{b.totalPurchases}</span> },
    { key: 'totalSpent', header: 'Total spent', render: (b) => <span style={{ color: b.totalSpent > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>₹{b.totalSpent.toLocaleString('en-IN')}</span> },
    { key: 'activeAlerts', header: 'Alert subs', render: (b) => (b.activeAlerts > 0 ? <Badge tone="blue">{b.activeAlerts} active</Badge> : <Badge tone="grey">None</Badge>) },
    { key: 'actions', header: 'Actions', render: (b) => <Button size="sm" variant="ghost" onClick={() => setSelected(b)}>View history</Button> },
  ]

  return (
    <div>
      <PageHead title="Buyer management" subtitle="View all registered buyers, purchase history, and subscriptions" />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard tone="grey" icon="👥" value={total} label="Total buyers" />
        <StatCard tone="blue" icon="🔔" value={stats.activeAlerts} label="Alert subscribers" />
        <StatCard tone="green" icon="📦" value={stats.totalPurchases} label="Paid purchases" />
        <StatCard tone="gold" icon="💰" value={`₹${stats.totalSpent.toLocaleString('en-IN')}`} label="Total revenue" />
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search buyer name, mobile, email…" style={{ marginBottom: 16 }} />

      {error ? (
        <ErrorState message={error} onRetry={loadBuyers} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : filtered}
            getRowKey={(b) => b.id}
            emptyState={<div style={{ padding: 40, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading buyers…' : 'No buyers found'}</div>}
          />
          {totalPages > 1 && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <span className="small muted">Page {page} of {totalPages} · {total} total buyers</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</Button>
                <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {selected && (
        <BuyerModal
          buyer={selected}
          onClose={() => setSelected(null)}
          onDeleted={handleDeleteBuyer}
          canManage={canManage}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
