import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from './States'
import { TermsAcceptanceGate } from './TermsAcceptanceGate'

/**
 * Route guard — mirrors apps/buyer's app/_layout.tsx redirect effect
 * (unauthenticated + protected → /login, holding render until the stored
 * token has resolved so no screen fires an authenticated request too early).
 *
 * Also blocks normal protected navigation (never login/signup/email-
 * verification/forgot-password/logout/terms/privacy, none of which render
 * inside this guard) behind the mandatory Terms & Conditions re-acceptance
 * gate whenever the session's AuthUser.termsAcceptanceRequired is true —
 * authMiddleware enforces the same requirement server-side on every other
 * protected API call regardless of what this UI does, so this is a UX
 * convenience, not the real enforcement boundary.
 */
export function ProtectedRoute() {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="container page">
        <LoadingState label="Loading your session…" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }

  if (user?.termsAcceptanceRequired) {
    return <TermsAcceptanceGate />
  }

  return <Outlet />
}

/** Login/Register — bounce an already-authenticated buyer back to their account. */
export function GuestOnlyRoute() {
  const { status } = useAuth()

  if (status === 'authenticated') {
    return <Navigate to="/account" replace />
  }

  return <Outlet />
}
