import { Router } from 'express'
import {
  identityDocumentUploadSchema,
  kycUploadSchema,
  sellerRegistrationSchema,
  sellerProfileUpdateSchema,
} from '@civilcheck/shared'
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

// ─── PROTECTED ROUTES ─────────────────────────────────────────────────────
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

export default router
