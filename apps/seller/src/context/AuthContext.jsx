// ─────────────────────────────────────────────────────────────────────────
//  AuthContext.jsx  —  seller auth + SINGLE partner role
//  RAKHNA: src/context/AuthContext.jsx  (replace)
//
//  Role ab backend (Seller.partnerRole) se aata hai. Ek seller = ek role.
//  Isliye kisi bhi device se login karo, sahi portal khulta hai.
// ─────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect } from 'react'
import API from '../api/axios'

const AuthContext = createContext(null)

export const DEFAULT_ROLE = 'OWNER'  // agar kisi purane seller ka role set na ho

export const AuthProvider = ({ children }) => {
  const [seller, setSeller]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [roles, setRolesState] = useState([])
  const [activeRole, setActiveRole] = useState(null)

  // ── App start ───────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('seller_token')
    if (!token) { setLoading(false); return }

    // `loading` stays true (ProtectedRoute/AppRoutes both gate render on it)
    // until this resolves — so trusting the cached `seller_user` here would
    // only ever risk showing stale KYC/badge/suspension state, never actually
    // paint anything sooner. Wait for the real profile check instead.
    API.get('/seller/profile')
      .then((res) => {
        if (res.data?.success) {
          setSeller(res.data.seller)
          localStorage.setItem('seller_user', JSON.stringify(res.data.seller))
          applyRole(res.data.seller)
        }
      })
      .catch((err) => { if (err.response?.status === 401) clearAll() })
      .finally(() => setLoading(false))
  }, [])

  // seller ke partnerRole se roles set karo
  const applyRole = (s) => {
    const r = s?.partnerRole || localStorage.getItem('partner_active') || DEFAULT_ROLE
    setRolesState([r])
    setActiveRole(r)
    localStorage.setItem('partner_active', r)
  }

  // ── login ─────────────────────────────────────────────────────────────
  const login = (token, sellerData, newRoles) => {
    localStorage.setItem('seller_token', token)
    localStorage.setItem('seller_user', JSON.stringify(sellerData))
    setSeller(sellerData)

    const r = (newRoles && newRoles[0]) || sellerData?.partnerRole || DEFAULT_ROLE
    setRolesState([r])
    setActiveRole(r)
    localStorage.setItem('partner_active', r)
  }

  // Single role — switch/add/remove ab bas ek role par kaam karte hain
  const switchRole = (id) => { setActiveRole(id); setRolesState([id]); localStorage.setItem('partner_active', id) }
  const setRoles = (arr) => { const r = arr[0] || DEFAULT_ROLE; setRolesState([r]); switchRole(r) }
  const addRole = () => {}     // single-role model me no-op
  const removeRole = () => {}  // single-role model me no-op

  // ── logout ──────────────────────────────────────────────────────────────
  const clearAll = () => {
    localStorage.removeItem('seller_token')
    localStorage.removeItem('seller_user')
    localStorage.removeItem('partner_active')
    setSeller(null); setRolesState([]); setActiveRole(null)
  }
  const logoutSeller = () => clearAll()

  const refreshSeller = async () => {
    try {
      const res = await API.get('/seller/profile')
      if (res.data?.success) {
        setSeller(res.data.seller)
        localStorage.setItem('seller_user', JSON.stringify(res.data.seller))
        applyRole(res.data.seller)
      }
    } catch { /* silent */ }
  }

  return (
    <AuthContext.Provider value={{
      seller, loading, roles, activeRole,
      login, logoutSeller, refreshSeller,
      switchRole, setRoles, addRole, removeRole,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)