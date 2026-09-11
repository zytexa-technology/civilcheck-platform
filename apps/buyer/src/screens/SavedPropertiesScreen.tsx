import { useCallback, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { getMyEngagedProperties } from '../api/property.api'
import { errorMessage } from '../lib/errors'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { FeedItemCard } from '../components/PropertyCard'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { FeedItem } from '../types/api'

type Tab = 'saved' | 'liked'

const TABS: { id: Tab; label: string }[] = [
  { id: 'saved', label: 'Saved' },
  { id: 'liked', label: 'Liked' },
]

/**
 * Saved Properties — Buyer Mobile Phase 4A. Mirrors Buyer Web's
 * SavedProperties.tsx exactly: same two tabs (Saved/Liked — Web's own
 * reference file has both on this one page, not Saved alone), same
 * GET /properties/mine?kind= endpoint, same FeedItem shape rendered with
 * the existing FeedItemCard (already built in Phase 2/3 — no new card
 * component needed). Both lists are fetched up front (AlertsScreen's own
 * established multi-tab pattern) rather than refetching per tab switch,
 * since the underlying endpoint only ever answers for one kind at a time.
 */
export function SavedPropertiesScreen() {
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('saved')
  const [savedItems, setSavedItems] = useState<FeedItem[]>([])
  const [likedItems, setLikedItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [savedResult, likedResult] = await Promise.allSettled([
        getMyEngagedProperties('saved'),
        getMyEngagedProperties('liked'),
      ])

      if (savedResult.status === 'rejected' && likedResult.status === 'rejected') {
        throw savedResult.reason
      }
      setSavedItems(savedResult.status === 'fulfilled' ? savedResult.value.results : [])
      setLikedItems(likedResult.status === 'fulfilled' ? likedResult.value.results : [])
    } catch (err) {
      setError(errorMessage(err, "Couldn't load this list."))
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

  // Composite id+source match, same defensive reasoning as Buyer Web's own
  // updateItem — a plain `id` alone isn't guaranteed unique across the three
  // underlying tables this list can mix (Listing/Property/ReporterPost).
  //
  // Explicit Phase 4A requirement: a successful unsave removes the item from
  // the Saved array immediately (server-confirmed — this only ever runs from
  // FeedItemCard's onChange, which only fires after the toggle API call
  // already succeeded; a failed unsave never calls this at all, so the item
  // simply stays put with no extra handling needed here). Applied regardless
  // of which tab is currently active — e.g. unsaving an item while viewing
  // the Liked tab must not leave a stale, already-unsaved row waiting in the
  // Saved array for the next full reload. The Liked array intentionally
  // keeps Buyer Web's own plain update-in-place behavior — unliking doesn't
  // remove it, matching Web exactly, since changing that would be a
  // Like-behavior change, out of this phase's scope.
  const handleItemChange = (next: FeedItem) => {
    const matches = (i: FeedItem) => i.id === next.id && i.source === next.source
    setSavedItems((prev) => (next.isSaved ? prev.map((i) => (matches(i) ? next : i)) : prev.filter((i) => !matches(i))))
    setLikedItems((prev) => prev.map((i) => (matches(i) ? next : i)))
  }

  const items = tab === 'saved' ? savedItems : likedItems

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <ScreenHeader title="Saved properties" backFallback="/profile" />

      <View style={styles.tabs}>
        {TABS.map((entry) => {
          const active = tab === entry.id
          return (
            <TouchableOpacity
              key={entry.id}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(entry.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{entry.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={styles.list}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void handleRefresh()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={tab === 'saved' ? '🔖' : '❤️'}
            title={tab === 'saved' ? 'No saved properties yet' : 'No liked properties yet'}
            description="Properties you save or like from Home will show up here."
            actionLabel="Browse properties"
            onAction={() => router.push('/search')}
          />
        ) : (
          items.map((item) => (
            <FeedItemCard
              key={`${item.source}:${item.id}`}
              item={item}
              onPress={() =>
                item.source === 'EXPERT_REPORT'
                  ? router.push(`/report/${item.id}`)
                  : item.source === 'OWNER_LISTING'
                    ? router.push(`/owner-properties/${item.id}`)
                    : undefined
              }
              onChange={handleItemChange}
            />
          ))
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: SCREEN_PADDING,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  tabText: { fontSize: 11.5, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.onGold },
  list: { paddingHorizontal: SCREEN_PADDING },
})
