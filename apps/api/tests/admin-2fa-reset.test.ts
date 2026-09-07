// ─────────────────────────────────────────────────────────────────────────────
// SuperAdmin-assisted 2FA reset (POST /api/admin/admins/:id/2fa/reset) —
// recovery path for an admin who lost their authenticator. Drives the REAL
// enrollment flow (setup → live otplib code → enable) rather than writing
// twoFactorSecret/twoFactorEnabled directly, so these tests also double as
// proof that ordinary enrollment/verification is unaffected by this change.
// ─────────────────────────────────────────────────────────────────────────────
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { generate } from 'otplib'
import { app, prisma, loginAdmin, uniqueEmail, uniquePhone, TEST_PASSWORD } from './helpers.js'

describe('admin 2FA reset (SuperAdmin recovery)', () => {
  const createdAdminIds: string[] = []

  afterAll(async () => {
    if (createdAdminIds.length) {
      await prisma.auditLog.deleteMany({ where: { adminId: { in: createdAdminIds } } })
      await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } })
    }
  })

  function superAdminId(token: string): string {
    const decoded = jwt.decode(token) as { adminId: string }
    return decoded.adminId
  }

  async function createSubAdmin(superToken: string, label: string) {
    const email = uniqueEmail(label)
    const phone = uniquePhone()
    const createRes = await request(app)
      .post('/api/admin/admins')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: label, email, phone, password: TEST_PASSWORD, role: 'SUB_ADMIN' })
    if (!createRes.body.success) throw new Error(`Admin create failed: ${JSON.stringify(createRes.body)}`)
    const adminId = createRes.body.admin.id as string
    createdAdminIds.push(adminId)

    const loginRes = await request(app).post('/api/auth/admin/login').send({ email, password: TEST_PASSWORD })
    if (!loginRes.body.success) throw new Error(`Sub-admin login failed: ${JSON.stringify(loginRes.body)}`)

    return { adminId, email, token: loginRes.body.token as string }
  }

  async function enrollTwoFactor(targetToken: string) {
    const setupRes = await request(app).post('/api/admin/2fa/setup').set('Authorization', `Bearer ${targetToken}`)
    if (!setupRes.body.success) throw new Error(`2FA setup failed: ${JSON.stringify(setupRes.body)}`)
    const secret = setupRes.body.secret as string

    const code = await generate({ secret })
    const enableRes = await request(app)
      .post('/api/admin/2fa/enable')
      .set('Authorization', `Bearer ${targetToken}`)
      .send({ totp: code })
    if (!enableRes.body.success) throw new Error(`2FA enable failed: ${JSON.stringify(enableRes.body)}`)

    return secret
  }

  it('SuperAdmin resets an enrolled admin\'s 2FA: fields cleared, password unchanged, secret never returned, audit recorded, target can log in without TOTP', async () => {
    const superToken = await loginAdmin()
    const { adminId, email, token: targetToken } = await createSubAdmin(superToken, 'reset-target')
    const secret = await enrollTwoFactor(targetToken)

    const before = await prisma.admin.findUniqueOrThrow({ where: { id: adminId } })
    expect(before.twoFactorEnabled).toBe(true)
    expect(before.twoFactorSecret).not.toBeNull()

    const resetRes = await request(app)
      .post(`/api/admin/admins/${adminId}/2fa/reset`)
      .set('Authorization', `Bearer ${superToken}`)

    expect(resetRes.status).toBe(200)
    expect(resetRes.body.success).toBe(true)

    // Secret never returned in the response, in any form.
    expect(JSON.stringify(resetRes.body)).not.toContain(secret)
    expect(resetRes.body.admin).not.toHaveProperty('twoFactorSecret')

    const after = await prisma.admin.findUniqueOrThrow({ where: { id: adminId } })
    expect(after.twoFactorEnabled).toBe(false)
    expect(after.twoFactorSecret).toBeNull()
    expect(after.lastTotpStep).toBeNull()
    // Untouched fields
    expect(after.password).toBe(before.password)
    expect(after.role).toBe(before.role)
    expect(after.blocked).toBe(before.blocked)
    expect(after.active).toBe(before.active)

    // Target logs in again with password only — no TOTP required anymore.
    const loginRes = await request(app).post('/api/auth/admin/login').send({ email, password: TEST_PASSWORD })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.success).toBe(true)
    expect(loginRes.body.token).toEqual(expect.any(String))
    expect(loginRes.body.twoFactor.enabled).toBe(false)

    // Audit row was written, with no secret/code inside it.
    const auditRow = await prisma.auditLog.findFirst({
      where: { action: 'ADMIN_2FA_RESET', adminId: superAdminId(superToken), target: `Admin:${adminId}` },
      orderBy: { createdAt: 'desc' },
    })
    expect(auditRow).not.toBeNull()
    expect(auditRow!.details ?? '').not.toContain(secret)

    // Target can re-enroll from scratch afterward — enrollment flow itself
    // is unaffected by this change.
    await enrollTwoFactor(loginRes.body.token as string)
    const reEnrolled = await prisma.admin.findUniqueOrThrow({ where: { id: adminId } })
    expect(reEnrolled.twoFactorEnabled).toBe(true)
  })

  it('a normal (non-SuperAdmin) Admin gets 403', async () => {
    const superToken = await loginAdmin()
    const { adminId } = await createSubAdmin(superToken, 'reset-target-403')
    const { token: actorToken } = await createSubAdmin(superToken, 'reset-actor-403')

    const res = await request(app)
      .post(`/api/admin/admins/${adminId}/2fa/reset`)
      .set('Authorization', `Bearer ${actorToken}`)

    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it('SuperAdmin cannot reset its own 2FA through this endpoint', async () => {
    const superToken = await loginAdmin()
    const ownId = superAdminId(superToken)

    const res = await request(app)
      .post(`/api/admin/admins/${ownId}/2fa/reset`)
      .set('Authorization', `Bearer ${superToken}`)

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('rejects an unauthenticated request', async () => {
    const superToken = await loginAdmin()
    const { adminId } = await createSubAdmin(superToken, 'reset-target-noauth')

    const res = await request(app).post(`/api/admin/admins/${adminId}/2fa/reset`)
    expect(res.status).toBe(401)
  })
})
