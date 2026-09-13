// ─────────────────────────────────────────────────────────────────────────────
// Mandatory Terms & Conditions / Privacy Policy acceptance.
//
// The "current Terms version" is NOT a new, parallel versioning system — it
// is the existing Content Control Disclaimer's own `version` field (see
// content.service.ts / schema.prisma's Disclaimer model, whose header
// comment already documents "version bumps on every body change so a
// purchased report can pin the wording that was live at purchase time").
// The canonical row is Disclaimer.key = TERMS_DISCLAIMER_KEY; its `version`
// is what every TermsAcceptance row pins. Privacy Policy is served as a
// second Disclaimer row (PRIVACY_DISCLAIMER_KEY) for reading, but does not
// carry its own separate acceptance-version dimension — the single
// mandatory checkbox ("I agree to the Terms & Conditions and Privacy
// Policy") is gated on the Terms document's version only, matching the
// business requirement's own single-version framing.
//
// Never trust a client-supplied version/timestamp/userId for any of this —
// every function below derives all three from the server (DB row, actor
// resolved from the authenticated session, DB clock via Prisma's default).
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'

export const TERMS_DISCLAIMER_KEY = 'terms-and-conditions'
export const PRIVACY_DISCLAIMER_KEY = 'privacy-policy'

export type TermsActor = { userId: string } | { sellerId: string }

export class TermsError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'TermsError'
    this.status = status
  }
}

// The Terms Disclaimer row must exist (seeded once per environment, same
// one-time-script convention as seed-verification-terms.ts) — if it's
// missing, this fails loudly rather than treating "no document" as "nothing
// to accept," which would silently disable the whole consent requirement.
export async function getCurrentTermsVersion(): Promise<number> {
  const disclaimer = await prisma.disclaimer.findUnique({ where: { key: TERMS_DISCLAIMER_KEY } })
  if (!disclaimer || !disclaimer.active) {
    throw new TermsError('Terms & Conditions content is not configured on this server', 500)
  }
  return disclaimer.version
}

export async function hasAcceptedCurrentTerms(actor: TermsActor): Promise<boolean> {
  const currentVersion = await getCurrentTermsVersion()
  const existing = await prisma.termsAcceptance.findFirst({
    where: { ...actor, version: currentVersion },
    select: { id: true },
  })
  return existing !== null
}

export interface RecordTermsAcceptanceContext {
  ipAddress?: string | null
  userAgent?: string | null
}

// Idempotent by construction: TermsAcceptance's @@unique([userId, version]) /
// [sellerId, version]) means a retried accept call for a version already on
// file hits the unique constraint and is treated as a no-op success, never a
// duplicate row — same "let the DB constraint be the real guard" discipline
// this codebase already uses for e.g. ProfessionalEarning.paymentOrderId.
export async function recordTermsAcceptance(
  actor: TermsActor,
  context: RecordTermsAcceptanceContext = {}
): Promise<{ version: number }> {
  const version = await getCurrentTermsVersion()
  try {
    await prisma.termsAcceptance.create({
      data: {
        ...actor,
        version,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    })
  } catch (err) {
    // P2002 = unique constraint violation — this exact (actor, version) pair
    // was already recorded (e.g. a retried request). Idempotent no-op.
    if (!(err instanceof Error) || !('code' in err) || (err as { code?: string }).code !== 'P2002') {
      throw err
    }
    logger.info(`[terms] acceptance already on file for this actor/version — idempotent no-op`)
  }
  return { version }
}
