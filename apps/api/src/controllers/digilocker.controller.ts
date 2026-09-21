import { Request, Response } from 'express'
import logger from '../lib/logger.js'
import { DigilockerError, type DigilockerResultCode } from '../services/digilocker/digilocker.types.js'
import { startAuthorization, handleCallback, getStatus } from '../services/digilocker/digilocker.service.js'

// Where the browser lands after the callback. The base is server-configured
// (never taken from the request), and only a fixed result code is appended —
// no tokens, codes or user data ever appear in this URL (no open redirect).
const resultUrl = (code: DigilockerResultCode) =>
  `${(process.env.SELLER_APP_URL || 'http://localhost:5173').replace(/\/+$/, '')}/dashboard/kyc?digilocker=${code}`

// POST /api/seller/digilocker/auth — authenticated. Returns the URL the
// browser must navigate to (a JWT in the Authorization header cannot ride a
// plain redirect, so the client performs the navigation).
export const authorize = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, ...(await startAuthorization(req.seller!.id)) })
  } catch (e) {
    if (e instanceof DigilockerError && e.failure === 'NOT_CONFIGURED') {
      res.status(503).json({ success: false, code: 'DIGILOCKER_UNAVAILABLE', message: 'DigiLocker verification is not available right now. Please try again later.' })
      return
    }
    logger.error('[digilocker] failed to start authorization')
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' })
  }
}

// GET /api/seller/digilocker/callback — public browser redirect from DigiLocker.
export const callback = async (req: Request, res: Response) => {
  let result: DigilockerResultCode
  try {
    result = await handleCallback({ state: req.query.state, code: req.query.code, error: req.query.error })
  } catch {
    logger.error('[digilocker] callback handling failed')
    result = 'failed'
  }
  res.redirect(302, resultUrl(result))
}

// GET /api/seller/digilocker/status — authenticated.
export const status = async (req: Request, res: Response) => {
  res.json({ success: true, ...(await getStatus(req.seller!.id)) })
}
