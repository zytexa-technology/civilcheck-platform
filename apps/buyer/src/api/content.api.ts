import client from './client'
import type {
  BannersResponse,
  CategoriesResponse,
  CoverageResponse,
  DisclaimerResponse,
} from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Content Control — what the admin panel publishes for the buyer app. All four
// endpoints are public (no session needed) and expose only live, active rows.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/content/categories — published property categories. */
export async function getCategories(): Promise<CategoriesResponse> {
  const { data } = await client.get<CategoriesResponse>('/content/categories')
  return data
}

/** GET /api/content/coverage — the cities and tehsils CivilCheck serves. */
export async function getCoverage(): Promise<CoverageResponse> {
  const { data } = await client.get<CoverageResponse>('/content/coverage')
  return data
}

/**
 * GET /api/content/banners?audience=BUYERS
 *
 * Only banners inside their live window come back, so an empty list is the
 * normal case and must render as nothing at all rather than a placeholder.
 */
export async function getBanners(audience: 'ALL' | 'BUYERS' = 'BUYERS'): Promise<BannersResponse> {
  const { data } = await client.get<BannersResponse>('/content/banners', {
    params: { audience },
  })
  return data
}

/**
 * GET /api/content/disclaimers/:key
 *
 * Returns 404 when the admin has not published that key yet — callers should
 * fall back to their built-in copy rather than showing an error.
 */
export async function getDisclaimer(key: string): Promise<DisclaimerResponse> {
  const { data } = await client.get<DisclaimerResponse>(`/content/disclaimers/${key}`)
  return data
}
