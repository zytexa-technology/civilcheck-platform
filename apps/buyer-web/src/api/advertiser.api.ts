// Advertiser account + campaign API. Advertisers are a SEPARATE identity from buyers: this module
// has its own axios instance and its own token key, so a buyer session is never sent here and an
// advertiser 401 never logs a buyer out (and vice-versa).
import { create as createHttpClient } from 'axios'
import { API_URL } from '../config/env'

const KEY = 'cc_advertiser_token'
export const getAdvertiserToken = (): string | null => {
  try { return localStorage.getItem(KEY) } catch { return null }
}
export const setAdvertiserToken = (t: string | null): void => {
  try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}

const http = createHttpClient({ baseURL: `${API_URL}/advertiser`, timeout: 20000 })
http.interceptors.request.use((c) => {
  const t = getAdvertiserToken()
  if (t) c.headers.Authorization = `Bearer ${t}`
  return c
})

export type CampaignStatus =
  | 'DRAFT' | 'PAYMENT_PENDING' | 'PENDING_APPROVAL' | 'ACTIVE' | 'PAUSED'
  | 'REJECTED' | 'EXHAUSTED' | 'EXPIRED' | 'COMPLETED'

export interface Campaign {
  id: string
  businessName: string
  title: string
  description: string
  creativeType: 'IMAGE' | 'VIDEO'
  creativeUrl: string
  ctaText: string
  destinationUrl: string
  platform: 'WEB' | 'MOBILE' | 'BOTH'
  status: CampaignStatus
  budget: number
  spent: number
  remaining: number
  cpm: number
  impressions: number
  clicks: number
  ctr: number
  effectiveCpc: number | null
  estimatedImpressions: number
  startDate: string | null
  endDate: string | null
  rejectionReason: string | null
  createdAt: string
  paymentStatus?: 'PAID' | 'FAILED' | 'UNPAID' | 'NONE'
  paidAmount?: number
  /** Refund of a rejected, never-started campaign (full amount) — set by the server only. */
  refund?: { status: 'NOT_REQUIRED' | 'PENDING' | 'PROCESSING' | 'REFUNDED' | 'FAILED'; amount: number; refundedAt: string | null } | null
}

export interface AdvertiserInfo { id: string; name: string; companyName: string; email: string }
export interface AdvertiserConfig { minBudget: number; cpm: number; referenceCpc: number }

export interface CampaignInput {
  businessName: string
  title: string
  description: string
  creativeType: 'IMAGE' | 'VIDEO'
  creativeUrl: string
  ctaText: string
  destinationUrl: string
  budget: number
  platform: 'WEB' | 'MOBILE' | 'BOTH'
  startDate?: string
  endDate?: string
}

export const getConfig = async () => (await http.get<AdvertiserConfig>('/config')).data

export async function register(input: { name: string; companyName: string; email: string; phone?: string; password: string }) {
  const { data } = await http.post<{ advertiser: AdvertiserInfo; token: string }>('/register', input)
  setAdvertiserToken(data.token)
  return data.advertiser
}
export async function login(email: string, password: string) {
  const { data } = await http.post<{ advertiser: AdvertiserInfo; token: string }>('/login', { email, password })
  setAdvertiserToken(data.token)
  return data.advertiser
}

export interface CampaignListResponse {
  campaigns: Campaign[]
  totals: { campaigns: number; active: number; spend: number; impressions: number; clicks: number }
}
export const listCampaigns = async () => (await http.get<CampaignListResponse>('/campaigns')).data
export const createCampaign = async (input: CampaignInput) => (await http.post<{ campaign: Campaign }>('/campaigns', input)).data.campaign

export interface PayResponse { order: { id: string; amount: number; currency: string }; razorpayKeyId: string | null }
export const startPayment = async (id: string) => (await http.post<PayResponse>(`/campaigns/${id}/pay`)).data
export const verifyPayment = async (id: string, r: { orderId: string; paymentId: string; signature: string }) =>
  (await http.post<{ campaign: Campaign }>(`/campaigns/${id}/verify-payment`, {
    razorpay_order_id: r.orderId, razorpay_payment_id: r.paymentId, razorpay_signature: r.signature,
  })).data.campaign

// ─── Creative upload: signed direct-to-Cloudinary (same existing storage as the rest of CivilCheck) ───
interface UploadSig {
  cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string
  allowedFormats: string; maxFileSize: number
}
export async function uploadCreative(file: File): Promise<{ url: string; type: 'IMAGE' | 'VIDEO' }> {
  const isVideo = file.type.startsWith('video/')
  const isImage = file.type.startsWith('image/')
  if (!isVideo && !isImage) throw new Error('Choose an image or a video file.')
  const { data } = await http.get<{ upload: UploadSig }>('/upload-signature', { params: { type: isVideo ? 'video' : 'image' } })
  const u = data.upload
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!u.allowedFormats.split(',').includes(ext)) throw new Error(`Only ${u.allowedFormats.replace(/,/g, ', ')} files are allowed.`)
  if (file.size > u.maxFileSize) throw new Error(`File must be smaller than ${Math.round(u.maxFileSize / (1024 * 1024))} MB.`)
  const type = isVideo ? 'VIDEO' : 'IMAGE'
  if (u.signature === 'mock_signature_dev_only') {
    // No Cloudinary account configured (dev): a clearly-fake placeholder so the flow can be exercised.
    return { url: `https://res.cloudinary.com/demo/${isVideo ? 'video' : 'image'}/upload/${u.folder}/MOCK-${Date.now()}.${ext}`, type }
  }
  const form = new FormData()
  form.append('file', file)
  form.append('api_key', u.apiKey)
  form.append('timestamp', String(u.timestamp))
  form.append('signature', u.signature)
  form.append('folder', u.folder)
  form.append('allowed_formats', u.allowedFormats)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${u.cloudName}/${isVideo ? 'video' : 'image'}/upload`, { method: 'POST', body: form })
  const json = (await res.json().catch(() => null)) as { secure_url?: string } | null
  if (!res.ok || !json?.secure_url) throw new Error('Upload failed. Please try again.')
  return { url: json.secure_url, type }
}
