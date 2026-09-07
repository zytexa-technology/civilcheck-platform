// ─────────────────────────────────────────────────────────────────────────────
// Session token persistence — localStorage, the web equivalent of apps/buyer's
// expo-secure-store wrapper (which no-ops on web and isn't usable here).
// Same key name pattern as apps/admin ('admin_token') / apps/seller
// ('seller_token') but namespaced 'buyer_' so a dev running two of these apps
// on the same origin/port never collides.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'cc_buyer_token'
const USER_KEY = 'cc_buyer_user'

export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage unavailable (private mode, quota) — session won't survive a reload.
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    // Nothing stored / unavailable — logout is idempotent either way.
  }
}
