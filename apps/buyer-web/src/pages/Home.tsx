import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFeed } from '../api/property.api'
import { freeCaseCheck } from '../api/property.api'
import { getBanners } from '../api/content.api'
import { FeedCard } from '../components/FeedCard'
import { CardSkeleton, ErrorState, InlineNotice } from '../components/States'
import { Button } from '../components/Button'
import { Input } from '../components/Field'
import { errorMessage } from '../lib/errors'
import type { Banner, FeedItem, FeedSourceFilter } from '../types/api'

const FILTERS: { label: string; value: FeedSourceFilter[] | undefined }[] = [
  { label: 'All', value: ['EXPERT', 'OWNER', 'REPORTER'] },
  { label: 'Expert', value: ['EXPERT'] },
  { label: 'Owner', value: ['OWNER'] },
  { label: 'Reporter', value: ['REPORTER'] },
]

const PAGE_SIZE = 20

// Home is the main scrolling property discovery feed (Buyer Experience
// redesign) — Expert/Owner/Reporter content merged, each card carrying its
// own "posted by" attribution. Publicly browsable with no login required;
// only Like/Comment/Save gate on an account (see FeedCard/AuthRequiredModal).
export default function Home() {
  const navigate = useNavigate()
  const [banners, setBanners] = useState<Banner[]>([])
  const [filter, setFilter] = useState(0)
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [checkValue, setCheckValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkNotice, setCheckNotice] = useState('')

  const loadFeed = (append: boolean) => {
    const nextLimit = append ? (items?.length ?? 0) + PAGE_SIZE : PAGE_SIZE
    if (append) setLoadingMore(true)
    getFeed({ sources: FILTERS[filter]?.value, limit: nextLimit })
      .then((res) => {
        setItems(res.results)
        setHasMore(res.results.length === nextLimit && res.results.length > 0)
        setLoadError('')
      })
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load the feed.")))
      .finally(() => setLoadingMore(false))
  }

  useEffect(() => {
    queueMicrotask(() => {
      setItems(null)
      setLoadError('')
    })
    loadFeed(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  useEffect(() => {
    void getBanners('BUYERS').then((res) => setBanners(res.banners)).catch(() => {})
  }, [])

  const handleFreeCheck = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkValue.trim()) return
    setChecking(true)
    setCheckNotice('')
    try {
      const res = await freeCaseCheck({ address: checkValue.trim() })
      if (res.found) {
        navigate(`/reports/${res.listingId}`)
      } else {
        setCheckNotice(res.disclaimer || 'No record found yet — try Browse Property to request a search.')
      }
    } catch (err) {
      setCheckNotice(errorMessage(err, 'Could not check right now.'))
    } finally {
      setChecking(false)
    }
  }

  const updateItem = (next: FeedItem) => {
    setItems((prev) => prev?.map((i) => (i.id === next.id && i.source === next.source ? next : i)) ?? prev)
  }

  return (
    <div className="container page" style={{ maxWidth: 620 }}>
      <form
        onSubmit={(e) => void handleFreeCheck(e)}
        className="row"
        style={{ marginBottom: 14, background: 'var(--cc-surface)', border: '1px solid var(--cc-border-2)', borderRadius: 14, padding: 8 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input
            aria-label="Check an address"
            placeholder="Know before you buy — check an address"
            value={checkValue}
            onChange={(e) => setCheckValue(e.target.value)}
            className="field__control"
            style={{ border: 'none', background: 'transparent', marginBottom: 0 }}
          />
        </div>
        <Button loading={checking} type="submit" size="sm">
          Check
        </Button>
      </form>
      {checkNotice ? (
        <div style={{ marginBottom: 14 }}>
          <InlineNotice message={checkNotice} />
        </div>
      ) : null}

      {banners.length > 0 ? (
        <div className="stack" style={{ marginBottom: 14 }}>
          {banners.map((banner) => (
            <InlineNotice
              key={banner.id}
              message={`${banner.title} — ${banner.body}`}
              tone={banner.severity === 'INFO' ? 'info' : 'warn'}
            />
          ))}
        </div>
      ) : null}

      <div className="row" style={{ gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            type="button"
            className={`pill${i === filter ? ' pill--blue' : ' pill--muted'}`}
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => setFilter(i)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={() => loadFeed(false)} />
      ) : items === null ? (
        <div className="stack">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="muted" style={{ padding: '40px 0', textAlign: 'center', fontSize: 13 }}>
          Nothing here yet.
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <FeedCard key={`${item.source}:${item.id}`} item={item} onChange={updateItem} />
          ))}
          {hasMore ? (
            <Button variant="secondary" block loading={loadingMore} onClick={() => loadFeed(true)}>
              Load more
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
