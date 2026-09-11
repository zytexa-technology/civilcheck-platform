import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { updateProfile } from '../api/auth.api'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../lib/errors'
import { formatPhone } from '../lib/format'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { TextField } from '../components/TextField'
import { InlineNotice } from '../components/States'

interface FieldErrors {
  name?: string
  email?: string
  city?: string
  state?: string
}

/**
 * Edit Profile — Buyer Mobile Phase 1 parity fix. Buyer Web's
 * AccountOverview.tsx lets a buyer edit name/email/city/state at any time
 * (phone stays immutable, it's the auth identity); mobile previously only
 * ever wrote these fields once, during the forced CompleteProfileScreen
 * onboarding gate, with no way back into it afterward. This screen reuses
 * the exact same PATCH /api/auth/profile call (updateProfile) and the same
 * validation rules as CompleteProfileScreen (mirroring @civilcheck/shared's
 * buyerProfileSchema — name/city/state min 2 chars, email optional but a
 * valid address — apps/buyer doesn't depend on @civilcheck/shared, same
 * reasoning as every other hand-rolled validation in this app, e.g.
 * RegisterScreen/NewDiscoveryRequestScreen), just reachable from Profile at
 * any time instead of once.
 */
export function EditProfileScreen() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [city, setCity] = useState(user?.city ?? '')
  const [stateVal, setStateVal] = useState(user?.state ?? '')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  if (!user) return null

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (name.trim().length < 2) errors.name = 'Enter your full name.'
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address.'
    }
    if (city.trim().length < 2) errors.city = 'City is required.'
    if (stateVal.trim().length < 2) errors.state = 'State is required.'
    return errors
  }

  const handleSave = async () => {
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setFormError('')
    setSaved(false)
    setBusy(true)
    try {
      await updateProfile({
        name: name.trim(),
        city: city.trim(),
        state: stateVal.trim(),
        email: email.trim() || undefined,
      })
      // Refetches /auth/me so the update is confirmed server-side (not just
      // assumed from the request body) and every other screen reading
      // `user` from AuthContext picks up the change immediately.
      await refreshUser()
      setSaved(true)
    } catch (err) {
      setFormError(errorMessage(err, 'Could not update your profile.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen scroll>
      <ScreenHeader title="Edit profile" backFallback="/profile" />

      <View style={styles.form}>
        <View style={styles.phoneBlock}>
          <Text style={styles.phoneLabel}>Phone Number</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.phoneValue}>{formatPhone(user.phone)}</Text>
            <Text style={styles.verified}>✓ Verified</Text>
          </View>
          <Text style={styles.phoneHint}>Your phone number can&apos;t be changed here.</Text>
        </View>

        {saved ? (
          <View style={styles.notice}>
            <InlineNotice message="Profile updated." />
          </View>
        ) : null}
        {formError ? (
          <View style={styles.notice}>
            <InlineNotice tone="warn" message={formError} />
          </View>
        ) : null}

        <TextField
          label="Full name"
          value={name}
          onChangeText={(v) => {
            setName(v)
            setSaved(false)
          }}
          placeholder="e.g. Anjali Sharma"
          error={fieldErrors.name}
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <TextField
          label="Email (optional)"
          value={email}
          onChangeText={(v) => {
            setEmail(v)
            setSaved(false)
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          error={fieldErrors.email}
          editable={!busy}
          returnKeyType="next"
        />
        <TextField
          label="City"
          value={city}
          onChangeText={(v) => {
            setCity(v)
            setSaved(false)
          }}
          placeholder="e.g. Jaipur"
          error={fieldErrors.city}
          editable={!busy}
          returnKeyType="next"
        />
        <TextField
          label="State"
          value={stateVal}
          onChangeText={(v) => {
            setStateVal(v)
            setSaved(false)
          }}
          placeholder="e.g. Rajasthan"
          error={fieldErrors.state}
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={() => void handleSave()}
        />

        <Button label="Save changes" onPress={() => void handleSave()} loading={busy} size="lg" block style={styles.submit} />
        <Button
          label="Cancel"
          variant="secondary"
          onPress={() => router.back()}
          disabled={busy}
          block
          style={styles.cancel}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: SCREEN_PADDING, paddingTop: spacing.md },
  notice: { marginBottom: spacing.md },
  phoneBlock: { marginBottom: spacing.lg },
  phoneLabel: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phoneValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  verified: { fontSize: 12, fontWeight: '600', color: colors.gold },
  phoneHint: { fontSize: 11, color: colors.muted, marginTop: 3 },
  submit: { marginTop: spacing.sm },
  cancel: { marginTop: spacing.sm },
})
