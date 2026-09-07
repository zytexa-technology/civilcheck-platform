import axios from 'axios'

// ✅ REAL BACKEND MODE — token expire (401) hone par auto-logout ON.
// Purely local testing me agar auto-logout nahi chahiye to true kar sakte ho.
const DEV_MODE = false

// Backend ka address — .env se aata hai
//   local  → .env me VITE_API_URL=http://localhost:3000
//   deploy → Vercel dashboard me VITE_API_URL=https://<backend-url>
// Fallback localhost taaki .env na ho to bhi local dev chale.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const API = axios.create({
  baseURL: `${BASE}/api`,          // saari calls '/seller/...' likhti hain → /api lagta hai
  headers: { 'Content-Type': 'application/json' },
})

// Har API call se pehle automatically token attach karo
// Toh har jagah manually likhne ki zaroorat nahi
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('seller_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Agar token expire ho jaye (401 error), automatically logout karo
// DEV mode mein yeh skip — fake token hai isliye 401 aayega hi
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!DEV_MODE && error.response?.status === 401) {
      localStorage.removeItem('seller_token')
      localStorage.removeItem('seller_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default API