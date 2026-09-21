import { create as createHttpClient } from 'axios'
import { API_URL } from '../config/env'

// Public ad serving/tracking. A bare axios instance on purpose: serving is anonymous and a failure
// here must never touch the buyer session (no token, no 401 handler).
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
  clickPath: string
}

export interface FeedAdsResponse {
  /** One ad after every `interval` property items — set on the server. */
  interval: number
  ads: FeedAd[]
}

export async function getFeedAds(count: number): Promise<FeedAdsResponse> {
  const { data } = await http.get<FeedAdsResponse>('/ads/feed', { params: { platform: 'MOBILE', count } })
  return data
}

export async function trackImpression(token: string): Promise<void> {
  await http.post('/ads/impression', { token })
}

/** Click-tracking redirect (counts the click once, then 302s to the advertiser's URL). */
export const adClickUrl = (ad: FeedAd) => `${API_URL}${ad.clickPath}`
