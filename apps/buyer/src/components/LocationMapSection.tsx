import { useState } from 'react'
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { buildDirectionsUrl, formatDistance, haversineDistanceKm } from '../lib/format'
import { getBuyerLocation, geolocationErrorMessage, type Coordinates, type GeolocationErrorReason } from '../lib/geolocation'
import { colors, radius, spacing } from '../theme'
import { Button } from './Button'
import { SectionCard } from './Card'

interface LocationMapSectionProps {
  latitude?: number | null
  longitude?: number | null
  /** Pre-built by the backend (buildMapUrl) — reused as-is rather than
   * re-derived client-side; see format.ts's header comment on this section. */
  mapUrl?: string | null
  address?: string | null
  /** Already-computed "Tehsil, City" (or similar) fallback label the screen uses elsewhere. */
  locationLabel: string
}

/**
 * Shared "Location" section for both ReportScreen (Expert Listing) and
 * OwnerPropertyDetailScreen (Owner Property) — Buyer Mobile Phase 4B, mirrors
 * Buyer Web's shared LocationMapSection.tsx. Self-contained: owns its own
 * buyerCoords/locating/geoError state, requested only on an explicit "Use my
 * location" tap, never on mount. Nothing here is sent to CivilCheck's API or
 * persisted anywhere — the coordinates live only in this component's state
 * for as long as the screen is open.
 */
export function LocationMapSection({ latitude, longitude, mapUrl, address, locationLabel }: LocationMapSectionProps) {
  const [buyerCoords, setBuyerCoords] = useState<Coordinates | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<GeolocationErrorReason | null>(null)

  const hasCoords = latitude != null && longitude != null
  const directionsUrl = hasCoords ? buildDirectionsUrl({ latitude, longitude }, buyerCoords) : null
  const distanceKm =
    hasCoords && buyerCoords
      ? haversineDistanceKm(buyerCoords.latitude, buyerCoords.longitude, latitude ?? null, longitude ?? null)
      : null
  const distanceLabel = formatDistance(distanceKm)

  const handleLocate = async () => {
    setLocating(true)
    setGeoError(null)
    const result = await getBuyerLocation()
    setLocating(false)
    if (result.coords) setBuyerCoords(result.coords)
    else setGeoError(result.error)
  }

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert("Couldn't open Maps", 'Please try again.')
    }
  }

  if (!mapUrl) {
    return (
      <SectionCard icon="🗺️" iconBackground={colors.blueDim} title="Location">
        <Text style={styles.noLocation}>No location data available for this property.</Text>
      </SectionCard>
    )
  }

  return (
    <SectionCard icon="🗺️" iconBackground={colors.blueDim} title="Location">
      <TouchableOpacity
        style={styles.preview}
        onPress={() => void openUrl(mapUrl)}
        accessibilityRole="link"
        accessibilityLabel={`Open ${locationLabel} in Google Maps`}
      >
        <Text style={styles.previewIcon}>📍</Text>
        <Text style={styles.previewAddress} numberOfLines={2}>
          {address || locationLabel}
        </Text>
      </TouchableOpacity>

      <View style={styles.actionsRow}>
        <Button label="📍 Open in Google Maps" variant="secondary" onPress={() => void openUrl(mapUrl)} style={styles.actionBtn} />
        {directionsUrl ? (
          <Button label="📍 Get Directions" variant="secondary" onPress={() => void openUrl(directionsUrl)} style={styles.actionBtn} />
        ) : null}
      </View>

      {/* Distance only ever applies when the property itself has real
          coordinates — an address-text-only fallback has nothing to measure
          a straight-line distance against. */}
      {hasCoords ? (
        <View style={styles.distanceWrap}>
          {distanceLabel ? (
            <Text style={styles.distanceText}>
              📍 {distanceLabel} <Text style={styles.distanceHint}>(straight-line distance)</Text>
            </Text>
          ) : (
            <Button
              label="📍 Use my location to see distance"
              variant="ghost"
              loading={locating}
              onPress={() => void handleLocate()}
              style={styles.locateBtn}
            />
          )}
          {geoError ? <Text style={styles.geoError}>{geolocationErrorMessage(geoError)}</Text> : null}
        </View>
      ) : null}
    </SectionCard>
  )
}

const styles = StyleSheet.create({
  noLocation: { fontSize: 12.5, color: colors.muted },
  preview: {
    height: 100,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  previewIcon: { fontSize: 26, marginBottom: 4 },
  previewAddress: { fontSize: 11.5, color: colors.muted, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { flexGrow: 1 },
  distanceWrap: { marginTop: spacing.sm },
  distanceText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  distanceHint: { fontWeight: '400', color: colors.muted, fontSize: 11 },
  locateBtn: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  geoError: { fontSize: 11, color: colors.muted, marginTop: spacing.xs },
})
