import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getSupportTicketById, HUMAN_HANDOFF_MESSAGE, postSupportMessage } from '../../api/support.api'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Textarea } from '../../components/Field'
import { ErrorState, LoadingState } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatDateTime, supportTicketTone } from '../../lib/format'
import type { SupportMessage, SupportTicket } from '../../types/api'

const SENDER_LABEL: Record<SupportMessage['sender'], string> = {
  USER: 'You',
  AI: 'CivilCheck AI',
  ADMIN: 'Support agent',
  SYSTEM: 'System',
}

export default function SupportTicketDetail() {
  const { id } = useParams<{ id: string }>()
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = () => {
    if (!id) return
    queueMicrotask(() => setError(''))
    getSupportTicketById(id)
      .then((res) => {
        setTicket(res.ticket)
        setMessages(res.messages)
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load this ticket.")))
  }

  useEffect(load, [id])
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])

  const send = async (body: string) => {
    if (!id || !body.trim() || sending) return
    setSending(true)
    try {
      const res = await postSupportMessage(id, body.trim())
      setTicket(res.ticket)
      setDraft('')
      load()
    } catch (err) {
      setError(errorMessage(err, 'Could not send your message.'))
    } finally {
      setSending(false)
    }
  }

  if (error && !ticket) return <ErrorState message={error} onRetry={load} />
  if (!ticket) return <LoadingState label="Loading conversation…" />

  const closed = ticket.status === 'CLOSED'

  return (
    <div>
      <div className="spread" style={{ marginBottom: 4 }}>
        <h1 className="h2" style={{ fontSize: 20 }}>
          {ticket.subject}
        </h1>
        <Badge tone={supportTicketTone(ticket.status)} />
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginBottom: 20 }}>
        Opened {formatDateTime(ticket.createdAt)}
      </p>

      <div className="card stack" style={{ maxHeight: 480, overflowY: 'auto', marginBottom: 16 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.sender === 'USER' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
            <div
              style={{
                background: m.sender === 'USER' ? 'var(--cc-gold-dim)' : 'var(--cc-surface-2)',
                border: `1px solid ${m.sender === 'USER' ? 'var(--cc-gold-border)' : 'var(--cc-border-2)'}`,
                borderRadius: 12,
                padding: '10px 13px',
              }}
            >
              <div className="muted" style={{ fontSize: 10, marginBottom: 3, fontWeight: 700 }}>
                {SENDER_LABEL[m.sender]}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </div>
            <div className="muted" style={{ fontSize: 9.5, marginTop: 3, textAlign: m.sender === 'USER' ? 'right' : 'left' }}>
              {formatDateTime(m.createdAt)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {closed ? (
        <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>
          This ticket is closed.{' '}
          <a href="/support/new" className="gold-text">
            Start a new one
          </a>
          .
        </p>
      ) : (
        <div className="stack">
          <Textarea
            aria-label="Message"
            placeholder="Type a message…"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn--ghost" onClick={() => void send(HUMAN_HANDOFF_MESSAGE)}>
              🧑‍💼 Talk to a human
            </button>
            <Button loading={sending} disabled={!draft.trim()} onClick={() => void send(draft)}>
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
