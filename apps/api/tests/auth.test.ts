import request from 'supertest'
import bcrypt from 'bcryptjs'
import {
  app,
  prisma,
  uniquePhone,
  uniqueEmail,
  loginAdmin,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TEST_PASSWORD,
} from './helpers.js'

const TEST_ADDRESS = '221B QA Test Street, Baker Colony, Jaipur, Rajasthan'

// Signup Email Verification — the OTP is never returned by the API by
// design, so a test that needs to actually verify an account swaps the
// stored hash to a known value it controls (the same technique this
// feature's own live QA script uses) rather than reading a real inbox.
async function forceKnownOtp(userId: string, otp: string) {
  const hash = await bcrypt.hash(otp, 10)
  const row = await prisma.passwordResetOtp.findFirst({
    where: { userId, purpose: 'EMAIL_VERIFICATION' },
    orderBy: { createdAt: 'desc' },
  })
  await prisma.passwordResetOtp.update({ where: { id: row!.id }, data: { otpHash: hash } })
}

describe('auth', () => {
  const createdPhones: string[] = []

  afterAll(async () => {
    if (createdPhones.length) {
      const users = await prisma.user.findMany({ where: { phone: { in: createdPhones } }, select: { id: true } })
      // Signup Email Verification — PasswordResetOtp.userId is a RESTRICT FK
      // (see schema.prisma), and every buyer registered in this file now
      // creates at least one row here (the welcome verification email).
      await prisma.passwordResetOtp.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } })
      await prisma.user.deleteMany({ where: { phone: { in: createdPhones } } })
    }
  })

  it('admin login succeeds with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.admin.role).toBe('SUPER_ADMIN')
  })

  it('admin login rejects a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong-password' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('registers a buyer unverified, verifies via emailed OTP, then logs in with the same credentials', async () => {
    const phone = uniquePhone()
    const email = uniqueEmail('auth-buyer')
    createdPhones.push(phone)

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ phone, name: 'Auth Test Buyer', email, address: TEST_ADDRESS, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD })
    expect(registerRes.status).toBe(201)
    expect(registerRes.body.requiresVerification).toBe(true)
    expect(registerRes.body.token).toBeUndefined()

    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(user.emailVerified).toBe(false)
    expect(user.address).toBe(TEST_ADDRESS)

    // Signup Email Verification — login is refused until the account verifies.
    const loginBeforeVerify = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD })
    expect(loginBeforeVerify.status).toBe(403)
    expect(loginBeforeVerify.body.code).toBe('EMAIL_NOT_VERIFIED')

    await forceKnownOtp(user.id, '654321')
    const wrongOtpRes = await request(app).post('/api/auth/verify-email').send({ email, otp: '000000' })
    expect(wrongOtpRes.status).toBe(400)

    const verifyRes = await request(app).post('/api/auth/verify-email').send({ email, otp: '654321' })
    expect(verifyRes.status).toBe(200)
    expect(verifyRes.body.token).toEqual(expect.any(String))

    const wrongPasswordRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
    expect(wrongPasswordRes.status).toBe(401)

    const loginRes = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.token).toEqual(expect.any(String))
    expect(loginRes.body.user.email).toBe(email)
  })

  it('rejects a duplicate VERIFIED phone or email on buyer registration', async () => {
    const phone = uniquePhone()
    const email = uniqueEmail('auth-buyer-dup')
    createdPhones.push(phone)

    const firstRes = await request(app)
      .post('/api/auth/register')
      .send({ phone, name: 'Dup Test Buyer', email, address: TEST_ADDRESS, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD })
    expect(firstRes.status).toBe(201)
    // Verify it — an unverified duplicate is a resumable signup (see
    // emailVerification.service.ts), not a 409; only a verified account
    // blocks a second registration on the same email/phone.
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    await forceKnownOtp(user.id, '654321')
    await request(app).post('/api/auth/verify-email').send({ email, otp: '654321' })

    const dupPhoneRes = await request(app)
      .post('/api/auth/register')
      .send({ phone, name: 'Dup Test Buyer 2', email: uniqueEmail('auth-buyer-dup2'), address: TEST_ADDRESS, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD })
    expect(dupPhoneRes.status).toBe(409)

    const dupEmailRes = await request(app)
      .post('/api/auth/register')
      .send({ phone: uniquePhone(), name: 'Dup Test Buyer 3', email, address: TEST_ADDRESS, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD })
    expect(dupEmailRes.status).toBe(409)
  })

  it('a Bearer token from loginAdmin() actually authorizes an admin route', async () => {
    const token = await loginAdmin()
    const res = await request(app).get('/api/admin/report-flags').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('rejects admin routes without a token', async () => {
    const res = await request(app).get('/api/admin/report-flags')
    expect(res.status).toBe(401)
  })
})
