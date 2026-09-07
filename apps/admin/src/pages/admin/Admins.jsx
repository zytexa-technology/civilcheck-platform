import { useState, useEffect } from 'react'
import {
  getAdmins,
  createAdmin,
  updateAdmin,
  blockAdmin,
  unblockAdmin,
  activateAdmin,
  deactivateAdmin,
  deleteAdmin,
  resetAdminTwoFactor,
} from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canManageAdmins } from '../../utils/permissions'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Field,
  Modal,
  PageHead,
  Pagination,
  ResponsiveTable,
  Toast,
} from '../../components/ui'

const ROLES = ['SUB_ADMIN', 'VIEWER']

// ─── CREATE ADMIN MODAL ───────────────────────────────────────────────────
const CreateAdminModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'SUB_ADMIN' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setErr('')
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.password) {
      setErr('Name, email, phone and password are all required')
      return
    }
    setBusy(true)
    try {
      await createAdmin(form)
      onCreated()
      onClose()
    } catch (e) {
      setErr(e.response?.data?.message || e.response?.data?.errors?.[0]?.message || 'Failed to create admin')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title="Create admin" onClose={onClose} footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Creating…' : '✓ Create admin'}</Button>
      </>
    }>
      {err && (
        <div className="badge red" style={{ display: 'block', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 12.5, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          ⚠️ {err}
        </div>
      )}

      <Field label="Full name" required>
        <input className="control" value={form.name} onChange={(e) => setField('name', e.target.value)} disabled={busy} />
      </Field>
      <Field label="Email" required>
        <input className="control" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} disabled={busy} />
      </Field>
      <Field label="Phone" required>
        <input className="control" type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} disabled={busy} />
      </Field>
      <Field label="Password" required>
        <input className="control" type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} disabled={busy} />
      </Field>
      <Field label="Role">
        <select className="control" value={form.role} onChange={(e) => setField('role', e.target.value)} disabled={busy}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
    </Modal>
  )
}

// ─── EDIT ADMIN MODAL ─────────────────────────────────────────────────────
const EditAdminModal = ({ admin, onClose, onAction }) => {
  const [name, setName] = useState(admin.name)
  const [phone, setPhone] = useState(admin.phone)
  const [role, setRole] = useState(admin.role)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    await onAction('update', admin.id, { name, phone, role })
    setBusy(false)
    onClose()
  }

  return (
    <Modal open title="Edit admin" onClose={onClose} footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </>
    }>
      <Field label="Full name" required>
        <input className="control" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </Field>
      <Field label="Phone" required>
        <input className="control" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
      </Field>
      <Field label="Role" hint="Email cannot be changed here.">
        <select className="control" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
    </Modal>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────
export default function Admins() {
  const { admin: me } = useAuth()
  const canManage = canManageAdmins(me?.role)
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirming, setConfirming] = useState(null) // { admin, action }
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [toast, setToast] = useState('')
  const LIMIT = 20

  useEffect(() => { load() }, [page])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAdmins({ page, limit: LIMIT })
      setAdmins(data.admins || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load admins')
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleAction = async (action, id, payload) => {
    try {
      if (action === 'update') await updateAdmin(id, payload)
      if (action === 'block') await blockAdmin(id)
      if (action === 'unblock') await unblockAdmin(id)
      if (action === 'activate') await activateAdmin(id)
      if (action === 'deactivate') await deactivateAdmin(id)
      if (action === 'delete') await deleteAdmin(id)
      if (action === 'reset2fa') {
        await resetAdminTwoFactor(id)
        showToast('✅ 2FA reset — they can log in with password only and must re-enroll')
        load()
        return
      }
      showToast(`✅ Admin ${action}d successfully!`)
      load()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Something went wrong'}`)
    }
  }

  // Block, Delete and Reset 2FA are the irreversible-feeling actions here
  // (block locks someone out immediately; delete is permanent; a 2FA reset
  // strips their second factor and forces re-enrollment) — all three go
  // through a real confirmation dialog instead of the previous
  // window.confirm() / no-confirmation-at-all mix.
  const requestConfirm = (admin, action) => setConfirming({ admin, action })
  const runConfirm = async () => {
    if (!confirming) return
    setConfirmBusy(true)
    await handleAction(confirming.action, confirming.admin.id)
    setConfirmBusy(false)
    setConfirming(null)
  }

  const totalPages = Math.ceil(total / LIMIT)

  const columns = [
    {
      key: 'admin',
      header: 'Admin',
      render: (a) => (
        <>
          <div style={{ fontWeight: 600 }}>{a.name}{a.id === me?.id && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}</div>
          <div className="small muted">{a.email} · {a.phone}</div>
        </>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (a) => <Badge tone={a.role === 'SUPER_ADMIN' ? 'gold' : a.role === 'SUB_ADMIN' ? 'blue' : 'grey'}>{a.role}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (a.blocked ? <Badge tone="red">Blocked</Badge> : !a.active ? <Badge tone="amber">Inactive</Badge> : <Badge tone="green">Active</Badge>),
    },
    { key: 'createdAt', header: 'Created', render: (a) => new Date(a.createdAt).toLocaleDateString('en-IN') },
    {
      key: 'actions',
      header: 'Actions',
      render: (a) => {
        const isMe = a.id === me?.id
        const isSuper = a.role === 'SUPER_ADMIN'
        if (isSuper) return <span className="small muted">Protected account</span>
        if (!canManage) return <span className="small muted">Read-only</span>
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button>
            {a.blocked ? (
              <Button size="sm" variant="soft" onClick={() => handleAction('unblock', a.id)}>Unblock</Button>
            ) : (
              <Button size="sm" variant="danger" onClick={() => requestConfirm(a, 'block')} disabled={isMe}>Block</Button>
            )}
            {a.active ? (
              <Button size="sm" variant="ghost" onClick={() => handleAction('deactivate', a.id)} disabled={isMe}>Deactivate</Button>
            ) : (
              <Button size="sm" variant="soft" onClick={() => handleAction('activate', a.id)}>Activate</Button>
            )}
            {a.twoFactorEnabled && (
              <Button size="sm" variant="ghost" onClick={() => requestConfirm(a, 'reset2fa')} disabled={isMe}>Reset 2FA</Button>
            )}
            <Button size="sm" variant="danger" onClick={() => requestConfirm(a, 'delete')} disabled={isMe}>Delete</Button>
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHead
        title="Admin management"
        subtitle="Create, edit, block and manage admin accounts. Super Admin only."
        right={canManage && <Button variant="primary" onClick={() => setShowCreate(true)}>+ Create admin</Button>}
      />

      {!canManage && (
        <div className="badge grey" style={{ display: 'block', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Only the Super Admin can manage admin accounts.
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : admins}
            getRowKey={(a) => a.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading admins…' : 'No admins found'}</div>}
          />
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} noun="admins" />
        </Card>
      )}

      {showCreate && <CreateAdminModal onClose={() => setShowCreate(false)} onCreated={() => { load(); showToast('✅ Admin created') }} />}
      {editing && <EditAdminModal key={editing.id} admin={editing} onClose={() => setEditing(null)} onAction={handleAction} />}

      <ConfirmDialog
        open={!!confirming}
        tone="danger"
        title={
          confirming?.action === 'delete'
            ? 'Delete this admin?'
            : confirming?.action === 'reset2fa'
              ? 'Reset this admin’s 2FA?'
              : 'Block this admin?'
        }
        description={
          confirming?.action === 'delete'
            ? `${confirming?.admin?.name} will be permanently removed. This cannot be undone.`
            : confirming?.action === 'reset2fa'
              ? `${confirming?.admin?.name}'s current authenticator will stop working immediately. They will be able to log in with password only, and must set up 2FA again from their Security page.`
              : `${confirming?.admin?.name} will be locked out immediately. You can unblock them again later.`
        }
        confirmLabel={confirming?.action === 'delete' ? 'Delete' : confirming?.action === 'reset2fa' ? 'Reset 2FA' : 'Block'}
        loading={confirmBusy}
        onConfirm={runConfirm}
        onClose={() => setConfirming(null)}
      />

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
