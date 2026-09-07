import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from './States'

/**
 * Route guard — mirrors apps/buyer's app/_layout.tsx redirect effect
 * (unauthenticated + protected → /login, holding render until the stored
 * token has resolved so no screen fires an authenticated request too early).
 */
export function ProtectedRoute() {
  const { status } = useAuth()
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
