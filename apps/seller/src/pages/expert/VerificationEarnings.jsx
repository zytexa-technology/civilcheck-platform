// ─────────────────────────────────────────────────────────────────────────
//  expert/VerificationEarnings.jsx  —  Verification Marketplace earnings +
//  payout requests (Phase 4B).
//
//  Distinct money system from expert/Earnings.jsx (Report-Unlock/weekly
//  settlement) — this covers paid professional verification jobs, backed by
//  the new financial ledger. Every number here is server-computed; nothing
//  is editable from this screen.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import {
  getVerificationEarningsSummary,
  getVerificationEarningsTransactions,
  getVerificationPayoutProfile,
  getMyVerificationPayouts,
  requestVerificationPayout,
} from '../../api/seller.api'
import { Card, Chip, PageHead, SectionTitle, toast } from '../../components/ui'

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return '—' }
}

const STATUS_TONE = {
  EARNED: 'ink', PENDING_SETTLEMENT: 'amber', AVAILABLE_FOR_PAYOUT: 'green',
  PAYOUT_REQUESTED: 'amber', PROCESSING: 'amber', PAID: 'green',
  FAILED: 'red', RETRYABLE: 'amber', MANUAL_REVIEW: 'red', REVERSED: 'red',
}

const ELIGIBILITY_LABEL = {
  PENDING_ONBOARDING: 'Pending Admin Onboarding',
  ELIGIBLE: 'Eligible for Payout',
  INELIGIBLE: 'Not Currently Eligible',
  SUSPENDED: 'Payouts Suspended',
}

export default function ExpertVerificationEarnings() {
  const [summary, setSummary] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [profile, setProfile] = useState(null)
  const [payouts, setPayouts] = useState([])
  const [busy, setBusy] = useState(false)

  const load = () => {
    getVerificationEarningsSummary().then((d) => setSummary(d?.summary)).catch(() => {})
    getVerificationEarningsTransactions().then((d) => setTransactions(d?.transactions || [])).catch(() => {})
    getVerificationPayoutProfile().then((d) => setProfile(d?.profile)).catch(() => {})
    getMyVerificationPayouts().then((d) => setPayouts(d?.payouts || [])).catch(() => {})
  }

  useEffect(load, [])

  const requestPayout = async () => {
    setBusy(true)
    try {
      await requestVerificationPayout()
      toast('Payout requested — an admin will process it')
      load()
    } catch (e) {
      toast(e.response?.data?.message || 'Payout request nahi hui')
    } finally {
      setBusy(false)
    }
  }

  const canRequest = profile?.payoutEligibilityStatus === 'ELIGIBLE' && (summary?.availableForPayout || 0) > 0

  return (
    <>
      <PageHead title="Verification Earnings" subtitle="Paid professional verification jobs — commission-split earnings, payouts and history." />

      <Card style={{ padding: 24, textAlign: 'center', marginBottom: 20, background: 'linear-gradient(120deg,#14273f,#1f3a58)', color: '#fff', maxWidth: 420, border: 'none' }}>
        <div className="small" style={{ opacity: 0.7 }}>Available for Payout</div>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 38, fontWeight: 800 }}>{inr(summary?.availableForPayout)}</div>
        <button className="btn btn-seal" style={{ marginTop: 12 }} onClick={requestPayout} disabled={!canRequest || busy}>
          {busy ? 'Requesting…' : 'Request Payout'}
        </button>
        {!canRequest && (
          <div className="xs" style={{ marginTop: 10, opacity: 0.75 }}>
            {profile?.payoutEligibilityStatus !== 'ELIGIBLE'
              ? `Payout status: ${ELIGIBILITY_LABEL[profile?.payoutEligibilityStatus] || profile?.payoutEligibilityStatus || '—'}`
              : 'No balance currently available'}
          </div>
        )}
      </Card>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCardLite label="Total Earned" value={inr(summary?.totalEarned)} />
        <StatCardLite label="Pending Settlement" value={inr(summary?.pendingSettlement)} />
        <StatCardLite label="In Payout" value={inr(summary?.inPayout)} />
        <StatCardLite label="Paid Out" value={inr(summary?.paid)} />
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card style={{ padding: '18px 22px' }}>
          <SectionTitle>Payout Profile</SectionTitle>
          <div className="li"><div className="tx"><b className="dev">Bank Account</b></div>
            <Chip tone={profile?.bankAccountOnFile ? 'green' : 'red'}>
              {profile?.bankAccountOnFile ? `****${profile.bankAccountLast4}` : 'Not on file'}
            </Chip>
          </div>
          <div className="li"><div className="tx"><b className="dev">IFSC</b></div><span>{profile?.ifsc || '—'}</span></div>
          <div className="li"><div className="tx"><b className="dev">Payout Status</b></div>
            <Chip tone={profile?.payoutEligibilityStatus === 'ELIGIBLE' ? 'green' : 'amber'}>
              {ELIGIBILITY_LABEL[profile?.payoutEligibilityStatus] || profile?.payoutEligibilityStatus || '—'}
            </Chip>
          </div>
          {!profile?.bankAccountOnFile && (
            <p className="xs muted dev" style={{ padding: '10px 18px' }}>
              Bank account/IFSC apni Profile page se add karein — payout ke liye zaroori hai.
            </p>
          )}
        </Card>

        <Card style={{ padding: '18px 22px' }}>
          <SectionTitle>Payout History</SectionTitle>
          {payouts.length === 0 ? (
            <p className="muted dev xs" style={{ padding: '4px 0' }}>Koi payout request nahi.</p>
          ) : (
            payouts.map((p) => (
              <div className="li" key={p.id}>
                <div className="tx"><b className="dev">{inr(p.amount)}</b><p className="dev">{fmtDate(p.requestedAt)} · {p.earningsCount} earning(s)</p></div>
                <Chip tone={STATUS_TONE[p.status] || 'ink'}>{p.status}</Chip>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="dev" style={{ padding: '14px 18px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Earnings History</div>
        {transactions.length === 0 ? (
          <p className="muted dev" style={{ padding: 18 }}>Abhi koi verification earning nahi.</p>
        ) : (
          transactions.map((t) => (
            <div key={t.id} className="li">
              <div className="tx">
                <b className="dev">{inr(t.amount)}</b>
                <p className="dev">{fmtDate(t.createdAt)} · Request {t.verificationRequest?.id?.slice(-6) || '—'}</p>
              </div>
              <Chip tone={STATUS_TONE[t.status] || 'ink'}>{t.status}</Chip>
            </div>
          ))
        )}
      </Card>
    </>
  )
}

function StatCardLite({ label, value }) {
  return (
    <Card style={{ padding: '16px 18px' }}>
      <div className="xs muted dev">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </Card>
  )
}
