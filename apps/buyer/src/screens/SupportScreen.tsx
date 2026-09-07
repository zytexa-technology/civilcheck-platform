import { useCallback, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { getMySupportTickets } from '../api/support.api'
import { errorMessage } from '../lib/errors'
import { formatDate, humanize, supportTicketTone } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Pill } from '../components/Pill'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { SupportTicket } from '../types/api'

export function SupportScreen() {
  const router = useRouter()

  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await getMySupportTickets()
      setTickets(response.tickets)
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your support tickets."))
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
        title="Support"
        backFallback="/profile"
        right={
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => router.push('/support/new')}
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
      ) : tickets.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No support tickets yet"
          description="Our AI assistant answers most questions instantly, and can bring in a human agent whenever you need one."
          actionLabel="Ask a question"
          onAction={() => router.push('/support/new')}
        />
      ) : (
        <View style={styles.list}>
          {tickets.map((ticket) => {
            const tone = supportTicketTone(ticket.status)
            return (
              <TouchableOpacity
                key={ticket.id}
                style={styles.card}
                onPress={() => router.push(`/support/${ticket.id}`)}
                accessibilityRole="button"
              >
                <View style={styles.cardTop}>
                  <Text style={styles.subject} numberOfLines={1}>
                    {ticket.subject}
                  </Text>
                  <Pill tone={tone} />
                </View>
                <View style={styles.cardFoot}>
                  <Text style={styles.footText}>{humanize(ticket.category)}</Text>
                  <Text style={styles.footText}>{formatDate(ticket.updatedAt)}</Text>
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
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  subject: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },
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
