import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { setAuthToken, setUnauthorizedHandler } from '../api/client'
import { getMe, logout as apiLogout } from '../api/auth.api'
import { clearToken, getToken, saveToken } from '../api/storage'
import { errorStatus, isNetworkError } from '../lib/errors'
import type { AuthUser } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the session.
//
// This replaces the old approach, where app/_layout.tsx fired a bare useEffect
// token check with no loading state and every screen separately called
// getMe(). Two consequences of that, both fixed here:
//
//   • The tab navigator mounted before the check resolved, so Home issued
//     authenticated requests that 401'd on a cold start with no token, and the
//     login redirect landed only after those had already failed.
//
//   • A 401 mid-session cleared the stored token but left the user sitting on
//     an authenticated screen, because nothing was listening.
//
// `status` stays 'loading' until the stored token has been resolved, and the
// root layout holds the splash screen for exactly that long.
// ─────────────────────────────────────────────────────────────────────────────

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** Persist a fresh login and switch the app into its authenticated state. */
  signIn: (token: string, user: AuthUser) => Promise<void>
  /** Clear the session locally and tell the API (best-effort). */
  signOut: () => Promise<void>
  /** Re-read the profile — after a name change, or to retry a failed bootstrap. */
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  // Guards against a 401 arriving from several in-flight requests at once, and
  // against state updates after unmount.
  const signingOut = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const signOut = useCallback(async () => {
    if (signingOut.current) return
    signingOut.current = true

    try {
      await apiLogout()
    } finally {
      setAuthToken(null)
      await clearToken()
      if (mounted.current) {
        setUser(null)
        setStatus('unauthenticated')
      }
      signingOut.current = false
    }
  }, [])

  const signIn = useCallback(async (token: string, nextUser: AuthUser) => {
    await saveToken(token)
    setAuthToken(token)
    if (mounted.current) {
      setUser(nextUser)
      setStatus('authenticated')
    }
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const { user: fresh } = await getMe()
      if (mounted.current) {
        setUser(fresh)
        setStatus('authenticated')
      }
    } catch (error) {
      // A 401 is handled by the interceptor below, which calls signOut for us.
      // Anything else (offline, 5xx) leaves the session alone — a flaky network
      // is not a reason to make someone log in again.
      if (errorStatus(error) !== 401) return
    }
  }, [])

  // Any 401 from any request tears the session down exactly once.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut()
    })
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  // Cold start: resolve the stored token before anything renders.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const token = await getToken()

      if (!token) {
        setAuthToken(null)
        if (!cancelled && mounted.current) setStatus('unauthenticated')
        return
      }

      setAuthToken(token)

      try {
        const { user: fresh } = await getMe()
        if (!cancelled && mounted.current) {
          setUser(fresh)
          setStatus('authenticated')
        }
      } catch (error) {
        if (cancelled || !mounted.current) return

        if (isNetworkError(error)) {
          // The API is unreachable, which says nothing about whether the token
          // is still good. Trust it and let individual screens surface their
          // own errors, rather than logging someone out because their train
          // went into a tunnel.
          setStatus('authenticated')
          return
        }

        // 401 already triggered the interceptor's signOut; any other status
        // means we cannot vouch for this token either.
        setAuthToken(null)
        await clearToken()
        setUser(null)
        setStatus('unauthenticated')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signOut, refreshUser }),
    [status, user, signIn, signOut, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return context
}
