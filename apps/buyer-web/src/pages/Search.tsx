import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { searchProperties } from '../api/property.api'
import { PropertyCard } from '../components/PropertyCard'
import { Button } from '../components/Button'
import { Input } from '../components/Field'
import { CardSkeleton, EmptyState, ErrorState } from '../components/States'
import { errorMessage } from '../lib/errors'
import type { FreePreviewProperty, PropertyType, RiskBadge } from '../types/api'

const PROPERTY_TYPES: { value: PropertyType | ''; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'AGRICULTURAL', label: 'Agricultural' },
  { value: 'PLOT', label: 'Plot' },
]

const RISK_BADGES: { value: RiskBadge | ''; label: string }[] = [
  { value: '', label: 'Any risk' },
  { value: 'GREEN', label: '🟢 Clear' },
  { value: 'AMBER', label: '🟡 Caution' },
  { value: 'RED', label: '🔴 Risk' },
]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const city = params.get('city') ?? ''
  const propertyType = (params.get('type') as PropertyType | null) ?? ''
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
      propertyType: propertyType || undefined,
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
  }, [query, city, propertyType, riskBadge])

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
      <h1 className="h2" style={{ marginBottom: 20 }}>
        Browse property reports
      </h1>

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

      <div className="row" style={{ marginBottom: 24, flexWrap: 'wrap', gap: 20 }}>
        <div className="chip-group">
          {PROPERTY_TYPES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="chip"
              aria-pressed={propertyType === opt.value}
              onClick={() => updateParam('type', opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="chip-group">
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
      </div>

      {results !== null ? (
        <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
          {total} report{total === 1 ? '' : 's'} found
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
        <EmptyState icon="🔍" title="No reports match your search" description="Try a different address, city, or filter." />
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
