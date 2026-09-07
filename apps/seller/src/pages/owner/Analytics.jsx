// ─────────────────────────────────────────────────────────────────────────
//  owner/Analytics.jsx  —  listings performance  (REAL /seller/properties)
//  RAKHNA: src/pages/owner/Analytics.jsx  (replace)
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { getMyProperties } from '../../api/seller.api'
import { Card, StatCard, PageHead } from '../../components/ui'
import { propertyFromApi } from './Dashboard'

export default function OwnerAnalytics() {
  const [props, setProps] = useState([])
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let live = true
    getMyProperties()
      .then((data) => { if (live) setProps((data?.properties || []).map(propertyFromApi)) })
      .catch(() => { if (live) setLoadError(true) })
    return () => { live = false }
  }, [])

  const active = props.filter((p) => p.status !== 'deleted')
  const totalViews = active.reduce((a, p) => a + (p.views || 0), 0)
  const verifiedBadges = active.filter((p) => p.status === 'approved').length

  return (
    <>
      <PageHead title="Analytics" subtitle="Aapki listings ki performance." />

      {loadError && (
        <Card style={{ padding: '14px 18px', marginBottom: 16, borderColor: 'var(--danger)' }}>
          <p className="small dev" style={{ color: 'var(--danger)' }}>Analytics load nahi hui.</p>
        </Card>
      )}

      {/* Property has no buyer-facing exposure yet (buyer search only queries
          Listing), so there is no real "preview unlocks" metric to show here. */}
      <div className="grid g2" style={{ marginBottom: 20 }}>
        <StatCard icon="chart" color="#2b5c8f" value={totalViews} label="Total Views" trend="▲ 8%" />
        <StatCard icon="props" color="#137a56" value={verifiedBadges} label="Verified Badges" />
      </div>

      <Card style={{ padding: 22 }}>
        <h3 className="dev" style={{ fontSize: 16, marginBottom: 16 }}>Views by Property</h3>
        {active.length === 0 && <p className="muted dev">Abhi koi property nahi.</p>}
        {active.map((p) => {
          const pct = Math.min(100, Math.round((p.views || 0) / 3))
          return (
            <div key={p.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <b className="dev">{p.title}</b>
                <span className="muted">{p.views} views</span>
              </div>
              <div style={{ height: 9, background: 'var(--paper-2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', background: 'linear-gradient(90deg,var(--seal),var(--seal-2))' }} />
              </div>
            </div>
          )
        })}
      </Card>
    </>
  )
}