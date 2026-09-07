// ─────────────────────────────────────────────────────────────────────────────
// Support-ticket creation rate limiting (audit 2026-09-02) — every new ticket
// triggers a real AI-provider call (support.service.ts's advanceTicket; the
// provider is Google Gemini as of 2026-09-02, previously Anthropic — this
// guard is provider-agnostic and needs no change either way), so this guard
// exists purely to bound API cost/abuse, not to fight spam in general. See
// middleware/rateLimiter.ts's supportTicketLimiter: 5 tickets per
// authenticated buyer/seller per rolling hour, keyed on req.user?.id ??
// req.seller?.id (never IP alone for an authenticated caller).
// ─────────────────────────────────────────────────────────────────────────────
import request from 'supertest'
import { app, deleteBuyer, registerAndLoginBuyer } from './helpers.js'

describe('Support-ticket creation rate limiting', () => {
  const createdUserIds: string[] = []

  async function freshBuyer() {
    const buyer = await registerAndLoginBuyer()
    createdUserIds.push(buyer.userId)
    return buyer
  }

  const createTicket = (token: string, n: number) =>
    request(app)
      .post('/api/support/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'ACCOUNT', subject: `Rate limit check ${n}`, message: 'Just checking something about my account, thanks.' })

  afterAll(async () => {
    for (const id of createdUserIds) await deleteBuyer(id)
  })

  it('the first support ticket is allowed', async () => {
    const buyer = await freshBuyer()
    const res = await createTicket(buyer.token, 1)
    expect(res.status).toBe(201)
  })

  it('a buyer can create up to 5 tickets within the window, and the 6th is blocked with 429', async () => {
    const buyer = await freshBuyer()
    const statuses: number[] = []
    for (let i = 1; i <= 5; i++) {
      const res = await createTicket(buyer.token, i)
      statuses.push(res.status)
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201])

    const sixth = await createTicket(buyer.token, 6)
    expect(sixth.status).toBe(429)
    // Project's existing JSON error envelope — {success, message} — and the
    // exact clear, generic message requested. No provider/key detail.
    expect(sixth.body).toEqual({ success: false, message: 'Too many support requests. Please try again later.' })
  })

  it('the 429 response never exposes AI-provider/API-key details', async () => {
    const buyer = await freshBuyer()
    for (let i = 1; i <= 5; i++) await createTicket(buyer.token, i)
    const sixth = await createTicket(buyer.token, 6)

    expect(sixth.status).toBe(429)
    const serialized = JSON.stringify(sixth.body) + JSON.stringify(sixth.headers)
    expect(serialized.toLowerCase()).not.toMatch(/anthropic|gemini|googleapis|api[_-]?key|sk-ant-|x-api-key|x-goog-api-key/)
  })

  it('a different buyer is not affected by another buyer already hitting the limit', async () => {
    const buyerA = await freshBuyer()
    for (let i = 1; i <= 5; i++) await createTicket(buyerA.token, i)
    const blocked = await createTicket(buyerA.token, 6)
    expect(blocked.status).toBe(429)

    const buyerB = await freshBuyer()
    const res = await createTicket(buyerB.token, 1)
    expect(res.status).toBe(201)
  })

  it('the limit does not affect reading an existing ticket, even after creation is exhausted', async () => {
    const buyer = await freshBuyer()
    let lastTicketId = ''
    for (let i = 1; i <= 5; i++) {
      const res = await createTicket(buyer.token, i)
      lastTicketId = res.body.ticket.id
    }
    const blocked = await createTicket(buyer.token, 6)
    expect(blocked.status).toBe(429)

    // Reading — list and detail — must still work with creation exhausted.
    const list = await request(app).get('/api/support/tickets').set('Authorization', `Bearer ${buyer.token}`)
    expect(list.status).toBe(200)

    const detail = await request(app).get(`/api/support/tickets/${lastTicketId}`).set('Authorization', `Bearer ${buyer.token}`)
    expect(detail.status).toBe(200)
  })

  it('the limit does not affect replying to an existing ticket, even after creation is exhausted', async () => {
    const buyer = await freshBuyer()
    let lastTicketId = ''
    for (let i = 1; i <= 5; i++) {
      const res = await createTicket(buyer.token, i)
      lastTicketId = res.body.ticket.id
    }
    const blocked = await createTicket(buyer.token, 6)
    expect(blocked.status).toBe(429)

    const reply = await request(app)
      .post(`/api/support/tickets/${lastTicketId}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ body: 'Following up on this — still creation-exhausted, this should still work.' })
    expect(reply.status).toBe(201)
  })
})
