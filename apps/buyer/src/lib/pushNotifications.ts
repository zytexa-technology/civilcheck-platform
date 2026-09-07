// ─────────────────────────────────────────────────────────────────────────────
// Push notification registration (QA audit 2026-08-03, finding #8).
//
// The backend (alert.controller.ts) stores a raw FCM device token per user and
// sends via the Firebase Admin SDK directly — not Expo's own push service — so
// this uses getDevicePushTokenAsync() (the native token) rather than Expo's
// getExpoPushTokenAsync().
//
// Android: the native token IS an FCM token, so this works end to end as soon
// as a Firebase project + google-services.json are wired up.
// iOS: the native token is an APNs token. Firebase Admin can deliver to it,
// but only once an APNs auth key has been uploaded to the same Firebase
// project in the Firebase Console — that is an account action, not something
// any client code change can do. Until then, registerForPushAsync() on iOS
// will still resolve a token and register it, but sendPush() on the backend
// will fail silently for that token (Firebase-side, not app-side).
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { registerDeviceToken } from '../api/alert.api'

const ANDROID_CHANNEL_ID = 'default'

// GET /api/auth/me doesn't return pushEnabled, so the last value set from
// this device is cached locally — same reasoning as before, just relocated
// here since this module is now the single place that cares about it.
const PUSH_PREF_KEY = 'cc_buyer_push_enabled'

export async function readCachedPushPreference(): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(PUSH_PREF_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

export async function cachePushPreference(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(PUSH_PREF_KEY, String(enabled))
  } catch {
    // Cache-only; the server already has the authoritative value.
  }
}

// Foreground behavior — without this, a notification that arrives while the
// app is open is silently swallowed instead of shown.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Case updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#f0a500',
  })
}

/**
 * Requests permission (if not already granted) and, on success, returns the
 * device's native push token. Returns null on a simulator/emulator (push
 * tokens are unreliable or unavailable there) or if permission is denied —
 * both are normal outcomes, not errors, so callers should not surface either
 * as a failure.
 */
export async function getDevicePushToken(): Promise<string | null> {
  if (!Device.isDevice) return null

  await ensureAndroidChannel()

  const existing = await Notifications.getPermissionsAsync()
  let status = existing.status

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync()
    status = requested.status
  }

  if (status !== 'granted') return null

  const token = await Notifications.getDevicePushTokenAsync()
  return token.data
}

/**
 * Gets a device push token and registers it with the backend. Best-effort —
 * a denied permission or a registration-call failure should never block
 * login or crash the app; push is a nice-to-have, SMS/email already cover
 * every alert regardless of this succeeding.
 */
export async function registerForPushAsync(): Promise<void> {
  try {
    const token = await getDevicePushToken()
    if (!token) return
    await registerDeviceToken(token)
  } catch {
    // Silent — see comment above. Nothing actionable for the user here.
  }
}

/**
 * Fires `onTap` with the notification's data payload whenever the user taps
 * a push notification (app backgrounded, or launched cold from a tap).
 * Returns an unsubscribe function.
 */
export function addNotificationTapListener(
  onTap: (data: Record<string, unknown>) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    onTap(response.notification.request.content.data ?? {})
  })
  return () => subscription.remove()
}
