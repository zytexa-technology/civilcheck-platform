import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMySpecialRequests } from '../../api/specialRequest.api'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatRupees, specialRequestTone } from '../../lib/format'
import type { SpecialRequestSummary } from '../../types/api'

export default function MyRequests() {
  const [requests, setRequests] = useState<SpecialRequestSummary[] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    queueMicrotask(() => {
      setError('')
      setRequests(null)
    })
    getMySpecialRequests()
      .then((res) => setRequests(res.requests))
      .catch((err) => setError(errorMessage(err, "Couldn't load your requests.")))
  }

  useEffect(load, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (requests === null) return <LoadingState label="Loading requests…" />

  return (
    <div>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h1 className="h2">Custom research requests</h1>
        <Link to="/account/requests/new">
          <Button>New request</Button>
        </Link>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="No custom requests yet"
          description="Can't find a property in our database? Ask an expert to research it for you."
          actionLabel="Request research"
          onAction={() => (window.location.href = '/account/requests/new')}
        />
      ) : (
        <div className="stack">
          {requests.map((r) => (
            <Link key={r.id} to={`/account/requests/${r.id}`} className="card" style={{ display: 'block' }}>
              <div className="spread">
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{r.address}</span>
                <Badge tone={specialRequestTone(r.status)} />
              </div>
              <div className="spread" style={{ marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {r.city} · {formatDate(r.createdAt)}
                </span>
                <span style={{ fontWeight: 600, fontSize: 12.5 }}>{formatRupees(r.advanceAmount)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
