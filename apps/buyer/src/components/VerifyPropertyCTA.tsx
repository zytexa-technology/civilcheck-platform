import { useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { createVerificationRequest, getVerificationConfig } from '../api/verification.api'
import { errorMessage, errorStatus } from '../lib/errors'
import { formatRupees } from '../lib/format'
import { colors, radius, spacing } from '../theme'
import { Button, ButtonRow } from './Button'
import { TextField } from './TextField'

/**
 * "Verify Property" — the buyer-facing entry point into the Phase 3
 * Verification Marketplace. Shared by ReportScreen (Listing/EXPERT_REPORT),
 * OwnerPropertyDetailScreen (Property/OWNER_LISTING), and the Feed's item
 * detail — one component so the minimum-fee copy and the create → navigate
 * flow live in exactly one place, never hardcoded per screen.
 *
 * Buyer Experience correction (2026-09-05): this used to fire
 * createVerificationRequest on a single tap with no amount at all — every
 * request silently got the platform's fixed minimum. The buyer must
 * actually choose their own initial offer (a budget, never a payment) here;
 * providers then accept it or counter, and only the buyer's later
 * acceptance of one quote sets the real price.
 */
export function VerifyPropertyCTA({
  source,
  targetId,
}: {
  source: 'LISTING' | 'PROPERTY'
  targetId: string
}) {
  const router = useRouter()
  const [minFee, setMinFee] = useState<number | null>(null)
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerAmount, setOfferAmount] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void getVerificationConfig()
      .then((res) => {
        if (live) {
          setMinFee(res.minVerificationFee)
          setOfferAmount(String(res.minVerificationFee))
        }
      })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const handleSubmitOffer = async () => {
    const amount = Number(offerAmount)
    if (!amount || amount <= 0) {
      Alert.alert('Invalid offer', 'Enter a valid offer amount.')
      return
    }
    if (minFee != null && amount < minFee) {
      Alert.alert('Offer too low', `Your offer must be at least ${formatRupees(minFee)}.`)
      return
    }

    setBusy(true)
    try {
      const response = await createVerificationRequest(
        source === 'LISTING'
          ? { source, listingId: targetId, initialOfferAmount: amount }
          : { source, propertyId: targetId, initialOfferAmount: amount },
      )
      router.push(`/verifications/${response.request.id}`)
    } catch (err) {
      if (errorStatus(err) === 409) {
        Alert.alert(
          'Request already exists',
          'You already have an active verification request for this property — check My Verifications.',
          [{ text: 'View', onPress: () => router.push('/verifications') }, { text: 'Close' }],
        )
      } else {
        Alert.alert("Couldn't submit your offer", errorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Want a professional opinion?</Text>
      <Text style={styles.body}>
        A licensed lawyer, civil engineer, or revenue officer will personally review this
        property and deliver a findings report.
        {minFee != null ? ` Starting from ${formatRupees(minFee)}.` : ''}
      </Text>

      {offerOpen ? (
        <>
          <TextField
            label="Your verification offer (₹)"
            value={offerAmount}
            onChangeText={setOfferAmount}
            keyboardType="numeric"
            hint="This is your initial offer. You'll only be charged after you select and accept a provider's quote — nothing is paid now."
          />
          <ButtonRow>
            <Button label="Submit Offer" onPress={() => void handleSubmitOffer()} loading={busy} />
            <Button label="Cancel" variant="secondary" onPress={() => setOfferOpen(false)} disabled={busy} />
          </ButtonRow>
        </>
      ) : (
        <Button label="🔎 Request Verification" onPress={() => setOfferOpen(true)} block />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.md,
  },
  title: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  body: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginBottom: spacing.md },
})
