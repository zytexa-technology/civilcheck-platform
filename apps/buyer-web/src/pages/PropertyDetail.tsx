import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { certificatePath, getMyPurchases, invoicePath, reviewPurchase, flagReport, unlockReport, verifyPurchase } from '../api/purchase.api'
import { getPropertyById } from '../api/property.api'
import { getDisclaimer } from '../api/content.api'
import { useAuth } from '../context/AuthContext'
import { Badge, Tag } from '../components/Badge'
import { Button } from '../components/Button'
import { Card, DetailRow, InfoGrid, SectionCard } from '../components/Card'
import { LocationMapSection } from '../components/LocationMapSection'
import { MediaGallery } from '../components/MediaGallery'
import { PaymentModal } from '../components/PaymentModal'
import { ErrorState, InlineNotice, LoadingState } from '../components/States'
import { Textarea } from '../components/Field'
import { VerifyPropertyCTA } from '../components/VerifyPropertyCTA'
import { errorMessage } from '../lib/errors'
import { downloadAuthenticatedPdf } from '../lib/pdf'
import { formatDate, formatRupees, humanize, riskBanner, sellerBadgeLong } from '../lib/format'
import type { CheckoutOrder, PaidReportProperty, ReportProperty } from '../types/api'

// Content Control key — admin-editable via the same Disclaimer system
// apps/buyer (mobile) already uses (see its src/components/Disclaimer.tsx).
// This fallback is only the offline/pre-publish copy; the real text is
// fetched from GET /api/content/disclaimers/:key below.
const PURCHASE_DECISION_DISCLAIMER_KEY = 'buyer-purchase-decision'
const PURCHASE_DECISION_DISCLAIMER_FALLBACK =
  'Please request professional verification before making any purchase decision. The platform does not guarantee the authenticity of third-party uploaded property information.'

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const { status } = useAuth()

  const [property, setProperty] = useState<ReportProperty | null>(null)
  const [hasPurchased, setHasPurchased] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [purchaseId, setPurchaseId] = useState<string | null>(null)

  const [payOpen, setPayOpen] = useState(false)
  const [order, setOrder] = useState<CheckoutOrder | null>(null)
  const [keyId, setKeyId] = useState<string | null>(null)
  const [startingUnlock, setStartingUnlock] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  const [flagOpen, setFlagOpen] = useState(false)
  const [flagReason, setFlagReason] = useState('')
  const [flagBusy, setFlagBusy] = useState(false)
  const [flagDone, setFlagDone] = useState(false)

  // Purchase-decision disclaimer — shown near the Unlock action, before the
  // buyer commits to a purchase-related action. Falls back to the built-in
  // copy if the key isn't published yet (same "something must always
  // render" reasoning as apps/buyer's Disclaimer component).
  const [purchaseDisclaimer, setPurchaseDisclaimer] = useState(PURCHASE_DECISION_DISCLAIMER_FALLBACK)

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)

  const load = () => {
    if (!id) return
    queueMicrotask(() => {
      setLoading(true)
      setError('')
    })
    getPropertyById(id)
      .then(async (res) => {
        setProperty(res.property)
        setHasPurchased(res.hasPurchased)
        if (res.hasPurchased && status === 'authenticated') {
          try {
            const purchases = await getMyPurchases()
            const match = purchases.purchases.find((p) => p.listingId === id)
            setPurchaseId(match?.id ?? null)
          } catch {
            // Non-critical — certificate/invoice/flag/review buttons stay hidden.
          }
        }
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load this report.")))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id, status])

  useEffect(() => {
    let live = true
    void getDisclaimer(PURCHASE_DECISION_DISCLAIMER_KEY)
      .then((res) => {
        if (live && res.disclaimer.body) setPurchaseDisclaimer(res.disclaimer.body)
      })
      .catch(() => {
        // Not published, or offline — the fallback already on screen stands.
      })
    return () => {
      live = false
    }
  }, [])

  if (loading) {
    return (
      <div className="container page">
        <LoadingState label="Loading report…" />
      </div>
    )
  }

  if (error || !property || !id) {
    return (
      <div className="container page">
        <ErrorState message={error || 'Report not found.'} onRetry={load} />
      </div>
    )
  }

  const banner = riskBanner(property.riskBadge)
  const location = property.tehsil ? `${property.tehsil}, ${property.city}` : property.city
  const paid = hasPurchased && property.isPaid ? (property as PaidReportProperty) : null

  const handleUnlock = async () => {
    setStartingUnlock(true)
    setUnlockError('')
    try {
      const res = await unlockReport(id)
      if (res.alreadyPurchased) {
        load()
        return
      }
      setOrder(res.order)
      setKeyId(res.razorpayKeyId)
      setPayOpen(true)
    } catch (err) {
      setUnlockError(errorMessage(err, "Couldn't start checkout."))
    } finally {
      setStartingUnlock(false)
    }
  }

  const handleFlag = async () => {
    if (!purchaseId || flagReason.trim().length < 10) return
    setFlagBusy(true)
    try {
      await flagReport(purchaseId, flagReason.trim())
      setFlagDone(true)
    } catch (err) {
      setUnlockError(errorMessage(err, 'Could not submit flag.'))
    } finally {
      setFlagBusy(false)
    }
  }

  const handleReview = async () => {
    if (!purchaseId || rating < 1) return
    setReviewBusy(true)
    try {
      await reviewPurchase(purchaseId, { rating, comment: comment.trim() || undefined })
      setReviewDone(true)
    } catch (err) {
      setUnlockError(errorMessage(err, 'Could not submit review.'))
    } finally {
      setReviewBusy(false)
    }
  }

  return (
    <div className="container page">
      <MediaGallery images={property.images} videos={property.videos} />

      <div className="two-col" style={{ marginTop: 24 }}>
        <div className="stack">
          <div>
            <div className="row" style={{ marginBottom: 8 }}>
              <Tag>{humanize(property.uploadedBy)}</Tag>
              {property.caseExists && !paid ? <Badge tone={{ label: 'Case on record', color: banner.color, bg: banner.bg, border: banner.border }} /> : null}
            </div>
            <h1 className="h2">{property.address}</h1>
            <p className="muted" style={{ marginTop: 6 }}>📍 {location}</p>
          </div>

          <LocationMapSection
            latitude={property.latitude}
            longitude={property.longitude}
            address={property.address}
            city={property.city}
            tehsil={property.tehsil}
            locationLabel={location ?? 'this property'}
          />

          <div className="card" style={{ background: banner.bg, borderColor: banner.border }}>
            <div className="row">
              <span style={{ fontSize: 22 }} aria-hidden="true">
                {banner.icon}
              </span>
              <div>
                <div style={{ fontWeight: 800, color: banner.color, fontSize: 13 }}>{banner.label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--cc-text)', marginTop: 2 }}>{banner.description}</div>
              </div>
            </div>
          </div>

          <SectionCard icon="🏠" title="Property details">
            <InfoGrid
              items={[
                { label: 'Property type', value: humanize(property.propertyType) },
                { label: 'Uploaded by', value: humanize(property.uploadedBy) },
                { label: 'Research date', value: formatDate(property.researchDate) },
                { label: 'Loan default', value: property.loanDefault ? 'Yes' : 'No' },
              ]}
            />
          </SectionCard>

          {!paid ? (
            <InlineNotice tone="warn" message={purchaseDisclaimer} />
          ) : null}

          {paid ? (
            <SectionCard icon="⚖️" title="Case & legal details">
              <DetailRow label="Case number" value={paid.caseNumber ?? '—'} />
              <DetailRow label="Case type" value={paid.caseType ? humanize(paid.caseType) : '—'} />
              <DetailRow label="Case status" value={paid.caseStatus ? humanize(paid.caseStatus) : '—'} />
              <DetailRow label="Court" value={paid.courtName ?? '—'} />
              <DetailRow label="Parties involved" value={paid.partiesInvolved ?? '—'} />
              {paid.loanDefault ? <DetailRow label="Lender" value={paid.lenderName ?? '—'} /> : null}
            </SectionCard>
          ) : (
            <Card>
              <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '20px 10px' }}>
                <span style={{ fontSize: 30 }} aria-hidden="true">
                  🔒
                </span>
                <h3 style={{ fontWeight: 700, fontSize: 14.5 }}>Unlock the full report</h3>
                <p className="muted" style={{ fontSize: 12.5, maxWidth: 340 }}>
                  Case number, court, parties involved, lender details, seller notes, documents and
                  contact — for {formatRupees(property.price)}.
                </p>
                {unlockError ? <InlineNotice tone="warn" message={unlockError} /> : null}
                <Button loading={startingUnlock} onClick={() => void handleUnlock()}>
                  Unlock for {formatRupees(property.price)}
                </Button>
              </div>
            </Card>
          )}

          {paid?.sellerNotes ? (
            <SectionCard icon="📝" title="Seller notes">
              <p style={{ fontSize: 13, lineHeight: 1.6, padding: '12px 0' }}>{paid.sellerNotes}</p>
            </SectionCard>
          ) : null}

          {paid?.documents && paid.documents.length > 0 ? (
            <SectionCard icon="📎" title="Documents">
              <div className="stack" style={{ padding: '10px 0' }}>
                {paid.documents.map((doc, i) => (
                  <a key={doc} href={doc} target="_blank" rel="noreferrer" className="detail-row" style={{ color: 'var(--cc-blue)' }}>
                    <span>📄 Document {i + 1}</span>
                    <span>Open ↗</span>
                  </a>
                ))}
              </div>
            </SectionCard>
          ) : null}

          <VerifyPropertyCTA source="LISTING" targetId={id} />
        </div>

        <aside className="stack">
          <Card>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--cc-gold)' }}>
              {property.isPaid ? 'Unlocked' : formatRupees(property.price)}
            </div>
            {!paid ? <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>One-time payment · includes GST invoice</p> : null}

            {paid?.sellerName ? (
              <div className="divider" />
            ) : null}
            {paid ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{sellerBadgeLong(paid.sellerBadge)}</p>
                {paid.sellerName ? <p className="muted" style={{ fontSize: 12 }}>{paid.sellerName}</p> : null}
                {paid.sellerContact ? <p style={{ fontSize: 12.5, marginTop: 6 }}>📞 {paid.sellerContact}</p> : null}
              </>
            ) : null}

            {purchaseId ? (
              <div className="stack" style={{ marginTop: 16 }}>
                <Button
                  variant="secondary"
                  onClick={() => void downloadAuthenticatedPdf(certificatePath(purchaseId), `civilcheck-certificate-${id}.pdf`)}
                >
                  📄 Download certificate
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void downloadAuthenticatedPdf(invoicePath(purchaseId), `civilcheck-invoice-${id}.pdf`)}
                >
                  🧾 Download GST invoice
                </Button>
              </div>
            ) : null}
          </Card>

          {purchaseId ? (
            <Card>
              <h3 style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>Rate this report</h3>
              {reviewDone ? (
                <InlineNotice message="Thanks — your review was submitted." />
              ) : (
                <div className="stack">
                  <div className="row">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                        onClick={() => setRating(n)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: n <= rating ? 'var(--cc-gold)' : 'var(--cc-border-2)' }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <Textarea
                    placeholder="Optional comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                  />
                  <Button variant="secondary" loading={reviewBusy} disabled={rating < 1} onClick={() => void handleReview()}>
                    Submit review
                  </Button>
                </div>
              )}
            </Card>
          ) : null}

          {purchaseId ? (
            <Card>
              {flagDone ? (
                <InlineNotice message="Thanks — we'll take a look at this report." />
              ) : flagOpen ? (
                <div className="stack">
                  <Textarea
                    label="What looks outdated?"
                    placeholder="Describe why this report looks outdated (min 10 characters)"
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    rows={3}
                  />
                  <Button variant="danger" loading={flagBusy} disabled={flagReason.trim().length < 10} onClick={() => void handleFlag()}>
                    Submit flag
                  </Button>
                </div>
              ) : (
                <button type="button" className="btn btn--ghost" onClick={() => setFlagOpen(true)}>
                  ⚠️ Report looks outdated?
                </button>
              )}
            </Card>
          ) : null}
        </aside>
      </div>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        order={order}
        razorpayKeyId={keyId}
        successTitle="Report unlocked!"
        successMessage="Your full report is ready. You can download the certificate and GST invoice below."
        successButtonLabel="View full report"
        onPaid={async (result) => {
          await verifyPurchase(result)
        }}
        onSuccess={() => {
          setPayOpen(false)
          load()
        }}
      />
    </div>
  )
}
