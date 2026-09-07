import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMySupportTickets } from '../../api/support.api'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatDateTime, supportTicketTone } from '../../lib/format'
import type { SupportTicket } from '../../types/api'

export default function SupportTickets() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    queueMicrotask(() => {
      setError('')
      setTickets(null)
    })
    getMySupportTickets()
      .then((res) => setTickets(res.tickets))
      .catch((err) => setError(errorMessage(err, "Couldn't load your support tickets.")))
  }

  useEffect(load, [])

  return (
    <div>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h1 className="h2">Support tickets</h1>
        <Link to="/support/new">
          <Button>New ticket</Button>
        </Link>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tickets === null ? (
        <LoadingState label="Loading tickets…" />
      ) : tickets.length === 0 ? (
        <EmptyState icon="💬" title="No support tickets yet" actionLabel="Start a conversation" onAction={() => (window.location.href = '/support/new')} />
      ) : (
        <div className="stack">
          {tickets.map((ticket) => (
            <Link key={ticket.id} to={`/account/support/${ticket.id}`} className="card" style={{ display: 'block' }}>
              <div className="spread">
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{ticket.subject}</span>
                <Badge tone={supportTicketTone(ticket.status)} />
              </div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Updated {formatDateTime(ticket.updatedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
