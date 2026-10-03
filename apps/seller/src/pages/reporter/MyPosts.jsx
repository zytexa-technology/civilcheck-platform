// ─────────────────────────────────────────────────────────────────────────
//  reporter/MyPosts.jsx  —  status filter (REAL /seller/reporter-posts)
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { getMyReporterPosts, deleteReporterPost } from '../../api/seller.api'
import { Card, PageHead, toast } from '../../components/ui'
import { PostTile, postFromApi } from './Dashboard'

const FILTERS = ['All', 'Published', 'Removed']

export default function ReporterPosts() {
  const [posts, setPosts] = useState([])
  const [filter, setFilter] = useState('all')
  const [loadError, setLoadError] = useState(false)
  // See owner/MyProperties.jsx's identical comment — without this, "Is
  // category me koi post nahi" flashed for every fetch, not just a genuinely
  // empty category.
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoadError(false)
    setLoading(true)
    getMyReporterPosts(filter === 'removed' ? { status: 'REMOVED' } : {})
      .then((data) => setPosts((data?.posts || []).map(postFromApi)))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [filter])

  const handleDelete = async (id) => {
    try {
      await deleteReporterPost(id)
      setPosts((list) => list.map((p) => (p.id === id ? { ...p, status: 'removed' } : p)))
      toast('Post remove ho gaya')
    } catch (e) {
      toast(e.response?.data?.message || 'Remove nahi hua — dobara try karo')
    }
  }

  const handleUpdated = (updatedApi) => {
    const updated = postFromApi(updatedApi)
    setPosts((list) => list.map((p) => (p.id === updated.id ? updated : p)))
  }

  const visible = filter === 'all'
    ? posts.filter((p) => p.status !== 'removed')
    : posts.filter((p) => p.status === filter)

  return (
    <>
      <PageHead title="My Posts" subtitle="Har post submit hote hi live hai — koi admin approval nahi chahiye." />

      <div className="seg" style={{ marginBottom: 18 }}>
        {FILTERS.map((f) => {
          const val = f.toLowerCase()
          return (
            <button key={f} className={filter === val ? 'on' : ''} onClick={() => setFilter(val)}>{f}</button>
          )
        })}
      </div>

      {loadError && (
        <Card style={{ padding: '14px 18px', marginBottom: 16, borderColor: 'var(--danger)' }}>
          <p className="small dev" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
            Posts load nahi hue.
            <button className="btn btn-light btn-sm" onClick={load}>Retry</button>
          </p>
        </Card>
      )}
      {loading ? (
        <div className="prop-grid">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="prop" style={{ padding: 0 }}>
              <div className="skel" style={{ height: 120, borderRadius: 0 }} />
              <div style={{ padding: 15 }}>
                <div className="skel" style={{ height: 14, width: '70%', marginBottom: 10 }} />
                <div className="skel" style={{ height: 12, width: '45%' }} />
              </div>
            </Card>
          ))}
        </div>
      ) : visible.length ? (
        <div className="prop-grid">
          {visible.map((p) => <PostTile key={p.id} p={p} onDelete={handleDelete} onUpdated={handleUpdated} />)}
        </div>
      ) : !loadError ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted dev">Is category me koi post nahi.</p>
        </Card>
      ) : null}
    </>
  )
}
