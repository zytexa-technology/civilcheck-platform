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
import { TextField } from '../components/TextField'
import { InlineNotice } from '../components/States'

interface FieldErrors {
  name?: string
  email?: string
  city?: string
  state?: string
}

/**
 * Post-phone-login onboarding gate — a buyer who signed in via Firebase
 * phone-OTP only ever has `phone` on record until this runs. Reuses the
 * exact same `PATCH /api/auth/profile` (`updateProfile`) the rest of the app
 * would use for an "edit profile" screen; this is a dedicated first-run
 * screen, not a second profile system. app/_layout.tsx routes here whenever
 * an authenticated buyer's `profileComplete` is false — including on a cold
 * start with a still-valid token, so closing the app mid-onboarding doesn't
 * lose progress or force a repeat phone verification.
 */
export function CompleteProfileScreen() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [city, setCity] = useState(user?.city ?? '')
  const [stateVal, setStateVal] = useState(user?.state ?? '')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

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

  const handleSubmit = async () => {
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setFormError('')
    setBusy(true)
    try {
      await updateProfile({
        name: name.trim(),
        city: city.trim(),
        state: stateVal.trim(),
        email: email.trim() || undefined,
      })
      await refreshUser() // updates the displayed name everywhere immediately
      setDone(true)
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save your profile.'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Screen scroll contentContainerStyle={styles.center}>
        <View style={styles.form}>
          <Text style={styles.title}>Profile completed successfully.</Text>
          <Text style={styles.intro}>Welcome, {name.trim()}.</Text>
          <Button
            label="Continue to Dashboard"
            onPress={() => router.replace('/')}
            size="lg"
            block
            style={styles.submit}
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen scroll>
      <View style={styles.form}>
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.intro}>Just a few details before you continue.</Text>

        <View style={styles.phoneBlock}>
          <Text style={styles.phoneLabel}>Phone Number</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.phoneValue}>{formatPhone(user.phone)}</Text>
            <Text style={styles.verified}>✓ Verified</Text>
          </View>
          <Text style={styles.phoneHint}>Your phone number has been verified.</Text>
        </View>

        {formError ? <InlineNotice tone="warn" message={formError} /> : null}

        <TextField
          label="Full name *"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Anjali Sharma"
          error={fieldErrors.name}
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <TextField
          label="Email (optional)"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          error={fieldErrors.email}
          editable={!busy}
          returnKeyType="next"
        />
        <TextField
          label="City *"
          value={city}
          onChangeText={setCity}
          placeholder="e.g. Jaipur"
          error={fieldErrors.city}
          editable={!busy}
          returnKeyType="next"
        />
        <TextField
          label="State *"
          value={stateVal}
          onChangeText={setStateVal}
          placeholder="e.g. Rajasthan"
          error={fieldErrors.state}
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={() => void handleSubmit()}
        />

        <Button
          label="Complete Profile"
          onPress={() => void handleSubmit()}
          loading={busy}
          size="lg"
          block
          style={styles.submit}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, justifyContent: 'center' },
  form: { paddingHorizontal: SCREEN_PADDING, paddingTop: spacing.xl },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
  intro: { fontSize: 12.5, color: colors.muted, lineHeight: 19, marginBottom: spacing.lg },
  phoneBlock: { marginBottom: spacing.lg },
  phoneLabel: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phoneValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  verified: { fontSize: 12, fontWeight: '600', color: colors.gold },
  phoneHint: { fontSize: 11, color: colors.muted, marginTop: 3 },
  submit: { marginTop: spacing.sm },
})
