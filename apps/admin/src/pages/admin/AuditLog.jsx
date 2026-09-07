import { useState, useEffect } from 'react'
import { getAuditLogs } from '../../api/admin.api'
import { Badge, Card, ErrorState, PageHead, ResponsiveTable, SearchInput, StatCard } from '../../components/ui'

const actionTone = (action = '') => {
  const a = action.toLowerCase()
  if (a.includes('approve')) return 'green'
  if (a.includes('reject')) return 'red'
  if (a.includes('suspend')) return 'amber'
  if (a.includes('login')) return 'blue'
  if (a.includes('refund')) return 'violet'
  if (a.includes('settle')) return 'gold'
  if (a.includes('delete') || a.includes('remove')) return 'red'
  return 'grey'
}

const timeAgo = (date) => {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ approvals: 0, rejections: 0, suspensions: 0 })
  const LIMIT = 20

  useEffect(() => { loadLogs() }, [page])

  const loadLogs = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAuditLogs({ page, limit: LIMIT })
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setStats(data.stats || { approvals: 0, rejections: 0, suspensions: 0 })
    } catch {
      setError('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  const filtered = logs.filter((l) =>
    (l.action || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.target || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.details || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(total / LIMIT)

  const columns = [
    {
      key: 'time',
      header: 'Time',
      render: (log) => (
        <>
          <div style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{timeAgo(log.createdAt)}</div>
          <div className="small muted" style={{ marginTop: 2 }}>{new Date(log.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
        </>
      ),
    },
    { key: 'action', header: 'Action', render: (log) => <Badge tone={actionTone(log.action)}>{log.action || '—'}</Badge> },
    { key: 'target', header: 'Target', render: (log) => <div style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }} className="muted">{log.target || '—'}</div> },
    { key: 'details', header: 'Details', render: (log) => <div style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} className="muted">{log.details || '—'}</div> },
    { key: 'ipAddress', header: 'IP address', render: (log) => <span style={{ fontFamily: 'monospace', fontSize: 11 }} className="muted">{log.ipAddress || '—'}</span> },
  ]

  return (
    <div>
      <PageHead title="Audit log" subtitle="A complete record of every admin action — for compliance and security" />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard tone="grey" icon="🧾" value={total} label="Total actions" />
        <StatCard tone="green" icon="✅" value={stats.approvals} label="Approvals" />
        <StatCard tone="red" icon="✗" value={stats.rejections} label="Rejections" />
        <StatCard tone="amber" icon="⏸" value={stats.suspensions} label="Suspensions" />
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search action, target, details…" style={{ marginBottom: 16 }} />

      {error ? (
        <ErrorState message={error} onRetry={loadLogs} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : filtered}
            getRowKey={(log) => log.id}
            emptyState={<div style={{ padding: 40, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading audit logs…' : total === 0 ? 'No audit logs yet — they appear here once admins perform actions' : 'No logs found'}</div>}
          />
          {totalPages > 1 && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <span className="small muted">Page {page} of {totalPages} · {total} total logs</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="badge blue" style={{ display: 'block', marginTop: 16, padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
        ℹ️ Audit logs are recorded automatically whenever an admin acts — approving or rejecting a seller or listing, processing a refund, and so on.
      </div>
    </div>
  )
}
