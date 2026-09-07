import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'

// ─── PROTECTED ROUTE ──────────────────────────────────────────────────────
// Agar admin logged in nahi hai → Login page par bhejo
// Agar logged in hai → page dikhao
const ProtectedRoute = ({ children }) => {
  const { admin, loading } = useAuth()

  // Token check ho raha hai — wait karo
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0c10',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        fontSize: 14,
        fontFamily: 'Poppins, sans-serif'
      }}>
        Loading...
      </div>
    )
  }

  // Logged in nahi → Login par bhejo
  if (!admin) return <Navigate to="/login" replace />

  return children
}

// ─── APP ROUTES ───────────────────────────────────────────────────────────
function AppRoutes() {
  const { admin } = useAuth()

  return (
    <Routes>
      {/* Login page — agar already logged in toh dashboard par bhejo */}
      <Route
        path="/login"
        element={admin ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* SuperAdmin-only self-service reset — no signup exists here or
          anywhere in this app; see ForgotPassword.jsx's own header comment. */}
      <Route
        path="/forgot-password"
        element={admin ? <Navigate to="/dashboard" replace /> : <ForgotPassword />}
      />

      {/* Protected routes — sirf logged in admin dekh sakta hai. /* so
          Dashboard's own nested <Routes> can render sub-pages under real
          URLs (deep-linkable, back/forward works) instead of local tab state. */}
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Default — dashboard par bhejo */}
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