// ─────────────────────────────────────────────────────────────────────────
//  shared/Notifications.jsx  —  real notifications (GET /seller/notifications)
//
//  Mark-read/mark-all-read merged in from the orphaned
//  pages/seller/Notifications.jsx (roadmap.md Day 1) — real backend
//  endpoints (POST /seller/notifications/:id/read, /mark-all-read) that
//  this page never called before.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/seller.api'
import { Icon } from '../../components/Icon'
import { Card, PageHead, Pagination, toast } from '../../components/ui'

const PAGE_SIZE = 10

const timeAgo = (d) => {
  const t = new Date(d).getTime()
  if (isNaN(t)) return ''
  const diff = Math.floor((Date.now() - t) / 1000)
  if (diff < 60) return 'abhi'
  if (diff < 3600) return `${Math.floor(diff / 60)} min pehle`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ghante pehle`
  if (diff < 604800) return `${Math.floor(diff / 86400)} din pehle`
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function Notifications() {
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filter, setFilter]   = useState('all') // 'all' | 'unread'
  const [page, setPage]       = useState(1)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await getNotifications()
      setList(d?.notifications || [])
    } catch (e) {
      setError(e?.response?.data?.message || 'Notifications load nahi huin')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => { setPage(1) }, [filter])

  const unreadCount = list.filter((n) => !n.read).length
  const filtered = filter === 'unread' ? list.filter((n) => !n.read) : list

  // Client-side — GET /seller/notifications has no page param (fixed 50-row
  // cap), so pagination just windows what's already loaded.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Optimistic update, but rolled back with a toast if the backend call
  // actually fails — otherwise the UI would claim something was marked
  // read when it wasn't.
  const markRead = async (id) => {
    const prevList = list
    setList((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    try {
      await markNotificationRead(id)
    } catch (err) {
      setList(prevList)
      toast(err?.response?.data?.message || 'Mark read nahi hua')
    }
  }
  const markAllRead = async () => {
    const prevList = list
    setList((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      await markAllNotificationsRead()
    } catch (err) {
      setList(prevList)
      toast(err?.response?.data?.message || 'Mark all read nahi hua')
    }
  }

  return (
    <>
      <PageHead
        title="Notifications"
        subtitle="Aapke updates."
        right={
          <button className="btn btn-light btn-sm" onClick={markAllRead} disabled={unreadCount === 0}>
            Mark all read
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['all', 'unread'].map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-light'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `All (${list.length})` : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {error && (
        <Card style={S.errorBox}>
          <span>{error}</span>
          <button className="btn btn-light btn-sm" onClick={load}>Retry</button>
        </Card>
      )}

      {loading ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted dev">Loading…</p>
        </Card>
      ) : error ? null : filtered.length ? (
        <Card>
          {paged.map((n) => (
            <div
              key={n.id}
              className="li"
              style={{ opacity: n.read ? 0.7 : 1, cursor: n.read ? 'default' : 'pointer' }}
              onClick={() => !n.read && markRead(n.id)}
            >
              <div className="ic"><Icon name="bell" size={18} /></div>
              <div className="tx">
                <b>{n.title}</b>
                <p className="dev">{n.body}</p>
              </div>
              <span className="xs muted">{timeAgo(n.createdAt)}</span>
            </div>
          ))}
        </Card>
      ) : (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted dev">{filter === 'unread' ? 'Sab kuch padh liya.' : 'Koi nayi notification nahi.'}</p>
        </Card>
      )}

      <Pagination page={safePage} totalPages={totalPages} total={filtered.length} onChange={setPage} noun="notifications" />
    </>
  )
}

const S = {
  errorBox: { padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--danger-soft)', borderColor: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 13.5, fontWeight: 600 },
}
