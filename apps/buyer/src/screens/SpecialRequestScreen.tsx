import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  createSpecialRequest,
  verifySpecialRequestAdvance,
} from '../api/specialRequest.api'
import { errorMessage } from '../lib/errors'
import { formatRupees } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { TextField } from '../components/TextField'
import { InlineNotice } from '../components/States'
import { PaymentSheet } from './PaymentSheet'
import type { CheckoutOrder, CheckoutResult, PropertyType } from '../types/api'

const PROPERTY_TYPES: { label: string; value: PropertyType }[] = [
  { label: 'Residential', value: 'RESIDENTIAL' },
  { label: 'Commercial', value: 'COMMERCIAL' },
  { label: 'Agricultural', value: 'AGRICULTURAL' },
  { label: 'Plot', value: 'PLOT' },
]

// The API accepts any advance between 999 and 4999 (specialRequestCreateSchema).
// These are the three presented tiers.
const TIERS = [
  { id: 'basic', amount: 999, label: 'Basic', blurb: 'Case & encumbrance check' },
  { id: 'standard', amount: 2499, label: 'Standard', blurb: 'Adds title chain review' },
  { id: 'deep', amount: 4999, label: 'Deep dive', blurb: 'Full legal + document audit' },
] as const

const MIN_QUESTION_LENGTH = 10

interface FieldErrors {
  address?: string
  city?: string
  tehsil?: string
  questions?: string
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
  const [tier, setTier] = useState<(typeof TIERS)[number]['id']>('standard')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const [requestId, setRequestId] = useState<string | null>(null)
  const [order, setOrder] = useState<CheckoutOrder | null>(null)
  const [razorpayKeyId, setRazorpayKeyId] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)

  const selectedTier = TIERS.find((entry) => entry.id === tier) ?? TIERS[1]

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

      const response = await createSpecialRequest({
        address: address.trim(),
        city: city.trim(),
        tehsil: tehsil.trim(),
        propertyType,
        questions: questionText,
        documents: [],
        advanceAmount: selectedTier.amount,
      })

      setRequestId(response.requestId)
      setOrder(response.order)
      setRazorpayKeyId(response.razorpayKeyId)
      setShowPayment(true)
    } catch (err) {
      setError(errorMessage(err, "Couldn't submit your request. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen scroll>
      <ScreenHeader
        title="Custom check"
        subtitle="Property not on CivilCheck yet?"
        backFallback="/requests"
      />

      <View style={styles.form}>
        {params.reason === 'not-found' ? (
          <InlineNotice message="We have no record of that property yet. A verified expert in that tehsil can research it for you." />
        ) : null}

        <Text style={styles.intro}>
          We&apos;ll assign a verified expert in that tehsil to research the property and
          deliver a full report in 48–72 hours.
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

        <Text style={styles.label}>Choose a research depth</Text>
        {TIERS.map((entry) => {
          const active = tier === entry.id
          return (
            <TouchableOpacity
              key={entry.id}
              style={[styles.tier, active && styles.tierActive]}
              onPress={() => setTier(entry.id)}
              disabled={submitting}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <View style={styles.grow}>
                <Text style={[styles.tierLabel, active && { color: colors.text }]}>
                  {entry.label}
                </Text>
                <Text style={styles.tierBlurb}>{entry.blurb}</Text>
              </View>
              <Text style={[styles.tierPrice, active && { color: colors.gold }]}>
                {formatRupees(entry.amount)}
              </Text>
            </TouchableOpacity>
          )
        })}

        <Text style={styles.note}>
          This is an advance. If we can&apos;t complete the research, it is refunded in full.
        </Text>

        <Button
          label={`Submit & pay ${formatRupees(selectedTier.amount)}`}
          onPress={() => void handleSubmit()}
          loading={submitting}
          size="lg"
          block
          style={styles.submit}
        />
      </View>

      <PaymentSheet
        visible={showPayment}
        onClose={() => {
          setShowPayment(false)
          // The request row exists but is unpaid. Send the buyer to its detail
          // screen, where the advance can be retried, rather than losing it.
          if (requestId) router.replace(`/requests/${requestId}`)
        }}
        order={order}
        razorpayKeyId={razorpayKeyId}
        priceLabel={formatRupees(selectedTier.amount)}
        successTitle="Request submitted!"
        successMessage="Your advance is confirmed. An admin will assign a verified expert shortly — you'll get the report in 48–72 hours."
        successButtonLabel="Track my request"
        onPaid={async (result: CheckoutResult) => {
          if (!requestId) throw new Error('Missing request id')
          await verifySpecialRequestAdvance(requestId, result)
        }}
        onSuccess={() => {
          setShowPayment(false)
          if (requestId) router.replace(`/requests/${requestId}`)
        }}
      />
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
