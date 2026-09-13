import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { searchProperties } from '../api/property.api'
import { searchOwnerProperties } from '../api/ownerProperty.api'
import { errorMessage } from '../lib/errors'
import { getBuyerLocation, geolocationErrorMessage, type Coordinates, type GeolocationErrorReason } from '../lib/geolocation'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { OwnerPropertyCard, PropertyCard } from '../components/PropertyCard'
import { Screen } from '../components/Screen'
import { TextField } from '../components/TextField'
import { EmptyState, LoadingState } from '../components/States'
import type { FreePreviewProperty, OwnerProperty, PropertyType } from '../types/api'

const TYPE_OPTIONS: { label: string; value: PropertyType | '' }[] = [
  { label: 'Any type', value: '' },
  { label: 'Residential', value: 'RESIDENTIAL' },
  { label: 'Plot', value: 'PLOT' },
  { label: 'Commercial', value: 'COMMERCIAL' },
  { label: 'Agricultural', value: 'AGRICULTURAL' },
]

type SearchState = 'idle' | 'loading' | 'done'

/**
 * "Browse Property" — Buyer Feature Parity with Web's BrowseProperty.tsx.
 * Distinct from both the Expert-only Search tab and the Owner-only
 * "Owner listings" screen: a buyer who already knows a specific
 * property/location searches CivilCheck's records across BOTH Expert
 * reports (Listing) and Owner listings (Property) from one form, and sees
 * both result sets together. Reuses the exact same two existing search API
 * functions those two screens already call — no new endpoint, no duplicate
 * screen. "No result" falls through to the existing Discovery request flow
 * (source=DISCOVERY), same as Web.
 */
export function BrowsePropertyScreen() {
  const router = useRouter()

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [tehsil, setTehsil] = useState('')
  const [khasra, setKhasra] = useState('')
  const [propertyType, setPropertyType] = useState<PropertyType | ''>('')

  const [state, setState] = useState<SearchState>('idle')
  const [error, setError] = useState('')
  const [listings, setListings] = useState<FreePreviewProperty[]>([])
  const [ownerProperties, setOwnerProperties] = useState<OwnerProperty[]>([])

  // Requested once via the button below and shared across every result card
  // — same "one shared fetch, never per-card, never automatic" ownership as
  // Web's BrowseProperty.tsx and Mobile's own SearchScreen.tsx.
  const [buyerCoords, setBuyerCoords] = useState<Coordinates | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<GeolocationErrorReason | null>(null)

  const handleLocate = async () => {
    setLocating(true)
    setGeoError(null)
    const result = await getBuyerLocation()
    setLocating(false)
    if (result.coords) setBuyerCoords(result.coords)
    else setGeoError(result.error)
  }

  const canSearch = Boolean(address.trim() || city.trim() || tehsil.trim() || khasra.trim() || propertyType)

  const handleSearch = async () => {
    if (!canSearch) return
    const query = [address.trim(), khasra.trim()].filter(Boolean).join(' ') || undefined
    setState('loading')
    setError('')
    try {
      const [listingRes, ownerRes] = await Promise.all([
        searchProperties({
          query,
          city: city.trim() || undefined,
          tehsil: tehsil.trim() || undefined,
          propertyType: propertyType || undefined,
          limit: 10,
        }),
        searchOwnerProperties({
          query,
          city: city.trim() || undefined,
          tehsil: tehsil.trim() || undefined,
          propertyType: propertyType || undefined,
          limit: 10,
        }),
      ])
      setListings(listingRes.results)
      setOwnerProperties(ownerRes.results)
      setState('done')
    } catch (err) {
      setError(errorMessage(err, 'Search failed. Please try again.'))
      setState('idle')
    }
  }

  const found = listings.length + ownerProperties.length > 0
  const searched = state === 'done'

  const goRequestSearch = () => {
    router.push({
      pathname: '/discovery-request/new',
      params: {
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(tehsil.trim() ? { tehsil: tehsil.trim() } : {}),
        ...(khasra.trim() ? { khasraNumber: khasra.trim() } : {}),
        ...(propertyType ? { propertyType } : {}),
      },
    })
  }

  return (
    <Screen scroll>
      <View style={styles.form}>
        <Text style={styles.title}>Browse Property</Text>
        <Text style={styles.intro}>
          Know a specific property? Search CivilCheck&apos;s records by address, city, tehsil, or
          khasra/survey number.
        </Text>

        <TextField label="Address / Locality" value={address} onChangeText={setAddress} placeholder="e.g. Vaishali Nagar" />
        <View style={styles.row}>
          <TextField label="City" value={city} onChangeText={setCity} placeholder="e.g. Jaipur" style={styles.rowField} />
          <TextField label="Tehsil" value={tehsil} onChangeText={setTehsil} placeholder="e.g. Sanganer" style={styles.rowField} />
        </View>
        <TextField
          label="Khasra / Survey number (optional)"
          value={khasra}
          onChangeText={setKhasra}
          placeholder="e.g. 245/1"
        />

        <Text style={styles.fieldLabel}>Property type (optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
          {TYPE_OPTIONS.map((option) => {
            const active = propertyType === option.value
            return (
              <Button
                key={option.label}
                label={option.label}
                variant={active ? 'primary' : 'secondary'}
                size="md"
                onPress={() => setPropertyType(option.value)}
                style={styles.typeChip}
              />
            )
          })}
        </ScrollView>

        <Button
          label="Search"
          onPress={() => void handleSearch()}
          loading={state === 'loading'}
          disabled={!canSearch}
          size="lg"
          block
          style={styles.submit}
        />

        {state === 'loading' ? <LoadingState label="Searching CivilCheck's records…" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {searched && found ? (
          <>
            <View style={styles.locateRow}>
              {buyerCoords ? (
                <Text style={styles.locateHint}>📍 Showing distance from your current location</Text>
              ) : (
                <Button
                  label="📍 Use my location to show distance"
                  variant="secondary"
                  size="md"
                  loading={locating}
                  onPress={() => void handleLocate()}
                />
              )}
              {geoError ? <Text style={styles.locateError}>{geolocationErrorMessage(geoError)}</Text> : null}
            </View>

            {listings.map((p) => (
              <PropertyCard key={`listing-${p.id}`} property={p} onPress={() => router.push(`/report/${p.id}`)} buyerCoords={buyerCoords} />
            ))}
            {ownerProperties.map((p) => (
              <OwnerPropertyCard
                key={`owner-${p.id}`}
                property={p}
                onPress={() => router.push(`/owner-properties/${p.id}`)}
                buyerCoords={buyerCoords}
              />
            ))}
          </>
        ) : null}

        {searched && !found ? (
          <EmptyState
            icon="🔍"
            title="Can't find the property you're looking for?"
            description="Submit the details and an eligible Expert or Admin will research it for you."
            actionLabel="Request a Property Search"
            onAction={goRequestSearch}
          />
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: SCREEN_PADDING, paddingTop: spacing.md, paddingBottom: spacing.xl },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
  intro: { fontSize: 12.5, color: colors.muted, lineHeight: 18, marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowField: { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: spacing.xs, marginTop: spacing.xs },
  typeRow: { marginBottom: spacing.md },
  typeChip: { marginRight: spacing.xs },
  submit: { marginTop: spacing.sm, marginBottom: spacing.lg },
  error: { fontSize: 12.5, color: colors.red, marginBottom: spacing.md },
  locateRow: { marginBottom: spacing.md, gap: spacing.xs },
  locateHint: { fontSize: 11.5, color: colors.muted },
  locateError: { fontSize: 11, color: colors.muted },
})
