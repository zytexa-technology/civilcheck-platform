import { useEffect, useState } from 'react'
import { getDisclaimer } from '../api/content.api'
import { LoadingState } from '../components/States'
import { errorMessage } from '../lib/errors'

// Mandatory Terms & Conditions / Privacy Policy acceptance system — same
// Content Control Disclaimer pattern as Terms.tsx, key "privacy-policy".
// Admin-editable through the existing Content Control UI, not hardcoded
// here. See apps/api/scripts/seed-legal-content.ts for the initial seed.
const DISCLAIMER_KEY = 'privacy-policy'

export default function Privacy() {
  const [title, setTitle] = useState('Privacy Policy')
  const [body, setBody] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    getDisclaimer(DISCLAIMER_KEY)
      .then((res) => {
        if (!live) return
        setTitle(res.disclaimer.title)
        setBody(res.disclaimer.body)
      })
      .catch((err) => {
        if (live) setError(errorMessage(err, "Couldn't load the Privacy Policy."))
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <h1 className="h2" style={{ marginBottom: 18 }}>
        {title}
      </h1>

      {body === null && !error ? <LoadingState /> : null}
      {error ? <p className="muted" style={{ color: 'var(--cc-red)', fontSize: 13 }}>{error}</p> : null}

      {body
        ? body.split('\n\n').map((paragraph, i) => (
            <p key={i} className="muted" style={{ fontSize: 13.5, lineHeight: 1.75, marginBottom: 14 }}>
              {paragraph}
            </p>
          ))
        : null}
    </div>
  )
}
