// ─────────────────────────────────────────────────────────────────────────────
// Google Maps integration foundation (Phase 2 — Property System).
//
// Two tiers, same "no fake data" discipline as every other adapter in this
// codebase (razorpay.ts, cloudinary.ts):
//
//   No GOOGLE_MAPS_API_KEY  → buildMapUrl() still returns a real, working
//                             Google Maps deep link (https://www.google.com/
//                             maps?q=lat,lng). This needs no API key and no
//                             billing account — it is the same URL a user
//                             gets from a Google Maps "Share" button. Opening
//                             it (in-browser, or via the OS's map app on
//                             mobile) is genuine functionality, not a stub.
//
//   GOOGLE_MAPS_API_KEY set → reserved for a future embedded/interactive map
//                             (Maps JavaScript API / react-native-maps tiles),
//                             which needs a real key and is a frontend build
//                             this Phase 2 pass does not include. The env var
//                             is wired through now so that later work is a
//                             pure addition, not a new integration.
// ─────────────────────────────────────────────────────────────────────────────

export function isGoogleMapsEmbedConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY)
}

// Returns null when either coordinate is missing — callers should omit the
// field entirely rather than send a broken link.
export function buildMapUrl(latitude: number | null | undefined, longitude: number | null | undefined): string | null {
  if (latitude == null || longitude == null) return null
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}
