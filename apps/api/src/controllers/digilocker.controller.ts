import { Request, Response } from 'express'
import logger from '../lib/logger.js'
import { DigilockerError, type DigilockerResultCode } from '../services/digilocker/digilocker.types.js'
import { startAuthorization, handleCallback, getStatus } from '../services/digilocker/digilocker.service.js'
import {
  startSignupAuthorization,
  handleSignupCallback,
  getSignupSessionStatus,
  isSignupState,
} from '../services/digilocker/digilocker.signup.service.js'

const appBase = () => (process.env.SELLER_APP_URL || 'http://localhost:5173').replace(/\/+$/, '')

// Where the browser lands after the callback. The base is server-configured
// (never taken from the request), and only a fixed result code is appended —
// no tokens, codes or user data ever appear in this URL (no open redirect).
const resultUrl = (code: DigilockerResultCode) => `${appBase()}/dashboard/kyc?digilocker=${code}`

// Same rule for the signup round trip — back to the Partner signup screen with
// only a fixed result code. The signup session token stays in the browser's own
// storage and is never put in this URL.
const signupResultUrl = (code: DigilockerResultCode) => `${appBase()}/login?digilocker=${code}`

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

// GET /api/seller/digilocker/callback — public browser redirect from
// DigiLocker, shared by BOTH flows.
//
// API Setu registers a single redirect URI, and OAuth requires the
// redirect_uri used at authorization to match the one used at token
// exchange — so there is exactly one callback and it dispatches on which
// flow owns the `state`. A pre-account signup state lands on the signup
// handler and returns to the signup screen; everything else keeps the
// original post-login behaviour unchanged.
export const callback = async (req: Request, res: Response) => {
  const { state, code, error } = req.query
  let signup = false
  try {
    signup = await isSignupState(state)
  } catch {
    signup = false // fall back to the post-login path
  }

  let result: DigilockerResultCode
  try {
    result = signup
      ? await handleSignupCallback({ state, code, error })
      : await handleCallback({ state, code, error })
  } catch {
    logger.error(`[digilocker${signup ? ':signup' : ''}] callback handling failed`)
    result = 'failed'
  }
  res.redirect(302, signup ? signupResultUrl(result) : resultUrl(result))
}

// GET /api/seller/digilocker/status — authenticated.
export const status = async (req: Request, res: Response) => {
  res.json({ success: true, ...(await getStatus(req.seller!.id)) })
}

// ─── SIGNUP (pre-account) ───────────────────────────────────────────────────
// Same OAuth flow, but keyed to a DigilockerSignupSession instead of a Seller,
// because during signup the account does not exist yet. Public by necessity —
// there is no JWT to present — so these are rate-limited and everything is
// resolved from opaque, hashed, single-use values.

// POST /api/seller/digilocker/signup/auth  { signupToken? }
// → { signupToken, authorizationUrl }. The client stores signupToken and
//   navigates to authorizationUrl.
export const signupAuthorize = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, ...(await startSignupAuthorization(req.body?.signupToken)) })
  } catch (e) {
    if (e instanceof DigilockerError && e.failure === 'NOT_CONFIGURED') {
      res.status(503).json({
        success: false,
        code: 'DIGILOCKER_UNAVAILABLE',
        message: 'DigiLocker verification is not available right now. Please try again later.',
      })
      return
    }
    logger.error('[digilocker:signup] failed to start authorization')
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' })
  }
}

// (There is no separate signup callback route: the single registered
// DIGILOCKER_REDIRECT_URI serves both flows — see `callback` above.)

// GET /api/seller/digilocker/signup/status — public; the session token is sent
// in a header rather than the query string so it never lands in access logs.
export const signupStatus = async (req: Request, res: Response) => {
  const token = req.get('x-digilocker-signup') ?? ''
  res.json({ success: true, ...(await getSignupSessionStatus(token)) })
}
