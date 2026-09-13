import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { acceptTerms } from '../api/auth.api'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../lib/errors'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { InlineNotice } from '../components/States'

/**
 * Mandatory Terms & Conditions / Privacy Policy re-acceptance gate —
 * app/_layout.tsx routes here whenever an authenticated buyer's
 * `termsAcceptanceRequired` is true (never accepted, or accepted an older
 * version than the server's current one). authMiddleware enforces the same
 * requirement server-side on every other protected API call regardless of
 * what this screen does.
 */
export function AcceptTermsScreen() {
  const router = useRouter()
  const { refreshUser, signOut } = useAuth()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleAccept = async () => {
    setError('')
    setBusy(true)
    try {
      await acceptTerms()
      await refreshUser()
      router.replace('/')
    } catch (err) {
      setError(errorMessage(err, "Couldn't record your acceptance. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen scroll>
      <View style={styles.form}>
        <Text style={styles.title}>Updated Terms &amp; Conditions</Text>
        <Text style={styles.intro}>
          To continue using CivilCheck, please review and accept the latest Terms &amp; Conditions and Privacy
          Policy.
        </Text>

        {error ? <InlineNotice tone="warn" message={error} /> : null}

        <Pressable onPress={() => router.push('/terms')} style={styles.link}>
          <Text style={styles.linkText}>Review Terms &amp; Conditions →</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/privacy')} style={styles.link}>
          <Text style={styles.linkText}>Review Privacy Policy →</Text>
        </Pressable>

        <Pressable style={styles.checkboxRow} onPress={() => setChecked((c) => !c)}>
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.checkboxLabel}>
            I have read and agree to the latest Terms &amp; Conditions and Privacy Policy.
          </Text>
        </Pressable>

        <Button
          label="Accept & Continue"
          onPress={() => void handleAccept()}
          loading={busy}
          disabled={!checked}
          size="lg"
          block
          style={styles.submit}
        />
        <Pressable onPress={() => void signOut()} style={styles.logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: SCREEN_PADDING, paddingTop: spacing.xl },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
  intro: { fontSize: 12.5, color: colors.muted, lineHeight: 19, marginBottom: spacing.lg },
  link: { marginBottom: spacing.sm },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.gold },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: spacing.md, marginBottom: spacing.lg },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkmark: { fontSize: 13, fontWeight: '700', color: colors.bg },
  checkboxLabel: { flex: 1, fontSize: 12.5, color: colors.muted, lineHeight: 18 },
  submit: { marginTop: spacing.sm },
  logout: { marginTop: spacing.md, alignItems: 'center' },
  logoutText: { fontSize: 12.5, color: colors.muted },
})
