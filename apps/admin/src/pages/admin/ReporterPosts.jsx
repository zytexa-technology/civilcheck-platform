import { useState, useEffect } from 'react'
import { getReporterPosts, deleteReporterPost } from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canDeleteReporterPosts } from '../../utils/permissions'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Modal,
  PageHead,
  Pagination,
  ResponsiveTable,
  SearchInput,
  Toast,
} from '../../components/ui'

// ─────────────────────────────────────────────────────────────────────────
//  ReporterPosts.jsx — oversight only. ReporterPost has NO moderation state
//  (no PENDING/APPROVED) — every post is live the instant it is created.
//  The only mutating action here is SuperAdmin-only removal.
// ─────────────────────────────────────────────────────────────────────────

const DetailGrid = ({ items }) => (
  <div className="grid g2" style={{ marginBottom: 16 }}>
    {items.map(([label, value]) => (
      <div key={label}>
        <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
      </div>
    ))}
  </div>
)

const PostModal = ({ post, onClose, onDelete, canDelete }) => {
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    await onDelete(post.id)
    setLoading(false)
    onClose()
  }

  return (
    <Modal open title="Reporter post" onClose={onClose} size="lg">
      <DetailGrid items={[
        ['Title', post.title || '—'],
        ['City', post.city || '—'],
        ['Source', post.sourceName || '—'],
        ['Reported by', post.seller?.name || '—'],
        ['Reporter phone', post.seller?.phone || '—'],
        ['Status', post.status],
      ]} />

      {post.description && (
        <div style={{ marginBottom: 16 }}>
          <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Description</div>
          <p style={{ fontSize: 13 }}>{post.description}</p>
        </div>
      )}

      {post.images?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Photos ({post.images.length})</div>
          {post.images.map((url, i) => (
            <div key={i} className="card-flat" style={{ padding: '10px 14px', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Photo {i + 1}</span>
              <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', fontSize: 12 }}>View →</a>
            </div>
          ))}
        </div>
      )}

      {!canDelete && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Only a SuperAdmin can remove a reporter post.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {canDelete && post.status !== 'REMOVED' && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={loading}>🗑 Remove</Button>
        )}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Remove this post?"
        description={`"${post.title || 'Untitled post'}" will be removed from the buyer feed. This cannot be undone from the UI.`}
        confirmLabel="Remove post"
        loading={loading}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </Modal>
  )
}

export default function ReporterPosts() {
  const { admin } = useAuth()
  const canDelete = canDeleteReporterPosts(admin?.role)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('PUBLISHED')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20

  useEffect(() => { loadPosts() }, [statusFilter, page])

  const loadPosts = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (statusFilter) params.status = statusFilter
      const data = await getReporterPosts(params)
      setPosts(data.posts || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load reporter posts')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleDelete = async (id) => {
    try {
      await deleteReporterPost(id)
      showToast('✅ Post removed')
      loadPosts()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  const filtered = posts.filter((p) =>
    (p.title || '').toLowerCase().includes(search.toLowerCase()) || (p.city || '').toLowerCase().includes(search.toLowerCase())
  )

  const columns = [
    {
      key: 'title',
      header: 'Post',
      render: (p) => (<><div style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Untitled post'}</div><div className="small muted" style={{ marginTop: 2 }}>{p.city || '—'}</div></>),
    },
    { key: 'reporter', header: 'Reporter', render: (p) => (<><div>{p.seller?.name || '—'}</div><div className="small muted">{p.seller?.phone || '—'}</div></>) },
    { key: 'sourceName', header: 'Source', render: (p) => p.sourceName || '—' },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={p.status === 'REMOVED' ? 'grey' : 'green'}>{p.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={() => setSelected(p)}>View</Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHead title="Reporter posts" subtitle="Property information/news posted by Reporters — live immediately, no admin approval. Oversight and removal only." />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search title or city…" style={{ flex: 1, minWidth: 220 }} />
        <select className="control" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} style={{ width: 'auto' }}>
          <option value="">All status</option>
          <option value="PUBLISHED">Published</option>
          <option value="REMOVED">Removed</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={loadPosts} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : filtered}
            getRowKey={(p) => p.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading posts…' : 'No reporter posts found'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="posts" />
        </Card>
      )}

      {selected && <PostModal post={selected} onClose={() => setSelected(null)} onDelete={handleDelete} canDelete={canDelete} />}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
