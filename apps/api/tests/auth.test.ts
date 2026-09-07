import request from 'supertest'
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

describe('auth', () => {
  const createdPhones: string[] = []

  afterAll(async () => {
    if (createdPhones.length) {
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

  it('registers a buyer with email+password and logs in with the same credentials', async () => {
    const phone = uniquePhone()
    const email = uniqueEmail('auth-buyer')
    createdPhones.push(phone)

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ phone, name: 'Auth Test Buyer', email, password: TEST_PASSWORD })
    expect(registerRes.status).toBe(201)
    expect(registerRes.body.user.phone).toBe(phone)
    expect(registerRes.body.token).toEqual(expect.any(String))

    const wrongPasswordRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
    expect(wrongPasswordRes.status).toBe(401)

    const loginRes = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.token).toEqual(expect.any(String))
    expect(loginRes.body.user.email).toBe(email)
  })

  it('rejects a duplicate phone or email on buyer registration', async () => {
    const phone = uniquePhone()
    const email = uniqueEmail('auth-buyer-dup')
    createdPhones.push(phone)

    const firstRes = await request(app)
      .post('/api/auth/register')
      .send({ phone, name: 'Dup Test Buyer', email, password: TEST_PASSWORD })
    expect(firstRes.status).toBe(201)

    const dupPhoneRes = await request(app)
      .post('/api/auth/register')
      .send({ phone, name: 'Dup Test Buyer 2', email: uniqueEmail('auth-buyer-dup2'), password: TEST_PASSWORD })
    expect(dupPhoneRes.status).toBe(409)

    const dupEmailRes = await request(app)
      .post('/api/auth/register')
      .send({ phone: uniquePhone(), name: 'Dup Test Buyer 3', email, password: TEST_PASSWORD })
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
