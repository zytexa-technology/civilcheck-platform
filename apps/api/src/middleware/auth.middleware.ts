import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AdminRole, KycStatus, PartnerRole } from '@prisma/client'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { JWT_SECRET } from '../lib/jwt.js'
import { verifyFirebaseToken } from '../lib/firebase.js'
import {
  isAdminSessionExpired,
  shouldRefreshActivity,
  isTwoFactorEnrollmentOverdue,
} from '../lib/session.js'

// Request mein user attach karne ke liye TypeScript ko batana padta hai
// ki hum req.user add kar rahe hain — nahi bataya toh TypeScript error dega
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; phone: string }
      seller?: { id: string; phone: string; kycStatus: KycStatus; partnerRole: PartnerRole | null }
      admin?: { id: string; phone: string; role: AdminRole }
    }
  }
}

// Helper function
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  return authHeader.slice(7) // 7 char for "Bearer "
}

// Local (legacy) JWT verify — returns payload or null instead of throwing,
// taaki Firebase fallback try kiya ja sake
function verifyLocalToken<T>(token: string): T | null {
  try {
    return jwt.verify(token, JWT_SECRET) as T
  } catch {
    return null
  }
}

// buyer's auth middleware
// Do tarah ke tokens accept karta hai:
//  1. Local JWT (OTP flow se bana) — existing panels/apps ke liye
//  2. Firebase ID token (phone OTP / Google / Apple SSO) — user DB me nahi
//     hai toh phone se create ho jaata hai (roadmap Day 1)
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req)

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Token required',
    })
    return
  }

  // 1) Local JWT
  const decoded = verifyLocalToken<{ userId?: string; phone?: string }>(token)
  if (decoded?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    })

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found',
      })
      return
    }

    // Checked on every request, not just at login — same reasoning as
    // adminMiddleware's blocked/active checks and sellerMiddleware's
    // deletedAt check: a buyer JWT is valid for 7 days regardless of DB
    // state, so a block issued mid-session must take effect immediately,
    // not just on the next login.
    if (user.blocked) {
      res.status(403).json({
        success: false,
        code: 'ACCOUNT_BLOCKED',
        message: 'This account has been blocked. Contact support.',
      })
      return
    }

    // SuperAdmin-deleted account (admin.controller.ts's deleteBuyer) — same
    // per-request re-check reasoning as `blocked` above, same response shape
    // as sellerMiddleware's existing PARTNER_DELETED check.
    if (user.deletedAt) {
      res.status(403).json({
        success: false,
        code: 'ACCOUNT_DELETED',
        message: 'This account has been deleted.',
      })
      return
    }

    req.user = {
      id: user.id,
      phone: user.phone,
    }

    next()
    return
  }

  // 2) Firebase ID token — verify karke user retrieve/create karo
  const identity = await verifyFirebaseToken(token)
  if (!identity) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    })
    return
  }

  if (!identity.phone) {
    // User.phone unique+required hai — bina phone ke account create nahi ho sakta
    res.status(401).json({
      success: false,
      message: 'Phone number required on your login account. Use phone OTP login.',
    })
    return
  }

  const user = await prisma.user.upsert({
    where: { phone: identity.phone },
    update: {},
    create: {
      phone: identity.phone,
      name: identity.name,
      email: identity.email,
    },
  })

  if (user.blocked) {
    res.status(403).json({
      success: false,
      code: 'ACCOUNT_BLOCKED',
      message: 'This account has been blocked. Contact support.',
    })
    return
  }

  if (user.deletedAt) {
    res.status(403).json({
      success: false,
      code: 'ACCOUNT_DELETED',
      message: 'This account has been deleted.',
    })
    return
  }

  req.user = {
    id: user.id,
    phone: user.phone,
  }

  next()
}

// Optional buyer auth — un public routes ke liye jahan login OPTIONAL hai
// (e.g. property search). Valid token mila toh req.user set karo; warna
// chup-chaap aage badho — yeh middleware KABHI 401 nahi karta.
//
// Firebase token par naya user CREATE nahi karte (authMiddleware ke ulat) —
// sirf existing identity resolve hoti hai, taaki ek public GET side-effect me
// account na bana de. Token invalid/expired ho toh bhi request aage jaati hai.
export const optionalAuthMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req)
  if (!token) {
    next()
    return
  }

  // 1) Local JWT
  const decoded = verifyLocalToken<{ userId?: string }>(token)
  if (decoded?.userId) {
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
    // A blocked buyer is treated as anonymous here, not rejected — this
    // middleware never 401s (see header comment); the request still goes
    // through for whatever public data it was already allowed to see, it
    // just doesn't get attributed to the blocked account.
    if (user && !user.blocked && !user.deletedAt) req.user = { id: user.id, phone: user.phone }
    next()
    return
  }

  // 2) Firebase ID token — sirf EXISTING user resolve karo, create nahi
  try {
    const identity = await verifyFirebaseToken(token)
    if (identity?.phone) {
      const user = await prisma.user.findUnique({ where: { phone: identity.phone } })
      if (user && !user.blocked && !user.deletedAt) req.user = { id: user.id, phone: user.phone }
    }
  } catch {
    // Optional auth kabhi fail nahi karta — silently aage badho
  }
  next()
}

// seller's auth middleware
// Local JWT ya Firebase ID token — dono chalta hai. Seller AUTO-CREATE nahi
// hota (registration me name/profession/bank chahiye) — sirf retrieve.
export const sellerMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req)

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Token required',
    })
    return
  }

  // 1) Local JWT
  const decoded = verifyLocalToken<{ sellerId?: string; phone?: string }>(token)
  let seller = null

  if (decoded?.sellerId) {
    seller = await prisma.seller.findUnique({
      where: { id: decoded.sellerId },
    })
  } else {
    // 2) Firebase ID token — phone se seller retrieve karo
    const identity = await verifyFirebaseToken(token)
    if (!identity) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      })
      return
    }
    if (identity.phone) {
      seller = await prisma.seller.findUnique({
        where: { phone: identity.phone },
      })
    }
  }

  if (!seller) {
    res.status(401).json({
      success: false,
      message: 'Seller not found — register via /api/seller/register',
    })
    return
  }

  // kyc status check
  if (seller.kycStatus === 'SUSPENDED') {
    res.status(403).json({
      success: false,
      message: 'Your account has been suspended. Contact support.',
    })
    return
  }

  // Partner account deletion (Phase 4A) — checked on every request, not just
  // login, same reasoning as adminMiddleware's blocked/active checks: a JWT
  // issued before the deletion is still cryptographically valid for up to 7
  // days, so the DB state is the real source of truth.
  if (seller.deletedAt) {
    res.status(403).json({
      success: false,
      code: 'PARTNER_DELETED',
      message: 'This account has been deleted.',
    })
    return
  }

  req.seller = {
    id: seller.id,
    phone: seller.phone,
    kycStatus: seller.kycStatus,
    partnerRole: seller.partnerRole,
  }

  next()
}

// ─────────────────────────────────────────────────────────────────────────────
// Seller persona RBAC (QA audit 2026-08-03, finding #2) — sellerMiddleware ke
// BAAD lagana hai. partnerRole (OWNER | REPORTER | EXPERT, a real Prisma enum
// as of the Phase 1 role-architecture pass) sirf frontend nav-rendering
// (Layout.jsx) me enforce ho raha tha, kabhi backend route guard nahi tha —
// koi bhi seller apna JWT replay karke doosri persona ke routes hit kar sakta
// tha.
// ─────────────────────────────────────────────────────────────────────────────
export const requireSellerRole =
  (...allowed: PartnerRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.seller) {
      res.status(401).json({ success: false, message: 'Seller authentication required' })
      return
    }

    if (req.seller.partnerRole && allowed.includes(req.seller.partnerRole)) {
      next()
      return
    }

    logger.warn(
      `[rbac] Seller ${req.seller.id} (partnerRole=${req.seller.partnerRole ?? 'none'}) blocked on ${req.method} ${req.originalUrl}`
    )
    res.status(403).json({
      success: false,
      message: `Access denied — this action requires the ${allowed.join(' or ')} partner role`,
    })
  }

// admin middleware
// Admins email/password se login karte hain — local JWT only (Firebase nahi)
export const adminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req)

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Token required',
    })
    return
  }

  const decoded = verifyLocalToken<{ adminId?: string }>(token)

  if (!decoded?.adminId) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    })
    return
  }

  const admin = await prisma.admin.findUnique({
    where: { id: decoded.adminId },
  })

  if (!admin) {
    res.status(403).json({
      success: false,
      message: 'Access denied — Admins only',
    })
    return
  }

  // ── Admin management (Super Admin CRUD) ─────────────────────────────────
  // Checked on every request, not just at login — a JWT issued before a
  // block/deactivate is still cryptographically valid for up to 7 days, so
  // the DB state is the actual source of truth for whether a session is live.
  if (admin.blocked) {
    res.status(403).json({
      success: false,
      code: 'ADMIN_BLOCKED',
      message: 'This admin account has been blocked. Contact the Super Admin.',
    })
    return
  }
  if (!admin.active) {
    res.status(403).json({
      success: false,
      code: 'ADMIN_DEACTIVATED',
      message: 'This admin account has been deactivated. Contact the Super Admin.',
    })
    return
  }

  // ── 30-minute inactivity timeout (PDF 5.1) ──────────────────────────────
  // JWT 7 din chalta hai, isliye idle-timeout DB se enforce hota hai.
  const now = Date.now()

  if (isAdminSessionExpired(admin.lastActivityAt, now)) {
    // Stamp clear karo taaki yeh token dobara use na ho sake
    if (admin.lastActivityAt !== null) {
      await prisma.admin.update({
        where: { id: admin.id },
        data: { lastActivityAt: null },
      })
      logger.info(`[session] Admin ${admin.id} session expired due to inactivity`)
    }

    res.status(401).json({
      success: false,
      code: 'SESSION_EXPIRED',
      message: 'Session expired due to inactivity — please log in again',
    })
    return
  }

  // Active session — stamp refresh karo (throttled, har request pe nahi)
  if (shouldRefreshActivity(admin.lastActivityAt, now)) {
    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastActivityAt: new Date(now) },
    })
  }

  // ── 2FA enrollment grace period (Day 2 carry-over #4) — default OFF ─────
  // req.path is relative to this router's mount point (/api/admin), so this
  // exempts all four existing 2FA routes (/2fa/status, /setup, /enable,
  // /disable) without listing each one individually.
  if (!req.path.startsWith('/2fa/') && isTwoFactorEnrollmentOverdue(admin, now)) {
    res.status(403).json({
      success: false,
      code: 'TWO_FACTOR_ENROLLMENT_REQUIRED',
      message: 'Two-factor authentication enrollment is overdue — set it up to continue',
    })
    return
  }

  req.admin = {
    id: admin.id,
    phone: admin.phone,
    role: admin.role,
  }

  next()
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin RBAC (PDF 5.1) — adminMiddleware ke BAAD lagana hai.
//
//   SUPER_ADMIN → sab kuch (KYC decisions, payments, settlements, content)
//   SUB_ADMIN   → read-only analytics + listing approvals + manual QC reviews
//   VIEWER      → sirf read-only (search data, analytics, lists)
//
// SUPER_ADMIN har allowed-list pass karta hai. Baaki roles tabhi pass hote
// hain jab explicitly allowed ho. GET routes ko gate karne ki zaroorat nahi —
// teeno roles read kar sakte hain.
// ─────────────────────────────────────────────────────────────────────────────
export const requireAdminRole =
  (...allowed: AdminRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      // adminMiddleware pehle nahi chala — route wiring bug
      res.status(401).json({ success: false, message: 'Admin authentication required' })
      return
    }

    if (req.admin.role === AdminRole.SUPER_ADMIN || allowed.includes(req.admin.role)) {
      next()
      return
    }

    logger.warn(
      `[rbac] Admin ${req.admin.id} (${req.admin.role}) blocked on ${req.method} ${req.originalUrl}`
    )
    res.status(403).json({
      success: false,
      message: `Access denied — requires ${[AdminRole.SUPER_ADMIN, ...allowed].join(' or ')} role`,
    })
  }
