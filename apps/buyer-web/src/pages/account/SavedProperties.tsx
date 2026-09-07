import { useEffect, useState } from 'react'
import { getMyEngagedProperties } from '../../api/property.api'
import { FeedCard } from '../../components/FeedCard'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import type { FeedItem } from '../../types/api'

const TABS: { key: 'saved' | 'liked'; label: string }[] = [
  { key: 'saved', label: 'Saved' },
  { key: 'liked', label: 'Liked' },
]

export default function SavedProperties() {
  const [tab, setTab] = useState<'saved' | 'liked'>('saved')
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    queueMicrotask(() => {
      setItems(null)
      setError('')
    })
    getMyEngagedProperties(tab)
      .then((res) => setItems(res.results))
      .catch((err) => setError(errorMessage(err, "Couldn't load this list.")))
  }

  useEffect(load, [tab])

  const updateItem = (next: FeedItem) => {
    setItems((prev) => prev?.map((i) => (i.id === next.id && i.source === next.source ? next : i)) ?? prev)
  }

  return (
    <div>
      <h1 className="h2" style={{ marginBottom: 16 }}>
        Saved properties
      </h1>
      <div className="row" style={{ gap: 6, marginBottom: 18 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`pill${tab === t.key ? ' pill--blue' : ' pill--muted'}`}
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items === null ? (
        <LoadingState label="Loading…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={tab === 'saved' ? '🔖' : '❤️'}
          title={tab === 'saved' ? 'No saved properties yet' : 'No liked properties yet'}
          description="Properties you save or like from the Home feed will show up here."
        />
      ) : (
        <div className="stack">
          {items.map((item) => (
            <FeedCard key={`${item.source}:${item.id}`} item={item} onChange={updateItem} />
          ))}
        </div>
      )}
    </div>
  )
}
