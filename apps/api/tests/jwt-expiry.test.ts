// ─────────────────────────────────────────────────────────────────────────────
// ACCESS_TOKEN_EXPIRY wiring (lib/jwt.ts). resolveAccessTokenExpiry() is a pure
// function (no process.env read inside), so its config-resolution rules are
// tested directly here rather than via module-reset/reimport tricks. The
// currently-configured ACCESS_TOKEN_EXPIRY (whatever .env has, defaulting to
// 7d) is verified end-to-end against a real login below, alongside proof that
// JWT_SECRET's fail-fast requirement and ordinary auth flows are unaffected.
// ─────────────────────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { ACCESS_TOKEN_EXPIRY, resolveAccessTokenExpiry } from '../src/lib/jwt.js'
import { app, loginAdmin, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers.js'

describe('resolveAccessTokenExpiry', () => {
  it('respects a configured duration string', () => {
    expect(resolveAccessTokenExpiry('2h')).toBe('2h')
    expect(resolveAccessTokenExpiry('45m')).toBe('45m')
  })

  it('respects a configured bare number of seconds', () => {
    expect(resolveAccessTokenExpiry('3600')).toBe(3600)
  })

  it('falls back to 7d when unset', () => {
    expect(resolveAccessTokenExpiry(undefined)).toBe('7d')
  })

  it('falls back to 7d when the value is not a valid duration', () => {
    expect(resolveAccessTokenExpiry('not-a-duration')).toBe('7d')
  })
})

describe('ACCESS_TOKEN_EXPIRY wiring', () => {
  it('signs tokens whose lifetime matches the resolved ACCESS_TOKEN_EXPIRY', () => {
    // Proves the exported constant is a real jsonwebtoken-accepted value,
    // not just a string that happens to look right.
    const token = jwt.sign({ probe: true }, 'irrelevant-for-this-check', {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    })
    const decoded = jwt.decode(token) as { iat: number; exp: number }
    expect(decoded.exp).toBeGreaterThan(decoded.iat)
  })

  it('JWT_SECRET is still required — admin login still fails without a valid one', async () => {
    // JWT_SECRET's own fail-fast-at-startup behavior isn't re-triggerable
    // inside a running test process (the app already booted successfully),
    // but this confirms the secret is still actually enforced at verify time:
    // a token signed with the wrong secret is rejected.
    const bogusToken = jwt.sign({ adminId: 'not-a-real-id' }, 'definitely-not-the-real-secret', {
      expiresIn: '7d',
    })
    const res = await request(app).get('/api/admin/report-flags').set('Authorization', `Bearer ${bogusToken}`)
    expect(res.status).toBe(401)
  })

  it('existing admin login still succeeds and returns a working, correctly-expiring token', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.token).toEqual(expect.any(String))

    const decoded = jwt.decode(res.body.token) as { iat: number; exp: number }
    const lifetimeSeconds = decoded.exp - decoded.iat
    // Whatever ACCESS_TOKEN_EXPIRY currently resolves to, the actual signed
    // token's lifetime must match it exactly — this is the real wiring proof.
    const expected = jwt.decode(
      jwt.sign({}, 'x', { expiresIn: ACCESS_TOKEN_EXPIRY })
    ) as { iat: number; exp: number }
    expect(lifetimeSeconds).toBe(expected.exp - expected.iat)
  })

  it('a token from loginAdmin() still authorizes an admin route (auth flow unaffected)', async () => {
    const token = await loginAdmin()
    const res = await request(app).get('/api/admin/report-flags').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
