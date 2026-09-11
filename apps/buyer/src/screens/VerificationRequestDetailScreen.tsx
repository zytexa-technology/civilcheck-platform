import { useCallback, useEffect, useState } from 'react'
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  acceptVerificationQuote,
  cancelVerificationRequest,
  createAdvanceOrder,
  createClaim,
  createFinalOrder,
  getMyClaims,
  getVerificationMessages,
  getVerificationQuotes,
  getVerificationRequestById,
  sendVerificationMessage,
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
import type {
  Claim,
  CheckoutOrder,
  CheckoutResult,
  VerificationMessage,
  VerificationQuote,
  VerificationRequest,
} from '../types/api'

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
  const [claimPromptDismissed, setClaimPromptDismissed] = useState(false)

  // Buyer-choice negotiation — the comparison list shown only while OPEN.
  const [quotes, setQuotes] = useState<VerificationQuote[]>([])
  const [confirmQuoteId, setConfirmQuoteId] = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [quoteError, setQuoteError] = useState('')

  // Buyer<->assigned-professional conversation — the minimum capability,
  // scoped to this one request. Opens only once assignedSeller is set.
  const [messages, setMessages] = useState<VerificationMessage[]>([])
  const [messageDraft, setMessageDraft] = useState('')
  const [messageBusy, setMessageBusy] = useState(false)
  const [messageError, setMessageError] = useState('')

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
      if (response.request.status === 'OPEN') {
        const quotesResponse = await getVerificationQuotes(id).catch(() => null)
        if (quotesResponse) setQuotes(quotesResponse.quotes)
      } else {
        setQuotes([])
      }
      // The conversation only opens once a professional is assigned (the
      // backend enforces this too) — no point loading it before then.
      if (response.request.assignedSeller || response.request.status !== 'OPEN') {
        const messagesResponse = await getVerificationMessages(id).catch(() => null)
        if (messagesResponse) setMessages(messagesResponse.messages)
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
    // 20 chars, not 10 — matches the backend's actual claimCreateSchema
    // (packages/shared/src/validation.ts) and Buyer Web's own client-side
    // check (VerificationRequestDetail.tsx), which this previously
    // under-validated against, risking a late server-side 400.
    if (claimReason.trim().length < 3 || claimDescription.trim().length < 20) return

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

  const handleAcceptQuote = async (quoteId: string) => {
    if (!id) return
    setAcceptingId(quoteId)
    setQuoteError('')
    try {
      await acceptVerificationQuote(id, quoteId)
      setConfirmQuoteId(null)
      setLoading(true)
      await load()
      setLoading(false)
    } catch (err) {
      setQuoteError(errorMessage(err, 'Could not accept this quote — it may no longer be available.'))
    } finally {
      setAcceptingId(null)
    }
  }

  const handleSendMessage = async () => {
    if (!id || messageDraft.trim().length === 0) return
    setMessageBusy(true)
    setMessageError('')
    try {
      const response = await sendVerificationMessage(id, messageDraft.trim())
      setMessages((prev) => [...prev, response.message])
      setMessageDraft('')
    } catch (err) {
      setMessageError(errorMessage(err, 'Could not send your message.'))
    } finally {
      setMessageBusy(false)
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

  // The report's own attached files ARE the "Download Report" capability —
  // no PDF generation step, just the documents/images/videos the
  // professional submitted, opened via Linking exactly like a purchased
  // Listing's documents (ReportScreen's UnlockedSections).
  const reportAttachments = [
    ...(request.report?.documents ?? []),
    ...(request.report?.images ?? []),
    ...(request.report?.videos ?? []),
  ]

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <ScreenHeader
        title="Verification request"
        subtitle={
          request.source === 'LISTING'
            ? 'Expert report'
            : request.source === 'DISCOVERY'
              ? 'Property search'
              : 'Owner listing'
        }
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

      {request.status === 'OPEN' ? (
        <SectionCard icon="💬" title="Compare quotes">
          {quoteError ? (
            <View style={styles.quoteErrorWrap}>
              <InlineNotice tone="warn" message={quoteError} />
            </View>
          ) : null}
          {quotes.length === 0 ? (
            <Text style={styles.mutedNote}>
              Waiting for Experts/Admin to respond with a quote. You&apos;ll be able to compare
              and accept one here.
            </Text>
          ) : (
            quotes.map((q) => (
              <View key={q.id} style={styles.quoteCard}>
                <View style={styles.quoteHeadRow}>
                  <Text style={styles.quoteName}>{q.quotedBySeller ? q.quotedBySeller.name : 'CivilCheck Admin'}</Text>
                  <Text style={styles.quoteFee}>{formatRupees(q.proposedFee)}</Text>
                </View>
                {q.quotedBySeller ? (
                  <Text style={styles.quoteMeta}>
                    {sellerBadgeLabel(q.quotedBySeller.badge)} · {humanize(q.quotedBySeller.profession)}
                  </Text>
                ) : null}
                {q.message ? <Text style={styles.quoteMessage}>{q.message}</Text> : null}

                {confirmQuoteId === q.id ? (
                  <View style={styles.quoteConfirm}>
                    <InlineNotice
                      message={`You are selecting this provider for property verification. Final verification price: ${formatRupees(q.proposedFee)}. 50% advance required before verification: ${formatRupees(q.proposedFee / 2)}.`}
                    />
                    <ButtonRow>
                      <Button
                        label="Confirm — Accept"
                        onPress={() => void handleAcceptQuote(q.id)}
                        loading={acceptingId === q.id}
                        disabled={acceptingId !== null}
                        style={styles.flexButton}
                      />
                      <Button
                        label="Back"
                        variant="secondary"
                        onPress={() => setConfirmQuoteId(null)}
                        disabled={acceptingId !== null}
                        style={styles.flexButton}
                      />
                    </ButtonRow>
                  </View>
                ) : (
                  <Button
                    label="Accept this quote"
                    onPress={() => setConfirmQuoteId(q.id)}
                    disabled={confirmQuoteId !== null}
                    block
                    style={styles.quoteAcceptButton}
                  />
                )}
              </View>
            ))
          )}
        </SectionCard>
      ) : null}

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

          {reportAttachments.length > 0 ? (
            <>
              <Text style={styles.attachmentsHeading}>📥 Download Report</Text>
              {reportAttachments.map((url, index) => (
                <TouchableOpacity
                  key={url}
                  style={[styles.documentRow, index === reportAttachments.length - 1 && styles.documentRowLast]}
                  onPress={() => void Linking.openURL(url)}
                  accessibilityRole="link"
                >
                  <Text style={styles.documentIcon}>📄</Text>
                  <View style={styles.grow}>
                    <Text style={styles.documentName} numberOfLines={1}>
                      {url.split('/').pop() || `Attachment ${index + 1}`}
                    </Text>
                    <Text style={styles.documentHint}>Tap to open</Text>
                  </View>
                  <Text style={styles.documentGlyph}>↗</Text>
                </TouchableOpacity>
              ))}
            </>
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

      {request.assignedSeller && request.status !== 'CANCELLED' ? (
        <SectionCard icon="✉️" title={`Chat with ${request.assignedSeller.name}`}>
          {messageError ? (
            <View style={styles.quoteErrorWrap}>
              <InlineNotice tone="warn" message={messageError} />
            </View>
          ) : null}

          <View style={styles.messageThread}>
            {messages.length === 0 ? (
              <Text style={styles.mutedNote}>No messages yet — start the conversation below.</Text>
            ) : (
              messages.map((m) => {
                const mine = m.senderRole === 'BUYER'
                return (
                  <View key={m.id} style={[styles.messageRow, mine && styles.messageRowMine]}>
                    <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleTheirs]}>
                      <Text style={[styles.messageBody, mine && styles.messageBodyMine]}>{m.body}</Text>
                      <Text style={[styles.messageMeta, mine && styles.messageMetaMine]}>
                        {mine ? 'You' : request.assignedSeller!.name} · {formatDate(m.createdAt)}
                      </Text>
                    </View>
                  </View>
                )
              })
            )}
          </View>

          <View style={styles.messageComposerRow}>
            <TextField
              value={messageDraft}
              onChangeText={setMessageDraft}
              placeholder="Type a message…"
              editable={!messageBusy}
              style={styles.messageField}
            />
            <Button
              label="Send"
              onPress={() => void handleSendMessage()}
              loading={messageBusy}
              disabled={!messageDraft.trim()}
            />
          </View>
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
          {!activeClaim && !claimPromptDismissed ? (
            <Card style={styles.claimPromptCard}>
              <Text style={styles.claimPromptTitle}>Not satisfied with this verification report?</Text>
              <Text style={styles.claimPromptBody}>
                If you believe the report is incomplete or incorrect, you can submit a claim for
                review.
              </Text>
              <ButtonRow>
                <Button
                  label="Raise a claim"
                  variant="danger"
                  onPress={() => {
                    setShowClaimForm(true)
                    setClaimPromptDismissed(true)
                  }}
                  style={styles.flexButton}
                />
                <Button
                  label="Dismiss"
                  variant="secondary"
                  onPress={() => setClaimPromptDismissed(true)}
                  style={styles.flexButton}
                />
              </ButtonRow>
            </Card>
          ) : null}

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
                  hint="Minimum 20 characters."
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
                    disabled={claimReason.trim().length < 3 || claimDescription.trim().length < 20}
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

          {claims.length > 0 ? (
            <TouchableOpacity
              style={styles.contactSupportLink}
              onPress={() => router.push('/support/new')}
              accessibilityRole="button"
            >
              <Text style={styles.contactSupportText}>💬 Contact Support</Text>
            </TouchableOpacity>
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
  grow: { flex: 1 },
  mutedNote: { fontSize: 12, color: colors.muted, lineHeight: 18, paddingVertical: spacing.md },

  // ─── Compare quotes ──────────────────────────────────────────────────────
  quoteErrorWrap: { paddingBottom: spacing.sm },
  quoteCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginVertical: spacing.xs,
  },
  quoteHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quoteName: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  quoteFee: { fontSize: 14.5, fontWeight: '800', color: colors.gold },
  quoteMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  quoteMessage: { fontSize: 12, color: colors.text, marginTop: spacing.sm, lineHeight: 18 },
  quoteConfirm: { marginTop: spacing.md, gap: spacing.sm },
  quoteAcceptButton: { marginTop: spacing.md },

  // ─── Report attachments ("Download Report") ─────────────────────────────
  attachmentsHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  documentRowLast: { borderBottomWidth: 0 },
  documentIcon: { fontSize: 18 },
  documentName: { fontSize: 12, fontWeight: '600', color: colors.text },
  documentHint: { fontSize: 10, color: colors.muted, marginTop: 2 },
  documentGlyph: { fontSize: 15, color: colors.gold },

  // ─── Conversation ────────────────────────────────────────────────────────
  messageThread: { paddingVertical: spacing.sm, gap: spacing.sm },
  messageRow: { flexDirection: 'row' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  messageBubbleTheirs: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  messageBubbleMine: { backgroundColor: colors.gold },
  messageBody: { fontSize: 12.5, color: colors.text, lineHeight: 18 },
  messageBodyMine: { color: colors.onGold },
  messageMeta: { fontSize: 9.5, color: colors.muted, marginTop: 4 },
  messageMetaMine: { color: colors.onGold, opacity: 0.7 },
  messageComposerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  messageField: { flex: 1, marginBottom: 0 },

  // ─── Claim prompt banner + Contact Support ──────────────────────────────
  claimPromptCard: { borderColor: colors.goldBorder },
  claimPromptTitle: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  claimPromptBody: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: 4, marginBottom: spacing.md },
  contactSupportLink: { alignSelf: 'flex-start', marginTop: spacing.md },
  contactSupportText: { fontSize: 11.5, fontWeight: '600', color: colors.gold },
})
