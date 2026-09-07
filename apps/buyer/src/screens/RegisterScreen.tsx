import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { registerBuyer } from '../api/auth.api'
import { useAuth } from '../context/AuthContext'
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
  password?: string
}

/**
 * Buyer signup — email + password + mandatory phone (replaces the old
 * phone-OTP flow, MSG91 removed). Registration logs the buyer straight in:
 * POST /api/auth/register now returns a token, so there is no separate
 * verification step to hand off to.
 */
export function RegisterScreen() {
  const router = useRouter()
  const { signIn } = useAuth()

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}

    if (normalizePhone(phone).length !== 10) {
      errors.phone = 'Enter a valid 10-digit mobile number.'
    }
    if (name.trim().length < 2) {
      errors.name = 'Enter your name.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address.'
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'At least 8 characters, with a letter and a number.'
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
        password,
      })
      await signIn(result.token, result.user)
    } catch (err) {
      // 409 means the phone or email is already registered — that buyer just
      // needs to log in, so send them there rather than showing an error
      // they can't fix.
      if (errorStatus(err) === 409) {
        router.replace('/login')
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
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          error={fieldErrors.password}
          editable={!loading}
          hint="At least 8 characters, with a letter and a number."
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
