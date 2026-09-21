import { useState, useEffect } from 'react'
import {
  getAnalyticsOverview,
  getConversionFunnel,
  getTopSellers,
  getTopCities,
  getSubscriptionAnalytics,
} from '../../api/admin.api'

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────
const Badge = ({ children, color }) => {
  // Pale tinted chip backgrounds need dark, saturated text for contrast —
  // the original bright text colors were tuned for a dark chip background.
  const colors = {
    green:  { bg: 'rgba(34,197,94,.15)',  text: '#15803d' },
    gold:   { bg: 'rgba(234,179,8,.15)',  text: '#a16207' },
    blue:   { bg: 'rgba(59,130,246,.15)', text: '#1d4ed8' },
    amber:  { bg: 'rgba(249,115,22,.15)', text: '#c2410c' },
    gray:   { bg: 'rgba(107,114,128,.15)',text: '#374151' },
  }
  const c = colors[color] || colors.gray
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>
      {children}
    </span>
  )
}

const StatCard = ({ icon, label, value, color = '#12141c', sub }) => (
  <div style={s.card}>
    <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 26, fontWeight: 800, color }}>{value}</div>
    <div style={{ color: '#5b6472', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 4 }}>{label}</div>
    {sub && <div style={{ fontSize: 12, color: '#5b6472', marginTop: 6 }}>{sub}</div>}
  </div>
)

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────
const ProgressBar = ({ label, value, total, color }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: '#12141c' }}>{label}</span>
        <span style={{ color: '#5b6472' }}>
          {value.toLocaleString()} <span style={{ color }}> ({pct}%)</span>
        </span>
      </div>
      <div style={{ height: 5, background: '#e4e7ec', borderRadius: 99 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .8s ease' }} />
      </div>
    </div>
  )
}

// ─── MAIN ANALYTICS PAGE ──────────────────────────────────────────────────
export default function Analytics() {
  const [overview, setOverview]     = useState(null)
  const [funnel, setFunnel]         = useState(null)
  const [topSellers, setTopSellers] = useState([])
  const [topCities, setTopCities]   = useState([])
  const [subs, setSubs]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [ov, fn, ts, tc, sa] = await Promise.all([
        getAnalyticsOverview(),
        getConversionFunnel(),
        getTopSellers(),
        getTopCities(),
        getSubscriptionAnalytics(),
      ])
      setOverview(ov.overview)
      setFunnel(fn.funnel)
      setTopSellers(ts.topSellers || [])
      setTopCities(tc.topCities || [])
      setSubs(sa.subscriptions)
    } catch {
      setError('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#5b6472', fontSize: 14 }}>
      ⏳ Loading analytics...
    </div>
  )

  if (error) return (
    <div style={{ background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.25)', borderRadius: 10, padding: 20, color: '#b91c1c', fontSize: 14 }}>
      ❌ {error}
      <button onClick={loadData} style={{ marginLeft: 12, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer' }}>
        Retry →
      </button>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={s.pageTitle}>Analytics</h1>
        <p style={s.pageSub}>Platform performance, conversion funnel & top performers</p>
      </div>

      {/* ── Top Stats ── */}
      <div className="grid g4" style={{ marginBottom: 24 }}>
        <StatCard icon="💰" label="Total GMV"
          value={`₹${(overview?.revenue?.totalGMV || 0).toLocaleString('en-IN')}`}
          color="#b45309"
          sub="Gross Merchandise Value"
        />
        <StatCard icon="🏦" label="Platform Revenue (40%)"
          value={`₹${(overview?.revenue?.platformRevenue || 0).toLocaleString('en-IN')}`}
          color="#15803d"
          sub="After partner commission"
        />
        <StatCard icon="📦" label="Total Transactions"
          value={overview?.revenue?.totalTransactions || 0}
          color="#1d4ed8"
          sub="Reports sold all time"
        />
        <StatCard icon="👥" label="Total Users"
          value={(overview?.users?.totalBuyers || 0) + (overview?.users?.totalSellers || 0)}
          color="#6d28d9"
          sub={`${overview?.users?.totalBuyers || 0} users · ${overview?.users?.totalSellers || 0} partners`}
        />
      </div>

      {/* ── Row 2: Users + Listings ── */}
      <div className="grid g2" style={{ marginBottom: 16 }}>

        {/* Users Breakdown */}
        <div style={s.card}>
          <div style={s.cardTitle}>Users Breakdown</div>
          {[
            { label: 'Total Users',       value: overview?.users?.totalBuyers || 0,     total: (overview?.users?.totalBuyers || 0) + (overview?.users?.totalSellers || 0), color: '#1d4ed8' },
            { label: 'Approved Partners', value: overview?.users?.approvedSellers || 0, total: overview?.users?.totalSellers || 1, color: '#15803d' },
            { label: 'Pending KYC',       value: overview?.users?.pendingSellers || 0,  total: overview?.users?.totalSellers || 1, color: '#c2410c' },
          ].map(item => (
            <ProgressBar key={item.label} {...item} />
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={s.miniStat}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8' }}>{overview?.users?.totalBuyers || 0}</div>
              <div style={{ fontSize: 11, color: '#5b6472' }}>Users</div>
            </div>
            <div style={s.miniStat}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d' }}>{overview?.users?.approvedSellers || 0}</div>
              <div style={{ fontSize: 11, color: '#5b6472' }}>Active Partners</div>
            </div>
            <div style={s.miniStat}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#c2410c' }}>{overview?.users?.pendingSellers || 0}</div>
              <div style={{ fontSize: 11, color: '#5b6472' }}>Pending KYC</div>
            </div>
          </div>
        </div>

        {/* Listings Breakdown */}
        <div style={s.card}>
          <div style={s.cardTitle}>Listings Breakdown</div>
          {[
            { label: 'Approved Listings', value: overview?.listings?.approved || 0,      total: overview?.listings?.total || 1, color: '#15803d' },
            { label: 'Pending Review',    value: overview?.listings?.pendingReview || 0, total: overview?.listings?.total || 1, color: '#c2410c' },
          ].map(item => (
            <ProgressBar key={item.label} {...item} />
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            {[
              { val: overview?.listings?.total || 0,         label: 'Total',   color: '#12141c' },
              { val: overview?.listings?.approved || 0,      label: 'Live',    color: '#15803d' },
              { val: overview?.listings?.pendingReview || 0, label: 'Pending', color: '#c2410c' },
            ].map(stat => (
              <div key={stat.label} style={s.miniStat}>
                <div style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.val}</div>
                <div style={{ fontSize: 11, color: '#5b6472' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Conversion Funnel ── */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={s.cardTitle}>
          Conversion Funnel
          <Badge color="blue">{funnel?.conversionRate || '0%'} conversion</Badge>
        </div>
        <div className="grid g3" style={{ marginBottom: 20 }}>
          {[
            { icon: '🔍', label: 'Free Case Checks',     value: funnel?.step1_freeChecks || 0,          color: '#1d4ed8' },
            { icon: '💳', label: 'Paid Report Unlocks',  value: funnel?.step2_paidUnlocks || 0,         color: '#15803d' },
            { icon: '🔔', label: 'Alert Subscriptions',  value: funnel?.step3_alertSubscriptions || 0,  color: '#6d28d9' },
          ].map(f => (
            <div key={f.label} style={{ background: '#f5f6f8', border: '1px solid #e4e7ec', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{f.icon}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 22, fontWeight: 800, color: f.color }}>{f.value.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: '#5b6472', marginTop: 4 }}>{f.label}</div>
            </div>
          ))}
        </div>

        {/* Funnel Visual */}
        {[
          { label: 'Step 1 — Free Case Check', value: funnel?.step1_freeChecks || 0,         pct: 100, color: '#1d4ed8' },
          { label: 'Step 2 — Paid Unlock',      value: funnel?.step2_paidUnlocks || 0,        pct: funnel?.step1_freeChecks > 0 ? Math.round((funnel.step2_paidUnlocks / funnel.step1_freeChecks) * 100) : 0, color: '#15803d' },
          { label: 'Step 3 — Alert Subscribe',  value: funnel?.step3_alertSubscriptions || 0, pct: funnel?.step1_freeChecks > 0 ? Math.round((funnel.step3_alertSubscriptions / funnel.step1_freeChecks) * 100) : 0, color: '#6d28d9' },
        ].map(f => (
          <ProgressBar key={f.label} label={f.label} value={f.value} total={funnel?.step1_freeChecks || 1} color={f.color} />
        ))}
      </div>

      {/* ── Top Sellers + Top Cities ── */}
      <div className="grid g2">

        {/* Top Sellers */}
        <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e4e7ec', ...s.cardTitle }}>
            Top Partners by Earnings
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f6f8' }}>
                  {['#', 'Partner', 'Badge', 'Earnings', 'Accuracy'].map(h => (
                    <th key={h} style={{ ...s.th, padding: '9px 14px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topSellers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#5b6472', fontSize: 12 }}>
                      No sellers yet
                    </td>
                  </tr>
                ) : topSellers.map((seller, i) => (
                  <tr key={seller.id}
                    style={{ borderTop: '1px solid #e4e7ec' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,24,40,.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ ...s.td, padding: '10px 14px', color: '#5b6472', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ ...s.td, padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{seller.name}</div>
                      <div style={{ fontSize: 11, color: '#5b6472' }}>{seller.profession}</div>
                    </td>
                    <td style={{ ...s.td, padding: '10px 14px' }}>
                      <Badge color={seller.badge === 'PLATINUM' || seller.badge === 'GOLD' ? 'gold' : seller.badge === 'SILVER' ? 'blue' : 'gray'}>
                        {seller.badge}
                      </Badge>
                    </td>
                    <td style={{ ...s.td, padding: '10px 14px', color: '#15803d', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      ₹{(seller.totalEarnings || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ ...s.td, padding: '10px 14px' }}>
                      <span style={{ color: seller.accuracyScore >= 95 ? '#15803d' : seller.accuracyScore >= 90 ? '#b45309' : '#b91c1c', fontWeight: 600 }}>
                        {seller.accuracyScore}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Cities */}
        <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e4e7ec', ...s.cardTitle }}>
            Top Cities by Activity
          </div>
          {topCities.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#5b6472', fontSize: 13 }}>
              No city data yet
            </div>
          ) : (
            <div style={{ padding: '12px 18px' }}>
              {topCities.map((city, i) => {
                const maxListings = topCities[0]?.totalListings || 1
                const pct = Math.round((city.totalListings / maxListings) * 100)
                return (
                  <div key={city.city} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                      <span style={{ fontWeight: 500 }}>
                        <span style={{ color: '#5b6472', marginRight: 8 }}>#{i + 1}</span>
                        {city.city}
                      </span>
                      <span style={{ color: '#5b6472' }}>
                        {city.totalListings} listings · {(city.totalViews || 0).toLocaleString()} views
                      </span>
                    </div>
                    <div style={{ height: 4, background: '#e4e7ec', borderRadius: 99 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#1d4ed8', borderRadius: 99, transition: 'width .8s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Alert Subscriptions (PDF 5.6) — had no UI at all before this ── */}
      <div style={{ ...s.card, marginTop: 20 }}>
        <div style={s.cardTitle}>Alert Subscriptions</div>
        {!subs ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#5b6472', fontSize: 13 }}>No data available</div>
        ) : (
          <>
            <div className="grid g5" style={{ marginTop: 14 }}>
              <MiniStat label="Active" value={subs.activeSubscriptions} color="#15803d" />
              <MiniStat label="Inactive" value={subs.inactiveSubscriptions} color="#374151" />
              <MiniStat label="Unique Subscribers" value={subs.uniqueActiveSubscribers} color="#1d4ed8" />
              <MiniStat label="New This Month" value={subs.newThisMonth} color="#6d28d9"
                sub={subs.monthOverMonthGrowthPct == null ? undefined : `${subs.monthOverMonthGrowthPct > 0 ? '+' : ''}${subs.monthOverMonthGrowthPct}% MoM`} />
              <MiniStat label="Churn Rate (this month)" value={subs.subscriberChurnRate == null ? '—' : `${subs.subscriberChurnRate}%`} color="#b91c1c" />
            </div>
            {subs.monthlyRenewalRate == null && (
              <div style={{ marginTop: 14, fontSize: 12, color: '#5b6472' }} title={subs.pendingMetricsNote}>
                ℹ️ Monthly renewal rate: — ({subs.pendingMetricsNote})
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const MiniStat = ({ label, value, color, sub }) => (
  <div style={s.miniStat}>
    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 22, fontWeight: 800, color }}>{value}</div>
    <div style={{ color: '#5b6472', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.3px', marginTop: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: '#5b6472', marginTop: 3 }}>{sub}</div>}
  </div>
)

// ─── STYLES ───────────────────────────────────────────────────────────────
const s = {
  pageTitle: { fontFamily: "'Poppins',sans-serif", fontSize: 22, fontWeight: 800 },
  pageSub: { color: '#5b6472', fontSize: 13, marginTop: 4 },
  card: {
    background: '#ffffff',
    border: '1px solid #e4e7ec',
    borderRadius: 12,
    padding: 20,
  },
  cardTitle: {
    fontFamily: "'Poppins',sans-serif",
    fontSize: 14, fontWeight: 700,
    marginBottom: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  miniStat: {
    background: '#f5f6f8', border: '1px solid #e4e7ec',
    borderRadius: 8, padding: '10px 14px', flex: 1, textAlign: 'center',
  },
  th: {
    textAlign: 'left', padding: '10px 16px',
    color: '#5b6472', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '.5px',
    fontWeight: 600, borderBottom: '1px solid #e4e7ec',
    whiteSpace: 'nowrap',
  },
  td: { padding: '12px 16px', verticalAlign: 'middle' },
}