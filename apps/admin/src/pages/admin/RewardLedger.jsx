import { useState, useEffect } from 'react'
import {
  getRewardTransactions,
  approveRewardTransaction,
  rejectRewardTransaction,
  getRedeemRequests,
  approveRedeemRequest,
  rejectRedeemRequest,
  getRewardSettings,
  updateRewardSettings,
} from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canManageRewards } from '../../utils/permissions'
import { Badge, Button, Card, Field, PageHead, ResponsiveTable, Tabs, Toast } from '../../components/ui'

const statusTone = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' }

export default function RewardLedger() {
  const { admin } = useAuth()
  const canManage = canManageRewards(admin?.role)
  const [tab, setTab] = useState('transactions')
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  return (
    <div>
      <PageHead title="Reporter reward ledger" subtitle="Approve/reject earned points, review redeem requests, and configure the reward rate. No cash payouts — points only." />

      <div style={{ marginBottom: 20 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'transactions', label: 'Reward transactions' },
            { value: 'redeem', label: 'Redeem requests' },
            { value: 'settings', label: 'Settings' },
          ]}
        />
      </div>

      {tab === 'transactions' && <TransactionsTab canManage={canManage} showToast={showToast} />}
      {tab === 'redeem' && <RedeemTab canManage={canManage} showToast={showToast} />}
      {tab === 'settings' && <SettingsTab canManage={canManage} showToast={showToast} />}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}

function TransactionsTab({ canManage, showToast }) {
  const [transactions, setTransactions] = useState([])
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      const data = await getRewardTransactions(params)
      setTransactions(data.transactions || [])
    } catch {
      showToast('❌ Failed to load reward transactions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  const act = async (fn, id, extra) => {
    try {
      await fn(id, extra)
      showToast('✅ Updated')
      load()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  const columns = [
    { key: 'seller', header: 'Seller', render: (t) => t.seller?.name || t.sellerId },
    { key: 'type', header: 'Type' },
    { key: 'points', header: 'Points', render: (t) => <span style={{ fontWeight: 700, color: t.points >= 0 ? 'var(--green)' : 'var(--red)' }}>{t.points > 0 ? '+' : ''}{t.points}</span> },
    { key: 'reason', header: 'Reason', render: (t) => t.reason || '—' },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={statusTone[t.status] || 'grey'}>{t.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (t) => canManage && t.status === 'PENDING' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="soft" onClick={() => act(approveRewardTransaction, t.id)}>Approve</Button>
          <Button size="sm" variant="danger" onClick={() => act(rejectRewardTransaction, t.id, prompt('Rejection reason (optional):') || undefined)}>Reject</Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto', marginBottom: 14 }}>
        <option value="">All status</option>
        <option value="PENDING">Pending</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable
          columns={columns}
          rows={loading ? [] : transactions}
          getRowKey={(t) => t.id}
          emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No transactions found'}</div>}
        />
      </Card>
    </div>
  )
}

function RedeemTab({ canManage, showToast }) {
  const [requests, setRequests] = useState([])
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      const data = await getRedeemRequests(params)
      setRequests(data.requests || [])
    } catch {
      showToast('❌ Failed to load redeem requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  const approve = async (id) => {
    try {
      await approveRedeemRequest(id)
      showToast('✅ Redeem request approved')
      load()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  const reject = async (id) => {
    const adminNote = prompt('Reason for rejecting this redeem request (required):')
    if (!adminNote || adminNote.trim().length < 5) { showToast('❌ A reason (min 5 characters) is required'); return }
    try {
      await rejectRedeemRequest(id, adminNote)
      showToast('✅ Redeem request rejected')
      load()
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    }
  }

  const columns = [
    { key: 'seller', header: 'Seller', render: (r) => r.seller?.name || r.sellerId },
    { key: 'points', header: 'Points', render: (r) => <span style={{ fontWeight: 700 }}>{r.points}</span> },
    { key: 'note', header: 'Note', render: (r) => r.note || '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status] || 'grey'}>{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => canManage && r.status === 'PENDING' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="soft" onClick={() => approve(r.id)}>Approve</Button>
          <Button size="sm" variant="danger" onClick={() => reject(r.id)}>Reject</Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto', marginBottom: 14 }}>
        <option value="">All status</option>
        <option value="PENDING">Pending</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable
          columns={columns}
          rows={loading ? [] : requests}
          getRowKey={(r) => r.id}
          emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No redeem requests found'}</div>}
        />
      </Card>
    </div>
  )
}

function SettingsTab({ canManage, showToast }) {
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getRewardSettings()
      .then((d) => setRate(String(d.settings?.reporterRewardPointsPerApprovedProperty ?? '')))
      .catch(() => {})
  }, [])

  const save = async () => {
    const value = parseInt(rate, 10)
    if (isNaN(value) || value < 0) { showToast('❌ Enter a valid non-negative number'); return }
    setSaving(true)
    try {
      await updateRewardSettings({ reporterRewardPointsPerApprovedProperty: value })
      showToast('✅ Reward rate updated')
    } catch (err) {
      showToast(`❌ ${err.response?.data?.message || 'Error aaya'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card style={{ padding: 24, maxWidth: 480 }}>
      <Field label="Points per approved Reporter property" hint="This is the single configurable rule the whole reward ledger runs on — never hardcoded in code.">
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="control" value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} disabled={!canManage} />
          {canManage && <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>}
        </div>
      </Field>
      {!canManage && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Your role has read-only access to reward settings.
        </div>
      )}
    </Card>
  )
}
