import { Link } from 'react-router-dom'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'

const CATEGORIES = [
  { icon: '👤', label: 'Account' },
  { icon: '🏠', label: 'Property reports' },
  { icon: '🔎', label: 'Verification requests' },
  { icon: '💳', label: 'Payments' },
  { icon: '↩️', label: 'Cancellations' },
  { icon: '⚠️', label: 'Claims' },
]

export default function SupportHome() {
  return (
    <div className="container page">
      <div className="center" style={{ flexDirection: 'column', textAlign: 'center', marginBottom: 36 }}>
        <h1 className="h2" style={{ marginBottom: 8 }}>
          How can we help?
        </h1>
        <p className="muted" style={{ maxWidth: 520 }}>
          Our AI assistant answers most questions instantly. Ask for a human agent anytime and we'll
          hand you off.
        </p>
        <div className="row" style={{ marginTop: 20 }}>
          <Link to="/support/new">
            <Button size="lg">💬 Start a conversation</Button>
          </Link>
          <Link to="/account/support">
            <Button variant="secondary" size="lg">
              View my tickets
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 32 }}>
        {CATEGORIES.map((c) => (
          <Card key={c.label}>
            <div style={{ fontSize: 22, marginBottom: 8 }} aria-hidden="true">
              {c.icon}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
          Our AI assistant can answer questions about your reports, verification requests, and
          account — but it cannot approve refunds or payments, change a verification's status, or
          give a legal opinion or a guarantee about a property's authenticity. For anything like
          that, ask to talk to a human agent and we'll route it to our support team.
        </p>
      </Card>
    </div>
  )
}
