// ─────────────────────────────────────────────────────────────────────────────
// AES-256-GCM field encryption for sensitive-at-rest values (7-Day
// Verification Acceptance, Claim & Professional Settlement System — Admin
// professional payout accounts: bank account number, IFSC, UPI id).
//
// Deliberately lazy about the key, unlike lib/jwt.ts's JWT_SECRET: JWT_SECRET
// is required for the app to function at all, so failing at import time is
// correct there. PAYOUT_ENCRYPTION_KEY is only ever needed by the narrow
// "an Admin has a professional payout account" path — most deployments and
// most requests never touch it — so this throws only when encrypt/decrypt is
// actually called without a configured key, never at module load, and never
// breaks any existing, unrelated request path.
//
// Never logs a plaintext or ciphertext value — every log line in this file
// and every caller must reference the field name only, never its content.
// ─────────────────────────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // recommended nonce length for GCM
const KEY_LENGTH = 32 // AES-256

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey

  const raw = process.env.PAYOUT_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'PAYOUT_ENCRYPTION_KEY is not set in .env — cannot encrypt/decrypt payout account details. ' +
        'Generate one (e.g. `openssl rand -hex 32`) and add it to your .env file before saving any ' +
        "Admin payout bank/UPI details."
    )
  }

  // Accept either a 32-byte hex string (64 chars, the recommended format —
  // see .env.sample) or an arbitrary passphrase, scrypt-derived to exactly
  // 32 bytes either way. A fixed, non-secret salt is fine here: this is a
  // single application-wide key, not a per-user password hash — the salt's
  // only job is to make the derivation deterministic across process
  // restarts, not to defend against a dictionary attack on a user secret.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    cachedKey = Buffer.from(raw, 'hex')
  } else {
    cachedKey = scryptSync(raw, 'civilcheck-payout-encryption', KEY_LENGTH)
  }
  return cachedKey
}

// Stored shape: "<ivHex>:<authTagHex>:<ciphertextHex>" — a single text
// column, no separate columns for iv/tag, so a masking/read helper only
// ever needs to know "is this column set", not the storage format.
export function encryptPayoutField(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptPayoutField(stored: string): string {
  const key = getKey()
  const parts = stored.split(':')
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payout field — expected "iv:authTag:ciphertext"')
  }
  const [ivHex, authTagHex, cipherHex] = parts as [string, string, string]
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()])
  return decrypted.toString('utf8')
}

// ─── DISPLAY MASKING — never return a full bank/UPI value from any API ──────

/** "1234567890123" -> "XXXX XXXX 0123" */
export function maskBankAccount(accountNumber: string): string {
  const last4 = accountNumber.slice(-4)
  return `XXXX XXXX ${last4}`
}

/** "praveen.kumar@okhdfcbank" -> "pr****@okhdfcbank" */
export function maskUpiId(upiId: string): string {
  const at = upiId.indexOf('@')
  if (at <= 0) return '****'
  const handle = upiId.slice(0, at)
  const domain = upiId.slice(at)
  const visible = handle.slice(0, Math.min(2, handle.length))
  return `${visible}${'*'.repeat(Math.max(2, handle.length - visible.length))}${domain}`
}
