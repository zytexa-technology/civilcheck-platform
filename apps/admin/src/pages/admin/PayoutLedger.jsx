import { useState, useEffect } from 'react'
import { getSpecialRequestPayouts } from '../../api/admin.api'
import { Badge, Card, ErrorState, PageHead, Pagination, ResponsiveTable, StatCard } from '../../components/ui'

export default function PayoutLedger() {
  const [payouts, setPayouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [settledFilter, setSettledFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20

  useEffect(() => { loadPayouts() }, [page, settledFilter])

  const loadPayouts = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (settledFilter) params.settled = settledFilter
      const data = await getSpecialRequestPayouts(params)
      setPayouts(data.payouts || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load the payout ledger')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const pendingSum = payouts.filter((p) => !p.settled).reduce((sum, p) => sum + p.amount, 0)

  const columns = [
    { key: 'createdAt', header: 'Created', render: (p) => new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) },
    { key: 'seller', header: 'Seller', render: (p) => (<><div style={{ fontWeight: 600 }}>{p.seller?.name || '—'}</div><div className="small muted">{p.seller?.phone} · {p.seller?.badge}</div></>) },
    { key: 'request', header: 'Request', render: (p) => (<><div title={p.specialRequest?.address || ''} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.specialRequest?.address || '—'}</div><div className="small muted">{p.specialRequest?.city}, {p.specialRequest?.tehsil}</div></>) },
    { key: 'amount', header: 'Seller cut', render: (p) => <span style={{ color: 'var(--green)', fontWeight: 700 }}>₹{p.amount.toLocaleString('en-IN')}</span> },
    { key: 'platformCut', header: 'Platform cut', render: (p) => <span className="muted">₹{p.platformCut.toLocaleString('en-IN')}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (p) => p.settled ? (
        <Badge tone="green">✓ Settled{p.settledAt ? ` ${new Date(p.settledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</Badge>
      ) : (
        <Badge tone="amber">⏳ Pending</Badge>
      ),
    },
  ]

  return (
    <div>
      <PageHead title="Seller payout ledger" subtitle="70/30 commission on approved special requests — settles via the weekly settlement cron" />

      <div className="grid g2" style={{ marginBottom: 20, maxWidth: 480 }}>
        <StatCard tone="grey" icon="🧾" value={total} label="Total payout rows" />
        <StatCard tone="amber" icon="⏳" value={`₹${pendingSum.toLocaleString('en-IN')}`} label="Unsettled (this page)" />
      </div>

      <select className="control" value={settledFilter} onChange={(e) => setSettledFilter(e.target.value)} style={{ width: 'auto', marginBottom: 16 }}>
        <option value="">All</option>
        <option value="false">Unsettled</option>
        <option value="true">Settled</option>
      </select>

      {error ? (
        <ErrorState message={error} onRetry={loadPayouts} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : payouts}
            getRowKey={(p) => p.id}
            emptyState={<div style={{ padding: 40, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No payouts yet — they appear here once a special request is approved'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="payouts" />
        </Card>
      )}
    </div>
  )
}
