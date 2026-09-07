import { useCallback, useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  getSpecialRequestById,
  retrySpecialRequestPayment,
  verifySpecialRequestAdvance,
} from '../api/specialRequest.api'
import { errorMessage, errorStatus } from '../lib/errors'
import {
  formatDate,
  formatRupees,
  humanize,
  sellerBadgeLabel,
  specialRequestTone,
} from '../lib/format'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Card, DetailRow, SectionCard } from '../components/Card'
import { Pill } from '../components/Pill'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorState, InlineNotice, LoadingState } from '../components/States'
import { PaymentSheet } from './PaymentSheet'
import type { CheckoutOrder, CheckoutResult, SpecialRequestDetail } from '../types/api'

export function SpecialRequestDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [request, setRequest] = useState<SpecialRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [retrying, setRetrying] = useState(false)
  const [order, setOrder] = useState<CheckoutOrder | null>(null)
  const [razorpayKeyId, setRazorpayKeyId] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
      setError('No request was selected.')
      return
    }

    setError('')
    try {
      const response = await getSpecialRequestById(id)
      setRequest(response.request)
    } catch (err) {
      setError(
        errorStatus(err) === 404
          ? 'This request no longer exists.'
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

  /**
   * Reopen checkout for a request whose advance was never paid — either the
   * first order failed to create, or the buyer closed the sheet. The API
   * rejects this once the advance is settled, so it is only offered while the
   * request is genuinely PENDING and unpaid.
   */
  const handleRetryPayment = async () => {
    if (!id) return

    setRetrying(true)
    try {
      const response = await retrySpecialRequestPayment(id)
      setOrder(response.order)
      setRazorpayKeyId(response.razorpayKeyId)
      setShowPayment(true)
    } catch (err) {
      Alert.alert("Couldn't reopen payment", errorMessage(err))
      await load()
    } finally {
      setRetrying(false)
    }
  }

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Request" backFallback="/requests" />
        <LoadingState />
      </Screen>
    )
  }

  if (error || !request) {
    return (
      <Screen>
        <ScreenHeader title="Request" backFallback="/requests" />
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

  const tone = specialRequestTone(request.status)
  const awaitingPayment = request.status === 'PENDING' && !request.advancePaid
  const reportReady = request.status === 'APPROVED' && request.completedListingId

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <ScreenHeader
        title="Research request"
        subtitle={request.address}
        backFallback="/requests"
      />

      <Card>
        <View style={styles.statusRow}>
          <Pill tone={tone} />
          <Text style={styles.amount}>{formatRupees(request.advanceAmount)}</Text>
        </View>
        <Text style={styles.statusMessage}>{request.statusMessage}</Text>
      </Card>

      {awaitingPayment ? (
        <View style={styles.section}>
          <InlineNotice
            tone="warn"
            message="The advance for this request has not been paid, so no expert can be assigned to it yet."
          />
          <Button
            label={`Pay ${formatRupees(request.advanceAmount)} advance`}
            onPress={() => void handleRetryPayment()}
            loading={retrying}
            size="lg"
            block
          />
        </View>
      ) : null}

      {reportReady ? (
        <View style={styles.section}>
          <Button
            label="📄 Open the finished report"
            onPress={() => router.push(`/report/${request.completedListingId}`)}
            size="lg"
            block
          />
        </View>
      ) : null}

      <SectionCard icon="📍" title="Property">
        <DetailRow label="Address" value={request.address} />
        <DetailRow label="City" value={request.city} />
        <DetailRow label="Tehsil" value={request.tehsil} />
        <DetailRow label="Type" value={humanize(request.propertyType)} last />
      </SectionCard>

      <SectionCard icon="❓" title="What you asked">
        <Text style={styles.questions}>{request.questions}</Text>
      </SectionCard>

      {request.seller ? (
        <SectionCard icon="👤" iconBackground={colors.violetDim} title="Assigned expert">
          <DetailRow label="Name" value={request.seller.name} />
          <DetailRow label="Badge" value={sellerBadgeLabel(request.seller.badge)} />
          <DetailRow
            label="Profession"
            value={humanize(request.seller.profession)}
            last={!request.seller.phone}
          />
          {request.seller.phone ? (
            <DetailRow label="Phone" value={request.seller.phone} last />
          ) : null}
        </SectionCard>
      ) : null}

      {request.adminNote ? (
        <SectionCard icon="📋" iconBackground={colors.blueDim} title="Note from CivilCheck">
          <Text style={styles.questions}>{request.adminNote}</Text>
        </SectionCard>
      ) : null}

      <SectionCard icon="🕓" title="Timeline">
        <DetailRow label="Submitted" value={formatDate(request.createdAt)} />
        <DetailRow
          label="Advance"
          value={request.advancePaid ? 'Paid' : 'Not paid'}
          valueColor={request.advancePaid ? colors.green : colors.amber}
        />
        <DetailRow label="Last updated" value={formatDate(request.updatedAt)} last />
      </SectionCard>

      <PaymentSheet
        visible={showPayment}
        onClose={() => setShowPayment(false)}
        order={order}
        razorpayKeyId={razorpayKeyId}
        priceLabel={formatRupees(request.advanceAmount)}
        successTitle="Advance confirmed!"
        successMessage="An admin will assign a verified expert shortly. You'll get the report in 48–72 hours."
        successButtonLabel="Done"
        onPaid={async (result: CheckoutResult) => {
          if (!id) throw new Error('Missing request id')
          await verifySpecialRequestAdvance(id, result)
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


const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  amount: { fontSize: 15, fontWeight: '700', color: colors.gold },
  statusMessage: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  section: { paddingHorizontal: SCREEN_PADDING, marginBottom: spacing.md },
  questions: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 19,
    paddingVertical: spacing.md,
  },
})
