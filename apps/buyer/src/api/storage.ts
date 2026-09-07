import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'cc_buyer_token'

/**
 * Session token persistence.
 *
 * SecureStore is unavailable on web, and every call throws there. The app
 * targets iOS/Android, but `expo start --web` is still reachable, so each call
 * degrades to a no-op rather than crashing the bundle on load.
 */

export async function saveToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token)
  } catch {
    // Unsupported platform — the session simply won't survive a reload.
  }
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  } catch {
    // Nothing stored / unsupported platform — logout is idempotent either way.
  }
}
