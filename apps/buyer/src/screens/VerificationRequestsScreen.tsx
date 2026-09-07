import { useCallback, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { getMyVerificationRequests } from '../api/verification.api'
import { errorMessage } from '../lib/errors'
import { formatDate, formatRupees, verificationRequestTone } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Pill } from '../components/Pill'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { VerificationRequest } from '../types/api'

export function VerificationRequestsScreen() {
  const router = useRouter()

  const [requests, setRequests] = useState<VerificationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await getMyVerificationRequests()
      setRequests(response.requests)
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your verification requests."))
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await load()
        setLoading(false)
      })()
    }, [load]),
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <ScreenHeader title="My verifications" backFallback="/profile" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void handleRefresh()} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon="🔎"
          title="No verification requests yet"
          description="Open a property and tap Verify this property to get a professional's independent findings."
        />
      ) : (
        <View style={styles.list}>
          {requests.map((request) => {
            const tone = verificationRequestTone(request.status)
            return (
              <TouchableOpacity
                key={request.id}
                style={styles.card}
                onPress={() => router.push(`/verifications/${request.id}`)}
                accessibilityRole="button"
              >
                <View style={styles.cardTop}>
                  <Text style={styles.source}>
                    {request.source === 'LISTING' ? 'Expert report' : 'Owner listing'}
                  </Text>
                  <Pill tone={tone} />
                </View>

                <View style={styles.cardFoot}>
                  <Text style={styles.footText}>
                    {formatRupees(request.agreedFee ?? request.buyerInitialOfferAmount)} · {formatDate(request.createdAt)}
                  </Text>
                  {request.assignedSeller?.name ? (
                    <Text style={styles.footText}>👤 {request.assignedSeller.name}</Text>
                  ) : (
                    <Text style={[styles.footText, { color: colors.gold }]}>Details →</Text>
                  )}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: SCREEN_PADDING },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  source: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footText: { fontSize: 10.5, color: colors.muted },
})
