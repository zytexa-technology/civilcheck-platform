// ─────────────────────────────────────────────────────────────────────────────
// Signup Email Verification — Buyer + Partner (Seller). Thin wrappers over
// emailVerification.service.ts, mirroring passwordReset.controller.ts's
// one-named-export-per-actor/step convention.
//
// verify (unlike password reset's verify/reset split) fully completes the
// action: on success it marks the account verified AND issues the same
// session shape login/register already return, so the frontend can call the
// exact same signIn()/login() it already uses.
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { Seller, User } from '@prisma/client'
import { JWT_SECRET, ACCESS_TOKEN_EXPIRY } from '../lib/jwt.js'
import * as emailVerification from '../services/emailVerification.service.js'

const GENERIC_REQUEST_MESSAGE = 'If this email is registered and not yet verified, a new verification code has been sent to it.'
const GENERIC_INVALID_MESSAGE = 'That code is invalid or has expired. Please request a new one.'

async function handleRequest(actor: emailVerification.VerifyActor, req: Request, res: Response) {
  const { email } = req.body as { email: string }
  await emailVerification.resendVerificationEmail(actor, email)
  res.json({ success: true, message: GENERIC_REQUEST_MESSAGE })
}

async function handleVerify(actor: emailVerification.VerifyActor, req: Request, res: Response) {
  const { email, otp } = req.body as { email: string; otp: string }
  const result = await emailVerification.verifyEmailOtp(actor, email, otp)
  if (!result.ok) {
    res.status(400).json({ success: false, message: GENERIC_INVALID_MESSAGE })
    return
  }

  if (actor === 'SELLER') {
    const seller = result.account as Seller
    const token = jwt.sign({ sellerId: seller.id, phone: seller.phone }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })
    res.json({
      success: true,
      message: 'Email verified successfully.',
      token,
      seller: {
        id: seller.id,
        name: seller.name,
        phone: seller.phone,
        email: seller.email,
        city: seller.city,
        state: seller.state,
        profession: seller.profession,
        kycStatus: seller.kycStatus,
        badge: seller.badge,
        partnerRole: seller.partnerRole,
      },
    })
    return
  }

  const user = result.account as User
  const token = jwt.sign({ userId: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })
  res.json({
    success: true,
    message: 'Email verified successfully.',
    token,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      city: user.city,
      state: user.state,
      profileComplete: Boolean(user.name && user.city && user.state),
    },
  })
}

// ── Buyer ───────────────────────────────────────────────────────────────────
export const requestBuyerEmailVerification = (req: Request, res: Response) => handleRequest('BUYER', req, res)
export const verifyBuyerEmailVerification = (req: Request, res: Response) => handleVerify('BUYER', req, res)

// ── Seller ──────────────────────────────────────────────────────────────────
export const requestSellerEmailVerification = (req: Request, res: Response) => handleRequest('SELLER', req, res)
export const verifySellerEmailVerification = (req: Request, res: Response) => handleVerify('SELLER', req, res)
