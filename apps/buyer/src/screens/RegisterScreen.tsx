import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { registerBuyer } from '../api/auth.api'
import { errorMessage, errorStatus } from '../lib/errors'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { TextField } from '../components/TextField'
import { InlineNotice } from '../components/States'

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(-10)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

interface FieldErrors {
  phone?: string
  name?: string
  email?: string
  address?: string
  password?: string
  confirmPassword?: string
}

/**
 * Buyer signup — email + password + mandatory phone + address. Signup Email
 * Verification: the account is created unverified and no session is issued
 * here — /verify-email (VerifyEmailScreen) is what actually logs the buyer
 * in, once the emailed OTP is confirmed.
 */
export function RegisterScreen() {
  const router = useRouter()

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}

    // Signup validation parity (Final Parity Batch, Task 2) — matches
    // packages/shared's phoneSchema exactly: an Indian mobile number starts
    // with 6-9, not just "any 10 digits" (the old check here would have
    // accepted e.g. "0123456789", which the backend rejects).
    if (!/^[6-9]\d{9}$/.test(normalizePhone(phone))) {
      errors.phone = 'Enter a valid Indian mobile number.'
    }
    if (name.trim().length < 2) {
      errors.name = 'Enter your name.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address.'
    }
    if (address.trim().length < 10) {
      errors.address = 'Enter your full address (at least 10 characters).'
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'At least 8 characters, with a letter and a number.'
    } else if (password.length > 72) {
      // packages/shared's passwordSchema caps this at 72 — bcrypt silently
      // truncates anything longer, so a longer password would compare as
      // "matching" against a truncated hash. Same cap the backend enforces.
      errors.password = 'Password must be at most 72 characters.'
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.'
    }

    return errors
  }

  const handleSubmit = async () => {
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const normalized = normalizePhone(phone)

    setLoading(true)
    setError('')

    try {
      const result = await registerBuyer({
        phone: normalized,
        name: name.trim(),
        email: email.trim(),
        address: address.trim(),
        password,
        confirmPassword,
      })
      // Signup Email Verification — no session yet; the OTP screen is what
      // actually logs the buyer in once the code is confirmed.
      router.replace({ pathname: '/verify-email', params: { email: result.email } })
    } catch (err) {
      // Signup validation parity (Final Parity Batch, Task 2) — this used to
      // silently router.replace('/login') on a 409 with no explanation at
      // all, which reads as a broken signup to anyone whose email or phone
      // is already registered. The backend already returns a precise,
      // user-friendly message for each case ("This email is already
      // registered." / "This phone number is already registered." —
      // auth.controller.ts), so surface that and stay on the form with
      // every field the buyer already typed still filled in, exactly like
      // Buyer Web's Register.tsx does for the same 409.
      if (errorStatus(err) === 409) {
        setError(errorMessage(err, 'An account with this email or phone number already exists.'))
        return
      }
      setError(errorMessage(err, "Couldn't create your account. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen scroll>
      <ScreenHeader title="Create your account" backFallback="/login" />

      <View style={styles.form}>
        <Text style={styles.intro}>
          Free to join. You only pay when you unlock a property report.
        </Text>

        {error ? <InlineNotice tone="warn" message={error} /> : null}

        <TextField
          label="Full name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Anjali Sharma"
          error={fieldErrors.name}
          editable={!loading}
          autoCapitalize="words"
        />

        <TextField
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          maxLength={15}
          error={fieldErrors.phone}
          editable={!loading}
        />

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          error={fieldErrors.email}
          editable={!loading}
        />

        <TextField
          label="Address"
          value={address}
          onChangeText={setAddress}
          placeholder="Your full address"
          error={fieldErrors.address}
          editable={!loading}
          multiline
        />

        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          error={fieldErrors.password}
          editable={!loading}
          hint="At least 8 characters, with a letter and a number."
        />

        <TextField
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter password"
          secureTextEntry
          error={fieldErrors.confirmPassword}
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={() => void handleSubmit()}
        />

        <Button
          label="Create account"
          onPress={() => void handleSubmit()}
          loading={loading}
          size="lg"
          block
          style={styles.submit}
        />

        <TouchableOpacity onPress={() => router.replace('/login')} disabled={loading}>
          <Text style={styles.link}>Already have an account? Log in</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  )
}


const styles = StyleSheet.create({
  form: { paddingHorizontal: SCREEN_PADDING },
  intro: {
    fontSize: 12.5,
    color: colors.muted,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  submit: { marginTop: spacing.sm },
  link: {
    textAlign: 'center',
    color: colors.gold,
    fontSize: 13,
    fontWeight: '500',
    marginTop: spacing.lg,
  },
})
