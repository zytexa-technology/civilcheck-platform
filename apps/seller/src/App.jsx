import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Layout from './pages/Layout'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import TermsAcceptanceGate from './components/TermsAcceptanceGate'

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F4F1EA',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#6C7686',
      fontSize: 14,
      fontFamily: "'Sora', sans-serif",
    }}>
      Loading...
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
  const { seller, loading } = useAuth()
  if (loading) return <LoadingScreen />

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