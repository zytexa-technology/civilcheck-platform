import { create as createHttpClient, isAxiosError, type AxiosInstance } from 'axios'
import { API_URL } from '../config/env'
import { clearToken, getToken } from './storage'

// ─────────────────────────────────────────────────────────────────────────────
// The single axios instance every api/*.ts module uses. Same shape as
// apps/buyer's client, adapted for a browser: the token is read from
// localStorage on the first request of the session and kept in memory after
// that, and a 401 notifies a registered handler (AuthContext) so the app
// navigates rather than sitting on a screen that keeps re-failing.
// ─────────────────────────────────────────────────────────────────────────────

let memoryToken: string | null = null
let hydrated = false

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

export function setAuthToken(token: string | null): void {
  memoryToken = token
  hydrated = true
}

function currentToken(): string | null {
  if (hydrated) return memoryToken
  memoryToken = getToken()
  hydrated = true
  return memoryToken
}

const client: AxiosInstance = createHttpClient({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = currentToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      memoryToken = null
      hydrated = true
      clearToken()
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)

export default client
