import { useState } from 'react'
import { Link } from 'react-router-dom'
import { acceptTerms as acceptTermsApi } from '../api/auth.api'
import { useAuth } from '../context/AuthContext'
import { Button } from './Button'
import { InlineNotice } from './States'
import { errorMessage } from '../lib/errors'

/**
 * Mandatory Terms & Conditions / Privacy Policy re-acceptance — rendered by
 * <ProtectedRoute> in place of the requested route whenever the
 * authenticated buyer's AuthUser.termsAcceptanceRequired is true (never
 * accepted, or accepted an older version than the server's current one).
 * Blocks all protected navigation until accepted; does not touch
 * login/signup/email-verification/forgot-password/logout, none of which
 * render inside <ProtectedRoute>.
 */
export function TermsAcceptanceGate() {
  const { refreshUser, signOut } = useAuth()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleAccept = async () => {
    setError('')
    setBusy(true)
    try {
      await acceptTermsApi()
      // Re-fetch the session so AuthUser.termsAcceptanceRequired flips to
      // false and <ProtectedRoute> renders the originally-requested route.
      await refreshUser()
    } catch (err) {
      setError(errorMessage(err, "Couldn't record your acceptance. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container page center" style={{ minHeight: '70vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, padding: 32 }}>
        <h1 className="h2" style={{ marginBottom: 6 }}>Updated Terms &amp; Conditions</h1>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>
          To continue using CivilCheck, please review and accept the latest Terms &amp; Conditions and Privacy Policy.
        </p>

        {error ? (
          <div style={{ marginBottom: 16 }}>
            <InlineNotice tone="warn" message={error} />
          </div>
        ) : null}

        <div className="stack" style={{ marginBottom: 20 }}>
          <Link to="/terms" target="_blank" rel="noopener noreferrer" className="gold-text" style={{ fontWeight: 600 }}>
            Review Terms &amp; Conditions →
          </Link>
          <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="gold-text" style={{ fontWeight: 600 }}>
            Review Privacy Policy →
          </Link>
        </div>

        <label className="small muted" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.5, cursor: 'pointer', marginBottom: 20 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I have read and agree to the latest Terms &amp; Conditions and Privacy Policy.</span>
        </label>

        <Button size="lg" block loading={busy} disabled={!checked} onClick={() => void handleAccept()}>
          Accept &amp; Continue
        </Button>

        <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5 }}>
          Not ready?{' '}
          <button
            type="button"
            className="gold-text"
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
            onClick={() => void signOut()}
          >
            Log out
          </button>
        </p>
      </div>
    </div>
  )
}
