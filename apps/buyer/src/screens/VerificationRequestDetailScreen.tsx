import { useCallback, useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  cancelVerificationRequest,
  createAdvanceOrder,
  createClaim,
  createFinalOrder,
  getMyClaims,
  getVerificationRequestById,
  verifyAdvancePayment,
  verifyFinalPayment,
} from '../api/verification.api'
import { errorMessage, errorStatus } from '../lib/errors'
import { formatDate, formatRupees, humanize, sellerBadgeLabel, verificationRequestTone } from '../lib/format'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Button, ButtonRow } from '../components/Button'
import { Card, DetailRow, SectionCard } from '../components/Card'
import { Pill } from '../components/Pill'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorState, InlineNotice, LoadingState } from '../components/States'
import { TextField } from '../components/TextField'
import { VerificationStepper } from '../components/VerificationStepper'
import { PaymentSheet } from './PaymentSheet'
import type { Claim, CheckoutOrder, CheckoutResult, VerificationRequest } from '../types/api'

// Buyer-owned CANCELLABLE_STATUSES mirror — verification.service.ts is the
// actual source of truth (the API rejects any status not in that list), this
// only decides whether the button is worth showing.
const CANCELLABLE: VerificationRequest['status'][] = [
  'OPEN',
  'ACCEPTED',
  'ADVANCE_PAYMENT_PENDING',
  'ADVANCE_PAID',
  'IN_PROGRESS',
  'COMPLETED',
  'FINAL_PAYMENT_PENDING',
]

const STATUS_COPY: Record<VerificationRequest['status'], string> = {
  OPEN: 'Waiting for a professional to accept this job and quote a fee.',
  ACCEPTED: 'A professional has accepted — pay the advance to begin verification.',
  ADVANCE_PAYMENT_PENDING: 'Advance order created. Complete the payment to begin verification.',
  ADVANCE_PAID: 'Advance received — the professional will start shortly.',
  IN_PROGRESS: 'The professional is actively verifying this property.',
  COMPLETED: 'Findings submitted. Pay the remaining amount to unlock the full report.',
  FINAL_PAYMENT_PENDING: 'Final payment order created. Complete the payment to unlock the report.',
  FULLY_PAID: 'Payment complete — the report is being finalised.',
  REPORT_UNLOCKED: 'The full verification report is available below.',
  CANCELLED: 'This request was cancelled.',
}

export function VerificationRequestDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [request, setRequest] = useState<VerificationRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [payBusy, setPayBusy] = useState(false)
  const [payStage, setPayStage] = useState<'advance' | 'final' | null>(null)
  const [order, setOrder] = useState<CheckoutOrder | null>(null)
  const [razorpayKeyId, setRazorpayKeyId] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)

  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const [claims, setClaims] = useState<Claim[]>([])
  const [showClaimForm, setShowClaimForm] = useState(false)
  const [claimReason, setClaimReason] = useState('')
  const [claimDescription, setClaimDescription] = useState('')
  const [claimSubmitting, setClaimSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
      setError('No verification request was selected.')
      return
    }
    setError('')
    try {
      const response = await getVerificationRequestById(id)
      setRequest(response.request)
      if (response.request.status === 'REPORT_UNLOCKED') {
        const claimsResponse = await getMyClaims(id)
        setClaims(claimsResponse.claims)
      }
    } catch (err) {
      setError(
        errorStatus(err) === 404
          ? 'This verification request no longer exists.'
          : errorMessage(err, "Couldn't load this request."),
      )
    }
  }, [id])

  useEffect(() => {
    void (async () => {
      await load()
      setLoading(false)
    })()
  }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const handlePayAdvance = async () => {
    if (!id) return
    setPayBusy(true)
    try {
      const response = await createAdvanceOrder(id)
      setOrder(response.order)
      setRazorpayKeyId(response.razorpayKeyId)
      setPayStage('advance')
      setShowPayment(true)
    } catch (err) {
      Alert.alert("Couldn't start payment", errorMessage(err))
      await load()
    } finally {
      setPayBusy(false)
    }
  }

  const handlePayFinal = async () => {
    if (!id) return
    setPayBusy(true)
    try {
      const response = await createFinalOrder(id)
      setOrder(response.order)
      setRazorpayKeyId(response.razorpayKeyId)
      setPayStage('final')
      setShowPayment(true)
    } catch (err) {
      Alert.alert("Couldn't start payment", errorMessage(err))
      await load()
    } finally {
      setPayBusy(false)
    }
  }

  // Backend remains the source of truth for the fee/refund split — this only
  // submits the buyer's reason and shows whatever the API computed back.
  const handleConfirmCancel = async () => {
    if (!id) return
    setCancelling(true)
    try {
      const response = await cancelVerificationRequest(id, cancelReason.trim() || 'Cancelled by buyer')
      setShowCancel(false)
      setCancelReason('')
      setRequest(response.request)
      Alert.alert(
        'Request cancelled',
        response.cancellationFee > 0
          ? `A cancellation fee of ${formatRupees(response.cancellationFee)} applies. ${formatRupees(response.refundAmount)} will be refunded.`
          : 'No amount was charged, so there is nothing to refund.',
      )
    } catch (err) {
      Alert.alert("Couldn't cancel this request", errorMessage(err))
    } finally {
      setCancelling(false)
    }
  }

  const handleSubmitClaim = async () => {
    if (!id) return
    if (claimReason.trim().length < 3 || claimDescription.trim().length < 10) return

    setClaimSubmitting(true)
    try {
      await createClaim(id, {
        reason: claimReason.trim(),
        description: claimDescription.trim(),
        evidence: [],
      })
      setShowClaimForm(false)
      setClaimReason('')
      setClaimDescription('')
      const claimsResponse = await getMyClaims(id)
      setClaims(claimsResponse.claims)
      Alert.alert('Claim submitted', 'An admin will review your claim and respond here.')
    } catch (err) {
      Alert.alert("Couldn't submit claim", errorMessage(err))
    } finally {
      setClaimSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Verification" backFallback="/verifications" />
        <LoadingState />
      </Screen>
    )
  }

  if (error || !request) {
    return (
      <Screen>
        <ScreenHeader title="Verification" backFallback="/verifications" />
        <ErrorState
          message={error || 'Request not found.'}
          onRetry={() => {
            setLoading(true)
            void (async () => {
              await load()
              setLoading(false)
            })()
          }}
        />
      </Screen>
    )
  }

  const tone = verificationRequestTone(request.status)
  const canCancel = CANCELLABLE.includes(request.status)
  const canClaim = request.status === 'REPORT_UNLOCKED'
  const activeClaim = claims.find((c) => c.status === 'OPEN' || c.status === 'UNDER_REVIEW')

  // Derived purely from fields already on the request (agreedFee splits into
  // advanceAmount + finalAmount by the existing 50/50 rule) — never a second
  // computation of what was actually charged, just a presentation summary of
  // the same numbers shown individually elsewhere on this screen.
  const fullyPaid = request.status === 'FULLY_PAID' || request.status === 'REPORT_UNLOCKED'
  const advancePaid = fullyPaid || ['ADVANCE_PAID', 'IN_PROGRESS', 'COMPLETED', 'FINAL_PAYMENT_PENDING'].includes(request.status)
  const paidSoFar = fullyPaid ? request.agreedFee : advancePaid ? request.advanceAmount : 0
  const remaining = request.agreedFee != null && paidSoFar != null ? request.agreedFee - paidSoFar : null

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <ScreenHeader
        title="Verification request"
        subtitle={request.source === 'LISTING' ? 'Expert report' : 'Owner listing'}
        backFallback="/verifications"
      />

      <Card>
        <View style={styles.statusRow}>
          <Pill tone={tone} />
          {request.agreedFee != null ? (
            <Text style={styles.amount}>{formatRupees(request.agreedFee)}</Text>
          ) : (
            <Text style={styles.amountMuted}>Your offer: {formatRupees(request.buyerInitialOfferAmount)}</Text>
          )}
        </View>
        <Text style={styles.statusMessage}>{STATUS_COPY[request.status]}</Text>

        {request.agreedFee != null ? (
          <View style={styles.amountBreakdown}>
            <AmountStat label="Total" value={formatRupees(request.agreedFee)} />
            <AmountStat label="Paid" value={formatRupees(paidSoFar)} color={colors.green} />
            <AmountStat label="Remaining" value={formatRupees(remaining)} color={remaining ? colors.amber : colors.green} />
          </View>
        ) : null}

        <View style={styles.stepperDivider} />
        <VerificationStepper status={request.status} />
      </Card>

      {request.status === 'ACCEPTED' || request.status === 'ADVANCE_PAYMENT_PENDING' ? (
        <View style={styles.section}>
          <Button
            label={`Pay ${formatRupees(request.advanceAmount)} advance`}
            onPress={() => void handlePayAdvance()}
            loading={payBusy}
            size="lg"
            block
          />
        </View>
      ) : null}

      {request.status === 'COMPLETED' || request.status === 'FINAL_PAYMENT_PENDING' ? (
        <View style={styles.section}>
          <Button
            label={`Pay remaining ${formatRupees(request.finalAmount)}`}
            onPress={() => void handlePayFinal()}
            loading={payBusy}
            size="lg"
            block
          />
        </View>
      ) : null}

      {request.status === 'REPORT_UNLOCKED' && request.reportAvailable ? (
        <SectionCard icon="📄" iconBackground={colors.greenDim} title="Verification report">
          <DetailRow
            label="Risk assessment"
            value={request.report?.riskAssessment ? humanize(request.report.riskAssessment) : '—'}
            valueColor={
              request.report?.riskAssessment === 'GREEN'
                ? colors.green
                : request.report?.riskAssessment === 'AMBER'
                  ? colors.amber
                  : request.report?.riskAssessment === 'RED'
                    ? colors.red
                    : undefined
            }
          />
          <DetailRow label="Submitted" value={formatDate(request.report?.submittedAt)} last />
          {request.report?.findings ? (
            <Text style={styles.findings}>{request.report.findings}</Text>
          ) : null}
        </SectionCard>
      ) : null}

      {request.acceptedQuote ? (
        <SectionCard icon="💬" title="Accepted quotation">
          <DetailRow label="Quoted fee" value={formatRupees(request.acceptedQuote.proposedFee)} last={!request.acceptedQuote.message} />
          {request.acceptedQuote.message ? (
            <DetailRow label="Note" value={request.acceptedQuote.message} last />
          ) : null}
        </SectionCard>
      ) : null}

      {request.assignedSeller ? (
        <SectionCard icon="👤" iconBackground={colors.violetDim} title="Assigned professional">
          <DetailRow label="Name" value={request.assignedSeller.name} />
          <DetailRow label="Badge" value={sellerBadgeLabel(request.assignedSeller.badge)} />
          <DetailRow
            label="Profession"
            value={humanize(request.assignedSeller.profession)}
            last={request.assignedSeller.accuracyScore == null}
          />
          {request.assignedSeller.accuracyScore != null ? (
            <DetailRow label="Accuracy score" value={`${request.assignedSeller.accuracyScore}%`} last />
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard icon="🕓" title="Timeline">
        <DetailRow label="Submitted" value={formatDate(request.createdAt)} />
        <DetailRow label="Last updated" value={formatDate(request.updatedAt)} last={!request.cancelledAt} />
        {request.cancelledAt ? (
          <>
            <DetailRow label="Cancelled" value={formatDate(request.cancelledAt)} />
            <DetailRow label="Reason" value={request.cancellationReason ?? '—'} last={request.cancellationFee == null} />
            {request.cancellationFee != null ? (
              <DetailRow label="Cancellation fee" value={formatRupees(request.cancellationFee)} last />
            ) : null}
          </>
        ) : null}
      </SectionCard>

      {canClaim ? (
        <View style={styles.section}>
          {activeClaim ? (
            <SectionCard icon="⚑" iconBackground={colors.amberDim} title="Your claim">
              <DetailRow label="Reason" value={activeClaim.reason} />
              <DetailRow label="Status" value={humanize(activeClaim.status)} last={!activeClaim.resolutionNote} />
              {activeClaim.resolutionNote ? (
                <DetailRow label="Admin response" value={activeClaim.resolutionNote} last />
              ) : null}
            </SectionCard>
          ) : claims.length > 0 ? (
            claims.slice(0, 1).map((c) => (
              <SectionCard key={c.id} icon="⚑" title="Previous claim">
                <DetailRow label="Reason" value={c.reason} />
                <DetailRow label="Status" value={humanize(c.status)} last={!c.resolutionNote} />
                {c.resolutionNote ? <DetailRow label="Admin response" value={c.resolutionNote} last /> : null}
              </SectionCard>
            ))
          ) : null}

          {!activeClaim ? (
            showClaimForm ? (
              <Card>
                <Text style={styles.formTitle}>Raise a claim</Text>
                <TextField
                  label="Reason"
                  value={claimReason}
                  onChangeText={setClaimReason}
                  placeholder="e.g. Findings don't match the property"
                  editable={!claimSubmitting}
                />
                <TextField
                  label="Description"
                  value={claimDescription}
                  onChangeText={setClaimDescription}
                  placeholder="Explain what's wrong in detail"
                  multiline
                  editable={!claimSubmitting}
                  hint="Minimum 10 characters."
                />
                <ButtonRow>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={() => setShowClaimForm(false)}
                    disabled={claimSubmitting}
                    style={styles.flexButton}
                  />
                  <Button
                    label="Submit claim"
                    onPress={() => void handleSubmitClaim()}
                    loading={claimSubmitting}
                    disabled={claimReason.trim().length < 3 || claimDescription.trim().length < 10}
                    style={styles.flexButton}
                  />
                </ButtonRow>
              </Card>
            ) : (
              <Button
                label="⚑ Raise a claim"
                variant="secondary"
                onPress={() => setShowClaimForm(true)}
                block
              />
            )
          ) : null}
        </View>
      ) : null}

      {canCancel ? (
        <View style={styles.section}>
          {showCancel ? (
            <Card>
              <Text style={styles.formTitle}>Cancel this request?</Text>
              <Text style={styles.cancelBlurb}>
                CivilCheck computes the cancellation fee and refund from what has actually been
                paid — nothing is deducted beyond the configured rate.
              </Text>
              <TextField
                label="Reason (optional)"
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="Why are you cancelling?"
                multiline
                editable={!cancelling}
              />
              <ButtonRow>
                <Button
                  label="Keep request"
                  variant="secondary"
                  onPress={() => setShowCancel(false)}
                  disabled={cancelling}
                  style={styles.flexButton}
                />
                <Button
                  label="Confirm cancel"
                  variant="danger"
                  onPress={() => void handleConfirmCancel()}
                  loading={cancelling}
                  style={styles.flexButton}
                />
              </ButtonRow>
            </Card>
          ) : (
            <Button label="Cancel request" variant="danger" onPress={() => setShowCancel(true)} block />
          )}
        </View>
      ) : null}

      <PaymentSheet
        visible={showPayment}
        onClose={() => setShowPayment(false)}
        order={order}
        razorpayKeyId={razorpayKeyId}
        priceLabel={
          payStage === 'advance' ? formatRupees(request.advanceAmount) : formatRupees(request.finalAmount)
        }
        successTitle={payStage === 'advance' ? 'Advance confirmed!' : 'Report unlocked!'}
        successMessage={
          payStage === 'advance'
            ? 'The professional will begin verification shortly.'
            : 'Your full verification report is ready below.'
        }
        successButtonLabel="Done"
        onPaid={async (result: CheckoutResult) => {
          if (!id) throw new Error('Missing request id')
          if (payStage === 'advance') await verifyAdvancePayment(id, result)
          else await verifyFinalPayment(id, result)
        }}
        onSuccess={() => {
          setShowPayment(false)
          setLoading(true)
          void (async () => {
            await load()
            setLoading(false)
          })()
        }}
      />
    </Screen>
  )
}

function AmountStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.amountStat}>
      <Text style={styles.amountStatLabel}>{label}</Text>
      <Text style={[styles.amountStatValue, color ? { color } : null]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  amount: { fontSize: 15, fontWeight: '700', color: colors.gold },
  amountMuted: { fontSize: 12, fontWeight: '600', color: colors.muted },
  statusMessage: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  amountBreakdown: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  amountStat: { flex: 1 },
  amountStatLabel: { fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  amountStatValue: { fontSize: 13.5, fontWeight: '700', color: colors.text, marginTop: 3 },
  stepperDivider: { height: 1, backgroundColor: colors.border, marginTop: spacing.md, marginBottom: spacing.sm },
  section: { paddingHorizontal: SCREEN_PADDING, marginBottom: spacing.md },
  findings: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 19,
    paddingVertical: spacing.md,
  },
  formTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  cancelBlurb: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginBottom: spacing.md },
  flexButton: { flex: 1 },
})
