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
// Single source of truth for the session — same state machine as apps/buyer's
// AuthContext (status stays 'loading' until the stored token has been
// resolved, so <ProtectedRoute> never fires an authenticated request before
// the check completes and never bounce-redirects to /login on a valid
// session). Storage reads are synchronous here (localStorage), unlike the
// RN app's SecureStore, but the shape is kept identical so both apps stay
// easy to reason about side by side.
// ─────────────────────────────────────────────────────────────────────────────

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  signIn: (token: string, user: AuthUser) => void
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

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
      clearToken()
      if (mounted.current) {
        setUser(null)
        setStatus('unauthenticated')
      }
      signingOut.current = false
    }
  }, [])

  const signIn = useCallback((token: string, nextUser: AuthUser) => {
    saveToken(token)
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
      // A 401 is handled by the interceptor, which calls signOut for us.
      // Anything else (offline, 5xx) leaves the session alone.
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

  // Cold start: resolve the stored token before anything renders as authenticated.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const token = getToken()

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
          // API unreachable says nothing about whether the token is still
          // good — trust it rather than logging someone out over a flaky
          // network, and let individual pages surface their own errors.
          setStatus('authenticated')
          return
        }

        // 401 already triggered the interceptor's signOut; any other status
        // means we cannot vouch for this token either.
        setAuthToken(null)
        clearToken()
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

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs next to its context, not split into its own file.
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return context
}
