import { useEffect, useState } from 'react'
import { getDisclaimer } from '../api/content.api'
import { LoadingState } from '../components/States'
import { errorMessage } from '../lib/errors'

// Mandatory Terms & Conditions acceptance system — this is now the general
// platform Terms & Conditions (Content Control Disclaimer key
// "terms-and-conditions"), whose `version` field is the single
// authoritative "current Terms version" the mandatory-acceptance system
// checks (see apps/api/src/services/terms.service.ts). Content is
// admin-editable through the existing Content Control UI, not hardcoded
// here. See apps/api/scripts/seed-legal-content.ts for the initial seed.
//
// The narrower, 7-day-claim-window-specific disclaimer this page used to
// show (key "verification-terms") is NOT removed — its content is still on
// file and still served at GET /api/content/disclaimers/verification-terms
// for any future contextual use — it has simply been superseded here by
// the general Terms, whose own "7-Day Claim Window" section covers the
// same ground at comparable depth.
const DISCLAIMER_KEY = 'terms-and-conditions'

export default function Terms() {
  const [title, setTitle] = useState('Terms & Conditions')
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
        if (live) setError(errorMessage(err, "Couldn't load the Terms & Conditions."))
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
