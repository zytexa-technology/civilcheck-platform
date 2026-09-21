// Public ad serving/tracking for the Buyer feed. Uses its own bare axios call (no buyer token,
// no 401 handler) — serving is anonymous and must never log a buyer out.
import { create as createHttpClient } from 'axios'
import { API_URL } from '../config/env'

const http = createHttpClient({ baseURL: API_URL, timeout: 10000 })

export interface FeedAd {
  id: string
  /** Server-signed proof of this display; required to count an impression / click. */
  token: string
  businessName: string
  title: string
  description: string
  creativeType: 'IMAGE' | 'VIDEO'
  creativeUrl: string
  ctaText: string
  /** Path (relative to the API base) of the click-tracking redirect. */
  clickPath: string
}

export interface FeedAdsResponse {
  /** Show one ad after every `interval` property items — configured on the server. */
  interval: number
  ads: FeedAd[]
}

export async function getFeedAds(count: number): Promise<FeedAdsResponse> {
  const { data } = await http.get<FeedAdsResponse>('/ads/feed', { params: { platform: 'WEB', count } })
  return data
}

export async function trackImpression(token: string): Promise<void> {
  await http.post('/ads/impression', { token })
}

export const adClickUrl = (ad: FeedAd) => `${API_URL}${ad.clickPath}`
