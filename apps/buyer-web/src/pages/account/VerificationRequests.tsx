import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMyVerificationRequests } from '../../api/verification.api'
import { Badge } from '../../components/Badge'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatRupees, verificationRequestTone } from '../../lib/format'
import type { VerificationRequest } from '../../types/api'

export default function VerificationRequests() {
  const [requests, setRequests] = useState<VerificationRequest[] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    queueMicrotask(() => {
      setError('')
      setRequests(null)
    })
    getMyVerificationRequests()
      .then((res) => setRequests(res.requests))
      .catch((err) => setError(errorMessage(err, "Couldn't load your verification requests.")))
  }

  useEffect(load, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (requests === null) return <LoadingState label="Loading verification requests…" />

  return (
    <div>
      <h1 className="h2" style={{ marginBottom: 20 }}>
        Verification requests
      </h1>

      {requests.length === 0 ? (
        <EmptyState
          icon="🔎"
          title="No verification requests yet"
          description="Open a property report and tap “Verify this property” to request a professional opinion."
        />
      ) : (
        <div className="stack">
          {requests.map((r) => (
            <Link key={r.id} to={`/account/verifications/${r.id}`} className="card" style={{ display: 'block' }}>
              <div className="spread">
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {r.source === 'LISTING' ? 'Paid report verification' : 'Owner-listed property verification'}
                </span>
                {r.status === 'OPEN' && (r.pendingQuoteCount ?? 0) > 0 ? (
                  <span className="pill pill--blue">Quotes available</span>
                ) : (
                  <Badge tone={verificationRequestTone(r.status)} />
                )}
              </div>
              <div className="spread" style={{ marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  Requested {formatDate(r.createdAt)}
                </span>
                <span style={{ fontWeight: 600, fontSize: 12.5 }}>
                  {r.agreedFee ? formatRupees(r.agreedFee) : `Your offer: ${formatRupees(r.buyerInitialOfferAmount)}`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
