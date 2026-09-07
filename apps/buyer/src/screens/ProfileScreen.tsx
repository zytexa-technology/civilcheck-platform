import { useCallback, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { getMyAlerts } from '../api/alert.api'
import { getMyPurchases } from '../api/purchase.api'
import { getMySpecialRequests } from '../api/specialRequest.api'
import { useAuth } from '../context/AuthContext'
import { formatPhone, initial } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Screen } from '../components/Screen'
import type { Href } from 'expo-router'

interface MenuItem {
  icon: string
  title: string
  href?: Href
  destructive?: boolean
  onPress?: () => void
}

export function ProfileScreen() {
  const router = useRouter()
  const { user, signOut, refreshUser } = useAuth()

  const [reportCount, setReportCount] = useState(0)
  const [watchingCount, setWatchingCount] = useState(0)
  const [requestCount, setRequestCount] = useState(0)

  // Counts are decoration. Each is fetched independently and a failure just
  // leaves that tile at zero rather than blocking the screen — the profile has
  // to stay usable (specifically: log out has to stay reachable) when the API
  // is down.
  const load = useCallback(async () => {
    // A session restored while offline leaves the profile unfetched (see
    // AuthContext: a network failure keeps the token rather than logging the
    // buyer out). This is where that gets retried, so the screen stops showing
    // a nameless account once connectivity is back.
    if (!user) void refreshUser()

    const [purchases, alerts, requests] = await Promise.allSettled([
      getMyPurchases(),
      getMyAlerts(),
      getMySpecialRequests(),
    ])

    if (purchases.status === 'fulfilled') setReportCount(purchases.value.total)
    if (alerts.status === 'fulfilled') setWatchingCount(alerts.value.total)
    if (requests.status === 'fulfilled') setRequestCount(requests.value.total)
  }, [user, refreshUser])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        // signOut flips the root layout to unauthenticated, which redirects.
        onPress: () => void signOut(),
      },
    ])
  }

  const MENU: MenuItem[] = [
    { icon: '📖', title: 'My reports', href: '/reports' },
    { icon: '🔎', title: 'My verifications', href: '/verifications' },
    { icon: '📝', title: 'My research requests', href: '/requests' },
    { icon: '🔔', title: 'Alerts & subscription', href: '/alerts' },
    { icon: '🏠', title: 'Owner listings', href: '/owner-properties' },
    { icon: '📰', title: 'Property Updates', href: '/reporter-feed' },
    { icon: '📍', title: 'Where we operate', href: '/coverage' },
    { icon: '💬', title: 'Support', href: '/support' },
    { icon: '📥', title: 'Notification inbox', href: '/inbox' },
    { icon: '⚙️', title: 'Notification settings', href: '/notifications' },
    { icon: '🚪', title: 'Log out', destructive: true, onPress: handleLogout },
  ]

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial(user?.name, user?.phone)}</Text>
        </View>
        <Text style={styles.name}>{user?.name || 'CivilCheck user'}</Text>
        {user?.phone ? <Text style={styles.phone}>{formatPhone(user.phone)}</Text> : null}
      </View>

      <View style={styles.stats}>
        <Stat value={reportCount} label="Reports" />
        <Stat value={watchingCount} label="Watching" />
        <Stat value={requestCount} label="Requests" />
      </View>

      <View style={styles.menu}>
        {MENU.map((item, index) => (
          <TouchableOpacity
            key={item.title}
            style={[styles.menuItem, index === MENU.length - 1 && styles.menuItemLast]}
            onPress={() => {
              if (item.onPress) item.onPress()
              else if (item.href) router.push(item.href)
            }}
            accessibilityRole="button"
          >
            <View style={styles.menuIcon}>
              <Text style={styles.menuIconGlyph}>{item.icon}</Text>
            </View>
            <Text style={[styles.menuTitle, item.destructive && { color: colors.red }]}>
              {item.title}
            </Text>
            {item.destructive ? null : <Text style={styles.chevron}>›</Text>}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.footer}>
        CivilCheck is an information service, not legal advice.
      </Text>
    </Screen>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}


const styles = StyleSheet.create({
  header: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  identity: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: colors.onGold },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  phone: { fontSize: 11.5, color: colors.muted },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: spacing.lg,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.gold },
  statLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  menu: { marginTop: spacing.xs },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: SCREEN_PADDING,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconGlyph: { fontSize: 15 },
  menuTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  chevron: { color: colors.dim, fontSize: 16 },
  footer: {
    textAlign: 'center',
    fontSize: 10.5,
    color: colors.dim,
    marginTop: spacing.xl,
  },
})
