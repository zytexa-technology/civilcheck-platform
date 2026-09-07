import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cancelAlert, getAlertHistory, getMyAlerts } from '../../api/alert.api'
import { cancelSubscription, getMySubscriptions, subscribeToAlerts } from '../../api/subscription.api'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatPaise, riskTone, subscriptionTone } from '../../lib/format'
import type { AlertHistoryResponse, MyAlertsResponse, Subscription } from '../../types/api'

type Tab = 'watching' | 'history' | 'subscription'

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
        <button type="button" className="chip" aria-pressed={tab === 'subscription'} onClick={() => setTab('subscription')}>
          Subscription
        </button>
      </div>

      {tab === 'watching' ? <Watching /> : tab === 'history' ? <History /> : <SubscriptionTab />}
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
            <Badge tone={riskTone(entry.property.riskBadge)} />
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

function SubscriptionTab() {
  const [subs, setSubs] = useState<Subscription[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = () => {
    queueMicrotask(() => {
      setError('')
      setSubs(null)
    })
    getMySubscriptions()
      .then((res) => setSubs(res.subscriptions))
      .catch((err) => setError(errorMessage(err, "Couldn't load your subscription.")))
  }
  useEffect(load, [])

  const active = subs?.find((s) => s.status === 'ACTIVE' || s.status === 'CREATED')

  const handleSubscribe = async () => {
    setBusy(true)
    setNotice('')
    try {
      await subscribeToAlerts()
      setNotice('Subscription started — it will activate once payment authorization completes.')
      load()
    } catch (err) {
      setNotice(errorMessage(err, 'Could not start subscription.'))
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async (id: string) => {
    setBusy(true)
    try {
      await cancelSubscription(id)
      load()
    } catch (err) {
      setNotice(errorMessage(err, 'Could not cancel subscription.'))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (subs === null) return <LoadingState />

  return (
    <div className="card">
      <h3 style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>Case-update alerts</h3>
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>
        Get notified whenever there's a change to a case you're tracking — ₹49/month.
      </p>
      {notice ? (
        <div style={{ marginBottom: 14 }}>
          <InlineNotice message={notice} />
        </div>
      ) : null}
      {active ? (
        <div className="stack">
          <div className="row">
            <Badge tone={subscriptionTone(active.status)} />
            <span style={{ fontWeight: 600 }}>{formatPaise(active.amount)}/mo</span>
          </div>
          {active.status !== 'CANCELLED' ? (
            <Button variant="danger" loading={busy} onClick={() => void handleCancel(active.id)}>
              Cancel subscription
            </Button>
          ) : null}
        </div>
      ) : (
        <Button loading={busy} onClick={() => void handleSubscribe()}>
          Subscribe for ₹49/month
        </Button>
      )}
    </div>
  )
}
