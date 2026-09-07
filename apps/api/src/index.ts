import 'dotenv/config'
import app from './app.js'
import logger from './lib/logger.js'
import { startInterval } from './lib/scheduler.js'
import { runSpecialRequestSlaSweep } from './services/specialRequestSla.service.js'
import { weeklySettlementTick } from './services/settlement.service.js'
import { sweepExpiredFeaturedListings } from './services/subscription.service.js'

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)

  // Special-request SLA sweep (Day 6) — 12h accept / 72h completion timers.
  // Single-instance only (see scheduler.ts).
  startInterval('special-request-sla', 15 * 60 * 1000, runSpecialRequestSlaSweep)

  // Weekly seller settlement (Day 6) — ticks every 30 min, only actually
  // runs inside the Monday 10:00 window (see settlement.service.ts).
  startInterval('weekly-settlement', 30 * 60 * 1000, weeklySettlementTick)

  // Featured-listing expiry sweep (Day 4 carry-over) — clears `featured` on
  // listings whose paid-through date has lapsed.
  startInterval('featured-expiry', 30 * 60 * 1000, sweepExpiredFeaturedListings)
})
