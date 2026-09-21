// DigiLocker service/provider unit tests.
//
// No real DigiLocker call is ever made: the provider's HTTP layer (global
// fetch) is replaced with canned responses at TEST LEVEL ONLY. Nothing in the
// production code can return a "verified" result without a real provider
// response; these tests just prove our handling of each response shape.
import crypto from 'node:crypto'
import { jest } from '@jest/globals'
import prisma from '../src/lib/prisma.js'
import { getDigilockerConfig, describeDigilockerConfig } from '../src/services/digilocker/digilocker.config.js'
import { buildAuthorizationUrl, exchangeCodeForToken, fetchIdentity } from '../src/services/digilocker/digilocker.client.js'
import { DigilockerError } from '../src/services/digilocker/digilocker.types.js'
import { startAuthorization, handleCallback, namesAlign } from '../src/services/digilocker/digilocker.service.js'

const ENV_KEYS = [
  'DIGILOCKER_CLIENT_ID', 'DIGILOCKER_CLIENT_SECRET', 'DIGILOCKER_REDIRECT_URI', 'DIGILOCKER_AUTH_URL',
  'DIGILOCKER_TOKEN_URL', 'DIGILOCKER_API_BASE_URL', 'DIGILOCKER_PROFILE_PATH', 'DIGILOCKER_SCOPE',
] as const
const SECRET = 'unit-test-secret-not-real'
const TOKEN = 'unit-test-token-not-real'
const saved: Record<string, string | undefined> = {}

const configure = () => {
  Object.assign(process.env, {
    DIGILOCKER_CLIENT_ID: 'unit-client',
    DIGILOCKER_CLIENT_SECRET: SECRET,
    DIGILOCKER_REDIRECT_URI: 'https://example.test/api/seller/digilocker/callback',
    DIGILOCKER_AUTH_URL: 'https://provider.test/authorize',
    DIGILOCKER_TOKEN_URL: 'https://provider.test/token',
    DIGILOCKER_API_BASE_URL: 'https://provider.test/api',
    DIGILOCKER_PROFILE_PATH: '/profile',
  })
}
const unconfigure = () => { for (const k of ENV_KEYS) delete process.env[k] }

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchSpy: ReturnType<typeof jest.spyOn>
let sellerId: string

beforeAll(async () => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  const s = await prisma.seller.create({
    data: {
      phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      name: 'Unit Test Partner',
      email: `dl.unit.${Date.now()}.${Math.floor(Math.random() * 1e6)}@test.civilcheck.in`,
      passwordHash: 'x',
      profession: 'PROPERTY_CONSULTANT',
    },
  })
  sellerId = s.id
})

afterAll(async () => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  await prisma.digilockerAuthState.deleteMany({ where: { sellerId } })
  await prisma.seller.delete({ where: { id: sellerId } })
})

beforeEach(() => { fetchSpy = jest.spyOn(globalThis, 'fetch') })
afterEach(() => { fetchSpy.mockRestore(); unconfigure() })

describe('DigiLocker configuration', () => {
  it('reports NOT CONFIGURED and lists only missing variable NAMES', () => {
    unconfigure()
    const d = describeDigilockerConfig()
    expect(d.status).toBe('NOT CONFIGURED')
    expect(d.missing).toContain('DIGILOCKER_CLIENT_SECRET')
    expect(JSON.stringify(d)).not.toContain(SECRET)
  })
  it('is CONFIGURED only when every required value is present', () => {
    configure()
    expect(describeDigilockerConfig().status).toBe('CONFIGURED')
    delete process.env.DIGILOCKER_TOKEN_URL
    expect(getDigilockerConfig().mode).toBe('disabled')
  })
  it('has no mock mode', () => {
    unconfigure()
    process.env.DIGILOCKER_MODE = 'mock'
    expect(getDigilockerConfig().mode).toBe('disabled')
    delete process.env.DIGILOCKER_MODE
  })
  it('startAuthorization fails with NOT_CONFIGURED and writes nothing', async () => {
    unconfigure()
    await expect(startAuthorization(sellerId)).rejects.toMatchObject({ failure: 'NOT_CONFIGURED' })
    expect(await prisma.digilockerAuthState.count({ where: { sellerId } })).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('DigiLocker provider client (HTTP mocked at test level)', () => {
  it('builds an authorization URL from configuration, without the secret', () => {
    configure()
    const u = new URL(buildAuthorizationUrl(getDigilockerConfig(), 'abc'))
    expect(u.origin + u.pathname).toBe('https://provider.test/authorize')
    expect(u.searchParams.get('client_id')).toBe('unit-client')
    expect(u.searchParams.get('redirect_uri')).toBe('https://example.test/api/seller/digilocker/callback')
    expect(u.searchParams.get('state')).toBe('abc')
    expect(u.toString()).not.toContain(SECRET)
  })
  it('exchanges a code for a token', async () => {
    configure()
    fetchSpy.mockResolvedValueOnce(jsonRes(200, { access_token: TOKEN }))
    await expect(exchangeCodeForToken(getDigilockerConfig(), 'c')).resolves.toBe(TOKEN)
  })
  it.each([
    [400, 'INVALID_CODE'], [401, 'INVALID_CODE'], [500, 'UNAVAILABLE'], [503, 'UNAVAILABLE'], [418, 'PROVIDER_ERROR'],
  ])('maps token endpoint HTTP %i to %s', async (status, failure) => {
    configure()
    fetchSpy.mockResolvedValueOnce(jsonRes(status as number, {}))
    await expect(exchangeCodeForToken(getDigilockerConfig(), 'c')).rejects.toMatchObject({ failure })
  })
  it('maps a network error / timeout to UNAVAILABLE without leaking its message', async () => {
    configure()
    fetchSpy.mockRejectedValueOnce(new Error(`connect failed client_secret=${SECRET}`))
    const e = await exchangeCodeForToken(getDigilockerConfig(), 'c').catch((x) => x)
    expect(e).toBeInstanceOf(DigilockerError)
    expect(e.failure).toBe('UNAVAILABLE')
    expect(String(e.message)).not.toContain(SECRET)
  })
  it('rejects malformed token and profile responses', async () => {
    configure()
    fetchSpy.mockResolvedValueOnce(jsonRes(200, { nope: 1 }))
    await expect(exchangeCodeForToken(getDigilockerConfig(), 'c')).rejects.toMatchObject({ failure: 'MALFORMED_RESPONSE' })
    fetchSpy.mockResolvedValueOnce(jsonRes(200, { foo: 1 }))
    await expect(fetchIdentity(getDigilockerConfig(), TOKEN)).rejects.toMatchObject({ failure: 'MALFORMED_RESPONSE' })
  })
})

describe('DigiLocker callback handling', () => {
  const stateFrom = async () => {
    configure()
    const { authorizationUrl } = await startAuthorization(sellerId)
    return new URL(authorizationUrl).searchParams.get('state') as string
  }

  it.each([undefined, '', 'short', '<script>', 'g'.repeat(64)])('rejects malformed state %p', async (s) => {
    await expect(handleCallback({ state: s, code: 'x' })).resolves.toBe('session_expired')
  })
  it('rejects an unknown (forged) but well-formed state', async () => {
    await expect(handleCallback({ state: crypto.randomBytes(32).toString('hex'), code: 'x' })).resolves.toBe('session_expired')
  })
  it('marks the attempt pending on start and stores only a state hash', async () => {
    const state = await stateFrom()
    expect((await prisma.seller.findUniqueOrThrow({ where: { id: sellerId } })).digilockerStatus).toBe('PENDING')
    expect(await prisma.digilockerAuthState.findFirst({ where: { stateHash: state } })).toBeNull()
    await handleCallback({ state, error: 'access_denied' })
  })
  it('handles user cancellation and clears pending', async () => {
    const state = await stateFrom()
    await expect(handleCallback({ state, error: 'access_denied' })).resolves.toBe('cancelled')
    expect((await prisma.seller.findUniqueOrThrow({ where: { id: sellerId } })).digilockerStatus).toBeNull()
  })
  it('completes the OAuth flow structure (mocked provider) and blocks replay', async () => {
    const state = await stateFrom()
    fetchSpy
      .mockResolvedValueOnce(jsonRes(200, { access_token: TOKEN }))
      .mockResolvedValueOnce(jsonRes(200, { name: 'unit test partner' }))
    await expect(handleCallback({ state, code: 'good' })).resolves.toBe('success')
    const s = await prisma.seller.findUniqueOrThrow({ where: { id: sellerId } })
    expect(s.digilockerStatus).toBe('VERIFIED')
    expect(s.digilockerProvider).toBe('DIGILOCKER')
    expect(JSON.stringify(s)).not.toContain(TOKEN)
    await expect(handleCallback({ state, code: 'good' })).resolves.toBe('session_expired')
    await prisma.seller.update({ where: { id: sellerId }, data: { digilockerStatus: null, digilockerProvider: null, digilockerVerifiedAt: null } })
  })
  it('fails (never verifies) on identity mismatch', async () => {
    const state = await stateFrom()
    fetchSpy
      .mockResolvedValueOnce(jsonRes(200, { access_token: TOKEN }))
      .mockResolvedValueOnce(jsonRes(200, { name: 'Somebody Else' }))
    await expect(handleCallback({ state, code: 'good' })).resolves.toBe('failed')
    expect((await prisma.seller.findUniqueOrThrow({ where: { id: sellerId } })).digilockerStatus).toBe('FAILED')
    await prisma.seller.update({ where: { id: sellerId }, data: { digilockerStatus: null, digilockerProvider: null } })
  })
  it('treats provider outage as unavailable and leaves the account not-verified', async () => {
    const state = await stateFrom()
    fetchSpy.mockResolvedValueOnce(jsonRes(503, {}))
    await expect(handleCallback({ state, code: 'good' })).resolves.toBe('unavailable')
    expect((await prisma.seller.findUniqueOrThrow({ where: { id: sellerId } })).digilockerStatus).toBeNull()
  })
  it('rejects an expired state', async () => {
    const state = await stateFrom()
    await prisma.digilockerAuthState.updateMany({ where: { sellerId, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await expect(handleCallback({ state, code: 'good' })).resolves.toBe('session_expired')
  })
})

describe('name alignment', () => {
  it('matches subsets of the same name and rejects different people', () => {
    expect(namesAlign('Rahul Kumar Sharma', 'rahul sharma')).toBe(true)
    expect(namesAlign('Rahul Sharma', 'Amit Verma')).toBe(false)
    expect(namesAlign('', 'Amit')).toBe(false)
  })
})
