import { useEffect, useState } from 'react'
import { getDisclaimer } from '../api/content.api'
import { Card, PageHead } from '../components/ui'

// Mandatory Terms & Conditions / Privacy Policy consent — general platform
// Terms, Content Control Disclaimer key "terms-and-conditions". Version is
// the single authoritative "current Terms version" the mandatory-
// acceptance system checks (see apps/api/src/services/terms.service.ts).
// Admin-editable through the existing Content Control UI, not hardcoded
// here. See apps/api/scripts/seed-legal-content.ts for the initial seed.
const DISCLAIMER_KEY = 'terms-and-conditions'

export default function Terms() {
  const [title, setTitle] = useState('Terms & Conditions')
  const [body, setBody] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    getDisclaimer(DISCLAIMER_KEY)
      .then((res) => {
        if (!live) return
        setTitle(res.disclaimer.title)
        setBody(res.disclaimer.body)
      })
      .catch(() => {
        if (live) setError("Couldn't load the Terms & Conditions.")
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <PageHead title={title} />
      <Card style={{ padding: 20 }}>
        {body === null && !error ? <p className="muted dev">Loading…</p> : null}
        {error ? <p className="dev" style={{ color: 'var(--danger)' }}>{error}</p> : null}
        {body
          ? body.split('\n\n').map((paragraph, i) => (
              <p key={i} className="dev muted" style={{ fontSize: 13.5, lineHeight: 1.75, marginBottom: 14 }}>
                {paragraph}
              </p>
            ))
          : null}
      </Card>
    </div>
  )
}
