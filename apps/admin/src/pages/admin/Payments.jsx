import { useState, useEffect } from 'react'
import { getRevenueReport } from '../../api/admin.api'
import { Card, ErrorState, PageHead, ResponsiveTable, StatCard } from '../../components/ui'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const now = new Date()
const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

// Live, browsable transaction view — Reports.jsx already covers the
// CSV-export/compliance angle on the same data; this is the day-to-day
// operational view the "Payments" nav item pointed nowhere useful before.
export default function Payments() {
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
      const d = await getRevenueReport({ month, year })
      setData(d)
    } catch {
      setError('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { key: 'date', header: 'Date', render: (t) => new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) },
    { key: 'buyer', header: 'Buyer', render: (t) => (<><div style={{ fontWeight: 600 }}>{t.buyerName}</div><div className="small muted">{t.buyerPhone}</div></>) },
    { key: 'property', header: 'Property', render: (t) => (<><div title={t.property} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.property}</div><div className="small muted">{t.city}</div></>) },
    { key: 'amountPaid', header: 'Amount', render: (t) => <span style={{ color: 'var(--amber)', fontWeight: 600 }}>₹{t.amountPaid.toLocaleString('en-IN')}</span> },
    { key: 'sellerCut', header: 'Seller cut', render: (t) => <span style={{ color: 'var(--green)' }}>₹{t.sellerCut.toLocaleString('en-IN')}</span> },
    { key: 'settled', header: 'Settled', render: (t) => (t.settled ? '✓' : '⏳') },
  ]

  return (
    <div>
      <PageHead
        title="Payments"
        subtitle="Report-unlock transactions for the selected month"
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
          <StatCard tone="blue" icon="📄" value={data.summary.totalTransactions} label="Transactions" />
          <StatCard tone="gold" icon="💰" value={`₹${data.summary.totalGMV.toLocaleString('en-IN')}`} label="Total GMV" />
          <StatCard tone="green" icon="🏦" value={`₹${data.summary.platformRevenue.toLocaleString('en-IN')}`} label="Platform revenue" />
          <StatCard tone="violet" icon="🤝" value={`₹${data.summary.sellerPayouts.toLocaleString('en-IN')}`} label="Seller payouts" />
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading || !data ? [] : data.transactions}
            getRowKey={(t) => `${t.date}-${t.buyerPhone}-${t.amountPaid}`}
            emptyState={<div style={{ padding: 40, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No transactions this month'}</div>}
          />
        </Card>
      )}
    </div>
  )
}
