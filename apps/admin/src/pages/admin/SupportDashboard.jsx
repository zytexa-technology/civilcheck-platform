import { useEffect, useState } from 'react'
import {
  assignSupportTicket,
  getSupportKnowledge,
  getSupportTicketDetail,
  getSupportTickets,
  replySupportTicket,
  reopenSupportTicket,
  resolveSupportTicket,
  returnSupportTicketToAi,
  updateSupportTicketPriority,
  upsertSupportKnowledge,
} from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canManageSupport, canResolveSupportTicket } from '../../utils/permissions'
import {
  Badge,
  Button,
  Card,
  Field,
  LoadingState,
  Modal,
  PageHead,
  Pagination,
  ResponsiveTable,
  SearchInput,
  Tabs,
  Toast,
} from '../../components/ui'

const STATUS_TONE = {
  OPEN: 'blue', AI_ASSISTED: 'blue', ESCALATED: 'amber', ASSIGNED: 'amber',
  IN_PROGRESS: 'amber', RESOLVED: 'green', CLOSED: 'grey',
}
const PRIORITY_TONE = { LOW: 'grey', NORMAL: 'blue', HIGH: 'amber', URGENT: 'red' }
const SENDER_LABEL = { USER: 'Requester', AI: 'AI Assistant', ADMIN: 'Support agent', SYSTEM: 'System' }
const CATEGORIES = ['ACCOUNT', 'PROPERTY', 'VERIFICATION', 'PAYMENT', 'CANCELLATION', 'CLAIM', 'PLATFORM', 'OTHER']
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

export default function SupportDashboard() {
  const { admin } = useAuth()
  const [tab, setTab] = useState('tickets')
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  return (
    <div>
      <PageHead
        title="AI / Human support"
        subtitle="Tickets the AI assistant escalated or a buyer/partner asked a human for, plus the knowledge base the assistant is allowed to answer from."
      />

      <div style={{ marginBottom: 20 }}>
        <Tabs value={tab} onChange={setTab} options={[{ value: 'tickets', label: 'Tickets' }, { value: 'knowledge', label: 'Knowledge base' }]} />
      </div>

      {tab === 'tickets' && <TicketsTab admin={admin} showToast={showToast} />}
      {tab === 'knowledge' && <KnowledgeTab admin={admin} showToast={showToast} />}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}

// ─── TICKETS ────────────────────────────────────────────────────────────────
function TicketsTab({ admin, showToast }) {
  const canManage = canManageSupport(admin?.role)
  const [tickets, setTickets] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', priority: '', category: '', q: '' })
  const [selectedId, setSelectedId] = useState(null)
  const LIMIT = 20

  const load = async () => {
    setLoading(true)
    try {
      const params = { page, limit: LIMIT }
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
      const data = await getSupportTickets(params)
      setTickets(data.tickets || [])
      setTotal(data.total || 0)
    } catch {
      showToast('❌ Failed to load support tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, filters])

  const changeFilter = (key, value) => { setFilters((prev) => ({ ...prev, [key]: value })); setPage(1) }

  const totalPages = Math.ceil(total / LIMIT)

  const columns = [
    { key: 'subject', header: 'Subject', render: (t) => <div title={t.subject} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div> },
    { key: 'requester', header: 'Requester', render: (t) => t.user?.name || t.seller?.name || '—' },
    { key: 'category', header: 'Category' },
    { key: 'priority', header: 'Priority', render: (t) => <Badge tone={PRIORITY_TONE[t.priority] || 'grey'}>{t.priority}</Badge> },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={STATUS_TONE[t.status] || 'grey'}>{t.status.replace(/_/g, ' ')}</Badge> },
    { key: 'messages', header: 'Messages', render: (t) => t._count?.messages ?? '—' },
    { key: 'updatedAt', header: 'Updated', render: (t) => <span className="small muted">{new Date(t.updatedAt).toLocaleString('en-IN')}</span> },
    { key: 'actions', header: '', render: (t) => <Button size="sm" variant="ghost" onClick={() => setSelectedId(t.id)}>View</Button> },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="control" value={filters.status} onChange={(e) => changeFilter('status', e.target.value)} style={{ width: 'auto' }}>
          <option value="">All status</option>
          {['OPEN', 'AI_ASSISTED', 'ESCALATED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((v) => (
            <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select className="control" value={filters.priority} onChange={(e) => changeFilter('priority', e.target.value)} style={{ width: 'auto' }}>
          <option value="">All priority</option>
          {PRIORITIES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="control" value={filters.category} onChange={(e) => changeFilter('category', e.target.value)} style={{ width: 'auto' }}>
          <option value="">All category</option>
          {CATEGORIES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <SearchInput value={filters.q} onChange={(v) => changeFilter('q', v)} placeholder="Search subject…" style={{ flex: 1, minWidth: 200 }} />
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable
          columns={columns}
          rows={loading ? [] : tickets}
          getRowKey={(t) => t.id}
          emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No tickets found'}</div>}
        />
        <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="tickets" />
      </Card>

      {selectedId && (
        <TicketModal id={selectedId} canManage={canManage} role={admin?.role} onClose={() => setSelectedId(null)} onChanged={() => load()} showToast={showToast} />
      )}
    </div>
  )
}

function TicketModal({ id, canManage, role, onClose, onChanged, showToast }) {
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await getSupportTicketDetail(id)
      setTicket(data.ticket)
    } catch {
      showToast('❌ Failed to load ticket')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const run = async (fn, ...args) => {
    setBusy(true)
    try {
      await fn(id, ...args)
      await load()
      onChanged()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    } finally {
      setBusy(false)
    }
  }

  const handleReply = async () => {
    if (!reply.trim()) return
    await run(replySupportTicket, reply.trim())
    setReply('')
  }

  const canResolve = ticket ? canResolveSupportTicket(role, ticket.category) : false
  const canAssign = canManage && ticket && ['OPEN', 'AI_ASSISTED', 'ESCALATED'].includes(ticket.status)
  const canReply = canManage && ticket && ['ASSIGNED', 'IN_PROGRESS'].includes(ticket.status)
  const canReopen = canManage && ticket && ['RESOLVED', 'CLOSED'].includes(ticket.status)
  const canReturnToAi = canManage && ticket && ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(ticket.status)

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={ticket?.subject || 'Ticket'}
      subtitle={ticket && (
        <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={STATUS_TONE[ticket.status] || 'grey'}>{ticket.status.replace(/_/g, ' ')}</Badge>
          <Badge tone={PRIORITY_TONE[ticket.priority] || 'grey'}>{ticket.priority}</Badge>
          <Badge tone="grey">{ticket.category}</Badge>
        </div>
      )}
    >
      {loading || !ticket ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid g2" style={{ marginBottom: 16 }}>
            <ReadField label="Requester" value={ticket.user?.name || ticket.seller?.name || '—'} />
            <ReadField label="Contact" value={ticket.user?.phone || ticket.seller?.phone || '—'} />
            <ReadField label="Created" value={new Date(ticket.createdAt).toLocaleString('en-IN')} />
            <ReadField label="Updated" value={new Date(ticket.updatedAt).toLocaleString('en-IN')} />
          </div>

          {ticket.aiSummary && (
            <div className="badge violet" style={{ display: 'block', marginBottom: 16, padding: 12, borderRadius: 8, textTransform: 'none', letterSpacing: 0 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4, fontWeight: 700 }}>
                🤖 AI summary (internal only — never shown to the requester)
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)' }}>{ticket.aiSummary}</div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Conversation</div>
            <div className="card-flat" style={{ padding: 12, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(ticket.messages || []).map((m) => (
                <div key={m.id}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: m.sender === 'ADMIN' ? 'var(--blue)' : m.sender === 'AI' ? 'var(--violet)' : 'var(--muted)', marginBottom: 2 }}>
                    {SENDER_LABEL[m.sender] || m.sender}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{m.body}</div>
                </div>
              ))}
            </div>
          </div>

          {!canManage && (
            <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              🔒 Your role has read-only access to support tickets.
            </div>
          )}

          {canManage && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Priority
                <select className="control" value={ticket.priority} onChange={(e) => run(updateSupportTicketPriority, e.target.value)} disabled={busy} style={{ width: 'auto' }}>
                  {PRIORITIES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              {canAssign && <Button size="sm" variant="soft" onClick={() => run(assignSupportTicket)} disabled={busy}>👤 Assign to me</Button>}
              {canReturnToAi && <Button size="sm" variant="ghost" onClick={() => run(returnSupportTicketToAi)} disabled={busy}>🤖 Return to AI</Button>}
              {canReopen && <Button size="sm" variant="ghost" onClick={() => run(reopenSupportTicket)} disabled={busy}>↺ Reopen</Button>}
              {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
                canResolve ? (
                  <Button size="sm" variant="soft" onClick={() => run(resolveSupportTicket)} disabled={busy}>✓ Resolve</Button>
                ) : (
                  <span className="small muted">🔒 Resolving a {ticket.category} ticket requires a Super Admin</span>
                )
              )}
            </div>
          )}

          {canReply && (
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea className="control" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply to the requester…" rows={3} disabled={busy} style={{ flex: 1 }} />
              <Button variant="primary" onClick={handleReply} disabled={busy || !reply.trim()}>Send</Button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

function ReadField({ label, value }) {
  return (
    <div>
      <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
    </div>
  )
}

// ─── KNOWLEDGE BASE ─────────────────────────────────────────────────────────
// The only source the AI assistant may ground answers in (aiSupport.ts) —
// upsert-by-key, same shape as Disclaimers in ContentControl.jsx.
function KnowledgeTab({ admin, showToast }) {
  const canManage = admin?.role === 'SUPER_ADMIN'
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getSupportKnowledge({ includeInactive: 'true' })
      setEntries(data.entries || [])
    } catch {
      showToast('❌ Failed to load knowledge base')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const startNew = () => setEditing({ key: '', topic: 'PLATFORM', question: '', answer: '', active: true })

  const save = async (entry) => {
    try {
      await upsertSupportKnowledge(entry)
      showToast('✅ Knowledge entry saved')
      setEditing(null)
      load()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  return (
    <div>
      {canManage && <Button variant="primary" onClick={startNew} style={{ marginBottom: 16 }}>+ New entry</Button>}

      {loading ? (
        <LoadingState />
      ) : entries.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center' }} className="muted small">No knowledge entries yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((e) => (
            <Card key={e.id} style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    <Badge tone="grey">{e.topic}</Badge>
                    {!e.active && <Badge tone="red">Inactive</Badge>}
                    <span className="small muted">{e.key}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{e.question}</div>
                  <div className="small muted" style={{ lineHeight: 1.6 }}>{e.answer}</div>
                </div>
                {canManage && <Button size="sm" variant="ghost" onClick={() => setEditing(e)} style={{ flexShrink: 0 }}>Edit</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && <KnowledgeModal entry={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function KnowledgeModal({ entry, onClose, onSave }) {
  const [form, setForm] = useState(entry)
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }))

  const canSubmit = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.key) && form.question.trim().length >= 5 && form.answer.trim().length >= 10

  return (
    <Modal open title={entry.id ? 'Edit entry' : 'New entry'} onClose={onClose} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onSave(form)} disabled={!canSubmit}>Save</Button>
      </>
    }>
      <Field label="Key (lowercase, hyphenated)">
        <input className="control" value={form.key} onChange={(e) => set('key', e.target.value.toLowerCase())} placeholder="e.g. verification-minimum-fee" />
      </Field>
      <Field label="Topic">
        <select className="control" value={form.topic} onChange={(e) => set('topic', e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Question">
        <input className="control" value={form.question} onChange={(e) => set('question', e.target.value)} />
      </Field>
      <Field label="Answer">
        <textarea className="control" value={form.answer} onChange={(e) => set('answer', e.target.value)} rows={5} />
      </Field>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
        Active (AI may use this to answer)
      </label>
    </Modal>
  )
}
