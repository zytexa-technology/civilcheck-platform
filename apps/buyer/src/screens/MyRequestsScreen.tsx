import { useCallback, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { getMySpecialRequests } from '../api/specialRequest.api'
import { errorMessage } from '../lib/errors'
import { formatDate, formatRupees, specialRequestTone } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Pill } from '../components/Pill'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { SpecialRequestSummary } from '../types/api'

export function MyRequestsScreen() {
  const router = useRouter()

  const [requests, setRequests] = useState<SpecialRequestSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await getMySpecialRequests()
      setRequests(response.requests)
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your requests."))
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
      <ScreenHeader
        title="My requests"
        backFallback="/profile"
        right={
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => router.push('/requests/new')}
            accessibilityRole="button"
          >
            <Text style={styles.newButtonText}>+ New</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void handleRefresh()} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon="📝"
          title="No research requests yet"
          description="If a property isn't in our database, ask a verified expert in that tehsil to research it for you."
          actionLabel="Request a custom check"
          onAction={() => router.push('/requests/new')}
        />
      ) : (
        <View style={styles.list}>
          {requests.map((request) => {
            const tone = specialRequestTone(request.status)
            const unpaid = request.status === 'PENDING' && !request.advancePaid

            return (
              <TouchableOpacity
                key={request.id}
                style={styles.card}
                onPress={() => router.push(`/requests/${request.id}`)}
                accessibilityRole="button"
              >
                <View style={styles.cardTop}>
                  <View style={styles.grow}>
                    <Text style={styles.address} numberOfLines={2}>
                      {request.address}
                    </Text>
                    <Text style={styles.meta}>
                      📍 {request.tehsil ? `${request.tehsil}, ` : ''}
                      {request.city}
                    </Text>
                  </View>
                  <Pill tone={tone} />
                </View>

                {unpaid ? (
                  <Text style={styles.unpaid}>
                    ⚠️ Advance not paid — this request won&apos;t be assigned until it is.
                  </Text>
                ) : request.statusMessage ? (
                  <Text style={styles.statusMessage}>{request.statusMessage}</Text>
                ) : null}

                <View style={styles.cardFoot}>
                  <Text style={styles.footText}>
                    {formatRupees(request.advanceAmount)} · {formatDate(request.createdAt)}
                  </Text>
                  {request.assignedTo?.name ? (
                    <Text style={styles.footText}>👤 {request.assignedTo.name}</Text>
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
  grow: { flex: 1 },
  newButton: {
    backgroundColor: colors.goldDim,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  newButtonText: { fontSize: 12, fontWeight: '700', color: colors.gold },
  list: { paddingHorizontal: SCREEN_PADDING },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  address: { fontSize: 13.5, fontWeight: '600', color: colors.text, lineHeight: 18 },
  meta: { fontSize: 10.5, color: colors.muted, marginTop: 3 },
  statusMessage: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  unpaid: {
    fontSize: 11,
    color: colors.amber,
    lineHeight: 16,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
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
