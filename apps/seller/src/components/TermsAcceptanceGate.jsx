import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { acceptSellerTerms } from '../api/seller.api'
import { Card } from './ui'

/**
 * Mandatory Terms & Conditions / Privacy Policy re-acceptance — rendered by
 * App.jsx's <ProtectedRoute> in place of <Layout /> whenever the
 * authenticated seller's termsAcceptanceRequired is true (never accepted,
 * or accepted an older version than the server's current one). Applies
 * uniformly to Owner/Expert/Reporter. sellerMiddleware enforces the same
 * requirement server-side on every other protected API call regardless of
 * what this UI does.
 */
export default function TermsAcceptanceGate() {
  const { refreshSeller, logoutSeller } = useAuth()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleAccept = async () => {
    setError('')
    setBusy(true)
    try {
      await acceptSellerTerms()
      await refreshSeller()
    } catch {
      setError("Couldn't record your acceptance. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0c10', padding: 16 }}>
      <Card style={{ maxWidth: 460, width: '100%', padding: 28 }}>
        <h2 className="dev" style={{ marginBottom: 6 }}>Updated Terms &amp; Conditions</h2>
        <p className="dev muted" style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
          To continue using CivilCheck, please review and accept the latest Terms &amp; Conditions and Privacy Policy.
        </p>

        {error ? <p className="dev small" style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p> : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          <Link to="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--seal, #B67A12)', fontWeight: 600 }}>
            Review Terms &amp; Conditions →
          </Link>
          <Link to="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--seal, #B67A12)', fontWeight: 600 }}>
            Review Privacy Policy →
          </Link>
        </div>

        <label className="dev small muted" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 18 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I have read and agree to the latest Terms &amp; Conditions and Privacy Policy.</span>
        </label>

        <button className="btn btn-primary btn-block" disabled={busy || !checked} onClick={() => void handleAccept()}>
          {busy ? 'Accepting…' : 'Accept & Continue'}
        </button>
        <button className="btn btn-block" style={{ color: 'var(--muted)', marginTop: 8 }} onClick={logoutSeller}>
          Log out
        </button>
      </Card>
    </div>
  )
}
