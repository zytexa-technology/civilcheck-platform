import { useEffect, useState } from 'react'
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from '../api/notification.api'
import { Button } from '../components/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import type { AppNotification } from '../types/api'

export default function Notifications() {
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState('')
  const [markingAll, setMarkingAll] = useState(false)

  const load = () => {
    queueMicrotask(() => setError(''))
    getMyNotifications()
      .then((res) => setNotifications(res.notifications))
      .catch((err) => setError(errorMessage(err, "Couldn't load notifications.")))
  }

  useEffect(load, [])

  const handleRead = async (id: string) => {
    setNotifications((prev) => prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? prev)
    try {
      await markNotificationRead(id)
    } catch {
      load()
    }
  }

  const handleMarkAll = async () => {
    setMarkingAll(true)
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev)
    } catch (err) {
      setError(errorMessage(err, 'Could not mark all as read.'))
    } finally {
      setMarkingAll(false)
    }
  }

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0

  return (
    <div className="container page" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h1 className="h2">Notifications</h1>
        {unreadCount > 0 ? (
          <Button variant="secondary" size="sm" loading={markingAll} onClick={() => void handleMarkAll()}>
            Mark all read
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : notifications === null ? (
        <LoadingState label="Loading notifications…" />
      ) : notifications.length === 0 ? (
        <EmptyState icon="🔔" title="You're all caught up" description="New updates about your reports and requests will show up here." />
      ) : (
        <div className="stack">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => !n.read && void handleRead(n.id)}
              className="card"
              style={{
                textAlign: 'left',
                cursor: n.read ? 'default' : 'pointer',
                borderColor: n.read ? 'var(--cc-border)' : 'var(--cc-gold-border)',
                background: n.read ? 'var(--cc-surface)' : 'var(--cc-surface-2)',
              }}
            >
              <div className="spread">
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{n.title}</span>
                {!n.read ? <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--cc-gold)', flexShrink: 0 }} /> : null}
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                {n.body}
              </p>
              <p className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                {formatDateTime(n.createdAt)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
