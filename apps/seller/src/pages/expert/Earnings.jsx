// ─────────────────────────────────────────────────────────────────────────
//  expert/Earnings.jsx  —  commission & settlement  (REAL APIs)
//  File #19 of the redesign.  RAKHNA: src/pages/expert/Earnings.jsx
//
//  REAL: getEarningsOverview + getPendingSettlement + getTransactions.
//  Demo fallback jab backend down ho. Commission ek estimate hai (gross data
//  backend me nahi). Transactions table merged in from the orphaned
//  pages/seller/Earnings.jsx (roadmap.md Day 1) — it had real per-purchase
//  data this page didn't.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { getEarningsOverview, getPendingSettlement, getTransactions } from '../../api/seller.api'
import { Icon } from '../../components/Icon'
import { Card, Chip, PageHead, Pagination, toast } from '../../components/ui'

const PERIODS = [
  { id: 'all',   label: 'All'   },
  { id: 'month', label: 'Month' },
  { id: 'week',  label: 'Week'  },
]

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }
  catch { return '—' }
}

// real data se pehle empty (fake numbers nahi)
const EMPTY = {
  lifetime: 0, pendingSettlement: 0, totalReportsSold: 0,
  pendingAmount: 0, nextPayoutDate: null, meetsThreshold: false,
}

export default function ExpertEarnings() {
  const [e, setE] = useState(EMPTY)
  const [transactions, setTransactions] = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [period, setPeriod] = useState('all')
  const [txPage, setTxPage] = useState(1)
  const [txTotal, setTxTotal] = useState(0)
  const [txTotalPages, setTxTotalPages] = useState(1)

  useEffect(() => {
    let live = true
    Promise.allSettled([getEarningsOverview(), getPendingSettlement()]).then(([ov, ps]) => {
      if (!live) return
      const next = { ...EMPTY }
      if (ov.status === 'fulfilled' && ov.value?.earnings) {
        next.lifetime = ov.value.earnings.lifetime ?? next.lifetime
        next.pendingSettlement = ov.value.earnings.pendingSettlement ?? next.pendingSettlement
        next.totalReportsSold = ov.value.earnings.totalReportsSold ?? next.totalReportsSold
      }
      if (ps.status === 'fulfilled' && ps.value) {
        next.pendingAmount = ps.value.pendingAmount ?? next.pendingAmount
        next.nextPayoutDate = ps.value.nextPayoutDate ?? next.nextPayoutDate
        next.meetsThreshold = ps.value.meetsThreshold ?? next.meetsThreshold
      }
      setE(next)
    })
    return () => { live = false }
  }, [])

  useEffect(() => {
    let live = true
    setTxLoading(true)
    getTransactions({ limit: 20, page: txPage })
      .then((t) => {
        if (!live) return
        setTransactions(t.transactions || [])
        setTxTotal(t.total || 0)
        setTxTotalPages(t.totalPages || 1)
      })
      .catch(() => {})
      .finally(() => { if (live) setTxLoading(false) })
    return () => { live = false }
  }, [txPage])

  const filteredTx = transactions.filter((t) => {
    if (period === 'all') return true
    const date = new Date(t.date)
    const now = new Date()
    if (period === 'week') return date >= new Date(now - 7 * 24 * 60 * 60 * 1000)
    if (period === 'month') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    return true
  })

  // Real sum from the loaded transactions, not an estimate — e.lifetime is
  // already the seller's net cut, so a flat % of it would double-subtract.
  const commission = transactions.reduce((sum, t) => sum + (t.platformCut || 0), 0)
  const payoutStr = e.nextPayoutDate ? fmtDate(e.nextPayoutDate) : 'Next Monday'

  const breakdown = [
    ['Lifetime Earned', inr(e.lifetime)],
    ['Pending Settlement', inr(e.pendingAmount)],
    ['CivilCheck Commission (loaded transactions)', '−' + inr(commission)],
    ['Next Payout', payoutStr],
  ]

  // Settlements are a weekly cron sweep (every Monday) — there is no
  // manual-trigger endpoint, so this button can only explain the schedule.
  const requestSettlement = () => {
    if (e.meetsThreshold) toast('Settlements automatic hain — har Monday process hote hain')
    else toast('₹500 minimum threshold abhi reach nahi hua')
  }

  const hdStyle = { padding: '14px 18px', fontWeight: 600, borderBottom: '1px solid var(--line)' }

  return (
    <>
      <PageHead title="Earnings" subtitle="Commission aur settlement details." />

      {/* Total */}
      <Card style={{ padding: 24, textAlign: 'center', marginBottom: 20, background: 'linear-gradient(120deg,#14273f,#1f3a58)', color: '#fff', maxWidth: 420, border: 'none' }}>
        <div className="small" style={{ opacity: 0.7 }}>Total Earnings</div>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 38, fontWeight: 800 }}>{inr(e.lifetime)}</div>
        <div className="small dev" style={{ opacity: 0.7 }}>CivilCheck commission ke baad</div>
      </Card>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        {/* Breakdown */}
        <Card>
          <div className="dev" style={hdStyle}>Breakdown</div>
          {breakdown.map(([label, val]) => (
            <div key={label} className="li">
              <div className="tx"><b className="dev">{label}</b></div>
              <span style={{ fontWeight: 700 }}>{val}</span>
            </div>
          ))}
        </Card>

        {/* Settlement method */}
        <Card>
          <div className="dev" style={hdStyle}>Settlement Method</div>
          {['Bank Transfer (Primary)', 'UPI'].map((m) => (
            <div key={m} className="li">
              <div className="ic"><Icon name="money" size={18} /></div>
              <div className="tx"><b className="dev">{m}</b></div>
              <Chip tone="green">Active</Chip>
            </div>
          ))}
          <div style={{ padding: '16px 18px' }}>
            <button className="btn btn-light btn-sm" onClick={requestSettlement}>Settlement Schedule</button>
          </div>
        </Card>
      </div>

      {/* Recent Transactions — real per-purchase data (getTransactions) */}
      <Card style={{ marginTop: 16 }}>
        <div className="dev" style={{ ...hdStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>Recent Transactions</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                className={`btn btn-sm ${period === p.id ? 'btn-primary' : 'btn-light'}`}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {txLoading ? (
          <p className="muted dev" style={{ padding: 18 }}>Loading…</p>
        ) : filteredTx.length === 0 ? (
          <p className="muted dev" style={{ padding: 18 }}>Abhi koi transaction nahi hai.</p>
        ) : (
          filteredTx.map((t) => (
            <div key={t.purchaseId} className="li">
              <div className="tx">
                <b className="dev">{t.property?.address || '—'}</b>
                <p className="dev">{t.property?.city} · {fmtDate(t.date)}</p>
              </div>
              <Chip tone={t.settled ? 'green' : 'amber'}>{t.settled ? 'Settled' : 'Pending'}</Chip>
              <span style={{ fontWeight: 700, marginLeft: 10 }}>{inr(t.yourEarning)}</span>
            </div>
          ))
        )}
        {!txLoading && (
          <div style={{ padding: '0 18px 16px' }}>
            <Pagination page={txPage} totalPages={txTotalPages} total={txTotal} onChange={setTxPage} noun="transactions" />
          </div>
        )}
      </Card>
    </>
  )
}