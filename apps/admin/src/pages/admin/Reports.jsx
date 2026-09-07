import { useState } from 'react'
import { getRevenueReport, getSettlementReport, getQCReport } from '../../api/admin.api'
import { Button, Card, PageHead, Toast } from '../../components/ui'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Computed, not hardcoded — a fixed list silently stops offering the current
// year the moment the calendar passes it. Matches Settlements.jsx's window.
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

// ─── CSV DOWNLOAD HELPER ──────────────────────────────────────────────────
const downloadCSV = (data, filename) => {
  if (!data || data.length === 0) return
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map((row) => Object.values(row).map((v) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v)).join(','))
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── REPORT CARD ──────────────────────────────────────────────────────────
const ReportCard = ({ icon, title, desc, month, year, onMonthChange, onYearChange, onExport, loading, exportLabel }) => (
  <Card style={{ padding: 24, flex: 1, minWidth: 280 }}>
    <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontFamily: 'var(--disp)', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</div>
    <p className="small muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>{desc}</p>

    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
      <select className="control" value={month} onChange={(e) => onMonthChange(parseInt(e.target.value))}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select className="control" value={year} onChange={(e) => onYearChange(parseInt(e.target.value))} style={{ width: 90 }}>
        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>

    <Button variant="primary" block onClick={onExport} disabled={loading}>{loading ? '⏳ Generating…' : exportLabel}</Button>
  </Card>
)

const SummaryGrid = ({ stats }) => (
  <div className="grid g4" style={{ marginBottom: 16 }}>
    {stats.map((stat) => (
      <div key={stat.label} className="card-flat" style={{ padding: '12px 16px' }}>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 19, fontWeight: 800, color: stat.color }}>{stat.value}</div>
        <div className="small muted" style={{ marginTop: 4 }}>{stat.label}</div>
      </div>
    ))}
  </div>
)

// ─── MAIN REPORTS PAGE ────────────────────────────────────────────────────
export default function Reports() {
  const now = new Date()

  const [revMonth, setRevMonth] = useState(now.getMonth() + 1)
  const [revYear, setRevYear] = useState(now.getFullYear())
  const [revLoading, setRevLoading] = useState(false)
  const [revData, setRevData] = useState(null)

  const [setMonth, setSetMonth] = useState(now.getMonth() + 1)
  const [setYear, setSetYear] = useState(now.getFullYear())
  const [setLoading, setSetLoading] = useState(false)
  const [setData, setSetData] = useState(null)

  const [qcMonth, setQcMonth] = useState(now.getMonth() + 1)
  const [qcYear, setQcYear] = useState(now.getFullYear())
  const [qcLoading, setQcLoading] = useState(false)
  const [qcData, setQcData] = useState(null)

  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleRevenueExport = async () => {
    setRevLoading(true)
    try {
      const data = await getRevenueReport({ month: revMonth, year: revYear })
      setRevData(data)
      const csvData = data.transactions.map((t) => ({
        Date: new Date(t.date).toLocaleDateString('en-IN'), Buyer: t.buyerName, Phone: t.buyerPhone,
        Property: t.property, City: t.city, Type: t.type, 'Amount Paid': t.amountPaid,
        'Platform Cut': t.platformCut, 'Seller Cut': t.sellerCut, 'GST (18%)': t.gst.toFixed(2),
        'Razorpay ID': t.razorpayId, Settled: t.settled ? 'Yes' : 'No',
      }))
      downloadCSV(csvData, `CivilCheck_Revenue_${MONTHS[revMonth - 1]}_${revYear}.csv`)
      showToast(`✅ Revenue report downloaded — ${data.summary.totalTransactions} transactions`)
    } catch {
      showToast('❌ Failed to generate the revenue report')
    } finally {
      setRevLoading(false)
    }
  }

  const handleSettlementExport = async () => {
    setSetLoading(true)
    try {
      const data = await getSettlementReport({ month: setMonth, year: setYear })
      setSetData(data)
      const csvData = data.sellers.map((s) => ({
        'Seller Name': s.sellerName, Phone: s.phone, Badge: s.badge, Profession: s.profession,
        'Total Earned': s.totalEarned, Settled: s.settled, Pending: s.pending,
        'TDS (10%)': s.tds.toFixed(2), 'Net Payable': s.netPayable.toFixed(2), Transactions: s.transactions,
      }))
      downloadCSV(csvData, `CivilCheck_Settlements_${MONTHS[setMonth - 1]}_${setYear}.csv`)
      showToast(`✅ Settlement report downloaded — ${data.sellers.length} sellers`)
    } catch {
      showToast('❌ Failed to generate the settlement report')
    } finally {
      setSetLoading(false)
    }
  }

  const handleQCExport = async () => {
    setQcLoading(true)
    try {
      const data = await getQCReport({ month: qcMonth, year: qcYear })
      setQcData(data)
      const csvData = data.spotChecks.map((sc) => ({
        'Check Date': new Date(sc.checkedAt).toLocaleDateString('en-IN'), Result: sc.result,
        Property: sc.listing, Seller: sc.seller, Badge: sc.badge, 'Admin Note': sc.adminNote || '—',
      }))
      downloadCSV(csvData, `CivilCheck_QC_${MONTHS[qcMonth - 1]}_${qcYear}.csv`)
      showToast(`✅ QC report downloaded — ${data.summary.totalChecks} spot checks`)
    } catch {
      showToast('❌ Failed to generate the QC report')
    } finally {
      setQcLoading(false)
    }
  }

  return (
    <div>
      <PageHead title="Platform reports" subtitle="Download automated reports for compliance, tax, and audits" />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <ReportCard icon="📊" title="Revenue report" desc="Complete transaction log with GST breakup — suitable for CA/tax filing"
          month={revMonth} year={revYear} onMonthChange={setRevMonth} onYearChange={setRevYear}
          onExport={handleRevenueExport} loading={revLoading} exportLabel="Export CSV" />
        <ReportCard icon="🏦" title="Seller settlement report" desc="Weekly payout history, TDS deductions, seller-wise earnings summary"
          month={setMonth} year={setYear} onMonthChange={setSetMonth} onYearChange={setSetYear}
          onExport={handleSettlementExport} loading={setLoading} exportLabel="Export CSV" />
        <ReportCard icon="🔍" title="Accuracy & QC report" desc="Spot-check results, seller accuracy scores, flagged and removed listings"
          month={qcMonth} year={qcYear} onMonthChange={setQcMonth} onYearChange={setQcYear}
          onExport={handleQCExport} loading={qcLoading} exportLabel="Export CSV" />
      </div>

      {revData && (
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Revenue summary — {MONTHS[revMonth - 1]} {revYear}</div>
          <SummaryGrid stats={[
            { label: 'Transactions', value: revData.summary.totalTransactions, color: 'var(--blue)' },
            { label: 'Total GMV', value: `₹${revData.summary.totalGMV.toLocaleString('en-IN')}`, color: 'var(--amber)' },
            { label: 'Platform revenue', value: `₹${revData.summary.platformRevenue.toLocaleString('en-IN')}`, color: 'var(--green)' },
            { label: 'GST collected', value: `₹${revData.summary.gstCollected.toFixed(0)}`, color: 'var(--violet)' },
          ]} />
        </Card>
      )}

      {setData && (
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Settlement summary — {MONTHS[setMonth - 1]} {setYear}</div>
          <SummaryGrid stats={[
            { label: 'Active sellers', value: setData.summary.totalSellers, color: 'var(--blue)' },
            { label: 'Total pending', value: `₹${setData.summary.totalPending.toLocaleString('en-IN')}`, color: 'var(--amber)' },
            { label: 'Total settled', value: `₹${setData.summary.totalSettled.toLocaleString('en-IN')}`, color: 'var(--green)' },
            { label: 'TDS deducted', value: `₹${setData.summary.totalTDS.toFixed(0)}`, color: 'var(--violet)' },
          ]} />
        </Card>
      )}

      {qcData && (
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>QC summary — {MONTHS[qcMonth - 1]} {qcYear}</div>
          <SummaryGrid stats={[
            { label: 'Total checks', value: qcData.summary.totalChecks, color: 'var(--blue)' },
            { label: 'Passed', value: qcData.summary.passedChecks, color: 'var(--green)' },
            { label: 'Failed', value: qcData.summary.failedChecks, color: 'var(--red)' },
            { label: 'Pass rate', value: `${qcData.summary.passRate}%`, color: 'var(--amber)' },
          ]} />
          {qcData.flaggedSellers.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600, marginBottom: 8 }}>⚠️ Low accuracy sellers ({qcData.flaggedSellers.length})</div>
              {qcData.flaggedSellers.map((seller) => (
                <div key={seller.phone} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span>{seller.name} — {seller.badge}</span>
                  <span style={{ color: seller.accuracyScore < 90 ? 'var(--red)' : 'var(--amber)', fontWeight: 600 }}>{seller.accuracyScore}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
