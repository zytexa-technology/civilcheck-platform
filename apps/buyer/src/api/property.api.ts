import client from './client'
import type {
  FreeCheckResponse,
  PropertyDetailResponse,
  PropertyFeedResponse,
  PropertySearchResponse,
  PropertyType,
  RiskBadge,
  SearchHistoryResponse,
  TrendingResponse,
} from '../types/api'

export interface PropertySearchParams {
  query?: string
  city?: string
  tehsil?: string
  propertyType?: PropertyType
  riskBadge?: RiskBadge
  minPrice?: number
  maxPrice?: number
  page?: number
  /** Server caps this at 50. */
  limit?: number
}

/**
 * GET /api/properties/search
 *
 * With a `query` the API runs Postgres full-text search and ranks by relevance;
 * without one it browses on the structured filters alone. Both paths paginate,
 * so always read `totalPages` back rather than assuming a single page.
 */
export async function searchProperties(
  params: PropertySearchParams = {},
): Promise<PropertySearchResponse> {
  const { data } = await client.get<PropertySearchResponse>('/properties/search', {
    params,
  })
  return data
}

/** GET /api/properties/trending — most-viewed approved listings. Not paginated. */
export async function getTrending(city?: string, limit?: number): Promise<TrendingResponse> {
  const { data } = await client.get<TrendingResponse>('/properties/trending', {
    params: { city, limit },
  })
  return data
}

/**
 * GET /api/properties/:id
 *
 * Returns the free preview or the full paid report depending on whether this
 * buyer owns a Purchase for it — narrow on `hasPurchased` before reading any
 * of the paid-only fields.
 */
export async function getPropertyById(id: string): Promise<PropertyDetailResponse> {
  const { data } = await client.get<PropertyDetailResponse>(`/properties/${id}`)
  return data
}

/**
 * GET /api/properties/check — the free "Case Hai Ya Nahi?" lookup.
 *
 * Public: works without a session. Exactly one identifier should be supplied;
 * the API checks address, then khasra, then survey, and ignores the rest.
 */
export async function freeCaseCheck(params: {
  address?: string
  khasra?: string
  survey?: string
}): Promise<FreeCheckResponse> {
  const { data } = await client.get<FreeCheckResponse>('/properties/check', { params })
  return data
}

/** GET /api/properties/searches — this buyer's last 10 distinct searches. */
export async function getSearchHistory(): Promise<SearchHistoryResponse> {
  const { data } = await client.get<SearchHistoryResponse>('/properties/searches')
  return data
}

/**
 * GET /api/properties/feed (Phase 2 backend, Phase 4C buyer UI)
 *
 * The unified, media-first discovery feed — Owner/Reporter self-listed
 * Properties and Expert-verified Listings merged into one array, each
 * already carrying `uploadedBy` and (Expert-only) `riskBadge`. Only
 * APPROVED rows from either source table are ever included — rejected,
 * suspended, pending, and deleted properties never reach this endpoint.
 */
export async function getPropertyFeed(params: {
  city?: string
  propertyType?: PropertyType
  limit?: number
} = {}): Promise<PropertyFeedResponse> {
  const { data } = await client.get<PropertyFeedResponse>('/properties/feed', { params })
  return data
}
