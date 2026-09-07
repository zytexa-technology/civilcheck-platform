// ─────────────────────────────────────────────────────────────────────────────
// AI Customer Support — real-vs-fallback behavior.
//
// Provider switched from Anthropic to Google Gemini 2026-09-02 — GEMINI_API_KEY
// is the only variable lib/aiSupport.ts reads for the real path now. It is
// empty in every real environment this suite runs against (support falls back
// to the deterministic knowledge-base matcher), so the "real path" cases here
// force it on for the duration of one test only (restored in `finally`) and
// monkey-patch global.fetch so the request never actually leaves this process
// — no real Gemini call, no cost, no real key ever used. lib/aiSupport.ts
// reads the key PER CALL, not at module load, which is exactly what makes
// this safe to toggle mid-suite.
//
// Each ticket-creating case below registers its OWN buyer (rather than
// sharing one across the file) so this suite doesn't collide with
// supportTicketLimiter (5 tickets/hour/buyer — see rateLimiter.ts and
// tests/support-rate-limit.test.ts): several cases here would otherwise burn
// through one buyer's whole budget and a later one would 429 instead of
// exercising the behavior it's meant to test.
// ─────────────────────────────────────────────────────────────────────────────
import request from 'supertest'
import { app, prisma, registerAndLoginBuyer, deleteBuyer } from './helpers.js'

const KEY_ENV = 'GEMINI_API_KEY'
const FAKE_KEY = 'test-key-never-sent-fetch-is-mocked'

function withFakeKeyAndMockFetch(fetchImpl: typeof fetch) {
  const original = process.env[KEY_ENV]
  const originalFetch = global.fetch
  process.env[KEY_ENV] = FAKE_KEY
  global.fetch = fetchImpl
  return () => {
    if (original === undefined) delete process.env[KEY_ENV]
    else process.env[KEY_ENV] = original
    global.fetch = originalFetch
  }
}

// Gemini's generateContent response shape: candidates[0].content.parts[].text
function mockGeminiResponse(text: string) {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    }) as unknown as Response) as unknown as typeof fetch
}

function mockGeminiHttpError(status: number, message: string) {
  return (async () =>
    ({
      ok: false,
      status,
      json: async () => ({ error: { message } }),
    }) as unknown as Response) as unknown as typeof fetch
}

describe('AI Customer Support — real Gemini path vs. deterministic fallback', () => {
  const knowledgeKey = `test-ai-support-${Date.now()}`
  const question = 'How do I reset my password for CivilCheck?'
  const approvedAnswer = 'Use the "Forgot password" link on the login screen to reset it.'
  const createdUserIds: string[] = []

  async function freshBuyer() {
    const buyer = await registerAndLoginBuyer()
    createdUserIds.push(buyer.userId)
    return buyer
  }

  beforeAll(async () => {
    // A minimal approved knowledge entry — the deterministic fallback matcher
    // needs at least one row to match against for the "key missing" case.
    await prisma.supportKnowledgeEntry.create({
      data: { key: knowledgeKey, topic: 'ACCOUNT', question, answer: approvedAnswer, active: true },
    })
  })

  afterAll(async () => {
    await prisma.supportKnowledgeEntry.deleteMany({ where: { key: knowledgeKey } })
    for (const id of createdUserIds) await deleteBuyer(id)
  })

  it('GEMINI_API_KEY missing -> deterministic knowledge-base fallback answers the ticket', async () => {
    expect(process.env[KEY_ENV]).toBeFalsy() // sanity: this dev env's real key, if any, is not read from here
    const buyer = await freshBuyer()

    const res = await request(app)
      .post('/api/support/tickets')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ category: 'ACCOUNT', subject: 'Password reset', message: question })

    expect(res.status).toBe(201)
    expect(res.body.ticket.status).toBe('AI_ASSISTED')

    const detail = await request(app)
      .get(`/api/support/tickets/${res.body.ticket.id}`)
      .set('Authorization', `Bearer ${buyer.token}`)
    const aiMessage = detail.body.messages.find((m: { sender: string }) => m.sender === 'AI')
    expect(aiMessage.body).toBe(approvedAnswer)
  })

  it('GEMINI_API_KEY configured -> the real Gemini path is actually selected (mocked network only)', async () => {
    const buyer = await freshBuyer()
    const restore = withFakeKeyAndMockFetch(mockGeminiResponse('CONFIDENT\n\nThis answer came from the mocked real-mode path, not the knowledge matcher.'))
    try {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ category: 'ACCOUNT', subject: 'Password reset 2', message: question })

      expect(res.status).toBe(201)
      const detail = await request(app)
        .get(`/api/support/tickets/${res.body.ticket.id}`)
        .set('Authorization', `Bearer ${buyer.token}`)
      const aiMessage = detail.body.messages.find((m: { sender: string }) => m.sender === 'AI')
      // Proves the REAL branch ran: the answer is the mocked-network text, not
      // the knowledge-base entry's answer the fallback matcher would have used.
      expect(aiMessage.body).toContain('mocked real-mode path')
      expect(res.body.ticket.status).toBe('AI_ASSISTED')
    } finally {
      restore()
    }
  })

  it('Gemini network/timeout failure -> gracefully falls back, ticket escalates', async () => {
    const buyer = await freshBuyer()
    const restore = withFakeKeyAndMockFetch((async () => {
      throw new Error('simulated network failure')
    }) as unknown as typeof fetch)
    try {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ category: 'ACCOUNT', subject: 'Password reset 3', message: question })

      expect(res.status).toBe(201)
      expect(res.body.ticket.status).toBe('ESCALATED')
    } finally {
      restore()
    }
  })

  it('Gemini 429 (rate-limited) -> gracefully falls back, ticket escalates', async () => {
    const buyer = await freshBuyer()
    const restore = withFakeKeyAndMockFetch(mockGeminiHttpError(429, 'Resource exhausted'))
    try {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ category: 'ACCOUNT', subject: 'Password reset 5', message: question })

      expect(res.status).toBe(201)
      expect(res.body.ticket.status).toBe('ESCALATED')
    } finally {
      restore()
    }
  })

  it('Gemini invalid-key error (400) -> gracefully falls back, ticket escalates', async () => {
    const buyer = await freshBuyer()
    const restore = withFakeKeyAndMockFetch(mockGeminiHttpError(400, 'API key not valid. Please pass a valid API key.'))
    try {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ category: 'ACCOUNT', subject: 'Password reset 6', message: question })

      expect(res.status).toBe(201)
      expect(res.body.ticket.status).toBe('ESCALATED')
    } finally {
      restore()
    }
  })

  it('a malformed Gemini response (no candidates) -> gracefully falls back', async () => {
    const buyer = await freshBuyer()
    const restore = withFakeKeyAndMockFetch((async () =>
      ({ ok: true, status: 200, json: async () => ({ nonsense: true }) }) as unknown as Response) as unknown as typeof fetch)
    try {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ category: 'ACCOUNT', subject: 'Password reset 7', message: question })

      expect(res.status).toBe(201)
      expect(res.body.ticket.status).toBe('ESCALATED')
    } finally {
      restore()
    }
  })

  it('the API key is never present anywhere in the HTTP response body', async () => {
    const buyer = await freshBuyer()
    const restore = withFakeKeyAndMockFetch(mockGeminiResponse('CONFIDENT\n\nAnother mocked answer.'))
    try {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ category: 'ACCOUNT', subject: 'Password reset 4', message: question })

      expect(JSON.stringify(res.body)).not.toContain(FAKE_KEY)
    } finally {
      restore()
    }
  })

  it('sensitive categories (PAYMENT) still bypass the AI entirely and escalate immediately, without ever calling Gemini', async () => {
    const buyer = await freshBuyer()
    const restore = withFakeKeyAndMockFetch((async () => {
      throw new Error('fetch should NOT have been called for a sensitive category')
    }) as unknown as typeof fetch)
    try {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ category: 'PAYMENT', subject: 'Refund question', message: 'Did my refund go through?' })

      expect(res.status).toBe(201)
      expect(res.body.ticket.status).toBe('ESCALATED')
    } finally {
      restore()
    }
  })

  it('a human-request phrase still escalates without ever needing a confident match', async () => {
    const buyer = await freshBuyer()
    const res = await request(app)
      .post('/api/support/tickets')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ category: 'ACCOUNT', subject: 'Need a person', message: 'I want to talk to a human please' })

    expect(res.status).toBe(201)
    expect(res.body.ticket.status).toBe('ESCALATED')
  })
})
