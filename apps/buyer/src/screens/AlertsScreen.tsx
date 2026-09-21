import { useCallback, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { cancelAlert, getAlertHistory, getMyAlerts } from '../api/alert.api'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../lib/errors'
import { formatDate, alertBanner } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { AlertHistoryResponse, MyAlertsResponse } from '../types/api'

type Tab = 'watching' | 'history'

const TABS: { id: Tab; label: string }[] = [
  { id: 'watching', label: 'Watching' },
  { id: 'history', label: 'History' },
]

export function AlertsScreen() {
  const router = useRouter()
  const { status } = useAuth()

  const [tab, setTab] = useState<Tab>('watching')
  const [watching, setWatching] = useState<MyAlertsResponse['alerts']>([])
  const [history, setHistory] = useState<AlertHistoryResponse['alerts']>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    // Guest browsing (Final Parity Batch, Task 1) — Alerts is 100% personal
    // content (watched properties) with no public equivalent on Buyer Web
    // either (account/alerts sits fully behind ProtectedRoute), so this
    // renders a plain sign-in prompt below instead of fetching.
    if (status !== 'authenticated') return

    setError('')
    try {
      const [alertsResult, historyResult] = await Promise.allSettled([
        getMyAlerts(),
        getAlertHistory(),
      ])

      if (alertsResult.status === 'rejected') throw alertsResult.reason
      setWatching(alertsResult.value.alerts)

      setHistory(historyResult.status === 'fulfilled' ? historyResult.value.alerts : [])
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your alerts."))
    }
  }, [status])

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

  const handleStopWatching = (alertId: string) => {
    Alert.alert('Stop watching?', "You'll no longer get updates for this property.", [
      { text: 'Keep watching', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await cancelAlert(alertId)
              setWatching((previous) => previous.filter((a) => a.alertId !== alertId))
              // The history list carries the same row with active: true, so it
              // has to be corrected too rather than left contradicting itself.
              setHistory((previous) =>
                previous.map((a) => (a.alertId === alertId ? { ...a, active: false } : a)),
              )
            } catch (err) {
              Alert.alert('Error', errorMessage(err))
            }
          })()
        },
      },
    ])
  }

  if (status !== 'authenticated') {
    return (
      <Screen scroll>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Alerts</Text>
        </View>
        <EmptyState
          icon="🔒"
          title="Sign in to see your alerts"
          description="Watch a property's case status and get notified of updates once you're signed in."
          actionLabel="Log In"
          onAction={() => router.push('/login')}
        />
        <Button
          label="Create Account"
          variant="secondary"
          onPress={() => router.push('/register')}
          style={styles.guestCreateBtn}
        />
      </Screen>
    )
  }

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alerts</Text>
        <TouchableOpacity
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notification settings"
        >
          <Text style={styles.settingsGlyph}>⚙️</Text>
        </TouchableOpacity>
      </View>

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
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {entry.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void handleRefresh()} />
      ) : tab === 'watching' ? (
        watching.length === 0 ? (
          <EmptyState
            icon="🔔"
            title="Not watching anything yet"
            description="Open a property report and tap the bell to get notified when its case status or encumbrances change."
            actionLabel="Browse properties"
            onAction={() => router.push('/search')}
          />
        ) : (
          <View style={styles.list}>
            {watching.map((entry) => {
              const tone = alertBanner(entry.property.propertyStatus, entry.property.disputeType)
              return (
                <View key={entry.alertId} style={styles.row}>
                  <TouchableOpacity
                    style={[styles.rowIcon, { backgroundColor: tone.bg }]}
                    onPress={() => router.push(`/report/${entry.property.id}`)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.rowIconGlyph}>{tone.icon}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.grow}
                    onPress={() => router.push(`/report/${entry.property.id}`)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {entry.property.address}
                    </Text>
                    <Text style={styles.rowBody}>
                      📍 {entry.property.tehsil || entry.property.city}
                      {entry.property.caseExists ? ' · ⚖️ Case on record' : ' · ✅ No case'}
                    </Text>
                    <Text style={styles.rowTime}>
                      Watching since {formatDate(entry.subscribedAt)}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleStopWatching(entry.alertId)}
                    accessibilityRole="button"
                    accessibilityLabel="Stop watching"
                  >
                    <Text style={styles.removeGlyph}>✕</Text>
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>
        )
      ) : (
        history.length === 0 ? (
          <EmptyState icon="🕓" title="No watch history" description="Properties you have watched will be listed here." />
        ) : (
          <View style={styles.list}>
            {history.map((entry) => {
              const tone = alertBanner(entry.property.propertyStatus, entry.property.disputeType)
              return (
                <TouchableOpacity
                  key={entry.alertId}
                  style={styles.row}
                  onPress={() => router.push(`/report/${entry.property.id}`)}
                  accessibilityRole="button"
                >
                  <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
                    <Text style={styles.rowIconGlyph}>{tone.icon}</Text>
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {entry.property.address}
                    </Text>
                    <Text style={styles.rowBody}>📍 {entry.property.city}</Text>
                    <Text style={styles.rowTime}>
                      Started {formatDate(entry.subscribedAt)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusTag,
                      entry.active ? styles.statusActive : styles.statusInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: entry.active ? colors.green : colors.muted },
                      ]}
                    >
                      {entry.active ? 'Active' : 'Stopped'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )
      )}
    </Screen>
  )
}


const styles = StyleSheet.create({
  grow: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  settingsGlyph: { fontSize: 17 },
  guestCreateBtn: { marginHorizontal: SCREEN_PADDING },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconGlyph: { fontSize: 17 },
  rowTitle: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  rowBody: { fontSize: 11, color: colors.muted, marginTop: 3, lineHeight: 16.5 },
  rowTime: { fontSize: 10, color: colors.dim, marginTop: 5 },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeGlyph: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
  },
  statusActive: { backgroundColor: colors.greenDim },
  statusInactive: { backgroundColor: colors.surface2 },
  statusText: { fontSize: 10, fontWeight: '700' },
})
