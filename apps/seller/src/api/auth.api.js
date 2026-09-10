import API from './axios'

// Partner login — email + password (replaces phone OTP, MSG91 removed)
export const sellerLogin = async (email, password) => {
  const response = await API.post('/auth/seller/login', { email, password })
  return response.data
}

// Phone-OTP login (additive — email+password above stays primary). No
// auto-create — a phone that doesn't match a registered Seller is told to
// sign up first (same as the backend endpoint itself does).
export const sellerLoginFirebase = async (idToken) => {
  const response = await API.post('/auth/seller/firebase', { idToken })
  return response.data
}

// ─── FORGOT PASSWORD (email OTP via Resend) ────────────────────────────────
export const requestSellerPasswordReset = async (email) => {
  const response = await API.post('/auth/seller/forgot-password', { email })
  return response.data
}

export const verifySellerPasswordResetOtp = async (email, otp) => {
  const response = await API.post('/auth/seller/forgot-password/verify', { email, otp })
  return response.data
}

export const resetSellerPassword = async (email, otp, newPassword, confirmPassword) => {
  const response = await API.post('/auth/seller/forgot-password/reset', { email, otp, newPassword, confirmPassword })
  return response.data
}

// Naya seller signup — email + password + mandatory phone + address.
// Signup Email Verification: response has no token — account is created
// unverified and an OTP is emailed; verifyEmail() below is what actually
// logs the seller in.
export const sellerRegister = async (data) => {
  const response = await API.post('/seller/register', data)
  return response.data
}

// ─── SIGNUP EMAIL VERIFICATION ──────────────────────────────────────────────
export const verifyEmail = async (email, otp) => {
  const response = await API.post('/auth/seller/verify-email', { email, otp })
  return response.data
}

export const resendVerificationEmail = async (email) => {
  const response = await API.post('/auth/seller/resend-verification-email', { email })
  return response.data
}

// Logged-in seller ki info
export const getMe = async () => {
  const response = await API.get('/auth/me')
  return response.data
}
