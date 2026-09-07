import client from './client'
import type {
  PropertyType,
  OwnerPropertyDetailResponse,
  OwnerPropertySearchResponse,
  OwnerPropertyTrendingResponse,
} from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Owner self-published properties — a free, fully public listing surface,
// separate from the paid Listing reports. There is no price and nothing to
// unlock, and the owner's uploaded documents are never exposed here. Admin
// approval gates buyer visibility only — it is never presented to buyers as
// a CivilCheck "Verified" claim. Do not present these alongside paid reports
// as if they were the same thing.
// ─────────────────────────────────────────────────────────────────────────────

export interface OwnerPropertySearchParams {
  query?: string
  city?: string
  propertyType?: PropertyType
  page?: number
  /** Server caps this at 50. */
  limit?: number
}

/** GET /api/owner-properties/search — ILIKE on title, plus city/type filters. */
export async function searchOwnerProperties(
  params: OwnerPropertySearchParams = {},
): Promise<OwnerPropertySearchResponse> {
  const { data } = await client.get<OwnerPropertySearchResponse>(
    '/owner-properties/search',
    { params },
  )
  return data
}

/** GET /api/owner-properties/trending — most-viewed, not paginated. */
export async function getTrendingOwnerProperties(
  city?: string,
  limit?: number,
): Promise<OwnerPropertyTrendingResponse> {
  const { data } = await client.get<OwnerPropertyTrendingResponse>(
    '/owner-properties/trending',
    { params: { city, limit } },
  )
  return data
}

/** GET /api/owner-properties/:id */
export async function getOwnerPropertyById(
  id: string,
): Promise<OwnerPropertyDetailResponse> {
  const { data } = await client.get<OwnerPropertyDetailResponse>(
    `/owner-properties/${id}`,
  )
  return data
}
