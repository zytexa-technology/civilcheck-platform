import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { searchOwnerProperties } from '../api/ownerProperty.api'
import { OwnerPropertyCard } from '../components/PropertyCard'
import { Button } from '../components/Button'
import { Input } from '../components/Field'
import { CardSkeleton, EmptyState, ErrorState } from '../components/States'
import { errorMessage } from '../lib/errors'
import type { OwnerProperty } from '../types/api'

export default function OwnerProperties() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const [queryInput, setQueryInput] = useState(query)

  const [results, setResults] = useState<OwnerProperty[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = (targetPage: number, replace: boolean) => {
    queueMicrotask(() => {
      setLoading(true)
      setError('')
    })
    searchOwnerProperties({ query: query || undefined, page: targetPage, limit: 12 })
      .then((res) => {
        setResults((prev) => (replace || !prev ? res.results : [...prev, ...res.results]))
        setPage(res.page)
        setTotalPages(res.totalPages)
        setTotal(res.total)
      })
      .catch((err) => setError(errorMessage(err, 'Search failed.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    run(1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <div className="container page">
      <h1 className="h2">Owner listings</h1>
      <p className="muted" style={{ marginTop: 8, marginBottom: 20, maxWidth: 600 }}>
        Free to view — properties published directly by owners, moderated by CivilCheck before
        going live. This is a separate, free surface from the paid expert reports, and is not an
        independent CivilCheck verification of the property.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const next = new URLSearchParams(params)
          if (queryInput.trim()) next.set('q', queryInput.trim())
          else next.delete('q')
          setParams(next, { replace: true })
        }}
        className="row"
        style={{ marginBottom: 24 }}
      >
        <Input
          aria-label="Search owner listings"
          placeholder="Title, city…"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          style={{ flex: 1, maxWidth: 400 }}
        />
        <Button type="submit">Search</Button>
      </form>

      {total ? (
        <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
          {total} listing{total === 1 ? '' : 's'}
        </p>
      ) : null}

      {error ? (
        <ErrorState message={error} onRetry={() => run(1, true)} />
      ) : results === null ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState icon="🏠" title="No listings found" description="Try a different search term." />
      ) : (
        <>
          <div className="grid">
            {results.map((p) => (
              <OwnerPropertyCard key={p.id} property={p} />
            ))}
          </div>
          {page < totalPages ? (
            <div className="center" style={{ marginTop: 28 }}>
              <Button variant="secondary" loading={loading} onClick={() => run(page + 1, false)}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
