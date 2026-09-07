import { useCallback, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { getMyPurchases } from '../api/purchase.api'
import { errorMessage } from '../lib/errors'
import { formatDate, formatRupees, humanize, riskTone } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Pill } from '../components/Pill'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { PurchaseWithListing } from '../types/api'

export function MyReportsScreen() {
  const router = useRouter()

  const [purchases, setPurchases] = useState<PurchaseWithListing[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await getMyPurchases()
      setPurchases(response.purchases)
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your reports."))
    }
  }, [])

  // Reload on focus so a report unlocked elsewhere in the session shows up.
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

  const totalSpent = purchases.reduce((sum, purchase) => sum + purchase.amountPaid, 0)
  const highRisk = purchases.filter((p) => p.listing.riskBadge === 'RED').length

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <ScreenHeader title="My reports" backFallback="/profile" />

      <View style={styles.stats}>
        <Stat value={String(purchases.length)} label="Purchased" />
        <View style={styles.divider} />
        <Stat value={formatRupees(totalSpent)} label="Total spent" />
        <View style={styles.divider} />
        <Stat value={String(highRisk)} label="High risk" />
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void handleRefresh()} />
      ) : purchases.length === 0 ? (
        <EmptyState
          icon="📖"
          title="No reports yet"
          description="Reports you unlock will appear here, along with their certificates and GST invoices."
          actionLabel="Browse properties"
          onAction={() => router.push('/search')}
        />
      ) : (
        <View style={styles.list}>
          {purchases.map((purchase) => {
            const listing = purchase.listing
            const tone = riskTone(listing.riskBadge)

            return (
              <TouchableOpacity
                key={purchase.id}
                style={styles.card}
                onPress={() => router.push(`/report/${listing.id}`)}
                accessibilityRole="button"
              >
                <View style={styles.cardTop}>
                  <View style={styles.grow}>
                    <Text style={styles.address} numberOfLines={2}>
                      {listing.address}
                    </Text>
                    <Text style={styles.meta}>
                      📍 {listing.tehsil || listing.city} · {humanize(listing.propertyType)}
                    </Text>
                  </View>
                  <Pill tone={tone} />
                </View>

                <View style={styles.cardFoot}>
                  <View>
                    <Text style={styles.paid}>{formatRupees(purchase.amountPaid)} paid</Text>
                    <Text style={styles.date}>
                      Unlocked {formatDate(purchase.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.viewTag}>
                    <Text style={styles.viewTagText}>View →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </Screen>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}


const styles = StyleSheet.create({
  grow: { flex: 1 },
  stats: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginHorizontal: SCREEN_PADDING,
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValue: { fontSize: 17, fontWeight: '700', color: colors.gold },
  statLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  divider: { width: 1, backgroundColor: colors.border },
  list: { paddingHorizontal: SCREEN_PADDING },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  address: { fontSize: 13.5, fontWeight: '600', color: colors.text, lineHeight: 18 },
  meta: { fontSize: 10.5, color: colors.muted, marginTop: 3 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  paid: { fontSize: 11, color: colors.muted },
  date: { fontSize: 10, color: colors.dim, marginTop: 2 },
  viewTag: {
    backgroundColor: colors.goldDim,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewTagText: { fontSize: 11.5, fontWeight: '600', color: colors.gold },
})
