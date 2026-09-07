import { useCallback, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from '../api/notification.api'
import { errorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { AppNotification } from '../types/api'

const TYPE_ICON: Record<string, string> = {
  verification: '🔎',
  payment: '💳',
  cancellation: '✋',
  claim: '⚑',
  support: '💬',
  alert: '🔔',
}

export function NotificationsInboxScreen() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await getMyNotifications()
      setNotifications(response.notifications)
      setUnreadCount(response.unreadCount)
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your notifications."))
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

  const handleOpen = async (notification: AppNotification) => {
    if (notification.read) return
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
    try {
      await markNotificationRead(notification.id)
    } catch {
      await load()
    }
  }

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    try {
      await markAllNotificationsRead()
    } catch {
      await load()
    }
  }

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <ScreenHeader
        title="Notifications"
        backFallback="/profile"
        right={
          unreadCount > 0 ? (
            <TouchableOpacity
              style={styles.markAllButton}
              onPress={() => void handleMarkAllRead()}
              accessibilityRole="button"
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void handleRefresh()} />
      ) : notifications.length === 0 ? (
        <EmptyState icon="🔔" title="No notifications yet" description="We'll let you know when something changes." />
      ) : (
        <View style={styles.list}>
          {notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[styles.card, !notification.read && styles.cardUnread]}
              onPress={() => void handleOpen(notification)}
              accessibilityRole="button"
            >
              <Text style={styles.icon}>{TYPE_ICON[notification.type] ?? '🔔'}</Text>
              <View style={styles.grow}>
                <View style={styles.cardTop}>
                  <Text style={styles.title} numberOfLines={1}>
                    {notification.title}
                  </Text>
                  {!notification.read ? <View style={styles.dot} /> : null}
                </View>
                <Text style={styles.body} numberOfLines={3}>
                  {notification.body}
                </Text>
                <Text style={styles.meta}>{formatDate(notification.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  markAllButton: {
    backgroundColor: colors.goldDim,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  markAllText: { fontSize: 11, fontWeight: '700', color: colors.gold },
  list: { paddingHorizontal: SCREEN_PADDING },
  grow: { flex: 1 },
  card: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 9,
  },
  cardUnread: { borderColor: colors.goldBorder, backgroundColor: colors.goldDim },
  icon: { fontSize: 18 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.text },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  body: { fontSize: 11.5, color: colors.muted, lineHeight: 16, marginTop: 3 },
  meta: { fontSize: 10, color: colors.dim, marginTop: 5 },
})
