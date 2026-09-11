import * as Location from 'expo-location'

// ─────────────────────────────────────────────────────────────────────────────
// Buyer geolocation — Buyer Mobile Phase 4B. Client-side only, on demand.
// Nothing here is ever sent to the API, stored in AsyncStorage/SecureStore, or
// persisted anywhere: the resolved coordinates live only in the calling
// screen's own React state for as long as that screen is mounted (see
// SearchScreen.tsx / OwnerPropertiesScreen.tsx / LocationMapSection.tsx),
// purely to compute a straight-line distance and build a Google Maps
// Directions link. A single call requests one fresh-ish fix — this never
// calls `watchPositionAsync`, so the buyer's location is never continuously
// tracked, and no background location capability is requested or declared.
//
// Mirrors Buyer Web's identically-shaped getBuyerLocation()
// (apps/buyer-web/src/lib/geolocation.ts) — same Coordinates/GeolocationResult
// shape and same "never throws, always resolves" contract — ported onto
// expo-location's permission + one-shot-position API instead of the
// browser's navigator.geolocation.
// ─────────────────────────────────────────────────────────────────────────────

export interface Coordinates {
  latitude: number
  longitude: number
}

// A native permission API can distinguish "denied, can ask again" from
// "permanently blocked" (canAskAgain), which a browser's Geolocation API
// cannot — Web's own reason union has no such distinction. Kept as an extra
// reason here since it reflects genuine platform capability and is
// explicitly a required state for Mobile (a device-settings deep-link
// message), not an invented one.
export type GeolocationErrorReason = 'permission-denied' | 'permission-blocked' | 'unavailable' | 'timeout'

export interface GeolocationResult {
  coords: Coordinates | null
  error: GeolocationErrorReason | null
}

const POSITION_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('__location_timeout__')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/**
 * Resolves the buyer's current position once. Only ever called from an
 * explicit "Use my location" tap — never on mount, never watched/repeated.
 * Never throws/rejects — every failure mode (permission denied/blocked,
 * location services off, a slow fix) resolves with
 * `{ coords: null, error: <reason> }` so a caller can always safely `await`
 * this without a try/catch.
 */
export async function getBuyerLocation(): Promise<GeolocationResult> {
  try {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync()
    if (status !== Location.PermissionStatus.GRANTED) {
      return { coords: null, error: canAskAgain ? 'permission-denied' : 'permission-blocked' }
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync()
    if (!servicesEnabled) {
      return { coords: null, error: 'unavailable' }
    }

    const position = await withTimeout(
      // Balanced (~100m) is plenty for an approximate "X km away" — the same
      // "don't force a slow, battery-hungry high-accuracy GPS lock for this"
      // reasoning as Web's own enableHighAccuracy: false.
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      POSITION_TIMEOUT_MS,
    )
    return {
      coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
      error: null,
    }
  } catch (err) {
    if (err instanceof Error && err.message === '__location_timeout__') {
      return { coords: null, error: 'timeout' }
    }
    return { coords: null, error: 'unavailable' }
  }
}

export function geolocationErrorMessage(reason: GeolocationErrorReason | null): string {
  switch (reason) {
    case 'permission-denied':
      return 'Location permission denied.'
    case 'permission-blocked':
      return 'Location is blocked for CivilCheck. Enable it in your device settings to see distance.'
    case 'timeout':
      return 'Location request timed out.'
    case 'unavailable':
      return 'Could not determine your location. Check that location services are turned on.'
    default:
      return ''
  }
}
