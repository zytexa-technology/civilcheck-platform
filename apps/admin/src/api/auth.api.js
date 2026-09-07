import API from './axios'

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────
// Current logged in admin ki info
export const getMe = async () => {
  const response = await API.get('/auth/me')
  return response.data
}

// Logout
export const logout = async () => {
  const response = await API.post('/auth/logout')
  return response.data
}

// `totp` is only sent once the admin has 2FA enrolled — the backend returns
// 401 {code:'TOTP_REQUIRED'} on the first attempt, which Login.jsx acts on.
// Sending an empty string would fail the shared totpCodeSchema, so it is
// omitted entirely rather than passed as ''.
export const adminLogin = async (email, password, totp) => {
  const body = { email, password }
  if (totp) body.totp = totp
  const response = await API.post('/auth/admin/login', body)
  return response.data
}

// Phone-OTP login (additive, SUB_ADMIN/VIEWER only — SuperAdmin is refused
// server-side). Only works once the admin has linked their phone via
// linkAdminFirebase below while logged in with email/password — there is no
// cold-start admin phone login.
export const adminLoginFirebase = async (idToken, totp) => {
  const body = { idToken }
  if (totp) body.totp = totp
  const response = await API.post('/auth/admin/firebase', body)
  return response.data
}

// Links the CALLING (already-authenticated) admin's own account to the
// Firebase UID behind `idToken`. Refused server-side for a SUPER_ADMIN row.
export const linkAdminFirebase = async (idToken) => {
  const response = await API.post('/admin/link-firebase', { idToken })
  return response.data
}

// ─── SUPERADMIN PASSWORD RESET (email OTP via Resend) ─────────────────────
// SuperAdmin-only self-service — the backend silently no-ops for a
// SUB_ADMIN/VIEWER email (same generic response either way), so there is no
// separate "not allowed" state for this UI to handle.
export const requestAdminPasswordReset = async (email) => {
  const response = await API.post('/auth/admin/forgot-password', { email })
  return response.data
}

export const verifyAdminPasswordResetOtp = async (email, otp) => {
  const response = await API.post('/auth/admin/forgot-password/verify', { email, otp })
  return response.data
}

export const resetAdminPassword = async (email, otp, newPassword, confirmPassword) => {
  const response = await API.post('/auth/admin/forgot-password/reset', { email, otp, newPassword, confirmPassword })
  return response.data
}

// ─── ADMIN 2FA (PDF 5.1) ──────────────────────────────────────────────────
export const getTwoFactorStatus = async () => {
  const response = await API.get('/admin/2fa/status')
  return response.data
}

export const setupTwoFactor = async () => {
  const response = await API.post('/admin/2fa/setup')
  return response.data
}

export const enableTwoFactor = async (totp) => {
  const response = await API.post('/admin/2fa/enable', { totp })
  return response.data
}

export const disableTwoFactor = async (password, totp) => {
  const response = await API.post('/admin/2fa/disable', { password, totp })
  return response.data
}

export const getMonthlyRevenue = async () => {
  const response = await API.get('/admin/analytics/monthly-revenue')
  return response.data
}

export const getRiskBreakdown = async () => {
  const response = await API.get('/admin/analytics/risk-breakdown')
  return response.data
}