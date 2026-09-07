import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  acceptVerificationQuote,
  cancelVerificationRequest,
  createAdvanceOrder,
  createClaim,
  createFinalOrder,
  getMyClaims,
  getVerificationQuotes,
  getVerificationReport,
  getVerificationRequestById,
  verifyAdvancePayment,
  verifyFinalPayment,
} from '../../api/verification.api'
import { useAuth } from '../../context/AuthContext'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card, DetailRow, SectionCard } from '../../components/Card'
import { Input, Textarea } from '../../components/Field'
import { PaymentModal } from '../../components/PaymentModal'
import { ErrorState, InlineNotice, LoadingState } from '../../components/States'
import { VerificationStepper } from '../../components/VerificationStepper'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatRupees, sellerBadgeLong, verificationRequestTone } from '../../lib/format'
import type { CheckoutOrder, Claim, VerificationQuote, VerificationReport, VerificationRequest } from '../../types/api'

type PaymentStage = 'advance' | 'final' | null

export default function VerificationRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const [request, setRequest] = useState<VerificationRequest | null>(null)
  const [report, setReport] = useState<VerificationReport | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [error, setError] = useState('')

  const [quotes, setQuotes] = useState<VerificationQuote[]>([])
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [confirmQuoteId, setConfirmQuoteId] = useState<string | null>(null)
  const [quoteError, setQuoteError] = useState('')

  const [stage, setStage] = useState<PaymentStage>(null)
  const [order, setOrder] = useState<CheckoutOrder | null>(null)
  const [keyId, setKeyId] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [startingPay, setStartingPay] = useState(false)
  const [payError, setPayError] = useState('')

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelResult, setCancelResult] = useState<{ fee: number; refund: number; paid: number } | null>(null)

  const [claimOpen, setClaimOpen] = useState(false)
  const [claimReason, setClaimReason] = useState('')
  const [claimDescription, setClaimDescription] = useState('')
  const [claimEvidence, setClaimEvidence] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimError, setClaimError] = useState('')

  const load = () => {
    if (!id) return
    queueMicrotask(() => setError(''))
    getVerificationRequestById(id)
      .then(async (res) => {
        setRequest(res.request)
        if (res.request.status === 'REPORT_UNLOCKED') {
          const [reportRes, claimsRes] = await Promise.allSettled([getVerificationReport(id), getMyClaims(id)])
          if (reportRes.status === 'fulfilled') setReport(reportRes.value.report)
          if (claimsRes.status === 'fulfilled') setClaims(claimsRes.value.claims)
        }
        if (res.request.status === 'OPEN') {
          const quotesRes = await getVerificationQuotes(id).catch(() => null)
          if (quotesRes) setQuotes(quotesRes.quotes)
        } else {
          setQuotes([])
        }
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load this request.")))
  }

  useEffect(load, [id])

  const handleAcceptQuote = async (quoteId: string) => {
    if (!id) return
    setAcceptingId(quoteId)
    setQuoteError('')
    try {
      await acceptVerificationQuote(id, quoteId)
      setConfirmQuoteId(null)
      load()
    } catch (err) {
      setQuoteError(errorMessage(err, 'Could not accept this quote — it may no longer be available.'))
    } finally {
      setAcceptingId(null)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!request || !id) return <LoadingState label="Loading verification request…" />

  const CANCELLABLE = new Set([
    'OPEN', 'ACCEPTED', 'ADVANCE_PAYMENT_PENDING', 'ADVANCE_PAID', 'IN_PROGRESS', 'COMPLETED', 'FINAL_PAYMENT_PENDING',
  ])
  // Once cancelResult is set, keep the card mounted so the fee/refund
  // confirmation stays visible — cancelling flips request.status to
  // CANCELLED in the same render that sets cancelResult, so gating on
  // CANCELLABLE alone would hide the confirmation before it's ever shown.
  const canCancel = CANCELLABLE.has(request.status) || cancelResult !== null
  const canRaiseClaim = request.status === 'REPORT_UNLOCKED' && !claims.some((c) => c.status === 'OPEN' || c.status === 'UNDER_REVIEW')

  const startPayment = async (which: PaymentStage) => {
    if (!which) return
    setStartingPay(true)
    setPayError('')
    try {
      const res = which === 'advance' ? await createAdvanceOrder(id) : await createFinalOrder(id)
      setOrder(res.order)
      setKeyId(res.razorpayKeyId)
      setStage(which)
      setPayOpen(true)
    } catch (err) {
      setPayError(errorMessage(err, "Couldn't start payment."))
    } finally {
      setStartingPay(false)
    }
  }

  const handleCancel = async () => {
    if (cancelReason.trim().length < 10) return
    setCancelBusy(true)
    try {
      const res = await cancelVerificationRequest(id, cancelReason.trim())
      setRequest(res.request)
      setCancelResult({ fee: res.cancellationFee, refund: res.refundAmount, paid: res.paidAmount })
    } catch (err) {
      setPayError(errorMessage(err, 'Could not cancel this request.'))
    } finally {
      setCancelBusy(false)
    }
  }

  const handleClaim = async () => {
    if (claimReason.trim().length < 3 || claimDescription.trim().length < 20) return
    setClaimBusy(true)
    setClaimError('')
    try {
      const evidence = claimEvidence
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await createClaim(id, { reason: claimReason.trim(), description: claimDescription.trim(), evidence })
      setClaims((prev) => [res.claim, ...prev])
      setClaimOpen(false)
      setClaimReason('')
      setClaimDescription('')
      setClaimEvidence('')
    } catch (err) {
      setClaimError(errorMessage(err, 'Could not submit your claim.'))
    } finally {
      setClaimBusy(false)
    }
  }

  return (
    <div className="two-col">
      <div className="stack">
        <div className="spread">
          <h1 className="h2" style={{ fontSize: 20 }}>
            Verification request
          </h1>
          <Badge tone={verificationRequestTone(request.status)} />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Requested {formatDate(request.createdAt)} ·{' '}
          {request.source === 'LISTING' ? 'Paid report' : 'Owner-listed property'} · Your initial offer{' '}
          {formatRupees(request.buyerInitialOfferAmount)}
        </p>

        {payError ? <InlineNotice tone="warn" message={payError} /> : null}

        <SectionCard icon="📋" title="Progress">
          <div style={{ padding: '10px 0' }}>
            <VerificationStepper status={request.status} />
          </div>
        </SectionCard>

        {request.status === 'OPEN' ? (
          <SectionCard icon="💬" title="Compare quotes">
            {quoteError ? (
              <div style={{ padding: '4px 0 10px' }}>
                <InlineNotice tone="warn" message={quoteError} />
              </div>
            ) : null}
            {quotes.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, padding: '10px 0' }}>
                Waiting for Experts/Admin to respond with a quote. You'll be able to compare and accept one here.
              </p>
            ) : (
              <div className="stack" style={{ padding: '6px 0' }}>
                {quotes.map((q) => (
                  <div key={q.id} className="card" style={{ padding: 14 }}>
                    <div className="spread">
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        {q.quotedBySeller ? q.quotedBySeller.name : 'CivilCheck Admin'}
                      </span>
                      <span className="gold-text" style={{ fontWeight: 800, fontSize: 15 }}>
                        {formatRupees(q.proposedFee)}
                      </span>
                    </div>
                    {q.quotedBySeller ? (
                      <p className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {sellerBadgeLong(q.quotedBySeller.badge)} · {q.quotedBySeller.profession.replace(/_/g, ' ')}
                      </p>
                    ) : null}
                    {q.message ? (
                      <p style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>{q.message}</p>
                    ) : null}
                    {confirmQuoteId === q.id ? (
                      <div className="stack" style={{ marginTop: 10, gap: 8 }}>
                        <InlineNotice
                          tone="info"
                          message={`You are selecting this provider for property verification. Final verification price: ${formatRupees(q.proposedFee)}. 50% advance required before verification: ${formatRupees(q.proposedFee / 2)}.`}
                        />
                        <div className="row">
                          <Button
                            size="sm"
                            block
                            loading={acceptingId === q.id}
                            disabled={acceptingId !== null}
                            onClick={() => void handleAcceptQuote(q.id)}
                          >
                            Confirm — Accept Offer
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmQuoteId(null)} disabled={acceptingId !== null}>
                            Back
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        block
                        style={{ marginTop: 10 }}
                        disabled={confirmQuoteId !== null}
                        onClick={() => setConfirmQuoteId(q.id)}
                      >
                        Accept this quote
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        ) : null}

        {request.assignedSeller ? (
          <SectionCard icon="👨‍⚖️" title="Assigned professional">
            <DetailRow label="Name" value={request.assignedSeller.name} />
            <DetailRow label="Standing" value={sellerBadgeLong(request.assignedSeller.badge)} />
            <DetailRow label="Profession" value={request.assignedSeller.profession.replace(/_/g, ' ')} />
            {request.assignedSeller.accuracyScore != null ? (
              <DetailRow label="Accuracy score" value={`${request.assignedSeller.accuracyScore}%`} />
            ) : null}
          </SectionCard>
        ) : null}

        {request.acceptedQuote ? (
          <SectionCard icon="💰" title="Quote">
            <DetailRow label="Proposed fee" value={formatRupees(request.acceptedQuote.proposedFee)} />
            {request.acceptedQuote.message ? (
              <p style={{ fontSize: 12.5, padding: '10px 0', lineHeight: 1.6 }}>{request.acceptedQuote.message}</p>
            ) : null}
          </SectionCard>
        ) : null}

        {report ? (
          <SectionCard icon="📄" title="Findings report">
            <p style={{ fontSize: 13, lineHeight: 1.7, padding: '12px 0' }}>{report.findings}</p>
            {report.riskAssessment ? <DetailRow label="Risk assessment" value={report.riskAssessment} /> : null}
            {report.documents.length > 0 ? (
              <div className="stack" style={{ padding: '10px 0' }}>
                {report.documents.map((doc, i) => (
                  <a key={doc} href={doc} target="_blank" rel="noreferrer" className="detail-row" style={{ color: 'var(--cc-blue)' }}>
                    <span>📄 Document {i + 1}</span>
                    <span>Open ↗</span>
                  </a>
                ))}
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        {request.status === 'REPORT_UNLOCKED' ? (
          <SectionCard icon="⚠️" title="Raise a claim">
            {claims.length > 0 ? (
              <div className="stack" style={{ padding: '10px 0' }}>
                {claims.map((c) => (
                  <div key={c.id} className="card" style={{ padding: 12 }}>
                    <div className="spread">
                      <span style={{ fontWeight: 700, fontSize: 12.5 }}>{c.reason}</span>
                      <span className="pill pill--muted">{c.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                      {c.description}
                    </p>
                    {c.resolutionNote ? (
                      <p style={{ fontSize: 11.5, marginTop: 6, color: 'var(--cc-blue)' }}>
                        Admin response: {c.resolutionNote}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {canRaiseClaim ? (
              claimOpen ? (
                <div className="stack" style={{ padding: '10px 0' }}>
                  {claimError ? <InlineNotice tone="warn" message={claimError} /> : null}
                  <Input label="Reason" value={claimReason} onChange={(e) => setClaimReason(e.target.value)} />
                  <Textarea
                    label="Describe the issue"
                    rows={4}
                    value={claimDescription}
                    onChange={(e) => setClaimDescription(e.target.value)}
                    hint="Minimum 20 characters."
                  />
                  <Input
                    label="Evidence links (optional)"
                    placeholder="Comma-separated URLs to photos or documents"
                    value={claimEvidence}
                    onChange={(e) => setClaimEvidence(e.target.value)}
                  />
                  <div className="row">
                    <Button
                      variant="danger"
                      loading={claimBusy}
                      disabled={claimReason.trim().length < 3 || claimDescription.trim().length < 20}
                      onClick={() => void handleClaim()}
                    >
                      Submit claim
                    </Button>
                    <Button variant="ghost" onClick={() => setClaimOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => setClaimOpen(true)}>
                  Report a problem with this verification
                </button>
              )
            ) : null}
          </SectionCard>
        ) : null}
      </div>

      <aside className="stack">
        <Card>
          {(request.status === 'ACCEPTED' || request.status === 'ADVANCE_PAYMENT_PENDING') && request.advanceAmount ? (
            <>
              <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Advance payment due</p>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cc-gold)', marginBottom: 12 }}>
                {formatRupees(request.advanceAmount)}
              </div>
              <Button block loading={startingPay} onClick={() => void startPayment('advance')}>
                Pay advance
              </Button>
            </>
          ) : (request.status === 'COMPLETED' || request.status === 'FINAL_PAYMENT_PENDING') && request.finalAmount ? (
            <>
              <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Final payment due</p>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cc-gold)', marginBottom: 12 }}>
                {formatRupees(request.finalAmount)}
              </div>
              <Button block loading={startingPay} onClick={() => void startPayment('final')}>
                Pay final amount
              </Button>
            </>
          ) : request.agreedFee ? (
            <>
              <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Agreed fee</p>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{formatRupees(request.agreedFee)}</div>
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Your offer</p>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{formatRupees(request.buyerInitialOfferAmount)}</div>
              <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                No payment is due yet — you'll pay only after accepting a provider's quote.
              </p>
            </>
          )}
        </Card>

        {request.status === 'CANCELLED' && !cancelResult ? (
          // A later revisit (not the same session that cancelled) — cancelResult
          // is ephemeral local state, but the fee/refund the server computed are
          // persisted on the request itself, so the breakdown must not vanish
          // just because the buyer navigated away and came back.
          <Card>
            <div className="stack">
              <InlineNotice message="This request was cancelled." />
              <DetailRow
                label="Amount paid"
                value={formatRupees((request.cancellationFee ?? 0) + (request.cancellationRefund ?? 0))}
              />
              <DetailRow label="Cancellation fee" value={formatRupees(request.cancellationFee ?? 0)} />
              <DetailRow label="Refund amount" value={formatRupees(request.cancellationRefund ?? 0)} valueColor="var(--cc-green)" />
            </div>
          </Card>
        ) : null}

        {canCancel ? (
          <Card>
            {cancelResult ? (
              <div className="stack">
                <InlineNotice message="Your cancellation was processed." />
                <DetailRow label="Amount paid" value={formatRupees(cancelResult.paid)} />
                <DetailRow label="Cancellation fee" value={formatRupees(cancelResult.fee)} />
                <DetailRow label="Refund amount" value={formatRupees(cancelResult.refund)} valueColor="var(--cc-green)" />
              </div>
            ) : cancelOpen ? (
              <div className="stack">
                <Textarea
                  label="Why are you cancelling?"
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  hint="Minimum 10 characters. The cancellation fee and refund are calculated by CivilCheck, not shown here in advance."
                />
                <div className="row">
                  <Button variant="danger" loading={cancelBusy} disabled={cancelReason.trim().length < 10} onClick={() => void handleCancel()}>
                    Confirm cancellation
                  </Button>
                  <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => setCancelOpen(true)}>
                Cancel this request
              </button>
            )}
          </Card>
        ) : null}
      </aside>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        order={order}
        razorpayKeyId={keyId}
        prefill={{ name: user?.name ?? undefined, email: user?.email ?? undefined, contact: user?.phone }}
        successTitle={stage === 'advance' ? 'Advance paid!' : 'Final payment received!'}
        successMessage={
          stage === 'advance'
            ? 'The assigned professional can now begin verifying this property.'
            : 'Your findings report is now unlocked below.'
        }
        successButtonLabel="Continue"
        onPaid={async (result) => {
          if (stage === 'advance') await verifyAdvancePayment(id, result)
          else if (stage === 'final') await verifyFinalPayment(id, result)
        }}
        onSuccess={() => {
          setPayOpen(false)
          load()
        }}
      />
    </div>
  )
}
