import { Router } from 'express'
import {
  identityDocumentUploadSchema,
  kycUploadSchema,
  sellerRegistrationSchema,
  sellerProfileUpdateSchema,
} from '@civilcheck/shared'
import { digilockerLimiter } from '../middleware/rateLimiter.js'
import * as digilockerController from '../controllers/digilocker.controller.js'
import * as sellerController from '../controllers/seller.controller.js'
import { getDashboard } from '../controllers/earnings.controller.js'
import { sellerMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

const router = Router()

// ─── PUBLIC ROUTES ────────────────────────────────────────────────────────
// Yeh routes bina token ke accessible hain

// Seller registration — pehli baar signup
// Zod validation: banking pair (account + IFSC) aur tcAccepted: true (PDF 6.1)
// POST /api/seller/register
router.post('/register', validateBody(sellerRegistrationSchema), sellerController.sellerRegister)

// Signup identity verification config — public (pre-account, no token).
// The manual Aadhaar signup endpoints (/kyc-signup/*) that used to live here
// are removed: Partner signup no longer collects an Aadhaar number, OTP or
// Aadhaar photo for any role. DigiLocker replaces them, and whether it is
// optional or mandatory is decided in config/identityVerification.ts.
// GET /api/seller/signup/identity-config  → { provider, required, available }
router.get('/signup/identity-config', sellerController.getSignupIdentityConfig)

// DigiLocker identity verification. The callback and mock consent are public
// browser redirects (identity is resolved from the single-use `state`); start
// and status are authenticated.
// POST /api/seller/digilocker/auth       → { authorizationUrl } (client navigates)
// GET  /api/seller/digilocker/callback   → 302 to the Partner portal KYC page
// GET  /api/seller/digilocker/status
router.get('/digilocker/callback', digilockerLimiter, digilockerController.callback)

// DigiLocker for SIGNUP (pre-account — no JWT exists yet, so these are public
// and rate-limited; state/session are opaque, hashed and single-use). The
// callback is the shared /digilocker/callback above, which dispatches on which
// flow owns the state — API Setu registers only one redirect URI.
// POST /api/seller/digilocker/signup/auth    { signupToken? } → { signupToken, authorizationUrl }
// GET  /api/seller/digilocker/signup/status  (header x-digilocker-signup)
router.post('/digilocker/signup/auth', digilockerLimiter, digilockerController.signupAuthorize)
router.get('/digilocker/signup/status', digilockerLimiter, digilockerController.signupStatus)

// ─── PROTECTED ROUTES ─────────────────────────────────────────────────────
router.post('/digilocker/auth', digilockerLimiter, sellerMiddleware, digilockerController.authorize)
router.get('/digilocker/status', digilockerLimiter, sellerMiddleware, digilockerController.status)
// Yeh routes seller JWT token chahte hain
// sellerMiddleware pehle chalega — token valid nahi toh 401 milega

// KYC certificate upload karo
// POST /api/seller/kyc/certificate
router.post(
  '/kyc/certificate',
  sellerMiddleware,
  validateBody(kycUploadSchema),
  sellerController.uploadCertificate
)

// KYC status check karo
// GET /api/seller/kyc/status
router.get('/kyc/status', sellerMiddleware, sellerController.getKycStatus)

// Identity document upload — manual admin review (replaces DigiLocker OAuth)
// POST /api/seller/kyc/identity-document
router.post(
  '/kyc/identity-document',
  sellerMiddleware,
  validateBody(identityDocumentUploadSchema),
  sellerController.uploadIdentityDocument
)

// Dashboard — earnings summary + next payout + per-listing views/sales,
// bundled in one call for the seller home screen
// GET /api/seller/dashboard
router.get('/dashboard', sellerMiddleware, getDashboard)

// Apni profile dekho
// GET /api/seller/profile
router.get('/profile', sellerMiddleware, sellerController.getSellerProfile)

// Profile update karo
// PATCH /api/seller/profile
router.patch(
  '/profile',
  sellerMiddleware,
  validateBody(sellerProfileUpdateSchema),
  sellerController.updateSellerProfile
)

// Apne reviews dekho (buyer feedback list)
// GET /api/seller/reviews
router.get('/reviews', sellerMiddleware, sellerController.getSellerReviews)

// Cloudinary signed-upload signature — client seedhe Cloudinary ko upload
// karta hai, file server se hokar nahi jaati
// GET /api/seller/uploads/signature?purpose=kyc-certificate|kyc-selfie|kyc-identity-document|listing-document
router.get('/uploads/signature', sellerMiddleware, sellerController.getUploadSignature)

// KYC document security hardening — mints a fresh, short-lived signed URL
// for the caller's OWN certificate/selfie/identity-document (now stored as
// `type: authenticated`, no longer directly viewable via the raw URL).
// GET /api/seller/kyc/documents/:field/signed-url  (field: certificate|selfie|identity-document)
router.get('/kyc/documents/:field/signed-url', sellerMiddleware, sellerController.getKycDocumentSignedUrl)

// Mandatory Terms & Conditions / Privacy Policy re-acceptance — applies
// uniformly to Owner/Expert/Reporter (one record per Seller row, never per
// role). The one route sellerMiddleware's TERMS_ACCEPTANCE_REQUIRED gate
// deliberately exempts (see auth.middleware.ts's TERMS_ACCEPT_PATH).
router.post('/terms/accept', sellerMiddleware, sellerController.acceptSellerTerms)

export default router
