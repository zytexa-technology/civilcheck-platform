import client from './client'
import type {
  FeedResponse,
  FeedSourceFilter,
  FreeCheckResponse,
  PropertyDetailResponse,
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

/** GET /api/properties/search */
export async function searchProperties(
  params: PropertySearchParams = {},
): Promise<PropertySearchResponse> {
  const { data } = await client.get<PropertySearchResponse>('/properties/search', { params })
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
 * GET /api/properties/:id — returns the free preview or the full paid report
 * depending on whether this buyer owns a Purchase. Narrow on `hasPurchased`.
 */
export async function getPropertyById(id: string): Promise<PropertyDetailResponse> {
  const { data } = await client.get<PropertyDetailResponse>(`/properties/${id}`)
  return data
}

/** GET /api/properties/check — the free "Case Hai Ya Nahi?" lookup. Public. */
export async function freeCaseCheck(params: {
  address?: string
  khasra?: string
  survey?: string
}): Promise<FreeCheckResponse> {
  const { data } = await client.get<FreeCheckResponse>('/properties/check', { params })
  return data
}

/**
 * GET /api/properties/feed — the Home social feed (Buyer Experience redesign).
 * Merges Expert Listings, Owner Properties, and Reporter posts. `sources`
 * defaults to Expert+Owner server-side if omitted; pass all three explicitly
 * to include Reporter posts. Public — richer (isLiked/isSaved) when the
 * buyer is logged in, same shape otherwise.
 */
export async function getFeed(params: {
  sources?: FeedSourceFilter[]
  city?: string
  propertyType?: PropertyType
  limit?: number
} = {}): Promise<FeedResponse> {
  const { sources, ...rest } = params
  const { data } = await client.get<FeedResponse>('/properties/feed', {
    params: { ...rest, sources: sources?.join(',') },
  })
  return data
}

/** GET /api/properties/mine?kind=saved|liked — Profile's Saved/Liked tab. */
export async function getMyEngagedProperties(kind: 'saved' | 'liked'): Promise<FeedResponse> {
  const { data } = await client.get<FeedResponse>('/properties/mine', { params: { kind } })
  return data
}

/** GET /api/properties/searches — this buyer's last 10 distinct searches. */
export async function getSearchHistory(): Promise<SearchHistoryResponse> {
  const { data } = await client.get<SearchHistoryResponse>('/properties/searches')
  return data
}
