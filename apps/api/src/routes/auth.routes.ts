import { Router } from 'express'
import {
  adminFirebaseLoginSchema,
  adminLoginSchema,
  buyerLoginSchema,
  buyerProfileSchema,
  buyerRegisterSchema,
  emailVerificationRequestSchema,
  emailVerificationVerifySchema,
  firebaseIdTokenSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  passwordResetVerifySchema,
  sellerLoginSchema,
} from '@civilcheck/shared'
import * as authController from '../controllers/auth.controller.js'
import * as passwordResetController from '../controllers/passwordReset.controller.js'
import * as emailVerificationController from '../controllers/emailVerification.controller.js'
import * as rateLimiter from '../middleware/rateLimiter.js'
import { validateBody } from '../middleware/validation.middleware.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

// Buyer — email + password (replaces phone OTP, MSG91 removed)
router.post(
  '/register',
  rateLimiter.registerLimiter,
  validateBody(buyerRegisterSchema),
  authController.registerBuyer
)
router.post(
  '/login',
  rateLimiter.buyerLoginLimiter,
  validateBody(buyerLoginSchema),
  authController.loginBuyer
)

// Buyer — Firebase phone-OTP (additive; email+password above stays primary).
// Firebase Phone Auth handles OTP generation/delivery/verification
// client-side; this only verifies the resulting ID token.
router.post(
  '/buyer/firebase',
  rateLimiter.buyerLoginLimiter,
  validateBody(firebaseIdTokenSchema),
  authController.loginBuyerFirebase
)

// Partner/Seller — email + password (replaces phone OTP, MSG91 removed).
// Registration stays on POST /api/seller/register (seller.routes.ts).
router.post(
  '/seller/login',
  rateLimiter.sellerLoginLimiter,
  validateBody(sellerLoginSchema),
  authController.sellerLogin
)

// Partner/Seller — Firebase phone-OTP (additive). No auto-create — a phone
// that doesn't match a registered Seller is told to register first.
router.post(
  '/seller/firebase',
  rateLimiter.sellerLoginLimiter,
  validateBody(firebaseIdTokenSchema),
  authController.loginSellerFirebase
)

// Admin — password + TOTP (2FA enforced once the admin has enrolled, PDF 5.1)
router.post(
  '/admin/login',
  rateLimiter.adminLoginLimiter,
  validateBody(adminLoginSchema),
  authController.adminLogin
)

// Admin — Firebase phone-OTP (additive, SUB_ADMIN/VIEWER only — never
// SUPER_ADMIN). Only works once the admin has linked their phone via
// POST /api/admin/link-firebase while logged in with the existing
// email/password(+TOTP) login; there is no cold-start admin phone login.
router.post(
  '/admin/firebase',
  rateLimiter.adminLoginLimiter,
  validateBody(adminFirebaseLoginSchema),
  authController.loginAdminFirebase
)

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD RESET (email OTP via Resend) — Buyer, Seller, and Admin
// (SUPER_ADMIN only; SUB_ADMIN/VIEWER are refused inside the service layer,
// not here, so the response stays identical either way — see
// passwordReset.service.ts). No self-service reset exists for a non-Super
// admin, and there is deliberately no admin self-signup anywhere in this
// file — both by explicit design.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/forgot-password',
  rateLimiter.buyerPasswordResetRequestLimiter,
  validateBody(passwordResetRequestSchema),
  passwordResetController.requestBuyerPasswordReset
)
router.post(
  '/forgot-password/verify',
  rateLimiter.buyerPasswordResetVerifyLimiter,
  validateBody(passwordResetVerifySchema),
  passwordResetController.verifyBuyerPasswordResetOtp
)
router.post(
  '/forgot-password/reset',
  rateLimiter.buyerPasswordResetVerifyLimiter,
  validateBody(passwordResetSchema),
  passwordResetController.resetBuyerPassword
)

router.post(
  '/seller/forgot-password',
  rateLimiter.sellerPasswordResetRequestLimiter,
  validateBody(passwordResetRequestSchema),
  passwordResetController.requestSellerPasswordReset
)
router.post(
  '/seller/forgot-password/verify',
  rateLimiter.sellerPasswordResetVerifyLimiter,
  validateBody(passwordResetVerifySchema),
  passwordResetController.verifySellerPasswordResetOtp
)
router.post(
  '/seller/forgot-password/reset',
  rateLimiter.sellerPasswordResetVerifyLimiter,
  validateBody(passwordResetSchema),
  passwordResetController.resetSellerPassword
)

router.post(
  '/admin/forgot-password',
  rateLimiter.adminPasswordResetRequestLimiter,
  validateBody(passwordResetRequestSchema),
  passwordResetController.requestAdminPasswordReset
)
router.post(
  '/admin/forgot-password/verify',
  rateLimiter.adminPasswordResetVerifyLimiter,
  validateBody(passwordResetVerifySchema),
  passwordResetController.verifyAdminPasswordResetOtp
)
router.post(
  '/admin/forgot-password/reset',
  rateLimiter.adminPasswordResetVerifyLimiter,
  validateBody(passwordResetSchema),
  passwordResetController.resetAdminPassword
)

// ─────────────────────────────────────────────────────────────────────────────
// SIGNUP EMAIL VERIFICATION (email OTP via Resend, same PasswordResetOtp
// table/security model as password reset above) — Buyer and Partner/Seller.
// registerBuyer / seller.controller.ts's sellerRegister send the first code
// inline at signup; these two endpoints per actor are resend + verify.
// verify-email issues the actual session (see emailVerification.controller.ts)
// — there is no separate login call needed right after it succeeds.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/resend-verification-email',
  rateLimiter.buyerEmailVerificationRequestLimiter,
  validateBody(emailVerificationRequestSchema),
  emailVerificationController.requestBuyerEmailVerification
)
router.post(
  '/verify-email',
  rateLimiter.buyerEmailVerificationVerifyLimiter,
  validateBody(emailVerificationVerifySchema),
  emailVerificationController.verifyBuyerEmailVerification
)

router.post(
  '/seller/resend-verification-email',
  rateLimiter.sellerEmailVerificationRequestLimiter,
  validateBody(emailVerificationRequestSchema),
  emailVerificationController.requestSellerEmailVerification
)
router.post(
  '/seller/verify-email',
  rateLimiter.sellerEmailVerificationVerifyLimiter,
  validateBody(emailVerificationVerifySchema),
  emailVerificationController.verifySellerEmailVerification
)

// Common
router.get('/me', authController.getMe)
router.post('/logout', authController.logout)

// Buyer Basic Profile (Partner Module item 1.6) — first-login profile step.
// Name/City/State mandatory; enforced by buyerProfileSchema.
router.patch(
  '/profile',
  authMiddleware,
  validateBody(buyerProfileSchema),
  authController.updateBuyerProfile
)

export default router
