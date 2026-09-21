import { useState, useEffect } from 'react'
import {
  getFinancialOverview,
  getPayoutRecords,
  processPayoutRecord,
  resolveManualReviewPayout,
  runReconciliationSweep,
  getReconciliationIssues,
  resolveReconciliationIssue,
  getVerificationSettings,
  updateVerificationSettings,
  getExpertVerificationPayouts,
  initiateExpertVerificationPayout,
} from '../../api/admin.api'
import { useAuth } from '../../context/AuthContext'
import { canManageFinance } from '../../utils/permissions'
import { Badge, Button, Card, Field, LoadingState, PageHead, ResponsiveTable, Tabs, Toast } from '../../components/ui'

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const payoutTone = { PAYOUT_REQUESTED: 'amber', PROCESSING: 'amber', PAID: 'green', FAILED: 'red', RETRYABLE: 'amber', MANUAL_REVIEW: 'red', REVERSED: 'red', FROZEN: 'red' }
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

// Expert Verification Payouts — the "worst-case earning status" label
// admin.controller.ts's getExpertVerificationPayouts derives per request,
// humanized for this table. This dashboard shows ONLY Expert-performed
// verifications (a ProfessionalEarning can only exist for an EXPERT-role
// Seller — see ledger.service.ts) — an Admin- or SuperAdmin-performed
// verification never appears here, by construction, not by a filter.
const EXPERT_PAYOUT_LABEL = {
  EARNED: 'On Hold',
  PENDING_SETTLEMENT: 'On Hold',
  FROZEN: 'Frozen (Claim)',
  AVAILABLE_FOR_PAYOUT: 'Eligible',
  PAYOUT_REQUESTED: 'Processing',
  PROCESSING: 'Processing',
  PAID: 'Paid',
  FAILED: 'Failed',
  RETRYABLE: 'Failed (Retryable)',
  MANUAL_REVIEW: 'Failed (Manual Review)',
  REVERSED: 'Refunded',
  NONE: '—',
}
const EXPERT_PAYOUT_TONE = {
  EARNED: 'amber', PENDING_SETTLEMENT: 'amber', FROZEN: 'red', AVAILABLE_FOR_PAYOUT: 'green',
  PAYOUT_REQUESTED: 'amber', PROCESSING: 'amber', PAID: 'green', FAILED: 'red', RETRYABLE: 'amber',
  MANUAL_REVIEW: 'red', REVERSED: 'grey', NONE: 'grey',
}

export default function FinancialDashboard() {
  const { admin } = useAuth()
  const canManage = canManageFinance(admin?.role)
  const [tab, setTab] = useState('overview')
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  return (
    <div>
      <PageHead title="Financial dashboard" subtitle="Verification Marketplace payments, commission, professional payouts and reconciliation." />

      <div style={{ marginBottom: 20 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'expert-payouts', label: 'Expert Verification Payouts' },
            { value: 'payouts', label: 'Payout Batches' },
            { value: 'reconciliation', label: 'Reconciliation' },
            { value: 'settings', label: 'Commission settings' },
          ]}
        />
      </div>

      {tab === 'overview' && <OverviewTab showToast={showToast} />}
      {tab === 'expert-payouts' && <ExpertVerificationPayoutsTab canManage={canManage} showToast={showToast} />}
      {tab === 'payouts' && <PayoutsTab canManage={canManage} showToast={showToast} />}
      {tab === 'reconciliation' && <ReconciliationTab canManage={canManage} showToast={showToast} />}
      {tab === 'settings' && <SettingsTab canManage={canManage} showToast={showToast} />}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}

function OverviewTab({ showToast }) {
  const [overview, setOverview] = useState(null)

  useEffect(() => {
    getFinancialOverview().then((d) => setOverview(d.overview)).catch(() => showToast('❌ Failed to load overview'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!overview) return <LoadingState />

  const cards = [
    ['Gross payments', overview.grossPayments, 'var(--text)'],
    ['Platform commission', overview.platformCommission, 'var(--green)'],
    ['Professional payable', overview.professionalPayable, 'var(--blue)'],
    ['Paid to professionals', overview.paidToProfessionals, 'var(--green)'],
    ['Pending payouts', overview.pendingPayouts, 'var(--amber)'],
    ['Failed payouts', overview.failedPayouts, 'var(--red)'],
    ['Refunds', overview.refunds, 'var(--red)'],
    ['Cancellation fees', overview.cancellationFees, 'var(--gold)'],
    ['Processing fees', overview.processingFees, 'var(--muted)'],
    ['Open reconciliation issues', overview.openReconciliationIssues, overview.openReconciliationIssues > 0 ? 'var(--red)' : 'var(--green)'],
  ]

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
      {cards.map(([label, value, color]) => (
        <Card key={label} style={{ padding: '16px 18px' }}>
          <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 21, fontWeight: 800, color }}>{label.includes('issues') ? value : inr(value)}</div>
        </Card>
      ))}
    </div>
  )
}

// Expert Verification Payouts — Buyer / Property / Expert / amount / 30-70
// split / report completed / claim deadline / buyer acceptance / claim
// status / payout status, with a Super Admin-only "Initiate Eligible
// Payout" action that never shows once a request is frozen, already paid,
// or not yet eligible. This table ONLY ever contains Expert-performed
// verifications — an Admin- or SuperAdmin-performed verification never
// creates a ProfessionalEarning row at all (see ledger.service.ts), so it
// structurally cannot appear here, not merely by a filter choice.
const EXPERT_PAYOUT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'claim_window_open', label: 'Claim Window Open' },
  { value: 'eligible', label: 'Eligible' },
  { value: 'processing', label: 'Processing' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'refunded', label: 'Refunded' },
]

function ExpertVerificationPayoutsTab({ canManage, showToast }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getExpertVerificationPayouts({ filter })
      setRequests(data.requests || [])
    } catch { showToast('❌ Failed to load Expert payouts') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const initiate = async (earningId) => {
    setBusyId(earningId)
    try {
      await initiateExpertVerificationPayout(earningId)
      showToast('✅ Sent to provider — awaiting confirmation')
      load()
    } catch (err) { showToast(`❌ ${err.response?.data?.message || 'Error'}`) } finally { setBusyId(null) }
  }

  const columns = [
    { key: 'buyer', header: 'User', render: (r) => r.buyer?.name || r.buyer?.phone || '—' },
    { key: 'property', header: 'Property', render: (r) => r.property?.address || r.property?.title || '—' },
    { key: 'expert', header: 'Expert', render: (r) => r.expert?.name || '—' },
    { key: 'amount', header: 'Verification Amount', render: (r) => inr(r.agreedFee) },
    {
      key: 'split',
      header: 'CivilCheck / Expert',
      render: (r) => r.platformCommissionRate != null
        ? `${Math.round(r.platformCommissionRate * 100)}% / ${Math.round((1 - r.platformCommissionRate) * 100)}%`
        : '—',
    },
    { key: 'reportCompletedAt', header: 'Report Completed', render: (r) => fmtDateTime(r.reportCompletedAt) },
    { key: 'claimDeadline', header: 'Claim Deadline', render: (r) => fmtDateTime(r.claimDeadline) },
    {
      key: 'acceptance',
      header: 'User Acceptance',
      render: (r) => <Badge tone={r.buyerAcceptanceStatus === 'ACCEPTED' ? 'green' : 'grey'}>{r.buyerAcceptanceStatus}</Badge>,
    },
    {
      key: 'claim',
      header: 'Claim',
      render: (r) => <Badge tone={r.hasActiveClaim ? 'red' : 'grey'}>{r.hasActiveClaim ? 'Active' : 'None'}</Badge>,
    },
    {
      key: 'payoutStatus',
      header: 'Payout Status',
      render: (r) => <Badge tone={EXPERT_PAYOUT_TONE[r.payoutStatus] || 'grey'}>{EXPERT_PAYOUT_LABEL[r.payoutStatus] || r.payoutStatus}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => {
        // Never show a payout action when frozen, already paid, or not yet
        // eligible — only an AVAILABLE_FOR_PAYOUT earning can be initiated.
        const eligibleEarning = r.earnings?.find((e) => e.status === 'AVAILABLE_FOR_PAYOUT')
        if (!canManage || !eligibleEarning) return null
        return (
          <Button size="sm" variant="soft" disabled={busyId === eligibleEarning.id} onClick={() => initiate(eligibleEarning.id)}>
            {busyId === eligibleEarning.id ? 'Sending…' : 'Initiate Eligible Payout'}
          </Button>
        )
      },
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {EXPERT_PAYOUT_FILTERS.map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? 'primary' : 'soft'} onClick={() => setFilter(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable
          columns={columns}
          rows={loading ? [] : requests}
          getRowKey={(r) => r.id}
          emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No Expert verification payouts found'}</div>}
        />
      </Card>
    </div>
  )
}

function PayoutsTab({ canManage, showToast }) {
  const [payouts, setPayouts] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      const data = await getPayoutRecords(params)
      setPayouts(data.payouts || [])
    } catch { showToast('❌ Failed to load payouts') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const process = async (id) => {
    try { await processPayoutRecord(id); showToast('✅ Sent to provider — awaiting confirmation'); load() }
    catch (err) { showToast(`❌ ${err.response?.data?.message || 'Error'}`) }
  }
  const resolve = async (id, action) => {
    const note = prompt(action === 'write_off' ? 'Reason for writing this off:' : 'Note (optional):') || undefined
    try { await resolveManualReviewPayout(id, action, note); showToast('✅ Resolved'); load() }
    catch (err) { showToast(`❌ ${err.response?.data?.message || 'Error'}`) }
  }

  const columns = [
    { key: 'seller', header: 'Professional', render: (p) => p.seller?.name || p.sellerId },
    { key: 'amount', header: 'Amount', render: (p) => <span style={{ fontWeight: 700 }}>{inr(p.totalAmountPaise / 100)}</span> },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={payoutTone[p.status] || 'grey'}>{p.status}</Badge> },
    { key: 'retryCount', header: 'Retries' },
    { key: 'requestedAt', header: 'Requested', render: (p) => new Date(p.requestedAt).toLocaleDateString('en-IN') },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <>
          {canManage && (p.status === 'PAYOUT_REQUESTED' || p.status === 'RETRYABLE') && (
            <Button size="sm" variant="soft" onClick={() => process(p.id)}>Process</Button>
          )}
          {canManage && p.status === 'MANUAL_REVIEW' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="soft" onClick={() => resolve(p.id, 'retry')}>Retry</Button>
              <Button size="sm" variant="danger" onClick={() => resolve(p.id, 'write_off')}>Write off</Button>
            </div>
          )}
        </>
      ),
    },
  ]

  return (
    <div>
      <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto', marginBottom: 14 }}>
        <option value="">All status</option>
        {['PAYOUT_REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'RETRYABLE', 'MANUAL_REVIEW', 'REVERSED'].map((st) => <option key={st} value={st}>{st}</option>)}
      </select>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable
          columns={columns}
          rows={loading ? [] : payouts}
          getRowKey={(p) => p.id}
          emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No payouts found'}</div>}
        />
      </Card>
    </div>
  )
}

function ReconciliationTab({ canManage, showToast }) {
  const [issues, setIssues] = useState([])
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [running, setRunning] = useState(false)

  const load = async () => {
    try {
      const data = await getReconciliationIssues({ status: statusFilter })
      setIssues(data.issues || [])
    } catch { showToast('❌ Failed to load reconciliation issues') }
  }
  useEffect(() => { load() }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const runSweep = async () => {
    setRunning(true)
    try {
      const data = await runReconciliationSweep()
      showToast(`✅ Sweep complete — ${data.result.internalIssuesOpened + data.result.remoteIssuesOpened} new issue(s)`)
      load()
    } catch (err) { showToast(`❌ ${err.response?.data?.message || 'Error'}`) } finally { setRunning(false) }
  }
  const resolve = async (id) => {
    const note = prompt('Resolution note (min 5 characters):')
    if (!note || note.trim().length < 5) { showToast('❌ A note (min 5 characters) is required'); return }
    try { await resolveReconciliationIssue(id, note); showToast('✅ Resolved'); load() }
    catch (err) { showToast(`❌ ${err.response?.data?.message || 'Error'}`) }
  }

  const columns = [
    { key: 'type', header: 'Type' },
    { key: 'reference', header: 'Reference' },
    { key: 'details', header: 'Details' },
    { key: 'status', header: 'Status', render: (i) => <Badge tone={i.status === 'OPEN' ? 'red' : 'green'}>{i.status}</Badge> },
    { key: 'actions', header: 'Actions', render: (i) => canManage && i.status === 'OPEN' && <Button size="sm" variant="soft" onClick={() => resolve(i.id)}>Resolve</Button> },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        {canManage && <Button variant="soft" onClick={runSweep} disabled={running}>{running ? 'Running…' : 'Run reconciliation sweep'}</Button>}
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable
          columns={columns}
          rows={issues}
          getRowKey={(i) => i.id}
          emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">No issues found</div>}
        />
      </Card>
    </div>
  )
}

function SettingsTab({ canManage, showToast }) {
  const [settings, setSettings] = useState(null)
  const [percent, setPercent] = useState('')
  const [minFee, setMinFee] = useState('')
  const [cancelPercent, setCancelPercent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getVerificationSettings().then((d) => {
      setSettings(d.settings)
      setPercent(String(d.settings.verificationPlatformCommissionPercent))
      setMinFee(String(d.settings.minVerificationFee))
      setCancelPercent(String(Math.round(d.settings.cancellationFeeRateAfterAcceptance * 100)))
    }).catch(() => showToast('❌ Failed to load settings'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    const rate = parseFloat(percent) / 100
    const fee = parseFloat(minFee)
    const cancelRate = parseFloat(cancelPercent) / 100
    if (isNaN(rate) || rate < 0 || rate > 1) { showToast('❌ Commission % must be between 0 and 100'); return }
    if (isNaN(fee) || fee <= 0) { showToast('❌ Minimum fee must be a positive number'); return }
    if (isNaN(cancelRate) || cancelRate < 0 || cancelRate > 1) { showToast('❌ Cancellation fee % must be between 0 and 100'); return }
    setSaving(true)
    try {
      const data = await updateVerificationSettings({
        verificationPlatformCommissionRate: rate,
        minVerificationFee: fee,
        cancellationFeeRateAfterAcceptance: cancelRate,
      })
      setSettings(data.settings)
      showToast('✅ Settings updated')
    } catch (err) { showToast(`❌ ${err.response?.data?.message || 'Error'}`) } finally { setSaving(false) }
  }

  if (!settings) return <LoadingState />

  return (
    <Card style={{ padding: 24, maxWidth: 480 }}>
      <Field label="Platform commission %" hint={`Professional receives the remaining ${settings.professionalSharePercent}% — derived automatically, always sums to 100%.`}>
        <input className="control" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ''))} disabled={!canManage} />
      </Field>
      <Field label="Minimum verification fee (₹)">
        <input className="control" value={minFee} onChange={(e) => setMinFee(e.target.value.replace(/[^\d.]/g, ''))} disabled={!canManage} />
      </Field>
      <Field label="Cancellation fee % (of amount paid, after acceptance)">
        <input className="control" value={cancelPercent} onChange={(e) => setCancelPercent(e.target.value.replace(/[^\d.]/g, ''))} disabled={!canManage} />
      </Field>
      {canManage && <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>}
      {!canManage && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginTop: 8, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Your role has read-only access to financial settings.
        </div>
      )}
      <p className="small muted" style={{ marginTop: 14, lineHeight: 1.6 }}>
        Changing this rate never affects an already-accepted verification request — the rate is frozen onto every
        request the moment a quote is accepted, and every ledger entry snapshots the rate that was live at the time.
      </p>
    </Card>
  )
}
