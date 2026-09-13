// One-time, manual-run script — seeds the Disclaimer row the 7-Day
// Verification Acceptance, Claim & Professional Settlement System's "View
// Terms & Conditions" link reads (GET /api/content/disclaimers/verification-terms).
// Idempotent (upsert by key) — safe to re-run. This is content an admin can
// edit afterward through the existing Content Control UI (Disclaimer model
// already has one — see admin.routes.ts's /content/disclaimers); this script
// only ever needs to run once per environment to create the initial row.
import 'dotenv/config'
import prisma from '../src/lib/prisma.js'

const KEY = 'verification-terms'

const BODY = `CivilCheck provides property information and verification-related services within the scope communicated for the selected service. Buyers should independently review the verification report and conduct appropriate due diligence before purchasing a property.

Any verification performed through CivilCheck is limited to the scope expressly communicated for that service and should not be interpreted as a guarantee against every present or future issue relating to the property.

After a verification report is completed and delivered, the buyer has 7 days to review the report and submit a claim if they identify an issue or discrepancy with the verification service. Claims submitted after this 7-day period may not be accepted. Accepting the report, or allowing the 7-day period to lapse without a claim, means the buyer has reviewed the report and currently has no claim regarding the verification service — it does not mean the property is guaranteed to be free from every present or future legal or physical issue.

Buyers are strongly advised to independently verify property title, ownership, documents, encumbrances, approvals, possession, boundaries, taxes, dues and other applicable matters, and to obtain professional legal advice where appropriate.

Any limitation of liability is subject to applicable law.`

async function main() {
  const existing = await prisma.disclaimer.findUnique({ where: { key: KEY } })
  if (existing) {
    console.log(`Disclaimer "${KEY}" already exists (version ${existing.version}) — leaving it as-is.`)
    return
  }
  const created = await prisma.disclaimer.create({
    data: { key: KEY, title: 'Terms & Conditions — Property Verification', body: BODY, version: 1, active: true },
  })
  console.log(`Created Disclaimer "${KEY}" (id ${created.id}).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
