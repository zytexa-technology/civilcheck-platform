// ─────────────────────────────────────────────────────────────────────────────
// Generic in-memory TTL cache — a plain Map, no new dependency.
//
// Single-instance only: it does NOT survive a process restart and is NOT
// shared across horizontally-scaled API instances. Each instance would keep
// its own cache and could disagree with another for the same key within the
// TTL window. Fine for a single Railway instance (the pilot's setup); a
// multi-instance deploy would need a shared cache (e.g. Redis) instead.
// ─────────────────────────────────────────────────────────────────────────────
interface CacheEntry<V> {
  value: V
  expiresAt: number
}

export class TtlCache<V> {
  private store = new Map<string, CacheEntry<V>>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return undefined
    }

    return entry.value
  }

  set(key: string, value: V): void {
    // Map preserves insertion order — evict the oldest entry rather than let
    // a stream of distinct queries (or an adversarial one) grow this
    // unboundedly.
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) this.store.delete(oldestKey)
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }
}
