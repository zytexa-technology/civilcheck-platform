import { useState } from 'react'
import { Button } from './Button'
import { SectionCard } from './Card'
import { buildDirectionsUrl, buildGoogleMapsUrl, formatDistance, haversineDistanceKm } from '../lib/format'
import { getBuyerLocation, geolocationErrorMessage, type Coordinates, type GeolocationErrorReason } from '../lib/geolocation'

// ─────────────────────────────────────────────────────────────────────────────
// Shared "Location Map" section for both PropertyDetail.tsx (Expert Listing)
// and OwnerPropertyDetail.tsx (Owner Property) — same address/lat-lng shape
// on both, so this is the one place the search-pin fallback, the buyer
// geolocation prompt, the straight-line distance, and the Directions link
// are implemented, instead of duplicating that logic across both pages.
// ─────────────────────────────────────────────────────────────────────────────

interface LocationMapSectionProps {
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  city?: string | null
  tehsil?: string | null
  /** Already-computed "Tehsil, City" (or similar) fallback label the page uses elsewhere. */
  locationLabel: string
}

export function LocationMapSection({ latitude, longitude, address, city, tehsil, locationLabel }: LocationMapSectionProps) {
  const [buyerCoords, setBuyerCoords] = useState<Coordinates | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<GeolocationErrorReason | null>(null)

  const mapsUrl = buildGoogleMapsUrl({ latitude, longitude, address, city, tehsil })
  const hasCoords = latitude != null && longitude != null
  const directionsUrl = hasCoords ? buildDirectionsUrl({ latitude, longitude }, buyerCoords) : null
  const distanceKm = hasCoords && buyerCoords
    ? haversineDistanceKm(buyerCoords.latitude, buyerCoords.longitude, latitude ?? null, longitude ?? null)
    : null
  const distanceLabel = formatDistance(distanceKm)

  // Only fires on an explicit click — never on mount, never repeated
  // automatically (see lib/geolocation.ts: one-shot getCurrentPosition, no
  // watchPosition). Nothing here is sent to the API or persisted anywhere.
  const handleLocate = async () => {
    setLocating(true)
    setGeoError(null)
    const result = await getBuyerLocation()
    setLocating(false)
    if (result.coords) setBuyerCoords(result.coords)
    else setGeoError(result.error)
  }

  return (
    <SectionCard icon="🗺️" title="Location Map">
      {mapsUrl ? (
        <>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${locationLabel} in Google Maps`}
            className="stack"
            style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 140,
                borderRadius: 10,
                background: 'var(--cc-surface-2)',
                border: '1px solid var(--cc-border-2)',
                fontSize: 34,
              }}
              aria-hidden="true"
            >
              📍
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              {address || locationLabel}
            </p>
          </a>

          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--secondary"
              style={{ display: 'inline-flex', textDecoration: 'none' }}
            >
              📍 Open in Google Maps
            </a>
            {directionsUrl ? (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--secondary"
                style={{ display: 'inline-flex', textDecoration: 'none' }}
              >
                📍 Get Directions
              </a>
            ) : null}
          </div>

          {/* Distance only ever applies when the property itself has real
              coordinates — an address-text-only fallback has nothing to
              measure a straight-line distance against. */}
          {hasCoords ? (
            <div style={{ marginTop: 10 }}>
              {distanceLabel ? (
                <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0 }}>
                  📍 {distanceLabel}
                  <span className="muted" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                    (straight-line distance)
                  </span>
                </p>
              ) : (
                <Button variant="ghost" size="sm" loading={locating} onClick={() => void handleLocate()}>
                  📍 Use my location to see distance
                </Button>
              )}
              {geoError ? (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  {geolocationErrorMessage(geoError)}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted" style={{ fontSize: 12.5 }}>No location data available for this property.</p>
      )}
    </SectionCard>
  )
}
