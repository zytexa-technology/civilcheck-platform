import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { searchProperties } from '../api/property.api'
import { PropertyCard } from '../components/PropertyCard'
import { Button } from '../components/Button'
import { Input } from '../components/Field'
import { CardSkeleton, EmptyState, ErrorState } from '../components/States'
import { errorMessage } from '../lib/errors'
import type { FreePreviewProperty, RiskBadge } from '../types/api'

const RISK_BADGES: { value: RiskBadge | ''; label: string }[] = [
  { value: '', label: 'Any risk' },
  { value: 'GREEN', label: '🟢 Low / Clear' },
  { value: 'AMBER', label: '🟡 Medium / Caution' },
  { value: 'RED', label: '🔴 High / Risk' },
]

// Properties/Listing rows are only ever created by a KYC-approved Expert
// (route-level gate — see apps/api/src/routes/listing.routes.ts's
// expertOnly), so /api/properties/search is already exactly "Expert
// Properties" — no backend filter is needed to exclude Owner/Reporter
// content, it structurally cannot appear here.
export default function ExpertProperties() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const city = params.get('city') ?? ''
  const riskBadge = (params.get('risk') as RiskBadge | null) ?? ''

  const [queryInput, setQueryInput] = useState(query)
  const [cityInput, setCityInput] = useState(city)

  const [results, setResults] = useState<FreePreviewProperty[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runSearch = (targetPage: number, replace: boolean) => {
    queueMicrotask(() => {
      setLoading(true)
      setError('')
    })
    searchProperties({
      query: query || undefined,
      city: city || undefined,
      riskBadge: riskBadge || undefined,
      page: targetPage,
      limit: 12,
    })
      .then((res) => {
        setResults((prev) => (replace || !prev ? res.results : [...prev, ...res.results]))
        setPage(res.page)
        setTotalPages(res.totalPages)
        setTotal(res.total)
      })
      .catch((err) => setError(errorMessage(err, 'Search failed. Please try again.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    runSearch(1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, city, riskBadge])

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParam('q', queryInput.trim())
    updateParam('city', cityInput.trim())
  }

  return (
    <div className="container page">
      <h1 className="h2" style={{ marginBottom: 6 }}>
        Expert Properties
      </h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Professionally researched reports from CivilCheck's verified Experts — each with a risk
        assessment. A risk indicator is information, not a substitute for requesting professional
        verification.
      </p>

      <form onSubmit={handleSubmit} className="row" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        <Input
          aria-label="Search"
          placeholder="Address, khasra, survey number…"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          style={{ minWidth: 240, flex: 2 }}
        />
        <Input
          aria-label="City"
          placeholder="City"
          value={cityInput}
          onChange={(e) => setCityInput(e.target.value)}
          style={{ minWidth: 160, flex: 1 }}
        />
        <Button type="submit">Search</Button>
      </form>

      <div className="chip-group" style={{ marginBottom: 24 }}>
        {RISK_BADGES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="chip"
            aria-pressed={riskBadge === opt.value}
            onClick={() => updateParam('risk', opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {results !== null ? (
        <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
          {total} propert{total === 1 ? 'y' : 'ies'} found
        </p>
      ) : null}

      {error ? (
        <ErrorState message={error} onRetry={() => runSearch(1, true)} />
      ) : results === null ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState icon="🔍" title="No Expert properties match your search" description="Try a different address, city, or risk filter." />
      ) : (
        <>
          <div className="grid">
            {results.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
          {page < totalPages ? (
            <div className="center" style={{ marginTop: 28 }}>
              <Button variant="secondary" loading={loading} onClick={() => runSearch(page + 1, false)}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
