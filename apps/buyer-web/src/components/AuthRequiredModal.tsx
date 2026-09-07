import { useNavigate } from 'react-router-dom'
import { Button } from './Button'

interface AuthRequiredModalProps {
  open: boolean
  onClose: () => void
  /** e.g. "request property verification", "like this property". */
  action?: string
  /** Where to return the buyer after they sign in/up. Defaults to the current path. */
  returnTo?: string
}

/**
 * The one "account required" modal, reused for every action that needs a
 * buyer identity — Like/Comment/Save (§5) and Request Verification (§7).
 * Browsing/searching never triggers this; it only ever appears on a genuine
 * write action. Reuses the existing Login/Register pages via `next=`, so a
 * successful sign-in returns the buyer to exactly where they were.
 */
export function AuthRequiredModal({ open, onClose, action = 'continue', returnTo }: AuthRequiredModalProps) {
  const navigate = useNavigate()
  if (!open) return null

  const next = encodeURIComponent(returnTo ?? window.location.pathname + window.location.search)

  const go = (path: 'login' | 'register') => {
    onClose()
    navigate(`/${path}?next=${next}`)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '8px 0 4px' }}>
          <span style={{ fontSize: 40 }} aria-hidden="true">
            🔒
          </span>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>Create an account to {action}</h3>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 300 }}>
            Browsing CivilCheck is always free — signing in just lets us keep this tied to your account.
          </p>
          <div className="stack" style={{ width: '100%', marginTop: 8 }}>
            <Button size="lg" block onClick={() => go('register')}>
              Create Account
            </Button>
            <Button size="lg" variant="secondary" block onClick={() => go('login')}>
              Log In
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
