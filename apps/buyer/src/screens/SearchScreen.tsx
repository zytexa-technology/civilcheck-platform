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
import { getSearchHistory, searchProperties } from '../api/property.api'
import { errorMessage } from '../lib/errors'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { PropertyCard } from '../components/PropertyCard'
import { Screen } from '../components/Screen'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { FreePreviewProperty, PropertyType, RiskBadge } from '../types/api'

const PAGE_SIZE = 10

const RISK_FILTERS: { label: string; value: RiskBadge | null }[] = [
  { label: 'All risk', value: null },
  { label: '🔴 Risk', value: 'RED' },
  { label: '🟡 Caution', value: 'AMBER' },
  { label: '🟢 Clear', value: 'GREEN' },
]

const TYPE_FILTERS: { label: string; value: PropertyType | null }[] = [
  { label: 'All types', value: null },
  { label: 'Residential', value: 'RESIDENTIAL' },
  { label: 'Plot', value: 'PLOT' },
  { label: 'Commercial', value: 'COMMERCIAL' },
  { label: 'Agricultural', value: 'AGRICULTURAL' },
]

export function SearchScreen() {
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [risk, setRisk] = useState<RiskBadge | null>(null)
  const [type, setType] = useState<PropertyType | null>(null)

  const [results, setResults] = useState<FreePreviewProperty[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [history, setHistory] = useState<string[]>([])

  // Guards an append against a filter change that landed while it was in
  // flight — without this, page 2 of the old filter can be appended to page 1
  // of the new one.
  const requestId = useRef(0)

  const runSearch = useCallback(
    async (options: {
      query: string
      risk: RiskBadge | null
      type: PropertyType | null
      page: number
      append: boolean
    }) => {
      const id = ++requestId.current

      try {
        const response = await searchProperties({
          query: options.query.trim() || undefined,
          riskBadge: options.risk ?? undefined,
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
        setError(errorMessage(err, 'Search failed. Please try again.'))
        if (!options.append) setResults([])
      }
    },
    [],
  )

  // Initial load — browse everything, plus this buyer's recent searches.
  useEffect(() => {
    void (async () => {
      await runSearch({ query: '', risk: null, type: null, page: 1, append: false })
      setLoading(false)

      try {
        const response = await getSearchHistory()
        setHistory(response.searches.map((entry) => entry.query))
      } catch {
        // History is a convenience; a failure here should not surface at all.
      }
    })()
  }, [runSearch])

  const search = async (options: {
    query?: string
    risk?: RiskBadge | null
    type?: PropertyType | null
  }) => {
    const next = {
      query: options.query ?? query,
      risk: options.risk !== undefined ? options.risk : risk,
      type: options.type !== undefined ? options.type : type,
    }

    setQuery(next.query)
    setRisk(next.risk)
    setType(next.type)
    setLoading(true)

    await runSearch({ ...next, page: 1, append: false })
    setLoading(false)
  }

  const loadMore = async () => {
    if (loadingMore || loading || page >= totalPages) return
    setLoadingMore(true)
    await runSearch({ query, risk, type, page: page + 1, append: true })
    setLoadingMore(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await runSearch({ query, risk, type, page: 1, append: false })
    setRefreshing(false)
  }

  const showHistory = !query.trim() && history.length > 0

  const header = (
    <View>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search properties</Text>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Address, society, survey or khasra no."
            placeholderTextColor={colors.dim}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void search({})}
            returnKeyType="search"
            accessibilityLabel="Search properties"
          />
          {query ? (
            <TouchableOpacity
              onPress={() => void search({ query: '' })}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Text style={styles.clearGlyph}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <FilterRow
        options={RISK_FILTERS}
        selected={risk}
        onSelect={(value) => void search({ risk: value })}
      />
      <FilterRow
        options={TYPE_FILTERS}
        selected={type}
        onSelect={(value) => void search({ type: value })}
      />

      {showHistory ? (
        <View style={styles.historyWrap}>
          <Text style={styles.historyTitle}>Recent searches</Text>
          <View style={styles.historyRow}>
            {history.map((entry) => (
              <TouchableOpacity
                key={entry}
                style={styles.historyChip}
                onPress={() => void search({ query: entry })}
              >
                <Text style={styles.historyChipText} numberOfLines={1}>
                  {entry}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {!loading && !error ? (
        <Text style={styles.count}>
          {total} verified {total === 1 ? 'property' : 'properties'} found
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
          <PropertyCard property={item} onPress={() => router.push(`/report/${item.id}`)} />
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
            <EmptyState
              icon="🔍"
              title="No properties match"
              description="Try a different address, or clear the filters. If the property isn't in our database yet, request a custom check."
              actionLabel="Request a custom check"
              onAction={() => router.push('/requests/new')}
            />
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

function FilterRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { label: string; value: T | null }[]
  selected: T | null
  onSelect: (value: T | null) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterRow}
      contentContainerStyle={styles.filterContent}
    >
      {options.map((option) => {
        const active = selected === option.value
        return (
          <TouchableOpacity
            key={option.label}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}


const styles = StyleSheet.create({
  listContent: { paddingHorizontal: SCREEN_PADDING, paddingBottom: spacing.xl },
  header: { paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  searchWrap: { paddingBottom: spacing.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border2,
    borderRadius: 11,
    paddingHorizontal: 13,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.text, fontSize: 13, paddingVertical: 12 },
  clearGlyph: { fontSize: 13, color: colors.muted, padding: 4 },
  filterRow: { marginBottom: spacing.sm, marginHorizontal: -SCREEN_PADDING },
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
  historyWrap: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  historyTitle: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  historyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  historyChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    maxWidth: 180,
  },
  historyChipText: { fontSize: 11, color: colors.text },
  count: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  footerSpinner: { marginVertical: spacing.lg },
})
