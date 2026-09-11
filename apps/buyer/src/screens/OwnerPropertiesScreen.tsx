import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { searchOwnerProperties } from '../api/ownerProperty.api'
import { errorMessage } from '../lib/errors'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { OwnerPropertyCard } from '../components/PropertyCard'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { OwnerProperty, PropertyType } from '../types/api'

const PAGE_SIZE = 10

const TYPE_FILTERS: { label: string; value: PropertyType | null }[] = [
  { label: 'All types', value: null },
  { label: 'Residential', value: 'RESIDENTIAL' },
  { label: 'Plot', value: 'PLOT' },
  { label: 'Commercial', value: 'COMMERCIAL' },
  { label: 'Agricultural', value: 'AGRICULTURAL' },
]

/**
 * Owner self-published properties — free to browse, nothing to unlock.
 *
 * Deliberately kept off the paid Search tab and styled differently: these are
 * owner-submitted listings, not expert-researched legal reports, and
 * conflating the two would misrepresent what a buyer is looking at. Admin
 * approval gates visibility only — it is not a CivilCheck verification claim,
 * so this screen never renders a "Verified" badge.
 */
export function OwnerPropertiesScreen() {
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [type, setType] = useState<PropertyType | null>(null)

  const [results, setResults] = useState<OwnerProperty[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const requestId = useRef(0)

  const run = useCallback(
    async (options: {
      query: string
      type: PropertyType | null
      page: number
      append: boolean
    }) => {
      const id = ++requestId.current

      try {
        const response = await searchOwnerProperties({
          query: options.query.trim() || undefined,
          propertyType: options.type ?? undefined,
          page: options.page,
          limit: PAGE_SIZE,
        })

        if (id !== requestId.current) return

        setResults((previous) =>
          options.append ? [...previous, ...response.results] : response.results,
        )
        setTotal(response.total)
        setPage(response.page)
        setTotalPages(response.totalPages)
        setError('')
      } catch (err) {
        if (id !== requestId.current) return
        setError(errorMessage(err, "Couldn't load owner listings."))
        if (!options.append) setResults([])
      }
    },
    [],
  )

  useEffect(() => {
    void (async () => {
      await run({ query: '', type: null, page: 1, append: false })
      setLoading(false)
    })()
  }, [run])

  const search = async (next: { query?: string; type?: PropertyType | null }) => {
    const merged = {
      query: next.query ?? query,
      type: next.type !== undefined ? next.type : type,
    }
    setQuery(merged.query)
    setType(merged.type)
    setLoading(true)
    await run({ ...merged, page: 1, append: false })
    setLoading(false)
  }

  const loadMore = async () => {
    if (loadingMore || loading || page >= totalPages) return
    setLoadingMore(true)
    await run({ query, type, page: page + 1, append: true })
    setLoadingMore(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await run({ query, type, page: 1, append: false })
    setRefreshing(false)
  }

  const header = (
    <View>
      <ScreenHeader
        title="Owner listings"
        subtitle="Free to browse · No unlock needed"
        backFallback="/profile"
      />

      <View style={styles.explainer}>
        <Text style={styles.explainerText}>
          These listings are published directly by property owners and moderated by CivilCheck
          before going live. They show document health, not court records — and are not an
          independent CivilCheck verification of the property. For a legal case check, open a
          paid report instead.
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by title"
          placeholderTextColor={colors.dim}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void search({})}
          returnKeyType="search"
          accessibilityLabel="Search owner listings"
        />
        {query ? (
          <TouchableOpacity onPress={() => void search({ query: '' })}>
            <Text style={styles.clearGlyph}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {TYPE_FILTERS.map((entry) => {
          const active = type === entry.value
          return (
            <TouchableOpacity
              key={entry.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => void search({ type: entry.value })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {entry.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {!loading && !error ? (
        <Text style={styles.count}>
          {total} listing{total === 1 ? '' : 's'}
        </Text>
      ) : null}
    </View>
  )

  return (
    <Screen>
      <FlatList
        data={loading ? [] : results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          // The header holds a full-bleed ScreenHeader, so the gutter is applied
          // per-row rather than on the list's content container.
          <View style={styles.cardWrap}>
            <OwnerPropertyCard
              property={item}
              onPress={() => router.push(`/owner-properties/${item.id}`)}
            />
          </View>
        )}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.gold}
            colors={[colors.gold]}
            progressBackgroundColor={colors.surface}
          />
        }
        ListEmptyComponent={
          loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void handleRefresh()} />
          ) : (
            <View>
              <EmptyState
                icon="🏡"
                title="No listings yet"
                description="Owners who publish a property with CivilCheck will appear here."
              />
              <TouchableOpacity
                style={styles.discoveryLink}
                onPress={() =>
                  router.push({
                    pathname: '/discovery-request/new',
                    params: {
                      ...(query.trim() ? { address: query.trim() } : {}),
                      ...(type ? { propertyType: type } : {}),
                    },
                  })
                }
                accessibilityRole="button"
              >
                <Text style={styles.discoveryLinkText}>
                  🔎 Can&apos;t find this property? Request a property search
                </Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.gold} style={styles.footerSpinner} />
          ) : null
        }
      />
    </Screen>
  )
}


const styles = StyleSheet.create({
  listContent: { paddingBottom: spacing.xl },
  cardWrap: { paddingHorizontal: SCREEN_PADDING },
  explainer: {
    marginHorizontal: SCREEN_PADDING,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  explainerText: { fontSize: 11, color: colors.muted, lineHeight: 16.5 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: SCREEN_PADDING,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border2,
    borderRadius: 11,
    paddingHorizontal: 13,
    marginBottom: spacing.md,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.text, fontSize: 13, paddingVertical: 12 },
  clearGlyph: { fontSize: 13, color: colors.muted, padding: 4 },
  filterRow: { marginBottom: spacing.sm },
  filterContent: { paddingHorizontal: SCREEN_PADDING, gap: 7 },
  chip: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { fontSize: 11, fontWeight: '500', color: colors.muted },
  chipTextActive: { color: colors.onGold },
  count: {
    fontSize: 11.5,
    color: colors.muted,
    marginHorizontal: SCREEN_PADDING,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  footerSpinner: { marginVertical: spacing.lg },
  discoveryLink: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  discoveryLinkText: { fontSize: 12, fontWeight: '600', color: colors.gold, textAlign: 'center' },
})
