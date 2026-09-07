// ─────────────────────────────────────────────────────────────────────────────
// One place to turn a thrown value into something a buyer can read.
//
// Screens previously did `err.response?.data?.message || "..."` inline, which
// only compiles under an implicit `any` and silently produces "undefined" when
// the failure is a timeout or DNS error rather than an HTTP response.
// ─────────────────────────────────────────────────────────────────────────────
import { isAxiosError } from 'axios'
import type { ApiErrorBody } from '../types/api'

const NETWORK_MESSAGE =
  "Couldn't reach CivilCheck. Check your internet connection and try again."

const TIMEOUT_MESSAGE = 'The request took too long. Please try again.'

/**
 * Best available human-readable message.
 *
 * @param fallback shown when the server sent no message of its own.
 */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return TIMEOUT_MESSAGE
    if (!error.response) return NETWORK_MESSAGE

    const body = error.response.data as Partial<ApiErrorBody> | undefined
    if (body?.message) return body.message

    return fallback
  }

  if (error instanceof Error && error.message) return error.message

  return fallback
}

/** HTTP status, when the failure actually reached the server. */
export function errorStatus(error: unknown): number | null {
  return isAxiosError(error) ? (error.response?.status ?? null) : null
}

/** True when the request never got a response (offline, DNS, refused). */
export function isNetworkError(error: unknown): boolean {
  return isAxiosError(error) && !error.response
}
