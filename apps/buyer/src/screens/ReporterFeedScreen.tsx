import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { getReporterFeed } from '../api/reporterPost.api'
import { errorMessage } from '../lib/errors'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { ReporterPostCard } from '../components/PropertyCard'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { ReporterPost } from '../types/api'

const PAGE_SIZE = 10

/**
 * Property Updates — a scrolling feed of property information/news
 * Reporters have sourced (newspaper cuttings, public notices, etc). Purely
 * informational content, not a property listing — never shows a "Verified"
 * badge or moderation status.
 */
export function ReporterFeedScreen() {
  const [posts, setPosts] = useState<ReporterPost[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const requestId = useRef(0)

  const run = useCallback(async (options: { page: number; append: boolean }) => {
    const id = ++requestId.current
    try {
      const response = await getReporterFeed({ page: options.page, limit: PAGE_SIZE })
      if (id !== requestId.current) return
      setPosts((prev) => (options.append ? [...prev, ...response.posts] : response.posts))
      setPage(response.page)
      setTotalPages(response.totalPages)
      setError('')
    } catch (err) {
      if (id !== requestId.current) return
      setError(errorMessage(err, 'Could not load the feed.'))
      if (!options.append) setPosts([])
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await run({ page: 1, append: false })
      setLoading(false)
    })()
  }, [run])

  const loadMore = async () => {
    if (loadingMore || loading || page >= totalPages) return
    setLoadingMore(true)
    await run({ page: page + 1, append: true })
    setLoadingMore(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await run({ page: 1, append: false })
    setRefreshing(false)
  }

  const header = (
    <View>
      <ScreenHeader title="Property Updates" subtitle="Reported by CivilCheck Reporters" backFallback="/profile" />
      <View style={styles.explainer}>
        <Text style={styles.explainerText}>
          Property information sourced by CivilCheck Reporters — newspaper cuttings, public
          notices and other publicly available material. This is informational content, not a
          property listing, and is not independently verified by CivilCheck.
        </Text>
      </View>
    </View>
  )

  return (
    <Screen>
      <FlatList
        data={loading ? [] : posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <ReporterPostCard post={item} />
          </View>
        )}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
            <EmptyState icon="📰" title="No posts yet" description="Reporter updates will appear here." />
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.gold} style={styles.footerSpinner} /> : null}
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
    borderRadius: 9,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  explainerText: { fontSize: 11, color: colors.muted, lineHeight: 16.5 },
  footerSpinner: { marginVertical: spacing.lg },
})
