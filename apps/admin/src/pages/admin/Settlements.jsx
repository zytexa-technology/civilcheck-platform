import { useState, useEffect } from 'react'
import { getSettlementReport } from '../../api/admin.api'
import { Card, ErrorState, PageHead, ResponsiveTable, StatCard } from '../../components/ui'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const now = new Date()
const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

// Live per-seller settlement status — Reports.jsx already covers the
// CSV-export/compliance angle on the same data; this is the day-to-day
// operational view the "Settlements" nav item pointed nowhere useful before.
export default function Settlements() {
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [month, year])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await getSettlementReport({ month, year })
      setData(d)
    } catch {
      setError('Failed to load settlements')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { key: 'seller', header: 'Seller', render: (sl) => (<><div style={{ fontWeight: 600 }}>{sl.sellerName}</div><div className="small muted">{sl.phone}</div></>) },
    { key: 'badge', header: 'Badge' },
    { key: 'totalEarned', header: 'Earned', render: (sl) => `₹${sl.totalEarned.toFixed(0)}` },
    { key: 'settled', header: 'Settled', render: (sl) => <span style={{ color: 'var(--green)' }}>₹{sl.settled.toFixed(0)}</span> },
    { key: 'pending', header: 'Pending', render: (sl) => <span style={{ color: 'var(--amber)' }}>₹{sl.pending.toFixed(0)}</span> },
    { key: 'tds', header: 'TDS', render: (sl) => <span className="muted">₹{sl.tds.toFixed(0)}</span> },
    { key: 'netPayable', header: 'Net payable', render: (sl) => <span style={{ fontWeight: 700 }}>₹{sl.netPayable.toFixed(0)}</span> },
    { key: 'transactions', header: 'Txns' },
  ]

  return (
    <div>
      <PageHead
        title="Settlements"
        subtitle="Per-seller settlement status for the selected month — actual payout happens via the weekly cron"
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="control" value={month} onChange={(e) => setMonth(parseInt(e.target.value))} style={{ width: 'auto' }}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select className="control" value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={{ width: 'auto' }}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        }
      />

      {data && (
        <div className="grid g4" style={{ marginBottom: 20 }}>
          <StatCard tone="blue" icon="👤" value={data.summary.totalSellers} label="Active sellers" />
          <StatCard tone="amber" icon="⏳" value={`₹${data.summary.totalPending.toLocaleString('en-IN')}`} label="Total pending" />
          <StatCard tone="green" icon="✅" value={`₹${data.summary.totalSettled.toLocaleString('en-IN')}`} label="Total settled" />
          <StatCard tone="violet" icon="🧾" value={`₹${data.summary.totalTDS.toFixed(0)}`} label="TDS withheld" />
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading || !data ? [] : data.sellers}
            getRowKey={(sl) => sl.sellerId}
            emptyState={<div style={{ padding: 40, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No seller earnings this month'}</div>}
          />
        </Card>
      )}
    </div>
  )
}
