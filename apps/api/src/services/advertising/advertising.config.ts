// Central advertising configuration — the ONE place these values live. Frontends do not
// hard-code any of them: the insertion interval reaches the Buyer Web/App via the ad-feed
// response, the minimum/CPM via the advertiser config endpoint.
const intFromEnv = (name: string, fallback: number, min = 1): number => {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n >= min ? n : fallback
}

export const adConfig = {
  // One ad after every N property items in the Buyer feed (never after every property).
  get insertionInterval(): number {
    return intFromEnv('AD_INSERTION_INTERVAL', 5, 2)
  },
  // CPM: ₹100 per 1,000 valid impressions => 10,000 paise per 1,000 => 10 paise per impression.
  get cpmPaise(): number {
    return intFromEnv('AD_CPM_PAISE', 10_000, 1000)
  },
  // Minimum campaign budget ₹100. There is deliberately no maximum.
  minBudgetPaise: 10_000,
  // Reference CPC (₹2) — analytics/reference ONLY. Clicks are never billed.
  referenceCpcPaise: 200,
  // How long an issued ad token (impression/click proof) stays valid.
  tokenTtlSeconds: 6 * 60 * 60,
  // Max ads returned per feed request.
  maxAdsPerRequest: 10,
} as const

export const rupeesToPaise = (rupees: number): bigint => BigInt(Math.round(rupees * 100))
export const paiseToRupees = (paise: bigint | number): number => Number(paise) / 100

// Estimated impressions for a budget: budget / CPM * 1000 (integer paise arithmetic).
export const estimateImpressions = (budgetPaise: bigint, cpmPaise: number): number =>
  Number((budgetPaise * 1000n) / BigInt(cpmPaise))
