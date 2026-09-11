import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { requestPasswordReset, verifyPasswordResetOtp, resetPassword } from '../api/auth.api'
import { errorMessage } from '../lib/errors'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { TextField } from '../components/TextField'
import { InlineNotice } from '../components/States'

type Stage = 'email' | 'otp' | 'password' | 'done'

export function ForgotPasswordScreen() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
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

  const handleSend = async () => {
    if (!email.trim()) {
      setError('Enter your email')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await requestPasswordReset(email.trim())
      setInfo(res.message)
      setStage('otp')
      startCooldown()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setLoading(true)
    setError('')
    try {
      await requestPasswordReset(email.trim())
      startCooldown()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code')
      return
    }
    setLoading(true)
    setError('')
    try {
      await verifyPasswordResetOtp(email.trim(), otp)
      setStage('password')
    } catch (err) {
      setError(errorMessage(err, 'Invalid or expired code'))
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    // Forgot Password validation parity (Final Parity Batch, Task 3) — this
    // only checked length before; packages/shared's passwordResetSchema
    // (which Buyer Web validates against directly) reuses the exact same
    // passwordSchema as signup: 8-72 characters, at least one letter and one
    // number. Matching it here means an invalid password is caught before
    // the OTP round-trip, not after — the OTP itself is still burned
    // server-side only on a genuinely valid reset request.
    if (
      newPassword.length < 8 ||
      newPassword.length > 72 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword)
    ) {
      setError('Password must be 8-72 characters, with a letter and a number.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      await resetPassword(email.trim(), otp, newPassword, confirmPassword)
      setStage('done')
    } catch (err) {
      setError(errorMessage(err, 'That code is invalid or has expired. Please request a new one.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <Text style={styles.brandName}>CivilCheck</Text>
        <Text style={styles.brandTagline}>Reset your password</Text>
      </View>

      {error ? <InlineNotice tone="warn" message={error} /> : null}
      {info && stage === 'otp' ? <InlineNotice tone="info" message={info} /> : null}

      {stage === 'email' && (
        <>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={() => void handleSend()}
          />
          <Button label="Send reset code" onPress={() => void handleSend()} loading={loading} size="lg" block />
        </>
      )}

      {stage === 'otp' && (
        <>
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
            hint={`Code expires in 10 minutes. Check the inbox for ${email}.`}
          />
          <Button label="Verify code" onPress={() => void handleVerify()} loading={loading} size="lg" block />
          <TouchableOpacity onPress={() => void handleResend()} disabled={cooldown > 0 || loading} style={styles.resendWrap}>
            <Text style={[styles.link, (cooldown > 0 || loading) && styles.linkDisabled]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {stage === 'password' && (
        <>
          <TextField
            label="New Password"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            editable={!loading}
            returnKeyType="next"
            hint="At least 8 characters, with a letter and a number."
          />
          <TextField
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter password"
            secureTextEntry
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={() => void handleReset()}
          />
          <Button label="Update password" onPress={() => void handleReset()} loading={loading} size="lg" block />
        </>
      )}

      {stage === 'done' && (
        <>
          <InlineNotice tone="info" message="Your password has been reset. You can now log in with your new password." />
          <Button label="Go to login" onPress={() => router.replace('/login')} size="lg" block style={styles.doneBtn} />
        </>
      )}

      {stage !== 'done' && (
        <TouchableOpacity onPress={() => router.back()} disabled={loading}>
          <Text style={styles.link}>← Back to login</Text>
        </TouchableOpacity>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SCREEN_PADDING + 12,
  },
  brand: { alignItems: 'center', marginBottom: 36 },
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
  resendWrap: { alignItems: 'center', marginTop: spacing.md },
  link: {
    textAlign: 'center',
    color: colors.gold,
    fontSize: 13,
    fontWeight: '500',
    marginTop: spacing.lg,
  },
  linkDisabled: { opacity: 0.5 },
  doneBtn: { marginTop: spacing.lg },
})
