import client from './client'
import type { ReporterPostFeedResponse } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Public Reporter content feed — property information/news a Reporter has
// sourced (a newspaper cutting, a public notice, etc.). Purely informational:
// no price, no moderation status, no "Verified" claim of any kind.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReporterFeedParams {
  city?: string
  page?: number
  limit?: number
}

/** GET /api/reporter-posts?city=&page=&limit= */
export async function getReporterFeed(
  params: ReporterFeedParams = {},
): Promise<ReporterPostFeedResponse> {
  const { data } = await client.get<ReporterPostFeedResponse>('/reporter-posts', { params })
  return data
}
