import { useState, useEffect, useCallback } from 'react'
import {
  getAdSummary, getAdCampaigns, approveAdCampaign, rejectAdCampaign, pauseAdCampaign, resumeAdCampaign, stopAdCampaign, retryAdRefund,
} from '../../api/admin.api'
import { Badge, Button, Card, ErrorState, Modal, PageHead, Pagination, ResponsiveTable, StatCard, Toast } from '../../components/ui'

// SuperAdmin-only Advertisements section: moderation (approve / reject with reason), pause / resume /
// stop, and a revenue + delivery summary. All billing numbers come from the server — nothing here
// computes or edits spend or impressions.

const STATUS_TONE = {
  PENDING_APPROVAL: 'amber', ACTIVE: 'green', PAUSED: 'grey', REJECTED: 'red', EXHAUSTED: 'violet',
  EXPIRED: 'grey', COMPLETED: 'blue', DRAFT: 'grey', PAYMENT_PENDING: 'grey',
}
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const num = (n) => Number(n || 0).toLocaleString('en-IN')
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—')

const FILTERS = [
  ['', 'All'], ['PENDING_APPROVAL', 'Pending approval'], ['ACTIVE', 'Active'], ['PAUSED', 'Paused'],
  ['EXHAUSTED', 'Budget used'], ['EXPIRED', 'Expired'], ['REJECTED', 'Rejected'], ['COMPLETED', 'Stopped'],
]

function Preview({ c }) {
  return (
    <div className="card-flat" style={{ padding: 14, maxWidth: 420 }}>
      <div className="small muted" style={{ marginBottom: 6, fontWeight: 700, letterSpacing: '.06em' }}>ADVERTISEMENT</div>
      {c.creativeType === 'VIDEO'
        ? <video src={c.creativeUrl} controls muted style={{ width: '100%', borderRadius: 8 }} />
        : <img src={c.creativeUrl} alt={c.title} style={{ width: '100%', borderRadius: 8 }} />}
      <div className="small muted" style={{ marginTop: 8 }}>{c.businessName}</div>
      <div style={{ fontWeight: 700 }}>{c.title}</div>
      <p style={{ fontSize: 13, margin: '4px 0 8px' }}>{c.description}</p>
      <span className="badge gold">{c.ctaText}</span>
    </div>
  )
}

export default function Advertisements() {
  const [summary, setSummary] = useState(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('PENDING_APPROVAL')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const LIMIT = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, list] = await Promise.all([getAdSummary(), getAdCampaigns({ status: status || undefined, page, limit: LIMIT })])
      setSummary(s.summary)
      setRows(list.campaigns || [])
      setTotal(list.total || 0)
    } catch {
      setError('Failed to load advertisements')
    } finally {
      setLoading(false)
    }
  }, [status, page])

  // Deferred a microtask: load() sets loading state, which must not run synchronously in the effect body.
  useEffect(() => { queueMicrotask(() => { void load() }) }, [load])

  const act = async (fn, okMsg) => {
    setBusy(true)
    try {
      await fn()
      setToast(`✅ ${okMsg}`)
      setSelected(null)
      setRejecting(false)
      setReason('')
      await load()
    } catch (err) {
      setToast(`❌ ${err.response?.data?.message || 'Action failed'}`)
    } finally {
      setBusy(false)
      setTimeout(() => setToast(''), 3500)
    }
  }

  const columns = [
    { key: 'advertiser', header: 'Advertiser', render: (c) => (<><div style={{ fontWeight: 600 }}>{c.businessName}</div><div className="small muted">{c.advertiser?.email}</div></>) },
    { key: 'title', header: 'Campaign', render: (c) => <span style={{ maxWidth: 200, display: 'inline-block' }}>{c.title}</span> },
    { key: 'budget', header: 'Budget', render: (c) => inr(c.budget) },
    { key: 'spent', header: 'Spent', render: (c) => inr(c.spent) },
    { key: 'remaining', header: 'Remaining', render: (c) => inr(c.remaining) },
    { key: 'impressions', header: 'Impressions', render: (c) => num(c.impressions) },
    { key: 'clicks', header: 'Clicks', render: (c) => num(c.clicks) },
    { key: 'ctr', header: 'CTR', render: (c) => `${c.ctr}%` },
    { key: 'status', header: 'Status', render: (c) => <Badge tone={STATUS_TONE[c.status] || 'grey'}>{c.status.replace(/_/g, ' ')}</Badge> },
    { key: 'start', header: 'Start', render: (c) => fmtDate(c.startDate) },
    { key: 'end', header: 'End', render: (c) => fmtDate(c.endDate) },
    { key: 'actions', header: 'Actions', render: (c) => <Button size="sm" variant="ghost" onClick={() => setSelected(c)}>View</Button> },
  ]

  return (
    <div>
      <PageHead title="Advertisements" subtitle="Review, approve and manage third-party advertising campaigns shown in the Buyer feed." />

      {summary && (
        <div className="grid g4" style={{ marginBottom: 20 }}>
          <StatCard tone="grey" icon="📣" value={num(summary.totalCampaigns)} label="Total campaigns" />
          <StatCard tone="amber" icon="🕓" value={num(summary.pendingApproval)} label="Pending approval" />
          <StatCard tone="green" icon="▶️" value={num(summary.active)} label="Active campaigns" />
          <StatCard tone="grey" icon="⏸" value={num(summary.paused)} label="Paused campaigns" />
          <StatCard tone="grey" icon="⌛" value={num(summary.expired)} label="Expired campaigns" />
          <StatCard tone="red" icon="🚫" value={num(summary.rejected)} label="Rejected campaigns" />
          <StatCard tone="gold" icon="💰" value={inr(summary.totalRevenue)} label="Total advertising revenue" />
          <StatCard tone="blue" icon="👁" value={`${num(summary.totalImpressions)} · ${num(summary.totalClicks)}`} label="Impressions · Clicks" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(([v, label]) => (
          <Button key={v || 'all'} size="sm" variant={status === v ? 'primary' : 'ghost'} onClick={() => { setStatus(v); setPage(1) }}>{label}</Button>
        ))}
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ResponsiveTable
            columns={columns}
            rows={loading ? [] : rows}
            getRowKey={(c) => c.id}
            emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No campaigns found'}</div>}
          />
          <Pagination page={page} totalPages={Math.ceil(total / LIMIT)} total={total} onChange={setPage} noun="campaigns" />
        </Card>
      )}

      {selected && (
        <Modal open title={`Advertisement — ${selected.businessName}`} onClose={() => { setSelected(null); setRejecting(false) }} size="lg">
          <div className="grid g2" style={{ gap: 16 }}>
            <Preview c={selected} />
            <div className="small">
              <div><b>Advertiser:</b> {selected.advertiser?.name} ({selected.advertiser?.email})</div>
              <div><b>Payment:</b> {selected.paymentStatus} {selected.paidAmount ? `· ${inr(selected.paidAmount)}` : ''}</div>
              {selected.refund && (
                <div>
                  <b>Refund:</b> {inr(selected.refund.amount)} · <b>Status:</b> {selected.refund.status.replace(/_/g, ' ')}
                  {selected.refund.error ? <span style={{ color: 'var(--red)' }}> — {selected.refund.error}</span> : null}
                </div>
              )}
              <div><b>Budget:</b> {inr(selected.budget)} · <b>CPM:</b> {inr(selected.cpm)} / 1,000</div>
              <div><b>Estimated impressions:</b> {num(selected.estimatedImpressions)}</div>
              <div><b>Spent / Remaining:</b> {inr(selected.spent)} / {inr(selected.remaining)}</div>
              <div><b>Impressions / Clicks:</b> {num(selected.impressions)} / {num(selected.clicks)} (CTR {selected.ctr}%{selected.effectiveCpc != null ? `, effective CPC ${inr(selected.effectiveCpc)}` : ''})</div>
              <div><b>Placement:</b> {selected.placement} · <b>Platform:</b> {selected.platform}</div>
              <div><b>Dates:</b> {fmtDate(selected.startDate)} → {fmtDate(selected.endDate)}</div>
              <div style={{ wordBreak: 'break-all' }}><b>Destination:</b> <a href={selected.destinationUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--blue)' }}>{selected.destinationUrl}</a></div>
              {selected.rejectionReason && <div style={{ color: 'var(--red)' }}><b>Rejection reason:</b> {selected.rejectionReason}</div>}
            </div>
          </div>

          {rejecting ? (
            <div style={{ marginTop: 16 }}>
              <label className="small muted">Rejection reason (required, shown to the advertiser)</label>
              <textarea className="control" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The submitted creative violates our advertising policy." />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button variant="danger" disabled={busy || reason.trim().length < 10} onClick={() => act(() => rejectAdCampaign(selected.id, reason.trim()), 'Campaign rejected')}>Confirm rejection</Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {selected.status === 'PENDING_APPROVAL' && <Button disabled={busy} onClick={() => act(() => approveAdCampaign(selected.id), 'Campaign approved')}>Approve</Button>}
              {selected.status === 'PENDING_APPROVAL' && <Button variant="danger" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>}
              {selected.status === 'ACTIVE' && <Button variant="soft" disabled={busy} onClick={() => act(() => pauseAdCampaign(selected.id), 'Campaign paused')}>Pause</Button>}
              {selected.status === 'PAUSED' && <Button disabled={busy} onClick={() => act(() => resumeAdCampaign(selected.id), 'Campaign resumed')}>Resume</Button>}
              {selected.status === 'REJECTED' && selected.refund && (selected.refund.status === 'FAILED' || selected.refund.status === 'PENDING') && <Button disabled={busy} onClick={() => act(() => retryAdRefund(selected.id), 'Refund retried')}>Retry refund</Button>}
              {(selected.status === 'ACTIVE' || selected.status === 'PAUSED') && <Button variant="danger" disabled={busy} onClick={() => act(() => stopAdCampaign(selected.id), 'Campaign stopped')}>Stop</Button>}
              <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
            </div>
          )}
        </Modal>
      )}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
