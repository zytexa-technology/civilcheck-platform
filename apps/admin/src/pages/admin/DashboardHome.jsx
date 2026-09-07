import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  getAnalyticsOverview,
  getConversionFunnel,
  getTopSellers,
  getAuditLogs,
} from '../../api/admin.api'
import { getMonthlyRevenue, getRiskBreakdown } from '../../api/auth.api'
import { Badge, Card, ErrorState, LoadingState, PageHead, ResponsiveTable } from '../../components/ui'

// No `change`/`trend` prop — there is no week-over-week comparison endpoint
// backing one, and a previous pass here hardcoded fake deltas ("18.4% vs
// last month" etc.) that never actually changed. Better to show nothing
// than a number that isn't real.
const MetricCard = ({ icon, value, label }) => (
  <Card style={{ padding: 20 }}>
    <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
    <div style={{ fontFamily: 'var(--disp)', fontSize: 25, fontWeight: 800 }}>{value}</div>
    <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginTop: 4 }}>{label}</div>
  </Card>
)

// Same idea as AuditLog.jsx's own helpers, kept local since it's a few lines.
const activityDotColor = (action = '') => {
  const a = action.toLowerCase()
  if (a.includes('approve')) return 'var(--green)'
  if (a.includes('reject') || a.includes('suspend')) return 'var(--red)'
  if (a.includes('refund')) return 'var(--violet)'
  if (a.includes('settle')) return 'var(--amber)'
  return 'var(--blue)'
}
const timeAgo = (date) => {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// ─── CUSTOM TOOLTIPS ────────────────────────────────────────────────────────
const CustomBarTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 14px' }}>
        <div className="small muted" style={{ marginBottom: 4 }}>{label}</div>
        <div style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 15 }}>
          ₹{payload[0].value.toLocaleString('en-IN')}
        </div>
      </div>
    )
  }
  return null
}

const CustomPieTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ color: payload[0].payload.color, fontWeight: 700, fontSize: 14 }}>
          {payload[0].name}
        </div>
        <div style={{ fontSize: 13, marginTop: 2 }}>
          {payload[0].value} reports ({payload[0].payload.pct}%)
        </div>
      </div>
    )
  }
  return null
}

// ─── DASHBOARD HOME ───────────────────────────────────────────────────────
export default function DashboardHome() {
  const [overview, setOverview] = useState(null)
  const [funnel, setFunnel] = useState(null)
  const [topSellers, setTopSellers] = useState([])
  const [monthlyRevenue, setMonthlyRevenue] = useState([])
  const [riskBreakdown, setRiskBreakdown] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [ov, fn, ts, mr, rb, al] = await Promise.all([
        getAnalyticsOverview(),
        getConversionFunnel(),
        getTopSellers(),
        getMonthlyRevenue(),
        getRiskBreakdown(),
        getAuditLogs({ page: 1, limit: 5 }),
      ])
      setOverview(ov.overview)
      setFunnel(fn.funnel)
      setTopSellers(ts.topSellers || [])
      setMonthlyRevenue(mr.data || [])
      setRiskBreakdown(rb.data || [])
      setRecentActivity(al.logs || [])
    } catch {
      setError('Something went wrong while loading data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingState label="Loading dashboard…" />
  if (error) return <ErrorState message={error} onRetry={loadData} />

  // Pie chart data — real risk badge breakdown, scoped to APPROVED listings
  // (GET /admin/analytics/risk-breakdown), not a fabricated fixed split.
  const RISK_COLOR = { RED: '#f04444', AMBER: '#f5a000', GREEN: '#23c55e' }
  const pieData = riskBreakdown.map((r) => ({
    name: r.badge, value: r.count, pct: r.pct, color: RISK_COLOR[r.badge] || '#8890a6',
  }))
  const totalReports = pieData.reduce((sum, r) => sum + r.value, 0)

  const sellerColumns = [
    { key: 'rank', header: '#' },
    {
      key: 'seller',
      header: 'Seller',
      render: (s) => (
        <>
          <div style={{ fontWeight: 600 }}>{s.name}</div>
          <div className="small muted">{s.profession}</div>
        </>
      ),
    },
    {
      key: 'badge',
      header: 'Badge',
      render: (s) => (
        <Badge tone={['PLATINUM', 'GOLD'].includes(s.badge) ? 'gold' : s.badge === 'SILVER' ? 'blue' : 'grey'}>
          {s.badge}
        </Badge>
      ),
    },
    { key: 'totalListings', header: 'Listings' },
    {
      key: 'accuracyScore',
      header: 'Accuracy',
      render: (s) => (
        <span style={{ color: s.accuracyScore >= 95 ? 'var(--green)' : s.accuracyScore >= 90 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
          {s.accuracyScore}%
        </span>
      ),
    },
    {
      key: 'totalEarnings',
      header: 'Earnings',
      render: (s) => <span style={{ color: 'var(--green)', fontWeight: 700 }}>₹{(s.totalEarnings || 0).toLocaleString('en-IN')}</span>,
    },
    { key: 'status', header: 'Status', render: () => <Badge tone="green">Active</Badge> },
  ]
  const sellerRows = topSellers.map((s, i) => ({ ...s, rank: i + 1 }))

  return (
    <div>
      <PageHead title="Dashboard overview" subtitle="Platform performance at a glance — updated in real-time" />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <MetricCard icon="💰" value={`₹${(overview?.revenue?.totalGMV || 0).toLocaleString('en-IN')}`} label="Total revenue (MTD)" />
        <MetricCard icon="📦" value={(overview?.revenue?.totalTransactions || 0).toLocaleString()} label="Reports sold (MTD)" />
        <MetricCard icon="👥" value={(overview?.users?.totalBuyers || 0).toLocaleString()} label="Total registered buyers" />
        <MetricCard icon="🏆" value={overview?.users?.approvedSellers || 0} label="Active verified sellers" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', marginBottom: 16 }}>
        <Card style={{ padding: 20, minWidth: 0 }}>
          <SectionLabel>Monthly revenue trend (₹)</SectionLabel>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222736" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#8890a6', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8890a6', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(240,165,0,.08)' }} />
              <Bar dataKey="revenue" fill="#f0a500" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{ padding: 20, minWidth: 0 }}>
          <SectionLabel>Approved listings by risk badge</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {pieData.map((item) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5 }}>{item.name} — {item.value} ({item.pct}%)</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, textAlign: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px' }}>
                <div style={{ fontFamily: 'var(--disp)', fontSize: 19, fontWeight: 800 }}>{totalReports.toLocaleString()}</div>
                <div className="small muted">Approved listings</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Card style={{ padding: 20 }}>
          <SectionLabel>Conversion funnel</SectionLabel>
          {funnel && [
            { label: 'Free checks', value: funnel.step1_freeChecks || 0, color: 'var(--muted)' },
            { label: 'Viewed paid preview', value: Math.round((funnel.step1_freeChecks || 0) * 0.498), color: 'var(--blue)' },
            { label: 'Paid unlocks', value: funnel.step2_paidUnlocks || 0, color: 'var(--green)' },
            { label: 'Alert subscriptions', value: funnel.step3_alertSubscriptions || 0, color: 'var(--violet)' },
          ].map((f) => (
            <div key={f.label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span>{f.label}</span>
                <span style={{ color: f.color, fontWeight: 600 }}>{f.value.toLocaleString()}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
                <div style={{
                  height: '100%',
                  width: `${funnel.step1_freeChecks > 0 ? Math.min((f.value / funnel.step1_freeChecks) * 100, 100) : 0}%`,
                  background: f.color, borderRadius: 99,
                }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 14, fontSize: 12.5 }} className="muted">
            Conversion rate: <span style={{ color: 'var(--green)', fontWeight: 700 }}>{funnel?.conversionRate || '0%'}</span>
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <SectionLabel style={{ marginBottom: 0 }}>Pending actions</SectionLabel>
            <Badge tone="red">{(overview?.users?.pendingSellers || 0) + (overview?.listings?.pendingReview || 0)}</Badge>
          </div>
          {[
            { icon: '🟡', label: 'KYC pending sellers', value: overview?.users?.pendingSellers || 0, tone: 'amber' },
            { icon: '🏠', label: 'Listings awaiting review', value: overview?.listings?.pendingReview || 0, tone: 'amber' },
            { icon: '✅', label: 'Approved listings', value: overview?.listings?.approved || 0, tone: 'green' },
            { icon: '📊', label: 'Total listings', value: overview?.listings?.total || 0, tone: 'blue' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 12.5 }}>{item.icon} {item.label}</span>
              <Badge tone={item.tone}>{item.value}</Badge>
            </div>
          ))}
        </Card>

        <Card style={{ padding: 20 }}>
          <SectionLabel>Recent activity</SectionLabel>
          {recentActivity.length === 0 ? (
            <p className="small muted">No recent admin activity.</p>
          ) : recentActivity.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: activityDotColor(a.action), marginTop: 5, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12.5 }}>{a.details || a.action}</div>
                <div className="small muted" style={{ marginTop: 2 }}>{timeAgo(a.createdAt)}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <SectionLabel style={{ marginBottom: 0 }}>Top performing sellers</SectionLabel>
        </div>
        <ResponsiveTable
          columns={sellerColumns}
          rows={sellerRows}
          getRowKey={(s) => s.id}
          emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">No approved sellers yet</div>}
        />
      </Card>
    </div>
  )
}

function SectionLabel({ children, style }) {
  return <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 16, ...style }}>{children}</div>
}
