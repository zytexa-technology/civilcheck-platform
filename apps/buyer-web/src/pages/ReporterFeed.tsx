import { useEffect, useState } from 'react'
import { getReporterFeed } from '../api/reporterPost.api'
import { ReporterPostCard } from '../components/PropertyCard'
import { Button } from '../components/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { errorMessage } from '../lib/errors'
import type { ReporterPost } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Property Updates — a scrolling feed of property information/news Reporters
// have sourced (newspaper cuttings, public notices, etc). Deliberately
// distinct from the Owner listings / paid reports pages: no price, no
// filters beyond city, no "Verified" language anywhere on this page.
// ─────────────────────────────────────────────────────────────────────────────
export default function ReporterFeed() {
  const [posts, setPosts] = useState<ReporterPost[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = (targetPage: number, replace: boolean) => {
    queueMicrotask(() => {
      setLoading(true)
      setError('')
    })
    getReporterFeed({ page: targetPage, limit: 10 })
      .then((res) => {
        setPosts((prev) => (replace || !prev ? res.posts : [...prev, ...res.posts]))
        setPage(res.page)
        setTotalPages(res.totalPages)
      })
      .catch((err) => setError(errorMessage(err, 'Could not load the feed.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    run(1, true)
  }, [])

  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <h1 className="h2">Property Updates</h1>
      <p className="muted" style={{ marginTop: 8, marginBottom: 20 }}>
        Property information sourced by CivilCheck Reporters — newspaper cuttings, public notices
        and other publicly available material. This is informational content, not a property
        listing, and is not independently verified by CivilCheck.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={() => run(1, true)} />
      ) : posts === null ? (
        <LoadingState label="Loading feed…" />
      ) : posts.length === 0 ? (
        <EmptyState icon="📰" title="No posts yet" description="Reporter updates will appear here." />
      ) : (
        <>
          {posts.map((post) => (
            <ReporterPostCard key={post.id} post={post} />
          ))}
          {page < totalPages ? (
            <div className="center" style={{ marginTop: 12, marginBottom: 28 }}>
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
