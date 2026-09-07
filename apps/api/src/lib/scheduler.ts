// ─────────────────────────────────────────────────────────────────────────────
// In-process interval scheduler — no new dependency (no cron/agenda/bull).
// Runs a task once shortly after boot, then every intervalMs, and never lets
// a slow run overlap the next tick.
//
// Single-instance only: if this API ever runs as more than one process
// (horizontal scale on Railway, etc.), each instance runs its own timers and
// every sweep registered here would fire once per instance. Fine at pilot
// scale — the same caveat the free-check cache (Day 5) already carries.
// Scaling past one instance needs a real scheduler (e.g. a Postgres advisory
// lock per sweep, or an external cron hitting an internal endpoint) before
// these can safely run more than once.
// ─────────────────────────────────────────────────────────────────────────────
import logger from './logger.js'

// Delay before the first run — lets the server finish booting (DB pool,
// etc.) before a sweep starts hitting it.
const FIRST_RUN_DELAY_MS = 5_000

export function startInterval(name: string, intervalMs: number, task: () => Promise<void>): void {
  let running = false

  const tick = async () => {
    if (running) {
      logger.warn(`[scheduler:${name}] previous run still in progress — skipping this tick`)
      return
    }
    running = true
    try {
      await task()
    } catch (err) {
      logger.error(`[scheduler:${name}] run failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      running = false
    }
  }

  setTimeout(tick, FIRST_RUN_DELAY_MS)
  setInterval(tick, intervalMs)
}
