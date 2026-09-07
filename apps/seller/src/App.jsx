import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Layout from './pages/Layout'

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0c10',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#7b8299',
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