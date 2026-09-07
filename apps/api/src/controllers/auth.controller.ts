import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { JWT_SECRET, ACCESS_TOKEN_EXPIRY } from '../lib/jwt.js'
import { isAdminSessionExpired } from '../lib/session.js'
import { verifyTotp } from '../services/twoFactor.service.js'
import { AuditAction, clientIp, recordAudit } from '../services/audit.service.js'
import { verifyFirebaseToken } from '../lib/firebase.js'

// bcrypt has a hard 72-byte input limit; passwordSchema already caps input at
// 72 characters so this only guards against callers that bypass Zod.
const PASSWORD_BCRYPT_ROUNDS = 10

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login → Buyer email + password login (replaces phone OTP —
// MSG91 removed). Generic invalid-credentials message on both a missing email
// and a wrong password, so a login attempt can't be used to enumerate which
// emails are registered.
// ─────────────────────────────────────────────────────────────────────────────
export const loginBuyer = async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash) {
    res.status(401).json({ success: false, message: 'Invalid email or password' })
    return
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    res.status(401).json({ success: false, message: 'Invalid email or password' })
    return
  }

  const token = jwt.sign(
    { userId: user.id, phone: user.phone },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )

  res.json({
    success: true,
    message: 'Login successful',
    token,
    // city/state let the buyer app decide whether the Basic Profile step
    // (Partner Module item 1.6) still needs to be completed after login.
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      city: user.city,
      state: user.state,
      profileComplete: Boolean(user.name && user.city && user.state),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/auth/profile → Buyer Basic Profile (Partner Module item 1.6)
// Name + City + State are mandatory (Zod: buyerProfileSchema); email/photo
// optional. Phone is immutable — it comes from the authenticated token.
// ─────────────────────────────────────────────────────────────────────────────
export const updateBuyerProfile = async (req: Request, res: Response) => {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required' })
    return
  }

  const { name, city, state, email, photoUrl } = req.body as {
    name: string
    city: string
    state: string
    email?: string
    photoUrl?: string
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      city,
      state,
      // Optional fields: only overwrite when provided, so a partial re-submit
      // never wipes an email/photo already on record.
      ...(email !== undefined ? { email } : {}),
      ...(photoUrl !== undefined ? { photoUrl } : {}),
    },
  })

  res.json({
    success: true,
    message: 'Profile updated',
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      city: user.city,
      state: user.state,
      photoUrl: user.photoUrl,
      profileComplete: Boolean(user.name && user.city && user.state),
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/seller/login → Partner email + password login (replaces
// phone OTP — MSG91 removed).
// ─────────────────────────────────────────────────────────────────────────────
export const sellerLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string }

  const seller = await prisma.seller.findUnique({ where: { email } })
  if (!seller || !seller.passwordHash) {
    res.status(401).json({ success: false, message: 'Invalid email or password' })
    return
  }

  const isValid = await bcrypt.compare(password, seller.passwordHash)
  if (!isValid) {
    res.status(401).json({ success: false, message: 'Invalid email or password' })
    return
  }

  if (seller.kycStatus === 'SUSPENDED') {
    res.status(403).json({ success: false, message: 'Account suspended. Please contact support.' })
    return
  }

  // Partner account deletion (Phase 4A) — soft-deleted, same as a hard 401
  // "no such account" from the login form's point of view.
  if (seller.deletedAt) {
    res.status(401).json({ success: false, message: 'Invalid email or password' })
    return
  }

  // Seller token — sellerId ke saath
  const token = jwt.sign(
    { sellerId: seller.id, phone: seller.phone },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )

  res.json({
    success: true,
    message: 'Seller login successful',
    token,
    seller: {
      id: seller.id,
      phone: seller.phone,
      email: seller.email,
      name: seller.name,
      profession: seller.profession,
      partnerRole: seller.partnerRole,
      badge: seller.badge,
      kycStatus: seller.kycStatus,
      accuracyScore: seller.accuracyScore,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/admin/login
// ─────────────────────────────────────────────────────────────────────────────
export const adminLogin = async (req: Request, res: Response) => {
  // Body is Zod-validated (adminLoginSchema): email is lowercased, and `totp`
  // is either absent or exactly six digits.
  const { email, password, totp } = req.body as {
    email: string
    password: string
    totp?: string
  }

  const admin = await prisma.admin.findUnique({ where: { email } })

  if (!admin) {
    res.status(401).json({ success: false, message: 'Invalid email ya password' })
    return
  }

  const isValid = await bcrypt.compare(password, admin.password)

  if (!isValid) {
    // Failed logins are recorded without an authenticated req.admin, so this
    // writes directly rather than through recordAudit(). Repeated rows against
    // one account are the signal a brute-force attempt leaves behind.
    await prisma.auditLog
      .create({
        data: {
          adminId: admin.id,
          action: AuditAction.ADMIN_LOGIN_FAILED,
          target: `Admin:${admin.id}`,
          details: 'Wrong password',
          ipAddress: clientIp(req),
        },
      })
      .catch(() => {
        /* audit must never turn a 401 into a 500 */
      })

    res.status(401).json({ success: false, message: 'Invalid email ya password' })
    return
  }

  // ── Admin management (Super Admin CRUD) ──────────────────────────────────
  // Checked after the password so a blocked/deactivated admin's credentials
  // stay indistinguishable from a wrong password to an outside caller, but
  // before 2FA — there's no reason to make a blocked admin type a TOTP code
  // just to learn they're blocked.
  if (admin.blocked) {
    res.status(403).json({ success: false, message: 'This admin account has been blocked. Contact the Super Admin.' })
    return
  }
  if (!admin.active) {
    res.status(403).json({ success: false, message: 'This admin account has been deactivated. Contact the Super Admin.' })
    return
  }

  // ── Second factor (PDF 5.1) ───────────────────────────────────────────────
  // Enforced only once the admin has completed enrollment. Demanding a code
  // from an admin who has no secret yet would lock every existing account out
  // of the panel — including the one needed to enroll.
  let acceptedTotpStep: number | undefined
  if (admin.twoFactorEnabled) {
    if (!totp) {
      res.status(401).json({
        success: false,
        code: 'TOTP_REQUIRED',
        message: 'Enter the 6-digit code from your authenticator app',
      })
      return
    }

    // afterTimeStep rejects a code already used this session — a glanced code is
    // useless the moment it is accepted once (PDF 5.1 replay window).
    const check = await verifyTotp(admin.twoFactorSecret, totp, admin.lastTotpStep)
    if (!check.valid) {
      await prisma.auditLog
        .create({
          data: {
            adminId: admin.id,
            action: AuditAction.ADMIN_LOGIN_FAILED,
            target: `Admin:${admin.id}`,
            details: 'Invalid or reused TOTP code',
            ipAddress: clientIp(req),
          },
        })
        .catch(() => {})

      res.status(401).json({ success: false, code: 'TOTP_INVALID', message: 'Invalid 6-digit code' })
      return
    }
    acceptedTotpStep = check.timeStep
  }

  // Session start — inactivity timeout isi stamp se measure hota hai (PDF 5.1).
  // The accepted TOTP step is stored so it cannot be replayed on the next login.
  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      lastActivityAt: new Date(),
      ...(acceptedTotpStep != null ? { lastTotpStep: acceptedTotpStep } : {}),
    },
  })

  await prisma.auditLog
    .create({
      data: {
        adminId: admin.id,
        action: AuditAction.ADMIN_LOGIN,
        target: `Admin:${admin.id}`,
        details: admin.twoFactorEnabled ? 'Password + TOTP' : 'Password only (2FA not enrolled)',
        ipAddress: clientIp(req),
      },
    })
    .catch(() => {})

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )

  res.json({
    success: true,
    message: 'Admin login successful',
    token,
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    twoFactor: {
      enabled: admin.twoFactorEnabled,
      // The panel uses this to push the admin into /2fa/setup after login.
      // Left as a prompt rather than a hard block so an unenrolled admin can
      // still reach the enrollment screen.
      enrollmentRequired: !admin.twoFactorEnabled,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE PHONE-OTP LOGIN — additive to the email/password logins above, not
// a replacement. Firebase Phone Authentication (client-side) handles the
// actual OTP generation/delivery/verification; these endpoints only ever
// verify the resulting ID token (lib/firebase.ts's verifyFirebaseToken,
// already wired for a token-fallback path in auth.middleware.ts) and issue
// the exact same local JWT the email/password logins already issue. Role,
// KYC status, blocked/deleted state, and SuperAdmin privilege are always
// read from the resolved DB row — never from anything in the Firebase token.
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/buyer/firebase
// Auto-creates a User on first phone-OTP login, same upsert-by-phone
// behavior authMiddleware's existing Firebase fallback already has — this
// endpoint exists so the buyer app can log in with phone-OTP directly at the
// login screen, rather than relying on that fallback firing mid-request.
export const loginBuyerFirebase = async (req: Request, res: Response) => {
  const { idToken } = req.body as { idToken: string }

  const identity = await verifyFirebaseToken(idToken)
  if (!identity) {
    res.status(401).json({ success: false, message: 'Invalid or expired code' })
    return
  }
  if (!identity.phone) {
    res.status(401).json({ success: false, message: 'Phone number required for this login' })
    return
  }

  // Guard against two ways a blind upsert could misattribute an account:
  // (a) this Firebase identity is already linked to a DIFFERENT phone's
  //     User row — reject rather than silently re-pointing it here;
  //     (b) the account this phone resolves to already has a DIFFERENT
  //     firebaseUid linked — never overwrite an existing link silently.
  // Same pattern as linkAdminFirebase's existing collision check below.
  const uidOwner = await prisma.user.findUnique({ where: { firebaseUid: identity.uid } })
  if (uidOwner && uidOwner.phone !== identity.phone) {
    res.status(409).json({ success: false, message: 'This Firebase account is already linked to a different CivilCheck account.' })
    return
  }
  const existingByPhone = await prisma.user.findUnique({ where: { phone: identity.phone } })
  if (existingByPhone?.firebaseUid && existingByPhone.firebaseUid !== identity.uid) {
    res.status(409).json({ success: false, message: 'This account is already linked to a different phone-OTP identity. Contact support.' })
    return
  }

  const user = await prisma.user.upsert({
    where: { phone: identity.phone },
    update: { firebaseUid: identity.uid },
    create: {
      phone: identity.phone,
      name: identity.name,
      email: identity.email,
      firebaseUid: identity.uid,
    },
  })

  if (user.blocked) {
    res.status(403).json({ success: false, code: 'ACCOUNT_BLOCKED', message: 'This account has been blocked. Contact support.' })
    return
  }
  if (user.deletedAt) {
    res.status(403).json({ success: false, code: 'ACCOUNT_DELETED', message: 'This account has been deleted.' })
    return
  }

  const token = jwt.sign({ userId: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })

  res.json({
    success: true,
    message: 'Login successful',
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

// POST /api/auth/seller/firebase
// No auto-create — a Seller registers via the full form (profession, bank
// details, T&C) first; a phone-OTP token for an unrecognized phone means
// "register first", same as sellerMiddleware never auto-creating a Seller.
export const loginSellerFirebase = async (req: Request, res: Response) => {
  const { idToken } = req.body as { idToken: string }

  const identity = await verifyFirebaseToken(idToken)
  if (!identity) {
    res.status(401).json({ success: false, message: 'Invalid or expired code' })
    return
  }
  if (!identity.phone) {
    res.status(401).json({ success: false, message: 'Phone number required for this login' })
    return
  }

  const seller = await prisma.seller.findUnique({ where: { phone: identity.phone } })
  if (!seller) {
    res.status(404).json({ success: false, message: 'No account found for this phone number — please register first' })
    return
  }

  if (seller.kycStatus === 'SUSPENDED') {
    res.status(403).json({ success: false, message: 'Account suspended. Please contact support.' })
    return
  }
  if (seller.deletedAt) {
    res.status(401).json({ success: false, message: 'Invalid login' })
    return
  }

  if (seller.firebaseUid !== identity.uid) {
    // Same two collision guards as loginBuyerFirebase — never silently
    // overwrite an existing different link, never let one Firebase
    // identity attach to a second Seller row.
    if (seller.firebaseUid) {
      res.status(409).json({ success: false, message: 'This account is already linked to a different phone-OTP identity. Contact support.' })
      return
    }
    const uidOwner = await prisma.seller.findUnique({ where: { firebaseUid: identity.uid } })
    if (uidOwner && uidOwner.id !== seller.id) {
      res.status(409).json({ success: false, message: 'This Firebase account is already linked to a different CivilCheck account.' })
      return
    }
    await prisma.seller.update({ where: { id: seller.id }, data: { firebaseUid: identity.uid } })
  }

  const token = jwt.sign({ sellerId: seller.id, phone: seller.phone }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })

  res.json({
    success: true,
    message: 'Seller login successful',
    token,
    seller: {
      id: seller.id,
      phone: seller.phone,
      email: seller.email,
      name: seller.name,
      profession: seller.profession,
      partnerRole: seller.partnerRole,
      badge: seller.badge,
      kycStatus: seller.kycStatus,
      accuracyScore: seller.accuracyScore,
    },
  })
}

// POST /api/auth/admin/firebase
// Deliberately NOT a cold-start login: Admin.phone is not unique (unlike
// User/Seller) and admins are provisioned by a Super Admin, never
// self-registered, so matching by phone would be ambiguous/unsafe. This
// only ever matches by firebaseUid, which is set exclusively by
// POST /api/admin/link-firebase (adminMiddleware-protected — an admin must
// already be authenticated via the existing email/password(+TOTP) login to
// link it). A SUPER_ADMIN row can never be linked in the first place (see
// linkAdminFirebase below), but the check is repeated here too so this
// endpoint can never issue a SuperAdmin session even if that invariant were
// ever violated by a future code change elsewhere.
export const loginAdminFirebase = async (req: Request, res: Response) => {
  const { idToken, totp } = req.body as { idToken: string; totp?: string }

  const identity = await verifyFirebaseToken(idToken)
  if (!identity) {
    res.status(401).json({ success: false, message: 'Invalid or expired code' })
    return
  }

  const admin = await prisma.admin.findUnique({ where: { firebaseUid: identity.uid } })
  if (!admin) {
    res.status(404).json({
      success: false,
      message: 'This phone number is not linked to an admin account. Log in with email/password first and link your phone from Settings.',
    })
    return
  }

  if (admin.role === 'SUPER_ADMIN') {
    res.status(403).json({
      success: false,
      message: 'SuperAdmin cannot use phone-OTP login. Use the existing email/password login.',
    })
    return
  }

  if (admin.blocked) {
    res.status(403).json({ success: false, message: 'This admin account has been blocked. Contact the Super Admin.' })
    return
  }
  if (!admin.active) {
    res.status(403).json({ success: false, message: 'This admin account has been deactivated. Contact the Super Admin.' })
    return
  }

  // Same second-factor bar as the email/password login — phone-OTP must not
  // become a way to skip an admin's already-enrolled TOTP.
  let acceptedTotpStep: number | undefined
  if (admin.twoFactorEnabled) {
    if (!totp) {
      res.status(401).json({ success: false, code: 'TOTP_REQUIRED', message: 'Enter the 6-digit code from your authenticator app' })
      return
    }
    const check = await verifyTotp(admin.twoFactorSecret, totp, admin.lastTotpStep)
    if (!check.valid) {
      res.status(401).json({ success: false, code: 'TOTP_INVALID', message: 'Invalid 6-digit code' })
      return
    }
    acceptedTotpStep = check.timeStep
  }

  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      lastActivityAt: new Date(),
      ...(acceptedTotpStep != null ? { lastTotpStep: acceptedTotpStep } : {}),
    },
  })

  await prisma.auditLog
    .create({
      data: {
        adminId: admin.id,
        action: AuditAction.ADMIN_LOGIN,
        target: `Admin:${admin.id}`,
        details: 'Phone-OTP login (Firebase)',
        ipAddress: clientIp(req),
      },
    })
    .catch(() => {})

  const token = jwt.sign({ adminId: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })

  res.json({
    success: true,
    message: 'Admin login successful',
    token,
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    twoFactor: { enabled: admin.twoFactorEnabled, enrollmentRequired: !admin.twoFactorEnabled },
  })
}

// POST /api/admin/link-firebase — adminMiddleware-protected (self-service,
// not role-gated, same reasoning as the 2FA endpoints: every admin manages
// their own login methods). Links the CALLING admin's own account to the
// Firebase UID behind the ID token just verified. A SUPER_ADMIN can never
// link one — the one hardcoded/legacy SuperAdmin login stays the sole path
// for that account, per the explicit requirement that Firebase must never
// gain any influence over SuperAdmin access.
export const linkAdminFirebase = async (req: Request, res: Response) => {
  const adminId = req.admin!.id
  const { idToken } = req.body as { idToken: string }

  const identity = await verifyFirebaseToken(idToken)
  if (!identity) {
    res.status(401).json({ success: false, message: 'Invalid or expired code' })
    return
  }

  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: adminId } })

  if (admin.role === 'SUPER_ADMIN') {
    res.status(403).json({
      success: false,
      message: 'SuperAdmin accounts cannot be linked to Firebase phone-OTP login.',
    })
    return
  }

  const existingLink = await prisma.admin.findUnique({ where: { firebaseUid: identity.uid } })
  if (existingLink && existingLink.id !== adminId) {
    res.status(409).json({ success: false, message: 'This phone number is already linked to a different admin account.' })
    return
  }

  await prisma.admin.update({ where: { id: adminId }, data: { firebaseUid: identity.uid } })

  await recordAudit(req, {
    action: AuditAction.ADMIN_FIREBASE_LINK,
    target: `Admin:${adminId}`,
    details: 'Linked phone-OTP login',
  })

  res.json({ success: true, message: 'Phone-OTP login linked to your account.' })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
type SessionTokenPayload = {
  adminId?: string
  sellerId?: string
  userId?: string
}

export const getMe = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Token required' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionTokenPayload

    if (decoded.adminId) {
      const admin = await prisma.admin.findUnique({ where: { id: decoded.adminId } })
      if (!admin) { res.status(401).json({ success: false, message: 'Admin not found' }); return }

      // Idle session ko yahan bhi reject karo — warna admin panel /me se
      // "logged in" samajh leta aur baaki har call 401 deti (PDF 5.1)
      if (isAdminSessionExpired(admin.lastActivityAt)) {
        res.status(401).json({
          success: false,
          code: 'SESSION_EXPIRED',
          message: 'Session expired due to inactivity — please log in again',
        })
        return
      }

      // A JWT issued before a block/deactivate still verifies cryptographically
      // for up to 7 days — /me is the panel's own "am I still logged in?" probe
      // on reload, so it has to catch this the same way adminMiddleware does.
      if (admin.blocked || !admin.active) {
        res.status(403).json({ success: false, message: 'This admin account is no longer active.' })
        return
      }

      res.json({ success: true, user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } })
      return
    }

    if (decoded.sellerId) {
      const seller = await prisma.seller.findUnique({ where: { id: decoded.sellerId } })
      if (!seller) { res.status(401).json({ success: false, message: 'Seller not found' }); return }
      res.json({ success: true, seller: { id: seller.id, phone: seller.phone, name: seller.name, badge: seller.badge, kycStatus: seller.kycStatus } })
      return
    }

    if (decoded.userId) {
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
      if (!user) { res.status(401).json({ success: false, message: 'User not found' }); return }
      res.json({
        success: true,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          city: user.city,
          state: user.state,
          profileComplete: Boolean(user.name && user.city && user.state),
        },
      })
      return
    }

    res.status(401).json({ success: false, message: 'Invalid token' })
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
export const logout = async (req: Request, res: Response) => {
  // Buyer/seller tokens stateless hain — client token discard kar deta hai.
  // Admin ke liye lastActivityAt clear karo: isse token server-side mar jaata
  // hai, bhale hi JWT abhi bhi cryptographically valid ho (PDF 5.1).
  const authHeader = req.headers.authorization

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as SessionTokenPayload
      if (decoded.adminId) {
        await prisma.admin.update({
          where: { id: decoded.adminId },
          data: { lastActivityAt: null },
        })

        await prisma.auditLog
          .create({
            data: {
              adminId: decoded.adminId,
              action: AuditAction.ADMIN_LOGOUT,
              target: `Admin:${decoded.adminId}`,
              details: 'Session ended by logout',
              ipAddress: clientIp(req),
            },
          })
          .catch(() => {
            /* logout stays idempotent even if the audit write fails */
          })
      }
    } catch {
      // Invalid/expired token — logout phir bhi success hai (idempotent)
    }
  }

  res.json({ success: true, message: 'Logged out successfully' })
}


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register → Buyer signup (email + password + mandatory phone —
// replaces phone OTP, MSG91 removed). Logs the buyer straight in: no
// verification step sits between this and a usable session.
// ─────────────────────────────────────────────────────────────────────────────
export const registerBuyer = async (req: Request, res: Response) => {
  const { name, email, phone, password } = req.body as {
    name: string
    email: string
    phone: string
    password: string
  }

  const existingPhone = await prisma.user.findUnique({ where: { phone } })
  if (existingPhone) {
    res.status(409).json({ success: false, message: 'This phone number is already registered.' })
    return
  }

  const existingEmail = await prisma.user.findUnique({ where: { email } })
  if (existingEmail) {
    res.status(409).json({ success: false, message: 'This email is already registered.' })
    return
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS)

  const user = await prisma.user.create({
    data: { phone, name, email, passwordHash },
  })

  const token = jwt.sign(
    { userId: user.id, phone: user.phone },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )

  res.status(201).json({
    success: true,
    message: 'Buyer registered successfully',
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