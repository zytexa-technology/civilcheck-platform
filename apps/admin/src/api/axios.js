
import axios from 'axios'

// Backend ka base URL
// Development mein localhost, production mein live URL
const rawBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const API = axios.create({
  baseURL: `${rawBaseUrl}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// ─── REQUEST INTERCEPTOR ──────────────────────────────────────────────────
// Har request se pehle automatically token attach karo
// Toh har API call mein manually token nahi likhna padega
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ─── RESPONSE INTERCEPTOR ─────────────────────────────────────────────────
// Agar 401 aaye (token expire) → automatically logout karo
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // 403 TWO_FACTOR_ENROLLMENT_REQUIRED — adminMiddleware's grace-period
    // enforcement (see lib/session.ts's isTwoFactorEnrollmentOverdue). The
    // session/token is still valid — this is not a logout, just a redirect
    // to the same Security page the login flow already sends an unenrolled
    // admin to (see Login.jsx's `enrollmentRequired` handling). /2fa/status
    // (which Security.jsx calls on mount) is itself exempt from this check
    // server-side, so the page loads normally and the admin can complete
    // enrollment from there.
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'TWO_FACTOR_ENROLLMENT_REQUIRED' &&
      window.location.pathname !== '/dashboard/security'
    ) {
      window.location.href = '/dashboard/security'
      return Promise.reject(error)
    }

    return Promise.reject(error)
  }
)

export default API