import { useEffect, useState } from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import RazorpayCheckout from 'react-native-razorpay'
import type { PaymentErrorData } from 'react-native-razorpay'
import { mockCheckout } from '../api/mockPayment'
import { errorMessage } from '../lib/errors'
import { formatRupees } from '../lib/format'
import { colors, radius, spacing } from '../theme'
import { Button } from '../components/Button'
import { InlineNotice } from '../components/States'
import type { CheckoutOrder, CheckoutResult } from '../types/api'

// Razorpay's rejection is a plain PaymentErrorData object, not an Error/Axios
// error — errorMessage() (lib/errors.ts) doesn't recognize that shape, so its
// `description` is read directly here. A dismissed/cancelled checkout rejects
// through this exact same path (there is no separate "user cancelled" branch
// to special-case): either way nothing is confirmed and the sheet just shows
// what Razorpay reported.
function razorpayErrorMessage(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'description' in err &&
    typeof (err as PaymentErrorData).description === 'string' &&
    (err as PaymentErrorData).description
  ) {
    return (err as PaymentErrorData).description
  }
  return errorMessage(err, 'The payment could not be confirmed. Please try again.')
}

const METHODS = [
  { id: 'upi', icon: '📱', label: 'UPI — GPay / PhonePe / Paytm' },
  { id: 'card', icon: '💳', label: 'Debit / Credit card' },
  { id: 'net', icon: '🏦', label: 'Netbanking' },
] as const

interface PaymentSheetProps {
  visible: boolean
  onClose: () => void
  /** Fired after the caller's verify step has succeeded. */
  onSuccess: () => void
  order: CheckoutOrder | null
  /** null when the API runs in mock mode; a real key id otherwise. */
  razorpayKeyId: string | null
  /** Calls the caller's own /verify endpoint. Must throw on failure. */
  onPaid: (result: CheckoutResult) => Promise<void>
  /** Rupee amount to display. Falls back to the order's paise value. */
  priceLabel?: string
  successTitle?: string
  successMessage?: string
  successButtonLabel?: string
}

/**
 * Payment confirmation sheet.
 *
 * Two checkout paths, chosen by whether the API reports a live Razorpay key:
 *   - liveKeyConfigured → RazorpayCheckout.open() (react-native-razorpay), the
 *     real native SDK. Its resolved/rejected payload is only ever forwarded to
 *     the caller's onPaid()/left alone — this component never decides a
 *     payment succeeded on its own.
 *   - otherwise → mockCheckout(), which only ever produces a signature the
 *     backend's dev secret accepts, so it cannot satisfy a real order even if
 *     it were reached.
 * Either way, the backend's /verify endpoint (via the caller's onPaid) is the
 * only thing that ever confirms a payment — nothing here unlocks anything.
 */
export function PaymentSheet({
  visible,
  onClose,
  onSuccess,
  order,
  razorpayKeyId,
  onPaid,
  priceLabel,
  successTitle = 'Report unlocked!',
  successMessage = 'Your full report is ready. You can download the certificate and GST invoice anytime from My Reports.',
  successButtonLabel = 'View full report',
}: PaymentSheetProps) {
  const [method, setMethod] = useState<string>('upi')
  const [paid, setPaid] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  // Reset between openings — otherwise a second unlock opens straight onto the
  // previous success panel.
  useEffect(() => {
    if (!visible) {
      setPaid(false)
      setPaying(false)
      setError('')
    }
  }, [visible])

  const liveKeyConfigured = Boolean(razorpayKeyId)
  const amount = priceLabel ?? (order ? formatRupees(order.amount / 100) : '—')

  const handlePay = async () => {
    if (!order) return

    setPaying(true)
    setError('')

    // Live checkout — the amount/currency/order id come from the backend's
    // order response (props), never computed or overridden here.
    if (liveKeyConfigured && razorpayKeyId) {
      try {
        const data = await RazorpayCheckout.open({
          key: razorpayKeyId,
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          name: 'CivilCheck',
          description: 'CivilCheck payment',
          theme: { color: '#f0a500' },
        })
        // Forwarded to the caller's /verify call as-is — this screen never
        // decides a payment succeeded; the backend's signature check does.
        await onPaid({
          orderId: data.razorpay_order_id ?? order.id,
          paymentId: data.razorpay_payment_id,
          signature: data.razorpay_signature ?? '',
        })
        setPaid(true)
      } catch (err) {
        // Covers both an explicit failure and the buyer dismissing the sheet —
        // Razorpay rejects the same way for either. No /verify call happens,
        // no success state is set, and the order is left exactly as it was so
        // the existing retry flow (retrySpecialRequestPayment, or simply
        // reopening this sheet) can pick it back up.
        setError(razorpayErrorMessage(err))
      } finally {
        setPaying(false)
      }
      return
    }

    // Mock checkout — dev/unconfigured backend only.
    try {
      await onPaid(mockCheckout(order.id))
      setPaid(true)
    } catch (err) {
      setError(errorMessage(err, 'The payment could not be confirmed. Please try again.'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.handle} />

          {paid ? (
            <>
              <View style={styles.successWrap}>
                <Text style={styles.successEmoji}>🎉</Text>
                <Text style={styles.successTitle}>{successTitle}</Text>
                <Text style={styles.successMessage}>{successMessage}</Text>
              </View>
              <Button label={successButtonLabel} onPress={onSuccess} size="lg" block />
            </>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Complete payment</Text>
                <View style={styles.secureTag}>
                  <Text style={styles.secureText}>🔒 Secure</Text>
                </View>
              </View>

              {error ? <InlineNotice tone="warn" message={error} /> : null}

              {METHODS.map((entry) => {
                const active = method === entry.id
                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={[styles.method, active && styles.methodActive]}
                    onPress={() => setMethod(entry.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={styles.methodIcon}>{entry.icon}</Text>
                    <Text style={[styles.methodLabel, active && { color: colors.text }]}>
                      {entry.label}
                    </Text>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <View style={styles.radioDot} /> : null}
                    </View>
                  </TouchableOpacity>
                )
              })}

              <View style={styles.breakdown}>
                <View style={styles.breakRow}>
                  <Text style={styles.breakKey}>Amount</Text>
                  <Text style={styles.breakValue}>{amount}</Text>
                </View>
                <View style={styles.breakRow}>
                  <Text style={styles.breakKey}>GST</Text>
                  <Text style={styles.breakValue}>Included</Text>
                </View>
                <View style={[styles.breakRow, styles.breakTotal]}>
                  <Text style={styles.breakTotalKey}>Total payable</Text>
                  <Text style={styles.breakTotalValue}>{amount}</Text>
                </View>
              </View>

              <Button
                label={`Pay ${amount}`}
                onPress={handlePay}
                loading={paying}
                disabled={!order}
                size="lg"
                block
              />

              <Text style={styles.footnote}>
                {liveKeyConfigured
                  ? '🔒 Payments are handled by Razorpay — CivilCheck never sees your card/UPI details.'
                  : '⚡ Test mode — no real money will be charged.'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}


const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border2,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  secureTag: {
    backgroundColor: colors.greenDim,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  secureText: { fontSize: 10, fontWeight: '600', color: colors.green },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.border2,
    borderRadius: radius.sm,
    padding: 13,
    marginBottom: spacing.sm,
  },
  methodActive: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  methodIcon: { fontSize: 18 },
  methodLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.muted },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.gold },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  breakdown: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breakKey: { fontSize: 12, color: colors.muted },
  breakValue: { fontSize: 12, color: colors.text },
  breakTotal: { borderBottomWidth: 0, marginTop: 2 },
  breakTotalKey: { fontSize: 13, fontWeight: '700', color: colors.text },
  breakTotalValue: { fontSize: 13, fontWeight: '700', color: colors.gold },
  footnote: {
    textAlign: 'center',
    fontSize: 10,
    color: colors.muted,
    marginTop: spacing.md,
  },
  successWrap: { alignItems: 'center', paddingVertical: spacing.xl },
  successEmoji: { fontSize: 48, marginBottom: spacing.md },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  successMessage: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
})
