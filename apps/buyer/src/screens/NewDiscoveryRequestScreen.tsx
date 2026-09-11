import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { createVerificationRequest, getVerificationConfig } from '../api/verification.api'
import { errorMessage, errorStatus } from '../lib/errors'
import { formatRupees } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { InlineNotice } from '../components/States'
import { TextField } from '../components/TextField'
import type { PropertyType } from '../types/api'

// Property Discovery flow — the Verification Marketplace's OWN creation flow
// (see VerifyPropertyCTA.tsx), not a new pricing model: the buyer states an
// initial offer/budget (never a payment) that must clear the platform's
// minimum; an Expert then accepts it as-is or counters via a quote. This is
// deliberately NOT SpecialRequestScreen's fixed-tier (₹999/2,499/4,999)
// pattern — that legacy flow is kept fully intact and untouched by this
// screen. Mirrors apps/buyer-web's NewDiscoveryRequest.tsx.

const PROPERTY_TYPES: { label: string; value: PropertyType }[] = [
  { label: 'Residential', value: 'RESIDENTIAL' },
  { label: 'Commercial', value: 'COMMERCIAL' },
  { label: 'Agricultural', value: 'AGRICULTURAL' },
  { label: 'Plot', value: 'PLOT' },
]

interface FieldErrors {
  address?: string
  city?: string
  propertyType?: string
  amount?: string
}

export function NewDiscoveryRequestScreen() {
  const router = useRouter()
  // Handoff shape from SearchScreen/OwnerPropertiesScreen's "Can't find this
  // property?" CTA and from ReporterPostCard's "Verify This Property" button
  // — Expo Router passes navigation params via the URL/params object, not
  // React Router's location.state.
  const params = useLocalSearchParams<{
    address?: string
    city?: string
    tehsil?: string
    khasraNumber?: string
    propertyType?: string
  }>()

  const [address, setAddress] = useState(params.address ?? '')
  const [city, setCity] = useState(params.city ?? '')
  const [tehsil, setTehsil] = useState(params.tehsil ?? '')
  // A handoff value is only ever a starting point — a Discovery request
  // always requires a property type, per the backend contract, so this never
  // skips the field's own required validation below.
  const [propertyType, setPropertyType] = useState<PropertyType | ''>(
    (params.propertyType as PropertyType) || '',
  )
  const [khasra, setKhasra] = useState(params.khasraNumber ?? '')

  const [minFee, setMinFee] = useState<number | null>(null)
  const [amount, setAmount] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void getVerificationConfig()
      .then((res) => {
        if (!live) return
        setMinFee(res.minVerificationFee)
        setAmount((prev) => prev || String(res.minVerificationFee))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const validate = (): boolean => {
    const errors: FieldErrors = {}
    if (!address.trim() || address.trim().length < 5) {
      errors.address = 'Enter the full address or locality (at least 5 characters).'
    }
    if (!city.trim() || city.trim().length < 2) errors.city = 'City is required.'
    if (!propertyType) errors.propertyType = 'Select a property type.'
    const numericAmount = Number(amount)
    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      errors.amount = 'Enter a valid budget amount.'
    } else if (minFee != null && numericAmount < minFee) {
      errors.amount = `Your budget must be at least ${formatRupees(minFee)}.`
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (busy) return
    setFormError('')
    if (!validate()) return

    setBusy(true)
    try {
      const response = await createVerificationRequest({
        source: 'DISCOVERY',
        initialOfferAmount: Number(amount),
        desiredAddress: address.trim(),
        desiredCity: city.trim(),
        desiredTehsil: tehsil.trim() || undefined,
        desiredPropertyType: propertyType,
        desiredKhasraOrSurvey: khasra.trim() || undefined,
      })
      router.replace(`/verifications/${response.request.id}`)
    } catch (err) {
      const status = errorStatus(err)
      if (status === 409) setFormError('A similar property search request already exists.')
      else setFormError(errorMessage(err, "Couldn't submit your request. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen scroll>
      <ScreenHeader title="Property search" subtitle="Can't find a property on CivilCheck?" backFallback="/profile" />

      <View style={styles.form}>
        <Text style={styles.intro}>
          We couldn&apos;t find a matching property. Tell us what you&apos;re looking for and an
          eligible Expert or Admin can search for it.
        </Text>

        {formError ? <InlineNotice tone="warn" message={formError} /> : null}

        <TextField
          label="Address / Locality"
          value={address}
          onChangeText={setAddress}
          placeholder="Full address or locality"
          error={fieldErrors.address}
          editable={!busy}
        />
        <TextField
          label="City"
          value={city}
          onChangeText={setCity}
          placeholder="e.g. Jaipur"
          error={fieldErrors.city}
          editable={!busy}
        />
        <TextField
          label="Tehsil (optional)"
          value={tehsil}
          onChangeText={setTehsil}
          placeholder="e.g. Sanganer"
          editable={!busy}
        />

        <Text style={styles.label}>Property type</Text>
        <View style={styles.chipRow}>
          {PROPERTY_TYPES.map((entry) => {
            const active = propertyType === entry.value
            return (
              <TouchableOpacity
                key={entry.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setPropertyType(entry.value)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{entry.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {fieldErrors.propertyType ? <Text style={styles.fieldError}>{fieldErrors.propertyType}</Text> : null}

        <TextField
          label="Khasra / Survey number (optional)"
          value={khasra}
          onChangeText={setKhasra}
          placeholder="e.g. 245/1"
          editable={!busy}
        />

        <TextField
          label="Your search & verification budget (₹)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          error={fieldErrors.amount}
          hint={minFee != null ? `Minimum ${formatRupees(minFee)}.` : undefined}
          editable={!busy}
        />

        <InlineNotice message="This is your initial offer, not a payment. Experts will quote against it — you'll only pay once you accept a quote, and only 50% up front." />

        <Button
          label="Submit request"
          onPress={() => void handleSubmit()}
          loading={busy}
          size="lg"
          block
          style={styles.submit}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: SCREEN_PADDING },
  intro: { fontSize: 12.5, color: colors.muted, lineHeight: 19, marginBottom: spacing.lg },
  label: { fontSize: 11.5, fontWeight: '500', color: colors.muted, marginBottom: 7, marginTop: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: spacing.xs },
  chip: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { fontSize: 11.5, fontWeight: '500', color: colors.muted },
  chipTextActive: { color: colors.onGold },
  fieldError: { fontSize: 11, color: colors.red, marginTop: -2, marginBottom: spacing.md },
  submit: { marginTop: spacing.md, marginBottom: spacing.sm },
})
