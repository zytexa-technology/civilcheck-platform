// ─────────────────────────────────────────────────────────────────────────────
// Admin 2FA enrollment (PDF 5.1). All routes sit behind adminMiddleware, so
// the admin is already authenticated — these endpoints manage the SECOND
// factor on their own account, never on anyone else's.
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { buildOtpAuthUri, generateSecret, verifyTotp } from '../services/twoFactor.service.js'
import { AuditAction, recordAudit } from '../services/audit.service.js'

// GET /api/admin/2fa/status
export const getTwoFactorStatus = async (req: Request, res: Response) => {
  const admin = await prisma.admin.findUnique({
    where: { id: req.admin!.id },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  })

  if (!admin) {
    res.status(404).json({ success: false, message: 'Admin not found' })
    return
  }

  res.json({
    success: true,
    twoFactor: {
      enabled: admin.twoFactorEnabled,
      // A secret exists but the flag is off → setup was started and never
      // confirmed. The panel uses this to resume enrollment.
      enrollmentPending: !admin.twoFactorEnabled && admin.twoFactorSecret !== null,
    },
  })
}

// POST /api/admin/2fa/setup
// ─────────────────────────────────────────────────────────────────────────────
// Issues a fresh secret and the otpauth:// URI the panel renders as a QR code.
// The secret is stored but stays INERT until /enable confirms a live code.
// ─────────────────────────────────────────────────────────────────────────────
export const setupTwoFactor = async (req: Request, res: Response) => {
  const admin = await prisma.admin.findUnique({ where: { id: req.admin!.id } })

  if (!admin) {
    res.status(404).json({ success: false, message: 'Admin not found' })
    return
  }

  // Re-enrolling while 2FA is live would let anyone holding a hijacked session
  // swap the factor to their own device. Disable first — that path costs a
  // password and a valid code.
  if (admin.twoFactorEnabled) {
    res.status(409).json({
      success: false,
      code: 'TOTP_ALREADY_ENABLED',
      message: '2FA is already enabled. To add a new device, disable it first via /2fa/disable.',
    })
    return
  }

  const secret = generateSecret()

  await prisma.admin.update({
    where: { id: admin.id },
    data: { twoFactorSecret: secret },
  })

  await recordAudit(req, {
    action: AuditAction.ADMIN_2FA_SETUP,
    target: `Admin:${admin.id}`,
    details: 'TOTP secret issued — awaiting confirmation',
  })

  res.json({
    success: true,
    message: 'Scan the QR in Google Authenticator, then confirm the 6-digit code at /2fa/enable.',
    // The panel renders the QR from otpauthUri. `secret` is the manual-entry
    // fallback for admins whose camera cannot read the code.
    otpauthUri: buildOtpAuthUri(admin.email, secret),
    secret,
  })
}

// POST /api/admin/2fa/enable  { totp }
export const enableTwoFactor = async (req: Request, res: Response) => {
  const { totp } = req.body as { totp: string }

  const admin = await prisma.admin.findUnique({ where: { id: req.admin!.id } })

  if (!admin) {
    res.status(404).json({ success: false, message: 'Admin not found' })
    return
  }

  if (admin.twoFactorEnabled) {
    res.status(409).json({ success: false, message: '2FA already enabled hai' })
    return
  }

  if (!admin.twoFactorSecret) {
    res.status(400).json({
      success: false,
      code: 'TOTP_SETUP_REQUIRED',
      message: 'Call /api/admin/2fa/setup first',
    })
    return
  }

  const check = await verifyTotp(admin.twoFactorSecret, totp, admin.lastTotpStep)
  if (!check.valid) {
    res.status(401).json({ success: false, code: 'TOTP_INVALID', message: 'Invalid 6-digit code' })
    return
  }

  await prisma.admin.update({
    where: { id: admin.id },
    // Store the accepted step so the enrollment code cannot be replayed at the
    // immediately following login (PDF 5.1 replay window).
    data: { twoFactorEnabled: true, lastTotpStep: check.timeStep },
  })

  await recordAudit(req, {
    action: AuditAction.ADMIN_2FA_ENABLE,
    target: `Admin:${admin.id}`,
    details: '2FA enabled',
  })

  res.json({
    success: true,
    message: '2FA enabled. A 6-digit code will now be required at every login.',
  })
}

// POST /api/admin/2fa/disable  { password, totp }
// ─────────────────────────────────────────────────────────────────────────────
// Removing a factor is a privilege de-escalation, so it costs BOTH the
// password and a live code — a stolen session alone cannot strip it.
// ─────────────────────────────────────────────────────────────────────────────
export const disableTwoFactor = async (req: Request, res: Response) => {
  const { password, totp } = req.body as { password: string; totp: string }

  const admin = await prisma.admin.findUnique({ where: { id: req.admin!.id } })

  if (!admin) {
    res.status(404).json({ success: false, message: 'Admin not found' })
    return
  }

  if (!admin.twoFactorEnabled) {
    res.status(400).json({ success: false, message: '2FA is not enabled' })
    return
  }

  const passwordValid = await bcrypt.compare(password, admin.password)
  const totpCheck = await verifyTotp(admin.twoFactorSecret, totp, admin.lastTotpStep)

  // One message for both failures: saying which half was wrong tells an
  // attacker whether they have the right password.
  if (!passwordValid || !totpCheck.valid) {
    res.status(401).json({ success: false, message: 'Invalid password ya code' })
    return
  }

  // Secret is cleared, not just unflagged — a disabled factor must not leave a
  // reusable secret behind for whoever re-enables it. lastTotpStep is reset too:
  // with no secret, a stored step is meaningless and a stale value would reject
  // a fresh enrollment's first code.
  await prisma.admin.update({
    where: { id: admin.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null, lastTotpStep: null },
  })

  await recordAudit(req, {
    action: AuditAction.ADMIN_2FA_DISABLE,
    target: `Admin:${admin.id}`,
    details: '2FA disabled and secret cleared',
  })

  res.json({ success: true, message: '2FA disabled.' })
}
