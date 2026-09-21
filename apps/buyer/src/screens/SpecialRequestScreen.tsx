import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { createVerificationRequest, getVerificationConfig } from '../api/verification.api'
import { errorMessage } from '../lib/errors'
import { formatRupees } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { TextField } from '../components/TextField'
import { InlineNotice } from '../components/States'
import type { PropertyType } from '../types/api'

const PROPERTY_TYPES: { label: string; value: PropertyType }[] = [
  { label: 'Residential', value: 'RESIDENTIAL' },
  { label: 'Commercial', value: 'COMMERCIAL' },
  { label: 'Agricultural', value: 'AGRICULTURAL' },
  { label: 'Plot', value: 'PLOT' },
]

// "Request for Legal Reports" (formerly Custom Research): no fixed plans — the buyer enters
// their own offer. Minimum ₹2,499 (the server also sends it via /verification-requests/config
// and enforces it), no maximum. The request goes into the verification marketplace, where
// Experts accept or counter the offer and the existing 50% + 50% payments run on the agreed price.
const DEFAULT_MIN_OFFER = 2499
const MIN_OFFER_MESSAGE = 'Minimum legal report request amount is ₹2,499.'

const MIN_QUESTION_LENGTH = 10

interface FieldErrors {
  address?: string
  city?: string
  tehsil?: string
  questions?: string
  amount?: string
}

export function SpecialRequestScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ address?: string; reason?: string }>()

  const [address, setAddress] = useState(params.address ?? '')
  const [city, setCity] = useState('')
  const [tehsil, setTehsil] = useState('')
  const [surveyNumber, setSurveyNumber] = useState('')
  const [propertyType, setPropertyType] = useState<PropertyType>('RESIDENTIAL')
  const [questions, setQuestions] = useState('')
  const [amount, setAmount] = useState('')
  const [minOffer, setMinOffer] = useState(DEFAULT_MIN_OFFER)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    let live = true
    void getVerificationConfig()
      .then((res) => {
        if (live && res.legalReportMinAmount) setMinOffer(res.legalReportMinAmount)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}

    // Mirrors specialRequestCreateSchema so the buyer gets inline errors rather
    // than a 400 after the request has already been attempted.
    if (address.trim().length < 5) errors.address = 'Enter the full address (min 5 characters).'
    if (city.trim().length < 2) errors.city = 'Enter the city.'
    if (tehsil.trim().length < 2) errors.tehsil = 'Enter the tehsil.'
    if (questions.trim().length < MIN_QUESTION_LENGTH) {
      errors.questions = `Describe what you want checked (min ${MIN_QUESTION_LENGTH} characters).`
    }
    const offer = Number(amount)
    if (!amount || !Number.isFinite(offer) || offer <= 0) errors.amount = 'Enter your offer amount.'
    else if (offer < minOffer) errors.amount = MIN_OFFER_MESSAGE

    return errors
  }

  const handleSubmit = async () => {
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    setError('')

    try {
      // There is no separate survey-number field on SpecialRequest, so it is
      // folded into the free-text questions the expert actually reads.
      const questionText = surveyNumber.trim()
        ? `Survey/Khasra: ${surveyNumber.trim()}. ${questions.trim()}`
        : questions.trim()

      const response = await createVerificationRequest({
        source: 'DISCOVERY',
        initialOfferAmount: Number(amount),
        desiredAddress: address.trim(),
        desiredCity: city.trim(),
        desiredTehsil: tehsil.trim(),
        desiredPropertyType: propertyType,
        desiredKhasraOrSurvey: surveyNumber.trim() || undefined,
        questions: questions.trim(),
      })

      router.replace(`/verifications/${response.request.id}`)
    } catch (err) {
      setError(errorMessage(err, "Couldn't submit your request. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen scroll>
      <ScreenHeader
        title="Request for Legal Reports"
        subtitle="Property not on CivilCheck yet?"
        backFallback="/requests"
      />

      <View style={styles.form}>
        {params.reason === 'not-found' ? (
          <InlineNotice message="We have no record of that property yet. A verified expert in that tehsil can research it for you." />
        ) : null}

        <Text style={styles.intro}>
          Tell us what you want checked and what you are willing to pay. Verified experts can
          accept your offer or counter with their own price — you only pay after you accept a
          price, and only 50% up front.
        </Text>

        {error ? <InlineNotice tone="warn" message={error} /> : null}

        <TextField
          label="Property address"
          value={address}
          onChangeText={setAddress}
          placeholder="Full address with pincode"
          error={fieldErrors.address}
          editable={!submitting}
        />

        <TextField
          label="City"
          value={city}
          onChangeText={setCity}
          placeholder="e.g. Jaipur"
          error={fieldErrors.city}
          editable={!submitting}
        />

        <TextField
          label="Tehsil"
          value={tehsil}
          onChangeText={setTehsil}
          placeholder="e.g. Sanganer"
          error={fieldErrors.tehsil}
          editable={!submitting}
          hint="We match experts by tehsil, so this decides who researches it."
        />

        <TextField
          label="Survey / Khasra number (optional)"
          value={surveyNumber}
          onChangeText={setSurveyNumber}
          placeholder="e.g. 245/1"
          editable={!submitting}
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
                disabled={submitting}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {entry.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <TextField
          label="What do you want checked?"
          value={questions}
          onChangeText={setQuestions}
          placeholder="e.g. Is there any pending litigation? Is the title clear? Any bank loan on this plot?"
          multiline
          error={fieldErrors.questions}
          editable={!submitting}
        />

        <TextField
          label="Your Offer Amount (₹)"
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
          placeholder="Enter your offer"
          keyboardType="number-pad"
          error={fieldErrors.amount}
          editable={!submitting}
          hint={`Enter your offer. Minimum ${formatRupees(minOffer)}; there is no maximum.`}
        />

        <Text style={styles.note}>
          This is your offer, not a payment. Nothing is charged until you accept a price.
        </Text>

        <Button
          label="Submit request"
          onPress={() => void handleSubmit()}
          loading={submitting}
          size="lg"
          block
          style={styles.submit}
        />
      </View>

    </Screen>
  )
}


const styles = StyleSheet.create({
  grow: { flex: 1 },
  form: { paddingHorizontal: SCREEN_PADDING },
  intro: {
    fontSize: 12.5,
    color: colors.muted,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '500',
    color: colors.muted,
    marginBottom: 7,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: spacing.md,
  },
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
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: spacing.sm,
  },
  tierActive: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  tierLabel: { fontSize: 13, fontWeight: '700', color: colors.muted },
  tierBlurb: { fontSize: 11, color: colors.muted, marginTop: 2 },
  tierPrice: { fontSize: 14, fontWeight: '700', color: colors.muted },
  note: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  submit: { marginBottom: spacing.sm },
})
