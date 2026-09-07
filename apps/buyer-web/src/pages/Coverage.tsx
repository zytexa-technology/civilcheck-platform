import { useEffect, useState } from 'react'
import { getCoverage } from '../api/content.api'
import { Card } from '../components/Card'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { errorMessage } from '../lib/errors'
import type { CoverageArea } from '../types/api'

export default function Coverage() {
  const [areas, setAreas] = useState<CoverageArea[] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    // Deferred a microtask so this synchronous reset doesn't run inside the
    // useEffect below (React disallows synchronous setState in an effect).
    queueMicrotask(() => {
      setError('')
      setAreas(null)
    })
    getCoverage()
      .then((res) => setAreas(res.coverage))
      .catch((err) => setError(errorMessage(err, "Couldn't load coverage areas.")))
  }

  useEffect(load, [])

  return (
    <div className="container page">
      <h1 className="h2" style={{ marginBottom: 8 }}>
        Where CivilCheck operates
      </h1>
      <p className="muted" style={{ marginBottom: 28, maxWidth: 560 }}>
        These are the states, cities, and tehsils our verified professionals currently cover. Don't
        see your area? You can still submit a custom research request.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : areas === null ? (
        <LoadingState label="Loading coverage areas…" />
      ) : areas.length === 0 ? (
        <EmptyState icon="🗺️" title="Coverage areas coming soon" />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {areas.map((area) => (
            <Card key={`${area.state}-${area.city}`}>
              <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{area.city}</h3>
              <p className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
                {area.state}
              </p>
              <div className="chip-group">
                {area.tehsils.map((tehsil) => (
                  <span key={tehsil} className="pill pill--muted">
                    {tehsil}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
