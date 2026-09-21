import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cancelAlert, getAlertHistory, getMyAlerts } from '../../api/alert.api'
import { Badge } from '../../components/Badge'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatDate, alertTone } from '../../lib/format'
import type { AlertHistoryResponse, MyAlertsResponse } from '../../types/api'

type Tab = 'watching' | 'history'

export default function Alerts() {
  const [tab, setTab] = useState<Tab>('watching')

  return (
    <div>
      <h1 className="h2" style={{ marginBottom: 20 }}>
        Watching & alerts
      </h1>
      <div className="chip-group" style={{ marginBottom: 20 }}>
        <button type="button" className="chip" aria-pressed={tab === 'watching'} onClick={() => setTab('watching')}>
          Watching
        </button>
        <button type="button" className="chip" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
          History
        </button>
      </div>

      {tab === 'watching' ? <Watching /> : <History />}
    </div>
  )
}

function Watching() {
  const [data, setData] = useState<MyAlertsResponse['alerts'] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    queueMicrotask(() => {
      setError('')
      setData(null)
    })
    getMyAlerts()
      .then((res) => setData(res.alerts))
      .catch((err) => setError(errorMessage(err, "Couldn't load your watchlist.")))
  }
  useEffect(load, [])

  const handleUnwatch = async (alertId: string) => {
    setData((prev) => prev?.filter((a) => a.alertId !== alertId) ?? prev)
    try {
      await cancelAlert(alertId)
    } catch {
      load()
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (data === null) return <LoadingState />
  if (data.length === 0) return <EmptyState icon="🔔" title="You aren't watching any properties" description="Watch a property's case status to get notified of updates." />

  return (
    <div className="stack">
      {data.map((entry) => (
        <div key={entry.alertId} className="card">
          <div className="spread">
            <Link to={`/reports/${entry.property.id}`} style={{ fontWeight: 700, fontSize: 13.5 }}>
              {entry.property.address}
            </Link>
            <Badge tone={alertTone(entry.property.propertyStatus, entry.property.disputeType)} />
          </div>
          <div className="spread" style={{ marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 11.5 }}>
              Watching since {formatDate(entry.subscribedAt)}
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleUnwatch(entry.alertId)}>
              Stop watching
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function History() {
  const [data, setData] = useState<AlertHistoryResponse['alerts'] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    queueMicrotask(() => {
      setError('')
      setData(null)
    })
    getAlertHistory()
      .then((res) => setData(res.alerts))
      .catch((err) => setError(errorMessage(err, "Couldn't load your alert history.")))
  }
  useEffect(load, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (data === null) return <LoadingState />
  if (data.length === 0) return <EmptyState icon="📜" title="No alert history yet" />

  return (
    <div className="stack">
      {data.map((entry) => (
        <div key={entry.alertId} className="card">
          <div className="spread">
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{entry.property.address}</span>
            <span className="pill pill--muted">{entry.active ? 'Active' : 'Stopped'}</span>
          </div>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {entry.property.city}
          </span>
        </div>
      ))}
    </div>
  )
}
