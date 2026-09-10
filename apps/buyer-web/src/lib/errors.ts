// ─────────────────────────────────────────────────────────────────────────────
// One place to turn a thrown value into something a buyer can read. Ported
// verbatim from apps/buyer's src/lib/errors.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { isAxiosError } from 'axios'
import type { ApiErrorBody } from '../types/api'

const NETWORK_MESSAGE = "Couldn't reach CivilCheck. Check your internet connection and try again."
const TIMEOUT_MESSAGE = 'The request took too long. Please try again.'

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

export function errorStatus(error: unknown): number | null {
  return isAxiosError(error) ? (error.response?.status ?? null) : null
}

// Signup Email Verification — loginBuyer's EMAIL_NOT_VERIFIED response is the
// first place this codebase needs a structured error `code`, not just a
// message/status.
export function errorCode(error: unknown): string | null {
  if (!isAxiosError(error)) return null
  const body = error.response?.data as Partial<ApiErrorBody> & { code?: string } | undefined
  return body?.code ?? null
}

export function isNetworkError(error: unknown): boolean {
  return isAxiosError(error) && !error.response
}
