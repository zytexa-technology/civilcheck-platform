import client from './client'
import type { LoginResponse, MeResponse, RegisterResponse } from '../types/api'

/** POST /api/auth/login */
export async function loginBuyer(email: string, password: string): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/auth/login', { email, password })
  return data
}

/**
 * POST /api/auth/buyer/firebase — phone-OTP login, additive to email/password
 * above. `idToken` comes from Firebase Phone Auth (see lib/firebaseAuth.ts);
 * the backend verifies it and returns the exact same shape as loginBuyer.
 */
export async function loginBuyerFirebase(idToken: string): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/auth/buyer/firebase', { idToken })
  return data
}

/** POST /api/auth/register — logs the buyer straight in, no separate OTP step. */
export async function registerBuyer(input: {
  phone: string
  name: string
  email: string
  password: string
}): Promise<RegisterResponse> {
  const { data } = await client.post<RegisterResponse>('/auth/register', input)
  return data
}

/** POST /api/auth/forgot-password — always the same generic response, sent or not. */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  const { data } = await client.post('/auth/forgot-password', { email })
  return data
}

/** POST /api/auth/forgot-password/verify — advisory pre-check only; reset() re-validates fully. */
export async function verifyPasswordResetOtp(email: string, otp: string): Promise<{ success: boolean; message: string }> {
  const { data } = await client.post('/auth/forgot-password/verify', { email, otp })
  return data
}

/** POST /api/auth/forgot-password/reset */
export async function resetPassword(
  email: string,
  otp: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ success: boolean; message: string }> {
  const { data } = await client.post('/auth/forgot-password/reset', { email, otp, newPassword, confirmPassword })
  return data
}

/** GET /api/auth/me — also the token-validity probe on cold start. */
export async function getMe(): Promise<MeResponse> {
  const { data } = await client.get<MeResponse>('/auth/me')
  return data
}

/** PATCH /api/auth/profile — Basic Profile step. Phone is immutable. */
export async function updateProfile(input: {
  name: string
  city: string
  state: string
  email?: string
  photoUrl?: string
}): Promise<MeResponse> {
  const { data } = await client.patch<MeResponse>('/auth/profile', input)
  return data
}

/**
 * POST /api/auth/logout — advisory only (buyer tokens are stateless
 * server-side). Never throws: a failed call must not strand the user
 * logged-in in the UI.
 */
export async function logout(): Promise<void> {
  try {
    await client.post('/auth/logout')
  } catch {
    // Offline or already-expired token — the local clear still happens.
  }
}
