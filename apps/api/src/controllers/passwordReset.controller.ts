// ─────────────────────────────────────────────────────────────────────────────
// Password reset via emailed OTP — Admin (SUPER_ADMIN only), Seller, Buyer.
// Thin wrappers over passwordReset.service.ts, one named export per
// actor/step (mirrors auth.controller.ts's loginBuyer/sellerLogin/adminLogin
// convention rather than one generic function branching on a param).
//
// Every response here is identical regardless of whether the email/OTP was
// valid — never return anything that lets a caller distinguish "no such
// account" from "wrong code" from "expired." See passwordReset.service.ts's
// header for the full reasoning.
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response } from 'express'
import * as passwordReset from '../services/passwordReset.service.js'

const GENERIC_REQUEST_MESSAGE = 'If this email is registered, a reset code has been sent to it.'
const GENERIC_INVALID_MESSAGE = 'That code is invalid or has expired. Please request a new one.'
const GENERIC_RESET_SUCCESS = 'Your password has been reset. You can now log in with your new password.'

async function handleRequest(actor: passwordReset.ResetActor, req: Request, res: Response) {
  const { email } = req.body as { email: string }
  await passwordReset.requestPasswordReset(actor, email)
  res.json({ success: true, message: GENERIC_REQUEST_MESSAGE })
}

async function handleVerify(actor: passwordReset.ResetActor, req: Request, res: Response) {
  const { email, otp } = req.body as { email: string; otp: string }
  const result = await passwordReset.verifyPasswordResetOtp(actor, email, otp)
  if (!result.ok) {
    res.status(400).json({ success: false, message: GENERIC_INVALID_MESSAGE })
    return
  }
  res.json({ success: true, message: 'Code verified. You can now set a new password.' })
}

async function handleReset(actor: passwordReset.ResetActor, req: Request, res: Response) {
  const { email, otp, newPassword } = req.body as { email: string; otp: string; newPassword: string }
  const result = await passwordReset.resetPassword(actor, email, otp, newPassword)
  if (!result.ok) {
    res.status(400).json({ success: false, message: GENERIC_INVALID_MESSAGE })
    return
  }
  res.json({ success: true, message: GENERIC_RESET_SUCCESS })
}

// ── Buyer ───────────────────────────────────────────────────────────────────
export const requestBuyerPasswordReset = (req: Request, res: Response) => handleRequest('BUYER', req, res)
export const verifyBuyerPasswordResetOtp = (req: Request, res: Response) => handleVerify('BUYER', req, res)
export const resetBuyerPassword = (req: Request, res: Response) => handleReset('BUYER', req, res)

// ── Seller ──────────────────────────────────────────────────────────────────
export const requestSellerPasswordReset = (req: Request, res: Response) => handleRequest('SELLER', req, res)
export const verifySellerPasswordResetOtp = (req: Request, res: Response) => handleVerify('SELLER', req, res)
export const resetSellerPassword = (req: Request, res: Response) => handleReset('SELLER', req, res)

// ── Admin (SUPER_ADMIN only — enforced in the service layer) ────────────────
export const requestAdminPasswordReset = (req: Request, res: Response) => handleRequest('ADMIN', req, res)
export const verifyAdminPasswordResetOtp = (req: Request, res: Response) => handleVerify('ADMIN', req, res)
export const resetAdminPassword = (req: Request, res: Response) => handleReset('ADMIN', req, res)
