import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMyPurchases } from '../../api/purchase.api'
import { Badge } from '../../components/Badge'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatRupees, riskTone } from '../../lib/format'
import type { PurchaseWithListing } from '../../types/api'

export default function MyReports() {
  const [purchases, setPurchases] = useState<PurchaseWithListing[] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    queueMicrotask(() => {
      setError('')
      setPurchases(null)
    })
    getMyPurchases()
      .then((res) => setPurchases(res.purchases))
      .catch((err) => setError(errorMessage(err, "Couldn't load your reports.")))
  }

  useEffect(load, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (purchases === null) return <LoadingState label="Loading your reports…" />

  const highRisk = purchases.filter((p) => p.listing.riskBadge === 'RED').length
  const totalSpent = purchases.reduce((sum, p) => sum + p.amountPaid, 0)

  return (
    <div>
      <h1 className="h2" style={{ marginBottom: 20 }}>
        My reports
      </h1>

      {purchases.length > 0 ? (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
          <StatTile label="Reports unlocked" value={purchases.length} />
          <StatTile label="Total spent" value={formatRupees(totalSpent)} />
          <StatTile label="High risk found" value={highRisk} color="var(--cc-red)" />
        </div>
      ) : null}

      {purchases.length === 0 ? (
        <EmptyState icon="📄" title="No reports unlocked yet" description="Search a property and unlock its full report to see it here." />
      ) : (
        <div className="stack">
          {purchases.map((p) => {
            const tone = riskTone(p.listing.riskBadge)
            return (
              <Link key={p.id} to={`/reports/${p.listingId}`} className="card" style={{ display: 'block' }}>
                <div className="spread">
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.listing.address}</span>
                  <Badge tone={tone} />
                </div>
                <div className="spread" style={{ marginTop: 8 }}>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {p.listing.city} · Unlocked {formatDate(p.createdAt)}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--cc-gold)', fontSize: 13 }}>
                    {formatRupees(p.amountPaid)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? 'var(--cc-gold)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}
