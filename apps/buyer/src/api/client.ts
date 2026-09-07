import { create as createHttpClient, isAxiosError, type AxiosInstance } from 'axios'
import { API_URL } from '../config/env'
import { clearToken, getToken } from './storage'

// ─────────────────────────────────────────────────────────────────────────────
// The single axios instance every api/*.ts module uses.
//
// Two changes from the original client.js:
//
//   • The token is held in memory and only read back from SecureStore on a cold
//     start. The old interceptor awaited a SecureStore read before *every*
//     request, which put a disk hit on the critical path of each screen load.
//
//   • A 401 now notifies a registered handler in addition to clearing storage.
//     Previously the token was dropped but nothing navigated, so the app sat on
//     an authenticated screen firing requests that would all keep failing.
// ─────────────────────────────────────────────────────────────────────────────

let memoryToken: string | null = null
let hydrated = false

/** Called by AuthContext on a 401 so it can tear the session down and redirect. */
type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

/** Keep the in-memory copy in step with storage after login/logout. */
export function setAuthToken(token: string | null): void {
  memoryToken = token
  hydrated = true
}

/** Read-through to SecureStore exactly once per app launch. */
async function currentToken(): Promise<string | null> {
  if (hydrated) return memoryToken
  memoryToken = await getToken()
  hydrated = true
  return memoryToken
}

const client: AxiosInstance = createHttpClient({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use(async (config) => {
  const token = await currentToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      // The token is invalid or expired. Drop it from both memory and storage
      // before handing control back, so nothing retries with a dead credential.
      memoryToken = null
      hydrated = true
      await clearToken()
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)

export default client
