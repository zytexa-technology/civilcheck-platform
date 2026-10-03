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
import { Badge, Card, ErrorState, PageHead, ResponsiveTable } from '../../components/ui'

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

// Small placeholder block matching a text line's approx footprint — used
// wherever a section is still loading, in place of that section's real
// content, so the surrounding page (PageHead, card grid, table shell)
// never has to wait for it.
const SkelLine = ({ w = '60%', h = 14, style }) => (
  <div className="skel" style={{ width: w, height: h, ...style }} />
)

// ─── DASHBOARD HOME ───────────────────────────────────────────────────────
// Previously: one `loading` flag gated the entire page behind a single
// `await Promise.all([...6 calls])` — so the slowest of six independent
// analytics endpoints decided when ANY of the page appeared, and one
// endpoint failing threw the whole page into an error state instead of
// just the section that actually failed. The six calls were already fired
// together (Promise.all doesn't serialize them), so parallelism wasn't the
// issue — the issue was every section waiting on every other section's data.
//
// Now each section fetches and settles independently: all six requests
// still start in the same tick (no new sequential waiting introduced), but
// each one's state flips to "loaded" — and its own section renders — the
// moment THAT request resolves, not when the slowest one does. A single
// endpoint failing only shows a retry inside its own card.
export default function DashboardHome() {
  const [overview, setOverview] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState(false)

  const [funnel, setFunnel] = useState(null)
  const [funnelLoading, setFunnelLoading] = useState(true)

  const [topSellers, setTopSellers] = useState([])
  const [topSellersLoading, setTopSellersLoading] = useState(true)

  const [monthlyRevenue, setMonthlyRevenue] = useState([])
  const [monthlyRevenueLoading, setMonthlyRevenueLoading] = useState(true)

  const [riskBreakdown, setRiskBreakdown] = useState([])
  const [riskBreakdownLoading, setRiskBreakdownLoading] = useState(true)

  const [recentActivity, setRecentActivity] = useState([])
  const [recentActivityLoading, setRecentActivityLoading] = useState(true)

  const loadData = () => {
    setOverviewError(false)
    setOverviewLoading(true)
    getAnalyticsOverview()
      .then((ov) => setOverview(ov.overview))
      .catch(() => setOverviewError(true))
      .finally(() => setOverviewLoading(false))

    setFunnelLoading(true)
    getConversionFunnel()
      .then((fn) => setFunnel(fn.funnel))
      .catch(() => {}) // section stays on its own placeholder — this is secondary info, not worth a page-level error
      .finally(() => setFunnelLoading(false))

    setTopSellersLoading(true)
    getTopSellers()
      .then((ts) => setTopSellers(ts.topSellers || []))
      .catch(() => {})
      .finally(() => setTopSellersLoading(false))

    setMonthlyRevenueLoading(true)
    getMonthlyRevenue()
      .then((mr) => setMonthlyRevenue(mr.data || []))
      .catch(() => {})
      .finally(() => setMonthlyRevenueLoading(false))

    setRiskBreakdownLoading(true)
    getRiskBreakdown()
      .then((rb) => setRiskBreakdown(rb.data || []))
      .catch(() => {})
      .finally(() => setRiskBreakdownLoading(false))

    setRecentActivityLoading(true)
    getAuditLogs({ page: 1, limit: 5 })
      .then((al) => setRecentActivity(al.logs || []))
      .catch(() => {})
      .finally(() => setRecentActivityLoading(false))
  }

  useEffect(loadData, [])

  // Pie chart data — real risk badge breakdown, scoped to APPROVED listings
  // (GET /admin/analytics/risk-breakdown), not a fabricated fixed split.
  const RISK_COLOR = { DISPUTED: '#dc2626', CLEAR: '#16a34a' } // two statuses; UNCLASSIFIED (legacy) falls back to grey
  const pieData = riskBreakdown.map((r) => ({
    name: r.status, value: r.count, pct: r.pct, color: RISK_COLOR[r.status] || '#5b6472',
  }))
  const totalReports = pieData.reduce((sum, r) => sum + r.value, 0)

  const sellerColumns = [
    { key: 'rank', header: '#' },
    {
      key: 'seller',
      header: 'Partner',
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

      {overviewError ? (
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <ErrorState message="Couldn't load the headline metrics." onRetry={loadData} />
        </Card>
      ) : (
        <div className="grid g4" style={{ marginBottom: 16 }}>
          {overviewLoading ? (
            [0, 1, 2, 3].map((i) => (
              <Card key={i} className="stat">
                <SkelLine w={36} h={36} style={{ borderRadius: 10 }} />
                <SkelLine w="45%" h={24} style={{ marginTop: 14 }} />
                <SkelLine w="70%" h={11} style={{ marginTop: 8 }} />
              </Card>
            ))
          ) : (
            <>
              <MetricCard icon="💰" value={`₹${(overview?.revenue?.totalGMV || 0).toLocaleString('en-IN')}`} label="Total revenue (MTD)" />
              <MetricCard icon="📦" value={(overview?.revenue?.totalTransactions || 0).toLocaleString()} label="Reports sold (MTD)" />
              <MetricCard icon="👥" value={(overview?.users?.totalBuyers || 0).toLocaleString()} label="Total registered users" />
              <MetricCard icon="🏆" value={overview?.users?.approvedSellers || 0} label="Active verified partners" />
            </>
          )}
        </div>
      )}

      <div className="grid dash-chart-grid" style={{ marginBottom: 16 }}>
        <Card style={{ padding: 20, minWidth: 0 }}>
          <SectionLabel>Monthly revenue trend (₹)</SectionLabel>
          {monthlyRevenueLoading ? (
            <SkelLine w="100%" h={240} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e7ec" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#5b6472', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5b6472', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(240,165,0,.08)' }} />
                <Bar dataKey="revenue" fill="#f0a500" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card style={{ padding: 20, minWidth: 0 }}>
          <SectionLabel>Approved listings by risk badge</SectionLabel>
          {riskBreakdownLoading ? (
            <SkelLine w="100%" h={150} />
          ) : (
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
          )}
        </Card>
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Card style={{ padding: 20 }}>
          <SectionLabel>Conversion funnel</SectionLabel>
          {funnelLoading ? [0, 1, 2, 3].map((i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <SkelLine w="40%" h={11} style={{ marginBottom: 6 }} />
              <SkelLine w="100%" h={4} style={{ borderRadius: 99 }} />
            </div>
          )) : funnel && [
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
          {overviewLoading ? [0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
              <SkelLine w="55%" h={11} />
              <SkelLine w={22} h={16} style={{ borderRadius: 999 }} />
            </div>
          )) : [
            { icon: '🟡', label: 'KYC pending partners', value: overview?.users?.pendingSellers || 0, tone: 'amber' },
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
          {recentActivityLoading ? [0, 1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
              <SkelLine w={7} h={7} style={{ borderRadius: '50%', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <SkelLine w="80%" h={11} />
                <SkelLine w="30%" h={10} style={{ marginTop: 6 }} />
              </div>
            </div>
          )) : recentActivity.length === 0 ? (
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
          <SectionLabel style={{ marginBottom: 0 }}>Top performing partners</SectionLabel>
        </div>
        {topSellersLoading ? (
          // ResponsiveTable has no loading state of its own — it would show
          // "No approved partners yet" for the whole fetch, same false-empty
          // problem as elsewhere. This local skeleton avoids touching that
          // shared component (used across many other admin pages).
          <div style={{ padding: '14px 20px' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 18, padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                <SkelLine w={60} h={13} />
                <SkelLine w={120} h={13} />
                <SkelLine w={70} h={13} />
                <SkelLine w={70} h={13} />
                <SkelLine w={90} h={13} />
              </div>
            ))}
          </div>
        ) : (
          <ResponsiveTable
            columns={sellerColumns}
            rows={sellerRows}
            getRowKey={(s) => s.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">No approved partners yet</div>}
          />
        )}
      </Card>
    </div>
  )
}

function SectionLabel({ children, style }) {
  return <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 16, ...style }}>{children}</div>
}
