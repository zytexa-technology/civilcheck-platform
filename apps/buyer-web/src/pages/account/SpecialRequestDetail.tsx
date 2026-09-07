import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSpecialRequestById, retrySpecialRequestPayment, verifySpecialRequestAdvance } from '../../api/specialRequest.api'
import { useAuth } from '../../context/AuthContext'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { DetailRow, SectionCard } from '../../components/Card'
import { PaymentModal } from '../../components/PaymentModal'
import { ErrorState, LoadingState } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatRupees, humanize, sellerBadgeLong, specialRequestTone } from '../../lib/format'
import type { CheckoutOrder, SpecialRequestDetail as SpecialRequestDetailType } from '../../types/api'

export default function SpecialRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [request, setRequest] = useState<SpecialRequestDetailType | null>(null)
  const [error, setError] = useState('')

  const [order, setOrder] = useState<CheckoutOrder | null>(null)
  const [keyId, setKeyId] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [starting, setStarting] = useState(false)

  const load = () => {
    if (!id) return
    queueMicrotask(() => setError(''))
    getSpecialRequestById(id)
      .then((res) => setRequest(res.request))
      .catch((err) => setError(errorMessage(err, "Couldn't load this request.")))
  }

  useEffect(load, [id])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!request || !id) return <LoadingState label="Loading request…" />

  const handleRetry = async () => {
    setStarting(true)
    try {
      const res = await retrySpecialRequestPayment(id)
      setOrder(res.order)
      setKeyId(res.razorpayKeyId)
      setPayOpen(true)
    } catch (err) {
      setError(errorMessage(err, "Couldn't restart payment."))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="two-col">
      <div className="stack">
        <div className="spread">
          <h1 className="h2" style={{ fontSize: 20 }}>
            {request.address}
          </h1>
          <Badge tone={specialRequestTone(request.status)} />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>{request.statusMessage}</p>

        <SectionCard icon="🏠" title="Request details">
          <DetailRow label="City" value={request.city} />
          <DetailRow label="Tehsil" value={request.tehsil} />
          <DetailRow label="Property type" value={humanize(request.propertyType)} />
          <DetailRow label="Requested" value={formatDate(request.createdAt)} />
        </SectionCard>

        <SectionCard icon="❓" title="Your questions">
          <p style={{ fontSize: 13, lineHeight: 1.7, padding: '12px 0' }}>{request.questions}</p>
        </SectionCard>

        {request.seller ? (
          <SectionCard icon="👨‍⚖️" title="Assigned expert">
            <DetailRow label="Name" value={request.seller.name} />
            <DetailRow label="Standing" value={sellerBadgeLong(request.seller.badge)} />
            {request.seller.phone ? <DetailRow label="Contact" value={request.seller.phone} /> : null}
          </SectionCard>
        ) : null}

        {request.adminNote ? (
          <SectionCard icon="📝" title="Note from CivilCheck">
            <p style={{ fontSize: 13, lineHeight: 1.6, padding: '12px 0' }}>{request.adminNote}</p>
          </SectionCard>
        ) : null}

        {request.status === 'APPROVED' && request.completedListingId ? (
          <Link to={`/reports/${request.completedListingId}`}>
            <Button block size="lg">
              View completed report
            </Button>
          </Link>
        ) : null}
      </div>

      <aside>
        {!request.advancePaid ? (
          <div className="card">
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Advance payment due</p>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cc-gold)', marginBottom: 12 }}>
              {formatRupees(request.advanceAmount)}
            </div>
            <Button block loading={starting} onClick={() => void handleRetry()}>
              Complete payment
            </Button>
          </div>
        ) : (
          <div className="card">
            <p className="muted" style={{ fontSize: 12 }}>Advance paid</p>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--cc-green)' }}>
              {formatRupees(request.advanceAmount)}
            </div>
          </div>
        )}
      </aside>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        order={order}
        razorpayKeyId={keyId}
        prefill={{ name: user?.name ?? undefined, email: user?.email ?? undefined, contact: user?.phone }}
        successTitle="Payment received!"
        successMessage="An expert will review your request and get started shortly."
        onPaid={async (result) => {
          await verifySpecialRequestAdvance(id, result)
        }}
        onSuccess={() => {
          setPayOpen(false)
          load()
        }}
      />
    </div>
  )
}
