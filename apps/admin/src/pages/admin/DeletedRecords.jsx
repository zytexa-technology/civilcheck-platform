import { useState, useEffect } from 'react'
import { getDeletedAccounts, getDeletedPosts } from '../../api/admin.api'
import { Badge, Card, ErrorState, PageHead, Pagination, ResponsiveTable, SearchInput, Tabs } from '../../components/ui'

// SuperAdmin-only history of accounts that were deleted / deactivated /
// blocked / suspended and posts that were deleted. Read-only by design — no
// restore action exists in this project, so none is offered here.

const OUTCOME_TONE = { DELETED: 'red', DEACTIVATED: 'amber', BLOCKED: 'amber', SUSPENDED: 'amber' }

const ROLE_LABEL = {
  USER: 'User',
  EXPERT: 'Expert',
  OWNER: 'Property Owner',
  REPORTER: 'Reporter',
  PARTNER: 'Partner',
  SUPER_ADMIN: 'Super Admin',
  SUB_ADMIN: 'Sub Admin',
  VIEWER: 'Viewer',
  ADMIN: 'Admin',
}
const roleName = (r) => (r ? ROLE_LABEL[r] || r : '—')

const fmtDateTime = (d) =>
  new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const byCell = (r) =>
  r.performedBy ? (
    <>
      <div style={{ fontWeight: 600 }}>{r.performedBy.name}</div>
      <div className="small muted">{roleName(r.performedBy.role)}</div>
    </>
  ) : (
    <span className="muted small">Removed admin ({String(r.performedById || '').slice(0, 8)}…)</span>
  )

const idCell = (id) => (
  <span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{id || '—'}</span>
)

const LIMIT = 20

function AccountsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [outcome, setOutcome] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => { setPage(1) }, [search, role, outcome])
  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    getDeletedAccounts({ page, limit: LIMIT, role: role || undefined, action: outcome || undefined, search: search || undefined })
      .then((d) => {
        if (!live) return
        setRows(d.records || [])
        setTotal(d.total || 0)
        setTotalPages(d.totalPages || 1)
      })
      .catch(() => live && setError('Failed to load deleted accounts'))
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [page, role, outcome, search])

  const columns = [
    {
      key: 'account',
      header: 'Account',
      render: (r) => (
        <>
          <div style={{ fontWeight: 600 }}>{r.name || '—'}</div>
          <div className="small muted">{r.email || r.phone || '—'}</div>
        </>
      ),
    },
    { key: 'role', header: 'Role', render: (r) => <Badge tone="grey">{roleName(r.role)}</Badge> },
    { key: 'accountId', header: 'Account ID', render: (r) => idCell(r.accountId) },
    { key: 'outcome', header: 'Action', render: (r) => <Badge tone={OUTCOME_TONE[r.outcome] || 'grey'}>{r.outcome}</Badge> },
    { key: 'by', header: 'Done by', render: byCell },
    { key: 'createdAt', header: 'Date & time', render: (r) => <span className="small">{fmtDateTime(r.createdAt)}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="small muted">{r.reason || '—'}</span> },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, phone or account ID…" style={{ flex: 1, minWidth: 220 }} />
        <select className="control" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All roles</option>
          {['USER', 'EXPERT', 'OWNER', 'REPORTER', 'SUPER_ADMIN', 'SUB_ADMIN', 'VIEWER'].map((r) => (
            <option key={r} value={r}>{roleName(r)}</option>
          ))}
        </select>
        <select className="control" value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All actions</option>
          {['DELETED', 'DEACTIVATED', 'BLOCKED', 'SUSPENDED'].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={() => setPage((p) => p)} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : rows}
            getRowKey={(r) => r.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No deleted or deactivated accounts recorded'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="records" />
        </Card>
      )}
    </>
  )
}

const POST_TYPE_LABEL = { PROPERTY: 'Owner property', REPORTER_POST: 'Reporter post', LISTING: 'Expert post' }

function PostsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => { setPage(1) }, [search, role])
  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    getDeletedPosts({ page, limit: LIMIT, role: role || undefined, search: search || undefined })
      .then((d) => {
        if (!live) return
        setRows(d.records || [])
        setTotal(d.total || 0)
        setTotalPages(d.totalPages || 1)
      })
      .catch(() => live && setError('Failed to load deleted posts'))
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [page, role, search])

  const columns = [
    {
      key: 'post',
      header: 'Post',
      render: (r) => (
        <>
          <div style={{ fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || 'Untitled'}</div>
          <div className="small muted">{POST_TYPE_LABEL[r.postType] || '—'}</div>
        </>
      ),
    },
    { key: 'postId', header: 'Property / post ID', render: (r) => idCell(r.postId) },
    { key: 'poster', header: 'Posted by', render: (r) => <><div>{r.posterName || '—'}</div><div className="small muted">{roleName(r.posterRole)}</div></> },
    { key: 'outcome', header: 'Action', render: (r) => <Badge tone={OUTCOME_TONE[r.outcome] || 'grey'}>{r.outcome}</Badge> },
    { key: 'by', header: 'Deleted by', render: byCell },
    { key: 'createdAt', header: 'Date & time', render: (r) => <span className="small">{fmtDateTime(r.createdAt)}</span> },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search title, ID or poster name…" style={{ flex: 1, minWidth: 220 }} />
        <select className="control" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All poster roles</option>
          {['OWNER', 'REPORTER', 'EXPERT'].map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
        </select>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={() => setPage((p) => p)} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : rows}
            getRowKey={(r) => r.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No deleted posts recorded'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="records" />
        </Card>
      )}
    </>
  )
}

export default function DeletedRecords() {
  const [tab, setTab] = useState('accounts')
  return (
    <div>
      <PageHead title="Deleted / removed" subtitle="Permanent history of accounts a SuperAdmin deleted, deactivated, blocked or suspended, and posts that were deleted. Records stay here even after the original account is gone." />
      <div style={{ marginBottom: 20 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[{ value: 'accounts', label: 'Deleted accounts' }, { value: 'posts', label: 'Deleted posts' }]}
        />
      </div>
      {tab === 'accounts' ? <AccountsTab /> : <PostsTab />}
    </div>
  )
}
