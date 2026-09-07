import client from './client'
import type { BannersResponse, CategoriesResponse, CoverageResponse, DisclaimerResponse } from '../types/api'

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

/** GET /api/content/banners?audience=BUYERS */
export async function getBanners(audience: 'ALL' | 'BUYERS' = 'BUYERS'): Promise<BannersResponse> {
  const { data } = await client.get<BannersResponse>('/content/banners', { params: { audience } })
  return data
}

/** GET /api/content/disclaimers/:key — 404s if unpublished; fall back to built-in copy. */
export async function getDisclaimer(key: string): Promise<DisclaimerResponse> {
  const { data } = await client.get<DisclaimerResponse>(`/content/disclaimers/${key}`)
  return data
}
