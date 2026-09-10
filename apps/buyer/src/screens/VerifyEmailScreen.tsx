import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { resendEmailVerificationOtp, verifyEmailOtp } from '../api/auth.api'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../lib/errors'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { TextField } from '../components/TextField'
import { InlineNotice } from '../components/States'

/**
 * Signup Email Verification — reached from RegisterScreen right after signup,
 * and from LoginScreen when the backend refuses an unverified account
 * (EMAIL_NOT_VERIFIED). Same OTP-entry conventions as ForgotPasswordScreen
 * (this app's one existing precedent), but verifying here IS the action —
 * it issues the real session directly, there's no separate password step.
 */
export function VerifyEmailScreen() {
  const router = useRouter()
  const { signIn } = useAuth()
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>()
  const email = emailParam ?? ''

  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const startCooldown = () => {
    setCooldown(60)
    const iv = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(iv)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await verifyEmailOtp(email, otp)
      // signIn flips the root layout into its authenticated state, which
      // redirects to the tabs (or Complete Profile) — no manual navigation
      // needed here, same as LoginScreen.
      await signIn(result.token, result.user)
    } catch (err) {
      setError(errorMessage(err, 'Invalid or expired code'))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setLoading(true)
    setError('')
    setResendMessage('')
    try {
      const res = await resendEmailVerificationOtp(email)
      setResendMessage(res.message)
      startCooldown()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (!email) {
    return (
      <Screen scroll contentContainerStyle={styles.content}>
        <InlineNotice tone="warn" message="No email to verify. Please sign up again." />
        <Button label="Back to sign up" onPress={() => router.replace('/register')} size="lg" block style={styles.doneBtn} />
      </Screen>
    )
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <Text style={styles.brandName}>CivilCheck</Text>
        <Text style={styles.brandTagline}>Verify your email</Text>
      </View>

      {error ? <InlineNotice tone="warn" message={error} /> : null}
      {resendMessage ? <InlineNotice tone="info" message={resendMessage} /> : null}

      <Text style={styles.subtitle}>We&apos;ve sent a verification code to {email}</Text>

      <TextField
        label="6-digit code"
        value={otp}
        onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
        editable={!loading}
        returnKeyType="go"
        onSubmitEditing={() => void handleVerify()}
        hint="Code expires in 10 minutes."
      />
      <Button label="Verify Email" onPress={() => void handleVerify()} loading={loading} size="lg" block />
      <TouchableOpacity onPress={() => void handleResend()} disabled={cooldown > 0 || loading} style={styles.resendWrap}>
        <Text style={[styles.link, (cooldown > 0 || loading) && styles.linkDisabled]}>
          {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/login')} disabled={loading}>
        <Text style={styles.link}>← Back to login</Text>
      </TouchableOpacity>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SCREEN_PADDING + 12,
  },
  brand: { alignItems: 'center', marginBottom: 20 },
  brandName: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  brandTagline: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12.5,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  resendWrap: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
  link: {
    textAlign: 'center',
    color: colors.gold,
    fontSize: 13,
    fontWeight: '500',
  },
  linkDisabled: { opacity: 0.5 },
  doneBtn: { marginTop: spacing.lg },
})
