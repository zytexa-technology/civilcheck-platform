// ─────────────────────────────────────────────────────────────────────────
//  seller/Settlements.jsx  —  Settlements   (light theme, partner portal)
//
//  Pehle ye page purane DARK dashboard ka tha — colors hardcoded (#111318,
//  #0a0c10, 'Crimson Pro' etc.) the, isliye light portal me kaala box +
//  gayab heading dikh rahi thi (see MyListings.jsx, jo pehle migrate hui).
//  Ab poora design system use karta hai: Card / PageHead / Chip / .tbl aur
//  CSS variables (var(--ink), var(--line)...).
//
//  Also fixes a real dead button: "✏️ Update" next to Linked Bank Account
//  had no onClick at all. Now opens a real edit modal (same pattern as
//  shared/Profile.jsx's Edit Profile modal) that PATCHes bankAccount/ifsc
//  via updateSellerProfile.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, Fragment } from 'react'
import {
  getSettlements, getPendingSettlement, getSellerProfile,
  downloadEarningsStatementPdf, updateSellerProfile,
} from '../../api/seller.api'
import { Card, Chip, PageHead, Field, Modal, toast } from '../../components/ui'

export default function Settlements() {
  const [settlements, setSettlements]   = useState([])
  const [pending, setPending]           = useState(null)
  const [profile, setProfile]           = useState(null)
  const [loading, setLoading]           = useState(true)
  const [selected, setSelected]         = useState(null)
  const [downloading, setDownloading]   = useState(false)
  const [dlError, setDlError]           = useState('')

  // ── Bank account edit modal (real: PATCH /seller/profile → bankAccount, ifsc) ──
  const [editOpen, setEditOpen]     = useState(false)
  const [savingBank, setSavingBank] = useState(false)
  const [bankForm, setBankForm]     = useState({ bankAccount: '', ifsc: '' })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, p, pr] = await Promise.all([
        getSettlements(),
        getPendingSettlement(),
        getSellerProfile(),
      ])
      setSettlements(s.settlements || [])
      setPending(p)
      setProfile(pr.seller)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Next Monday calculate karo
  const nextMonday = () => {
    const now = new Date()
    const days = (8 - now.getDay()) % 7 || 7
    const monday = new Date(now)
    monday.setDate(now.getDate() + days)
    return monday.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
  }

  const totalPaid = settlements.reduce((sum, s) => sum + s.amountPaid, 0)
  const totalSettlements = settlements.length

  // Real PDF from GET /seller/earnings/statement/pdf — this button did nothing
  // at all before (no onClick), while the endpoint had existed since Day 6.
  const downloadStatement = async () => {
    setDownloading(true)
    setDlError('')
    let url
    try {
      const blob = await downloadEarningsStatementPdf()
      url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `civilcheck-statement-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      setDlError('Statement download nahi hua — dobara try karein')
    } finally {
      // Revoking immediately after click() is safe: the browser has already
      // taken its own reference to the blob by then.
      if (url) URL.revokeObjectURL(url)
      setDownloading(false)
    }
  }

  // ── Bank account edit — real PATCH /seller/profile, same call Profile.jsx
  // uses for its Edit Profile modal (bankAccount + ifsc are two of the fields
  // it accepts). Was previously a no-op "✏️ Update" button.
  const openBankEdit = () => {
    setBankForm({
      bankAccount: profile?.bankAccount || '',
      ifsc: profile?.ifsc || '',
    })
    setEditOpen(true)
  }

  const saveBankEdit = async () => {
    if (!bankForm.bankAccount.trim() || !bankForm.ifsc.trim()) {
      toast('Account number aur IFSC dono zaroori hain')
      return
    }
    setSavingBank(true)
    try {
      const res = await updateSellerProfile({
        bankAccount: bankForm.bankAccount.trim(),
        ifsc: bankForm.ifsc.trim(),
      })
      if (res?.success) {
        toast('Bank account updated')
        setEditOpen(false)
        await loadData()
      } else {
        toast(res?.message || 'Update nahi hua')
      }
    } catch (err) {
      toast(err?.response?.data?.message || 'Update nahi hua')
    } finally {
      setSavingBank(false)
    }
  }

  if (loading) return (
    <Card style={{ padding: 48, textAlign: 'center' }}>
      <p className="muted dev">⏳ Loading settlements...</p>
    </Card>
  )

  return (
    <>
      <PageHead
        title="Settlements"
        subtitle="Bank transfers aur payouts ka record"
        right={
          <div style={{ textAlign: 'right' }}>
            <button
              className="btn btn-primary"
              style={{ opacity: downloading ? 0.6 : 1 }}
              onClick={downloadStatement}
              disabled={downloading}
            >
              {downloading ? '⏳ Preparing...' : '📥 Download Statement'}
            </button>
            {dlError && (
              <div className="xs" style={{ color: 'var(--danger)', marginTop: 6 }}>{dlError}</div>
            )}
          </div>
        }
      />

      {/* Bank Info Card */}
      <Card style={S.bankCard}>
        <div style={S.bankLeft}>
          <div style={S.bankIcon}>🏦</div>
          <div>
            <div className="xs" style={{ color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Linked Bank Account
            </div>
            <div className="dev" style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>
              {profile?.bankAccount ? `Account ****${profile.bankAccount.slice(-4)}` : 'Bank account linked nahi hai'}
            </div>
            <div className="small muted" style={{ marginTop: 2 }}>
              {profile?.ifsc ? `IFSC: ${profile.ifsc}` : '—'} · {profile?.name}
            </div>
          </div>
        </div>
        <button className="btn btn-light btn-sm" onClick={openBankEdit}>✏️ Update</button>
      </Card>

      {/* Pending Settlement Highlight */}
      {pending && (pending.pendingAmount || 0) > 0 && (
        <Card style={S.pendingCard}>
          <div style={S.pendingTop}>
            <div>
              <div className="xs" style={{ color: 'var(--seal)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                ⏳ Next Settlement
              </div>
              <div style={{ fontFamily: 'var(--disp)', fontSize: 36, fontWeight: 600, color: 'var(--verified)', marginTop: 8, letterSpacing: -1 }}>
                ₹{(pending.pendingAmount || 0).toLocaleString('en-IN')}
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>
                {pending.meetsThreshold
                  ? <>Payout expected on <strong style={{ color: 'var(--ink)' }}>{nextMonday()}</strong></>
                  : `Rs. 500 minimum threshold reach nahi hua — ${pending.transactionCount || 0} pending transactions`
                }
              </div>
            </div>

            <div style={S.breakdown}>
              <BreakdownRow label="Pending Transactions" value={pending.transactionCount || 0} />
              <BreakdownRow label="Gross Amount"         value={`₹${(pending.pendingAmount || 0).toLocaleString('en-IN')}`} />
              <BreakdownRow label="TDS (if applicable)"  value="10% if > ₹30,000/year" negative />
              <div className="divider" style={{ margin: '8px 0' }} />
              <BreakdownRow label="Expected Payout" value={`₹${(pending.pendingAmount || 0).toLocaleString('en-IN')}`} highlight />
            </div>
          </div>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid g3" style={{ marginBottom: 20 }}>
        <StatTile color="var(--verified)" icon="✅" label="Total Paid Out"
          value={`₹${totalPaid.toLocaleString('en-IN')}`}
          sub={`${totalSettlements} settlements`} />
        <StatTile color="var(--seal)" icon="⏳" label="Pending Payout"
          value={`₹${(pending?.pendingAmount || 0).toLocaleString('en-IN')}`}
          sub={pending?.meetsThreshold ? 'Processing this week' : 'Below ₹500 threshold'} />
        <StatTile color="var(--blue)" icon="📅" label="Payout Cycle"
          value="Weekly"
          sub="Every Monday" />
      </div>

      {/* Settlement History Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={S.cardHd}>
          <div style={{ ...S.cardHdIco, background: 'var(--verified-soft)' }}>📜</div>
          <div style={{ flex: 1 }}>
            <div className="dev" style={S.cardHdTitle}>Settlement History</div>
            <div className="xs muted dev" style={{ marginTop: 2 }}>{totalSettlements} settlements total</div>
          </div>
        </div>

        {settlements.length === 0 ? (
          <div className="muted dev" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>💰</div>
            Abhi koi settlement nahi hua — jab pehla payout hoga toh yahan dikhega
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  {['Week Of', 'Transactions', 'Amount Paid', 'Status', 'Action'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settlements.map((st, i) => (
                  <Fragment key={st.weekOf}>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        Week of {new Date(st.weekOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td>
                        <Chip tone="blue">×{st.transactions}</Chip>
                      </td>
                      <td style={{ color: 'var(--verified)', fontWeight: 700 }}>
                        ₹{st.amountPaid.toLocaleString('en-IN')}
                      </td>
                      <td>
                        <Chip tone="green">✓ Paid</Chip>
                      </td>
                      <td>
                        <button className="btn btn-light btn-sm" onClick={() => setSelected(selected === i ? null : i)}>
                          {selected === i ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>

                    {/* Detail row */}
                    {selected === i && (
                      <tr key={`detail-${i}`}>
                        <td colSpan={5} style={{ padding: 16 }}>
                          <div style={S.detailBox}>
                            <div className="dev" style={{ fontFamily: 'var(--disp)', fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>
                              📋 Settlement Details
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 14 }}>
                              <DetailItem label="Week Starting" value={new Date(st.weekOf).toLocaleDateString('en-IN')} />
                              <DetailItem label="Total Reports Sold" value={`${st.transactions} reports`} />
                              <DetailItem label="Amount Paid" value={`₹${st.amountPaid.toLocaleString('en-IN')}`} />
                              <DetailItem label="Status" value="PAID ✓" />
                            </div>
                            <div style={S.detailBreakdown}>
                              <BreakdownRow label="Gross Earnings" value={`₹${st.amountPaid.toLocaleString('en-IN')}`} />
                              <BreakdownRow label="TDS (if applicable)" value="Deducted if > ₹30,000/year" negative />
                              <div className="divider" style={{ margin: '8px 0' }} />
                              <BreakdownRow label="Net Amount Paid" value={`₹${st.amountPaid.toLocaleString('en-IN')}`} highlight />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Update Bank Account Modal ── */}
      <Modal
        open={editOpen}
        title="Update Bank Account"
        onClose={() => setEditOpen(false)}
        footer={<>
          <button className="btn btn-light" onClick={() => setEditOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveBankEdit} disabled={savingBank}>
            {savingBank ? 'Saving…' : 'Save Changes'}
          </button>
        </>}
      >
        <Field label="Bank Account Number" required>
          <input
            className="control"
            value={bankForm.bankAccount}
            onChange={(e) => setBankForm((f) => ({ ...f, bankAccount: e.target.value.replace(/\D/g, '') }))}
            placeholder="Settlement ke liye"
          />
        </Field>
        <Field label="IFSC Code" required>
          <input
            className="control"
            value={bankForm.ifsc}
            onChange={(e) => setBankForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))}
            placeholder="e.g. SBIN0001234"
          />
        </Field>
      </Modal>
    </>
  )
}

function StatTile({ color, icon, label, value, sub }) {
  return (
    <div className="card" style={{ padding: 20, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
      <div className="xs" style={{ color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 600, color }}>{value}</div>
      <div className="xs muted" style={{ marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function BreakdownRow({ label, value, negative, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
      <span className="small muted">{label}</span>
      <span style={{ color: highlight ? 'var(--verified)' : negative ? 'var(--danger)' : 'var(--ink)', fontWeight: highlight ? 800 : 700, fontSize: highlight ? 16 : 14 }}>
        {value}
      </span>
    </div>
  )
}

function DetailItem({ label, value }) {
  return (
    <div>
      <div className="xs" style={{ color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  )
}

const S = {
  bankCard: { padding: 20, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  bankLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  bankIcon: { width: 48, height: 48, background: 'var(--blue-soft)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 },
  // Soft verified→seal gradient built from the design system's own accent
  // colors (var(--verified) #137a56, var(--seal) #B0812F) — rgba() is used
  // here only because CSS custom properties can't carry alpha on their own.
  pendingCard: { padding: 24, marginBottom: 20, background: 'linear-gradient(135deg, rgba(19,122,86,0.06), rgba(176,129,47,0.06))', border: '1px solid rgba(176,129,47,0.25)' },
  pendingTop: { display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' },
  breakdown: { background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, minWidth: 260, flex: '1 1 260px' },
  cardHd: { padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 },
  cardHdIco: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 },
  cardHdTitle: { fontSize: 14, fontWeight: 600, color: 'var(--ink)' },
  detailBox: { padding: 20, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12 },
  detailBreakdown: { padding: 14, background: 'var(--paper)', borderRadius: 10, border: '1px solid var(--line)' },
}
