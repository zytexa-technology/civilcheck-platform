import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { getBanners } from '../api/content.api'
import { freeCaseCheck, getPropertyFeed } from '../api/property.api'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../lib/errors'
import { initial } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { FeedItemCard } from '../components/PropertyCard'
import { Screen } from '../components/Screen'
import { SectionTitle } from '../components/Card'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { Banner, FeedItem, FeedSourceFilter } from '../types/api'

// Buyer Feature Parity — "Search reports" already hits the exact same
// Listing/Expert search endpoint (searchProperties -> GET /properties/search)
// as Buyer Web's dedicated "Expert Properties" page (ExpertProperties.tsx),
// confirmed by direct audit of both apps' API wiring. The destination was
// already correct; only the label was generic rather than Web's canonical
// term, so this renames it without touching where it goes. "Browse Property"
// is new — Web's /browse (BrowseProperty.tsx) searches Listing (Expert) AND
// Property (Owner) together from one form and shows both result sets, which
// neither "Expert Properties" nor "Owner listings" does alone; BrowsePropertyScreen
// reuses the same two existing search API functions those two screens already
// call, it does not introduce a new endpoint or duplicate either screen.
const QUICK_ACTIONS = [
  { icon: '🏆', label: 'Expert Properties', href: '/search' },
  { icon: '🏠', label: 'Owner listings', href: '/owner-properties' },
  { icon: '🧭', label: 'Browse Property', href: '/browse' },
  { icon: '📰', label: 'Property Updates', href: '/reporter-feed' },
  { icon: '📖', label: 'My reports', href: '/reports' },
  { icon: '📝', label: 'Custom check', href: '/requests/new' },
] as const

// Buyer Feature Parity — mirrors Buyer Web's Home.tsx FILTERS exactly (same
// four source combinations, same order, same underlying getFeed/getPropertyFeed
// call). Previously Home's merged feed had no source filter at all; Web's had
// one directly on the feed section.
const FEED_FILTERS: { label: string; sources: FeedSourceFilter[] }[] = [
  { label: 'All', sources: ['EXPERT', 'OWNER', 'REPORTER'] },
  { label: 'Expert', sources: ['EXPERT'] },
  { label: 'Owner', sources: ['OWNER'] },
  { label: 'Reporter', sources: ['REPORTER'] },
]

export function HomeScreen() {
  const router = useRouter()
  const { user } = useAuth()

  const [banners, setBanners] = useState<Banner[]>([])
  // Buyer Mobile Phase 2 — one merged feed (Expert + Owner + Reporter),
  // matching Buyer Web's Home exactly, replacing the old two-separate-lists
  // approach so Reporter Posts (and their Verify This Property CTA) are
  // actually reachable from Home.
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [filterIndex, setFilterIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [address, setAddress] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')

  const load = useCallback(async (sources: FeedSourceFilter[]) => {
    setError('')
    try {
      // Banners are supporting content — a failure there must not blank out
      // the whole home screen, so only the feed call is allowed to decide
      // the error state.
      const [feedResult, bannersResult] = await Promise.allSettled([
        getPropertyFeed({ sources, limit: 10 }),
        getBanners('BUYERS'),
      ])

      if (feedResult.status === 'rejected') {
        throw feedResult.reason
      }
      setFeedItems(feedResult.value.results)

      setBanners(bannersResult.status === 'fulfilled' ? bannersResult.value.banners : [])
    } catch (err) {
      setError(errorMessage(err, "Couldn't load properties right now."))
    }
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await load(FEED_FILTERS[filterIndex]!.sources)
      setLoading(false)
    })()
  }, [load, filterIndex])

  const handleRefresh = async () => {
    setRefreshing(true)
    await load(FEED_FILTERS[filterIndex]!.sources)
    setRefreshing(false)
  }

  const handleFreeCheck = async () => {
    const query = address.trim()
    if (!query) {
      setCheckError('Enter a property address to check.')
      return
    }

    setChecking(true)
    setCheckError('')

    try {
      const result = await freeCaseCheck({ address: query })

      if (result.found) {
        router.push(`/report/${result.listingId}`)
        return
      }

      // Nothing on record. That is not the same as "clear", and the API is
      // careful to say so — pass the buyer on to a research request instead.
      router.push({
        pathname: '/requests/new',
        params: { address: query, reason: 'not-found' },
      })
    } catch (err) {
      setCheckError(errorMessage(err, "Couldn't run the check right now."))
    } finally {
      setChecking(false)
    }
  }

  const firstName = user?.name?.trim().split(' ')[0]

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <View style={styles.top}>
        <View style={styles.greetRow}>
          <View style={styles.grow}>
            <Text style={styles.greeting} numberOfLines={1}>
              {firstName ? `Hi, ${firstName} 👋` : 'Hi 👋'}
            </Text>
            <Text style={styles.greetingSub}>Verify before you invest</Text>
          </View>
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Text style={styles.avatarText}>{initial(user?.name, user?.phone)}</Text>
          </TouchableOpacity>
        </View>

        {banners.map((banner) => (
          <BannerCard key={banner.id} banner={banner} />
        ))}

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Free · Instant</Text>
          <Text style={styles.heroTitle}>Case Hai Ya Nahi?</Text>
          <Text style={styles.heroSub}>
            Enter any property address to instantly check whether it has legal cases on
            record.
          </Text>
          <View style={styles.heroRow}>
            <TextInput
              style={styles.heroInput}
              placeholder="Enter property address"
              placeholderTextColor={colors.dim}
              value={address}
              onChangeText={(text) => {
                setAddress(text)
                setCheckError('')
              }}
              onSubmitEditing={() => void handleFreeCheck()}
              returnKeyType="search"
              editable={!checking}
              accessibilityLabel="Property address"
            />
            <Button
              label="Check"
              onPress={() => void handleFreeCheck()}
              loading={checking}
              style={styles.heroButton}
            />
          </View>
          {checkError ? <Text style={styles.heroError}>{checkError}</Text> : null}
        </View>
      </View>

      <View style={styles.quickRow}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={styles.quickTile}
            onPress={() => router.push(action.href)}
            accessibilityRole="button"
          >
            <Text style={styles.quickIcon}>{action.icon}</Text>
            <Text style={styles.quickLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Buyer Mobile Phase 2 — one merged section (Expert + Owner + Reporter),
          matching Buyer Web's Home feed. Titled "Latest properties" rather
          than the old "Recently verified": that label was only ever
          accurate for Expert reports — Owner listings and Reporter Posts
          must never be presented as a "Verified" claim (see
          PropertyCard.tsx's own OwnerPropertyCard/ReporterPostCard
          comments), so keeping "verified" in a title covering all three
          would be misleading. No single "See all" destination exists for a
          merged feed on mobile (Search/Owner-properties/Reporter-feed stay
          separate screens, reached via the quick actions above) — same
          reasoning Web's own Home has no "see all" link either, since Home
          already is the full feed there. */}
      <SectionTitle>Latest properties</SectionTitle>

      <View style={styles.filterRow}>
        {FEED_FILTERS.map((f, i) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterPill, i === filterIndex && styles.filterPillActive]}
            onPress={() => setFilterIndex(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: i === filterIndex }}
          >
            <Text style={[styles.filterPillText, i === filterIndex && styles.filterPillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.list}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void handleRefresh()} />
        ) : feedItems.length === 0 ? (
          <EmptyState
            icon="🏘️"
            title="Nothing published yet"
            description="Once experts, owners or reporters publish content for your area, it'll show up here."
            actionLabel="Request a custom check"
            onAction={() => router.push('/requests/new')}
          />
        ) : (
          feedItems.map((item) => (
            <FeedItemCard
              key={item.id}
              item={item}
              onPress={() =>
                item.source === 'EXPERT_REPORT'
                  ? router.push(`/report/${item.id}`)
                  : item.source === 'OWNER_LISTING'
                    ? router.push(`/owner-properties/${item.id}`)
                    : undefined
              }
              onChange={(next) =>
                setFeedItems((prev) => prev.map((existing) => (existing.id === next.id ? next : existing)))
              }
            />
          ))
        )}
      </View>
    </Screen>
  )
}

function BannerCard({ banner }: { banner: Banner }) {
  const palette =
    banner.severity === 'CRITICAL'
      ? { bg: colors.redDim, border: colors.redBorder, text: colors.red }
      : banner.severity === 'WARNING'
        ? { bg: colors.amberDim, border: colors.amberBorder, text: colors.amber }
        : { bg: colors.blueDim, border: colors.blueBorder, text: colors.blue }

  return (
    <View
      style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <Text style={[styles.bannerTitle, { color: palette.text }]}>{banner.title}</Text>
      <Text style={styles.bannerBody}>{banner.body}</Text>
    </View>
  )
}


const styles = StyleSheet.create({
  grow: { flex: 1 },
  top: { paddingHorizontal: SCREEN_PADDING, paddingTop: spacing.sm },
  greetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  greeting: { fontSize: 18, fontWeight: '600', color: colors.text },
  greetingSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.onGold },
  banner: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerTitle: { fontSize: 12.5, fontWeight: '700', marginBottom: 3 },
  bannerBody: { fontSize: 11.5, color: colors.muted, lineHeight: 17 },
  hero: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border2,
    padding: spacing.lg,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gold,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 12.5,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  heroRow: { flexDirection: 'row', gap: spacing.sm },
  heroInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border2,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 13,
    color: colors.text,
  },
  heroButton: { minWidth: 76 },
  heroError: { fontSize: 11, color: colors.red, marginTop: spacing.sm },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: SCREEN_PADDING,
    paddingVertical: spacing.lg,
  },
  quickTile: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 5,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: SCREEN_PADDING,
    marginBottom: spacing.md,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  filterPillTextActive: {
    color: colors.onGold,
  },
  quickIcon: { fontSize: 18 },
  quickLabel: {
    fontSize: 9.5,
    color: colors.muted,
    fontWeight: '600',
    textAlign: 'center',
  },
  list: { paddingHorizontal: SCREEN_PADDING },
  link: { fontSize: 12.5, color: colors.gold, fontWeight: '500' },
})
