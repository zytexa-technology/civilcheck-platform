import { Request, Response } from 'express'
import logger from '../lib/logger.js'
import {
  KycError,
  startAadhaarKyc,
  verifyAadhaarOtp,
  getAadhaarUploadSignature,
  attachAadhaarDocument,
  getAadhaarKycStatus,
} from '../services/aadhaarKyc/aadhaarKyc.service.js'

// Signup Aadhaar KYC endpoints. Error handling is deliberately uniform: only
// KycError messages (already Aadhaar-free and provider-detail-free) reach the
// client; anything else is logged WITHOUT the request body and answered with a
// generic 500. The request body (which carries the Aadhaar number) is never logged.
function fail(res: Response, e: unknown) {
  if (e instanceof KycError) {
    res.status(e.status).json({ success: false, message: e.message, code: e.code })
    return
  }
  logger.error(`Aadhaar KYC: unexpected error (${e instanceof Error ? e.name : 'unknown'})`)
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.', code: 'KYC_ERROR' })
}

// Header (not query string) so the token never lands in access-log URLs.
const tokenFromQuery = (req: Request) => req.get('x-kyc-session') ?? ''

export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { aadhaarNumber, sessionToken } = req.body
    res.json({ success: true, ...(await startAadhaarKyc(aadhaarNumber, sessionToken)) })
  } catch (e) { fail(res, e) }
}

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, ...(await verifyAadhaarOtp(req.body.sessionToken, req.body.otp)) })
  } catch (e) { fail(res, e) }
}

export const uploadSignature = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, upload: await getAadhaarUploadSignature(tokenFromQuery(req)) })
  } catch (e) { fail(res, e) }
}

export const attachDocument = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, ...(await attachAadhaarDocument(req.body.sessionToken, req.body.documentUrl)) })
  } catch (e) { fail(res, e) }
}

export const status = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, ...(await getAadhaarKycStatus(tokenFromQuery(req))) })
  } catch (e) { fail(res, e) }
}
