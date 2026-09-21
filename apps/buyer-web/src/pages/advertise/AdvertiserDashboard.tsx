import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  getAdvertiserToken,
  listCampaigns,
  setAdvertiserToken,
  startPayment,
  verifyPayment,
  type Campaign,
  type CampaignListResponse,
  type PayResponse,
} from '../../api/advertiser.api'
import { Button } from '../../components/Button'
import { ErrorState, LoadingState } from '../../components/States'
import { PaymentModal } from '../../components/PaymentModal'
import { errorMessage, errorStatus } from '../../lib/errors'
import { formatRupees } from '../../lib/format'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft — payment needed',
  PAYMENT_PENDING: 'Payment pending',
  PENDING_APPROVAL: 'Pending approval',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  REJECTED: 'Rejected',
  EXHAUSTED: 'Budget used',
  EXPIRED: 'Expired',
  COMPLETED: 'Completed',
}
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN') : '—')
const n = (v: number) => v.toLocaleString('en-IN')

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ flex: '1 1 140px', minWidth: 140 }}>
      <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>{value}</div>
    </div>
  )
}

export default function AdvertiserDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<CampaignListResponse | null>(null)
  const [error, setError] = useState('')
  const [payFor, setPayFor] = useState<Campaign | null>(null)
  const [pay, setPay] = useState<PayResponse | null>(null)
  const [payBusy, setPayBusy] = useState<string | null>(null)

  const load = () =>
    listCampaigns()
      .then((d) => { setData(d); setError('') })
      .catch((err) => {
        if (errorStatus(err) === 401) { setAdvertiserToken(null); navigate('/advertiser/login'); return }
        setError(errorMessage(err, "Couldn't load your campaigns."))
      })

  useEffect(() => {
    if (getAdvertiserToken()) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!getAdvertiserToken()) return <Navigate to="/advertiser/login" replace />

  const payNow = async (c: Campaign) => {
    setPayBusy(c.id)
    try {
      setPay(await startPayment(c.id))
      setPayFor(c)
    } catch (err) {
      setError(errorMessage(err, "Couldn't start the payment."))
    } finally {
      setPayBusy(null)
    }
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 className="h2">Advertiser dashboard</h1>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/advertiser/campaigns/new"><Button>Create Advertisement</Button></Link>
          <Button variant="ghost" onClick={() => { setAdvertiserToken(null); navigate('/advertise') }}>Log out</Button>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : data === null ? (
        <LoadingState label="Loading your campaigns…" />
      ) : (
        <>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <Stat label="Total campaigns" value={n(data.totals.campaigns)} />
            <Stat label="Active campaigns" value={n(data.totals.active)} />
            <Stat label="Total spend" value={formatRupees(data.totals.spend)} />
            <Stat label="Total impressions" value={n(data.totals.impressions)} />
            <Stat label="Total clicks" value={n(data.totals.clicks)} />
          </div>

          {data.campaigns.length === 0 ? (
            <div className="card muted" style={{ textAlign: 'center', padding: 32 }}>
              No campaigns yet. Create your first advertisement to get started.
            </div>
          ) : (
            <div className="stack">
              {data.campaigns.map((c) => (
                <div key={c.id} className="card">
                  <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{c.businessName} — {c.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>Status: <b>{STATUS_LABEL[c.status] ?? c.status}</b></div>
                    </div>
                    {c.status === 'DRAFT' || c.status === 'PAYMENT_PENDING' ? (
                      <Button size="sm" loading={payBusy === c.id} onClick={() => void payNow(c)}>
                        Pay {formatRupees(c.budget)}
                      </Button>
                    ) : null}
                  </div>
                  {c.status === 'REJECTED' && c.rejectionReason ? (
                    <p style={{ fontSize: 13, marginTop: 8, color: 'var(--cc-red)' }}>Reason: {c.rejectionReason}</p>
                  ) : null}
                  {c.status === 'REJECTED' && c.refund && c.refund.status !== 'NOT_REQUIRED' ? (
                    <p style={{ fontSize: 13, marginTop: 4 }}>
                      Refund: <b>{formatRupees(c.refund.amount || c.paidAmount || 0)}</b> —{' '}
                      {c.refund.status === 'REFUNDED'
                        ? `refunded${c.refund.refundedAt ? ` on ${new Date(c.refund.refundedAt).toLocaleDateString('en-IN')}` : ''}`
                        : c.refund.status === 'FAILED'
                          ? 'we could not complete it automatically; our team will follow up'
                          : 'in progress'}
                    </p>
                  ) : null}
                  {c.status === 'PAYMENT_PENDING' && c.paymentStatus === 'FAILED' ? (
                    <p style={{ fontSize: 13, marginTop: 8 }}>Your last payment attempt failed. You can try again.</p>
                  ) : null}
                  <div className="row" style={{ flexWrap: 'wrap', gap: 18, marginTop: 10, fontSize: 12.5 }}>
                    <span>Budget <b>{formatRupees(c.budget)}</b></span>
                    <span>Spent <b>{formatRupees(c.spent)}</b></span>
                    <span>Remaining <b>{formatRupees(c.remaining)}</b></span>
                    <span>Impressions <b>{n(c.impressions)}</b></span>
                    <span>Clicks <b>{n(c.clicks)}</b></span>
                    <span>CTR <b>{c.ctr}%</b></span>
                    {c.effectiveCpc != null ? <span>Effective CPC <b>{formatRupees(c.effectiveCpc)}</b></span> : null}
                    <span>Start <b>{fmtDate(c.startDate)}</b></span>
                    <span>End <b>{fmtDate(c.endDate)}</b></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <PaymentModal
        open={payFor !== null}
        onClose={() => setPayFor(null)}
        order={pay?.order ?? null}
        razorpayKeyId={pay?.razorpayKeyId ?? null}
        priceLabel={payFor ? formatRupees(payFor.budget) : undefined}
        successTitle="Payment successful"
        successMessage="Payment received. Once it is confirmed your campaign moves to pending approval."
        successButtonLabel="Back to dashboard"
        onPaid={async (r) => {
          if (payFor) await verifyPayment(payFor.id, r)
        }}
        onSuccess={() => { setPayFor(null); void load() }}
      />
    </div>
  )
}
