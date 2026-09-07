// ─────────────────────────────────────────────────────────────────────────────
// RazorpayX Payouts adapter — a DIFFERENT Razorpay product from the Checkout
// Orders API in razorpay.ts. Needs a funded RazorpayX current account
// (RAZORPAYX_ACCOUNT_NUMBER) and its own key pair; same mock/real/prod-guard
// shape as razorpay.ts otherwise.
//
// A payout moves real money out and is not something a buyer can "abandon"
// the way an unpaid order just expires — so, like refundPayment, this throws
// on failure rather than degrading silently, and refuses to mock in
// production. Mock mode is the practical default for local dev: there is no
// RazorpayX sandbox equivalent to Razorpay's test-mode Checkout, so
// exercising this for real requires an actual funded RazorpayX account.
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from 'node:crypto'
import logger from './logger.js'

const RAZORPAYX_API_BASE = 'https://api.razorpay.com/v1'
const PROVIDER_TIMEOUT_MS = 15_000

function mockId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('hex')}`
}

function readPayoutKeys(): {
  keyId: string | undefined
  keySecret: string | undefined
  accountNumber: string | undefined
} {
  return {
    // RazorpayX can use a separate key pair from Checkout, but many setups
    // share one Razorpay account — fall back to the Checkout keys if no
    // RazorpayX-specific pair is configured.
    keyId: process.env.RAZORPAYX_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAYX_KEY_SECRET ?? process.env.RAZORPAY_KEY_SECRET,
    accountNumber: process.env.RAZORPAYX_ACCOUNT_NUMBER,
  }
}

export function isRazorpayPayoutsConfigured(): boolean {
  const { keyId, keySecret, accountNumber } = readPayoutKeys()
  return Boolean(keyId && keySecret && accountNumber)
}

export class RazorpayPayoutError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'RazorpayPayoutError'
    this.status = status
  }
}

export interface PayoutBankAccount {
  name: string
  accountNumber: string
  ifsc: string
}

export interface CreatePayoutInput {
  amount: number // paise
  bankAccount: PayoutBankAccount
  referenceId: string // our own id, for idempotency/audit on Razorpay's side
  narration: string
}

export interface RazorpayPayout {
  id: string
  entity: 'payout'
  amount: number
  currency: string
  status: string // 'queued' | 'processing' | 'processed' | 'reversed' | 'rejected'
  reference_id: string | null
  created_at: number
}

export async function createPayout(input: CreatePayoutInput): Promise<RazorpayPayout> {
  const amount = Math.round(input.amount)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RazorpayPayoutError('Payout amount must be a positive integer in paise', 400)
  }
  const { keyId, keySecret, accountNumber } = readPayoutKeys()

  // ── Real mode ──────────────────────────────────────────────────────────────
  if (keyId && keySecret && accountNumber) {
    try {
      const response = await fetch(`${RAZORPAYX_API_BASE}/payouts`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_number: accountNumber,
          amount,
          currency: 'INR',
          mode: 'IMPS',
          purpose: 'payout',
          queue_if_low_balance: true,
          reference_id: input.referenceId,
          narration: input.narration,
          // Inline fund_account + contact — creates them on the fly rather
          // than requiring a pre-registered contact_id/fund_account_id.
          fund_account: {
            account_type: 'bank_account',
            bank_account: {
              name: input.bankAccount.name,
              ifsc: input.bankAccount.ifsc,
              account_number: input.bankAccount.accountNumber,
            },
            contact: {
              name: input.bankAccount.name,
              type: 'vendor',
            },
          },
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      })

      const payload = (await response.json().catch(() => null)) as
        | (RazorpayPayout & { error?: { description?: string } })
        | null

      if (!response.ok || !payload?.id) {
        const error = payload?.error?.description || `HTTP ${response.status}`
        logger.error(`[razorpayx] payout rejected: ${error}`)
        throw new RazorpayPayoutError(`RazorpayX rejected the payout: ${error}`, 502)
      }

      logger.info(`[razorpayx] payout created ${payload.id} (${amount} paise, ref ${input.referenceId})`)
      return payload
    } catch (err) {
      if (err instanceof RazorpayPayoutError) throw err
      const error = err instanceof Error ? err.message : String(err)
      logger.error(`[razorpayx] payout call failed: ${error}`)
      throw new RazorpayPayoutError(`RazorpayX payout call failed: ${error}`, 502)
    }
  }

  // ── No keys ──────────────────────────────────────────────────────────────
  // A production deploy without credentials must NOT mock-succeed a payout —
  // sellers would be told they got paid when no money ever moved.
  if (process.env.NODE_ENV === 'production') {
    logger.error('[razorpayx] createPayout called in production without RazorpayX credentials')
    throw new RazorpayPayoutError('Missing RazorpayX credentials in production', 500)
  }

  // ── Mock mode ────────────────────────────────────────────────────────────
  const payout: RazorpayPayout = {
    id: mockId('pout_mock'),
    entity: 'payout',
    amount,
    currency: 'INR',
    status: 'processed',
    reference_id: input.referenceId,
    created_at: Math.floor(Date.now() / 1000),
  }
  logger.info(`[razorpayx:mock] payout created ${payout.id} (${amount} paise, ref ${input.referenceId})`)
  return payout
}
