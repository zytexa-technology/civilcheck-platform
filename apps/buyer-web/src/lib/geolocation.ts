// ─────────────────────────────────────────────────────────────────────────────
// Buyer geolocation — client-side only, on demand. Nothing here is ever sent
// to the API, stored in localStorage, or persisted anywhere: the resolved
// coordinates live only in the calling component's own React state for as
// long as that page is open (see PropertyDetail.tsx / OwnerPropertyDetail.tsx
// / BrowseProperty.tsx), purely to compute a straight-line distance and build
// a Google Maps Directions link. A single call requests one fresh-ish fix
// (`maximumAge` lets the browser return a recent cached position instead of
// forcing a new GPS lock every click) — this never calls `watchPosition`, so
// the buyer's location is never continuously tracked.
// ─────────────────────────────────────────────────────────────────────────────

export interface Coordinates {
  latitude: number
  longitude: number
}

export type GeolocationErrorReason = 'unsupported' | 'permission-denied' | 'unavailable' | 'timeout'

export interface GeolocationResult {
  coords: Coordinates | null
  error: GeolocationErrorReason | null
}

/**
 * Resolves the buyer's current position once. Never throws/rejects — every
 * failure mode (unsupported browser, denied permission, unavailable fix,
 * timeout) resolves with `{ coords: null, error: <reason> }` so a caller can
 * always safely `await` this without a try/catch.
 */
export function getBuyerLocation(): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ coords: null, error: 'unsupported' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          error: null,
        })
      },
      (err) => {
        let reason: GeolocationErrorReason = 'unavailable'
        if (err.code === err.PERMISSION_DENIED) reason = 'permission-denied'
        else if (err.code === err.TIMEOUT) reason = 'timeout'
        resolve({ coords: null, error: reason })
      },
      {
        enableHighAccuracy: false, // approximate distance is fine — faster, less battery
        timeout: 10_000,
        maximumAge: 5 * 60 * 1000, // a position up to 5 min old is fine for "X km away"
      },
    )
  })
}

export function geolocationErrorMessage(reason: GeolocationErrorReason | null): string {
  switch (reason) {
    case 'unsupported':
      return "This browser doesn't support location."
    case 'permission-denied':
      return 'Location permission denied.'
    case 'timeout':
      return 'Location request timed out.'
    case 'unavailable':
      return 'Could not determine your location.'
    default:
      return ''
  }
}
