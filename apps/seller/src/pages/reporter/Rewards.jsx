// ─────────────────────────────────────────────────────────────────────────
//  reporter/Rewards.jsx  —  reward wallet + redeem requests (Phase 4A)
//  Every number here comes straight from the RewardTransaction ledger — no
//  currency conversion, no fake payouts. Redemption is fulfilled off-platform
//  by an Admin once approved.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { getRewardSummary, getRewardTransactions, getMyRedeemRequests, createRedeemRequest } from '../../api/seller.api'
import { Card, StatCard, PageHead, SectionTitle, Field, toast } from '../../components/ui'

const TX_LABEL = { EARNED: 'Earned', ADMIN_ADJUSTMENT: 'Adjustment', REDEMPTION: 'Redeemed' }
const STATUS_TONE = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' }

export default function ReporterRewards() {
  const [summary, setSummary] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [redeemRequests, setRedeemRequests] = useState([])
  const [points, setPoints] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    getRewardSummary().then((d) => setSummary(d?.summary)).catch(() => {})
    getRewardTransactions().then((d) => setTransactions(d?.transactions || [])).catch(() => {})
    getMyRedeemRequests().then((d) => setRedeemRequests(d?.requests || [])).catch(() => {})
  }

  useEffect(load, [])

  const submitRedeem = async () => {
    const n = parseInt(points, 10)
    if (!n || n <= 0) { toast('Valid points daaliye'); return }
    setBusy(true)
    try {
      await createRedeemRequest({ points: n, note: note || undefined })
      toast('Redeem request submitted — admin review karega')
      setPoints(''); setNote('')
      load()
    } catch (e) {
      toast(e.response?.data?.message || 'Redeem request nahi hui — dobara try karo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title="Wallet & Rewards" subtitle="Points sirf Admin-approved property submissions se milte hain — koi cash payout nahi, redemption Admin off-platform fulfil karta hai." />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard icon="chart" color="#137a56" value={summary?.availableBalance ?? '—'} label="Available Balance" />
        <StatCard icon="add"   color="#B67A12" value={summary?.pendingPoints ?? '—'} label="Pending Approval" />
        <StatCard icon="props" color="#2b5c8f" value={summary?.totalEarned ?? '—'} label="Total Earned" />
        <StatCard icon="file"  color="#B0424C" value={summary?.redeemedPoints ?? '—'} label="Redeemed" />
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card style={{ padding: 22 }}>
          <SectionTitle>Redeem Points</SectionTitle>
          <Field label="Points to redeem" required>
            <input className="control" inputMode="numeric" placeholder="e.g. 50"
              value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Note (optional)">
            <input className="control" placeholder="What would you like this redeemed for?"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button className="btn btn-primary btn-block" onClick={submitRedeem} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit Redeem Request'}
          </button>

          <h4 className="dev" style={{ fontSize: 14, margin: '18px 0 8px' }}>My Redeem Requests</h4>
          {redeemRequests.length === 0 ? (
            <p className="muted dev xs">Koi redeem request nahi.</p>
          ) : (
            <div className="card" style={{ padding: '4px 16px' }}>
              {redeemRequests.map((r) => (
                <div className="docrow" key={r.id}>
                  <div className="nm dev">{r.points} points{r.note ? ` — ${r.note}` : ''}</div>
                  <span className={`chip ${STATUS_TONE[r.status] || 'ink'}`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ padding: '18px 22px' }}>
          <SectionTitle>Reward History</SectionTitle>
          {transactions.length === 0 ? (
            <p className="muted dev xs">Abhi tak koi transaction nahi.</p>
          ) : (
            <div className="card" style={{ padding: '4px 16px' }}>
              {transactions.map((t) => (
                <div className="docrow" key={t.id}>
                  <div className="nm dev">
                    {TX_LABEL[t.type] || t.type}: {t.points > 0 ? '+' : ''}{t.points} points
                    {t.reason ? <span className="xs muted"> — {t.reason}</span> : null}
                  </div>
                  <span className={`chip ${STATUS_TONE[t.status] || 'ink'}`}>{t.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
