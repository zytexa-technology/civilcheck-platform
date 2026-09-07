import { useState, useEffect } from 'react'
import { getAlertSubs } from '../../api/admin.api'
import { Badge, Card, ErrorState, PageHead, Pagination, PillFilter, ResponsiveTable, SearchInput, StatCard } from '../../components/ui'

const RISK_DOT = { RED: 'var(--red)', AMBER: 'var(--amber)', GREEN: 'var(--green)' }
const RiskDot = ({ risk }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: RISK_DOT[risk] || 'var(--muted)', flexShrink: 0 }} />
    {risk}
  </span>
)

export default function AlertSubs() {
  const [alerts, setAlerts] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 15

  useEffect(() => { loadAlerts() }, [page])

  const loadAlerts = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAlertSubs({ page, limit: LIMIT })
      setAlerts(data.alerts || [])
      setStats(data.stats || {})
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load alert subscriptions')
    } finally {
      setLoading(false)
    }
  }

  const filtered = alerts.filter((a) => {
    const matchFilter = filter === 'all' || (filter === 'active' ? a.active : !a.active)
    const matchSearch =
      (a.buyer?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.buyer?.phone || '').includes(search) ||
      (a.listing?.address || '').toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const totalPages = Math.ceil(total / LIMIT)

  const columns = [
    {
      key: 'buyer',
      header: 'Buyer',
      render: (a) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--blue-dim)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12, color: 'var(--blue)', flexShrink: 0 }}>
            {(a.buyer?.name || a.buyer?.phone || 'B')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{a.buyer?.name || 'Anonymous'}</div>
            <div className="small muted">+91 {a.buyer?.phone}</div>
          </div>
        </div>
      ),
    },
    { key: 'property', header: 'Property', render: (a) => <div style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{a.listing?.address || '—'}</div> },
    { key: 'city', header: 'City', render: (a) => <span className="muted">{a.listing?.city || '—'}</span> },
    { key: 'risk', header: 'Risk', render: (a) => (a.listing?.riskBadge ? <RiskDot risk={a.listing.riskBadge} /> : '—') },
    { key: 'active', header: 'Status', render: (a) => <Badge tone={a.active ? 'green' : 'grey'}>{a.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'subscribedAt', header: 'Subscribed on', render: (a) => <span className="small muted">{new Date(a.subscribedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span> },
  ]

  return (
    <div>
      <PageHead title="Alert subscriptions" subtitle="Buyers subscribed to property case updates · ₹49/month" />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard tone="grey" icon="🔔" value={total} label="Total" />
        <StatCard tone="green" icon="✅" value={stats.active || 0} label="Active" />
        <StatCard tone="grey" icon="⏸" value={stats.inactive || 0} label="Inactive" />
        <StatCard tone="gold" icon="💰" value={`₹${((stats.active || 0) * 49).toLocaleString('en-IN')}`} label="Monthly revenue" />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Filter this page by buyer or property…" style={{ flex: 1, minWidth: 220 }} />
        <PillFilter value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={loadAlerts} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : filtered}
            getRowKey={(a) => a.id}
            emptyState={<div style={{ padding: 40, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No subscriptions found'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="alerts" />
        </Card>
      )}
    </div>
  )
}
