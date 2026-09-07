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

  const load = () => {
    setLoadError(false)
    getMyReporterPosts(filter === 'removed' ? { status: 'REMOVED' } : {})
      .then((data) => setPosts((data?.posts || []).map(postFromApi)))
      .catch(() => setLoadError(true))
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
      {visible.length ? (
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
