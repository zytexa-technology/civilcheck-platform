import 'dotenv/config'
import app from './app.js'
import logger from './lib/logger.js'
import { startInterval } from './lib/scheduler.js'
import { runSpecialRequestSlaSweep } from './services/specialRequestSla.service.js'
import { weeklySettlementTick } from './services/settlement.service.js'
import { runVerificationExpirySweep } from './services/verificationExpiry.service.js'
import { describeDigilockerConfig } from './services/digilocker/digilocker.config.js'

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)

  // Config status only (never values). Missing credentials do not stop the app;
  // the DigiLocker endpoints answer "unavailable" until they are added.
  const dl = describeDigilockerConfig()
  logger.info(`DigiLocker integration: ${dl.status}${dl.missing.length ? ` (missing: ${dl.missing.join(', ')})` : ''}`)

  // Special-request SLA sweep (Day 6) — 12h accept / 72h completion timers.
  // Single-instance only (see scheduler.ts).
  startInterval('special-request-sla', 15 * 60 * 1000, runSpecialRequestSlaSweep)

  // Weekly seller settlement (Day 6) — ticks every 30 min, only actually
  // runs inside the Monday 10:00 window (see settlement.service.ts).
  startInterval('weekly-settlement', 30 * 60 * 1000, weeklySettlementTick)

  // 7-Day Verification Acceptance, Claim & Professional Settlement System —
  // hourly sweep that makes payout ELIGIBLE once a buyer's claim window
  // expires with no acceptance and no claim (verificationExpiry.service.ts).
  startInterval('verification-claim-expiry', 60 * 60 * 1000, async () => {
    await runVerificationExpirySweep()
  })
})
