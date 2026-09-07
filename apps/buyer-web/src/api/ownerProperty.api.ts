import client from './client'
import type {
  PropertyType,
  OwnerPropertyDetailResponse,
  OwnerPropertySearchResponse,
  OwnerPropertyTrendingResponse,
} from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Owner self-published properties — a free, fully public listing surface,
// separate from the paid Listing reports. No price, nothing to unlock. Admin
// approval gates whether a property is visible here at all — it is never
// presented to buyers as a CivilCheck "Verified" claim.
// ─────────────────────────────────────────────────────────────────────────────

export interface OwnerPropertySearchParams {
  query?: string
  city?: string
  propertyType?: PropertyType
  page?: number
  limit?: number
}

export async function searchOwnerProperties(
  params: OwnerPropertySearchParams = {},
): Promise<OwnerPropertySearchResponse> {
  const { data } = await client.get<OwnerPropertySearchResponse>(
    '/owner-properties/search',
    { params },
  )
  return data
}

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

export async function getOwnerPropertyById(id: string): Promise<OwnerPropertyDetailResponse> {
  const { data } = await client.get<OwnerPropertyDetailResponse>(`/owner-properties/${id}`)
  return data
}
