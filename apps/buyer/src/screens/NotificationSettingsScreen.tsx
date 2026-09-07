import { useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { setPushPreference } from '../api/alert.api'
import { errorMessage } from '../lib/errors'
import {
  cachePushPreference,
  getDevicePushToken,
  readCachedPushPreference,
} from '../lib/pushNotifications'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Card, SectionCard } from '../components/Card'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { InlineNotice } from '../components/States'

export function NotificationSettingsScreen() {
  const [pushEnabled, setPushEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    void (async () => {
      setPushEnabled(await readCachedPushPreference())
    })()
  }, [])

  const handleToggle = async (next: boolean) => {
    // Optimistic: the switch should move under the finger, not after a round trip.
    setPushEnabled(next)
    setSaving(true)
    setError('')
    setStatus('')

    try {
      const response = await setPushPreference(next)
      setPushEnabled(response.pushEnabled)
      await cachePushPreference(response.pushEnabled)
      setStatus(response.message ?? '')

      // Ask for OS permission and register a device token right when the
      // buyer opts in, rather than waiting for the next app launch.
      if (response.pushEnabled) {
        const token = await getDevicePushToken()
        if (!token) {
          setStatus('Saved — allow notifications for CivilCheck in your device settings to receive them.')
        }
      }
    } catch (err) {
      setPushEnabled(!next)
      setError(errorMessage(err, "Couldn't update your preference."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen scroll>
      <ScreenHeader title="Notification settings" backFallback="/alerts" />

      {error ? (
        <View style={styles.notice}>
          <InlineNotice tone="warn" message={error} />
        </View>
      ) : null}

      <SectionCard icon="🔔" title="Case-update alerts">
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.rowTitle}>Push notifications</Text>
            <Text style={styles.rowBody}>
              Turning this off does not stop your alerts — they are sent by SMS instead.
            </Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={(next) => void handleToggle(next)}
            disabled={saving}
            trackColor={{ false: colors.border2, true: colors.goldBorder }}
            thumbColor={pushEnabled ? colors.gold : colors.muted}
            accessibilityLabel="Push notifications"
          />
        </View>
      </SectionCard>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <Card>
        <Text style={styles.cardTitle}>What you get alerted about</Text>
        <Text style={styles.cardBody}>
          For every property you watch, we notify you when its case status changes — a new
          case filed, a case disposed or stayed, or a change in its risk badge.
        </Text>
      </Card>
    </Screen>
  )
}


const styles = StyleSheet.create({
  grow: { flex: 1 },
  notice: { paddingHorizontal: SCREEN_PADDING },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  rowBody: { fontSize: 11, color: colors.muted, lineHeight: 16, marginTop: 3 },
  status: {
    fontSize: 11,
    color: colors.green,
    marginHorizontal: SCREEN_PADDING,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  cardBody: { fontSize: 11.5, color: colors.muted, lineHeight: 17 },
})
