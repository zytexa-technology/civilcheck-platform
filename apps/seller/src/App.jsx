import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Layout from './pages/Layout'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import TermsAcceptanceGate from './components/TermsAcceptanceGate'

const screenStyle = {
  minHeight: '100vh',
  background: '#F4F1EA',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  padding: 24,
  textAlign: 'center',
  color: '#6C7686',
  fontSize: 14,
  fontFamily: "'Sora', sans-serif",
}

function LoadingScreen() {
  return <div style={screenStyle}>Loading...</div>
}

// Shown only when the session check failed for a server-side reason (timeout,
// network, 5xx) — never for a 401, which still signs the partner out and
// falls through to /login as before. The stored token is deliberately kept,
// so retrying re-runs the real /seller/profile request rather than forcing a
// re-login for what is a server problem, not an auth problem.
function SessionErrorScreen({ message, onRetry }) {
  return (
    <div style={screenStyle}>
      <div style={{ fontWeight: 600, color: '#2F3742', fontSize: 15 }}>{message}</div>
      <div style={{ maxWidth: 360, lineHeight: 1.6 }}>
        Your session is still saved — this is a problem reaching the CivilCheck
        server, not your account.
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 4,
          padding: '10px 22px',
          borderRadius: 10,
          border: 'none',
          background: '#B67A12',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "'Sora', sans-serif",
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { seller, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!seller) return <Navigate to="/login" replace />
  // Mandatory Terms & Conditions re-acceptance — blocks normal dashboard
  // access (never /login, /forgot-password, /terms, /privacy, none of
  // which render inside this guard) until accepted. Applies uniformly to
  // Owner/Expert/Reporter. sellerMiddleware enforces the same requirement
  // server-side on every other protected route regardless of this UI.
  if (seller.termsAcceptanceRequired) return <TermsAcceptanceGate />
  return children
}

function AppRoutes() {
  const { seller, loading, sessionError, retrySession } = useAuth()
  if (loading) return <LoadingScreen />
  // Server-side failure during session restore — report it instead of
  // bouncing a partner who still has a valid token to /login.
  if (sessionError && !seller) return <SessionErrorScreen message={sessionError} onRetry={retrySession} />

  return (
    <Routes>
      <Route
        path="/login"
        element={seller ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/forgot-password"
        element={seller ? <Navigate to="/dashboard" replace /> : <ForgotPassword />}
      />
      {/* Public — accessible whether or not the seller is authenticated
          (linked from the signup checkbox, the mandatory re-acceptance
          gate, and reachable directly). */}
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      {/* /* so Layout's own section-from-URL logic can read any sub-path —
          real deep-linkable routes instead of local tab state. */}
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}