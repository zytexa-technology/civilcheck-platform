// ─────────────────────────────────────────────────────────────────────────
//  expert/Ratings.jsx  —  Ratings & Reviews   (REAL /seller/profile + /seller/reviews)
//  File #20 of the redesign.  RAKHNA: src/pages/expert/Ratings.jsx
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getMyReviews } from '../../api/seller.api'
import { Card, PageHead } from '../../components/ui'

export default function ExpertRatings() {
  const { seller } = useAuth()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    getMyReviews({ limit: 100 })
      .then((data) => { if (live) setReviews(data?.reviews || []) })
      .catch(() => { if (live) setError(true) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  const avgRating = seller?.avgRating ?? null
  const reviewCount = seller?.reviewCount ?? 0

  const breakdown = [5, 4, 3, 2, 1].map((stars) => [
    `${stars}★`,
    reviews.filter((r) => r.rating === stars).length,
  ])
  const max = Math.max(1, ...breakdown.map(([, count]) => count))

  return (
    <>
      <PageHead title="Ratings & Reviews" subtitle="Buyers ka feedback." />

      {/* Summary */}
      <Card style={{ padding: 24, display: 'flex', gap: 24, alignItems: 'center', marginBottom: 20, maxWidth: 520 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 48, fontWeight: 800, lineHeight: 1 }}>
            {avgRating !== null ? avgRating.toFixed(1) : '—'}
          </div>
          <div style={{ color: 'var(--seal)' }}>{'★'.repeat(Math.round(avgRating || 0)).padEnd(5, '☆')}</div>
          <div className="xs muted">{reviewCount} review{reviewCount === 1 ? '' : 's'}</div>
        </div>
        <div style={{ flex: 1 }}>
          {breakdown.map(([label, count]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="xs muted" style={{ width: 24 }}>{label}</span>
              <div style={{ flex: 1, height: 7, background: 'var(--paper-2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: (count / max * 100) + '%', background: 'var(--seal)' }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Reviews */}
      <Card>
        {loading && <p className="muted dev" style={{ padding: 16 }}>Loading reviews…</p>}
        {!loading && error && <p className="muted dev" style={{ padding: 16 }}>Reviews load nahi hue.</p>}
        {!loading && !error && reviews.length === 0 && (
          <p className="muted dev" style={{ padding: 16 }}>Abhi koi review nahi mila.</p>
        )}
        {reviews.map((r) => (
          <div key={r.id} className="li">
            <div className="avatar">{r.reviewerName[0]}</div>
            <div className="tx">
              <b>{r.reviewerName} <span style={{ color: 'var(--seal)' }}>{'★'.repeat(r.rating)}</span></b>
              {r.comment && <p className="dev">{r.comment}</p>}
            </div>
          </div>
        ))}
      </Card>
    </>
  )
}
