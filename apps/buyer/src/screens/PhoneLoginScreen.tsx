import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { loginBuyerFirebase } from '../api/auth.api'
import { useAuth } from '../context/AuthContext'
import {
  confirmOtp,
  firebaseErrorMessage,
  isFirebaseAuthAvailable,
  sendOtp,
  type PhoneConfirmation,
} from '../lib/firebaseAuth'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { TextField } from '../components/TextField'
import { InlineNotice } from '../components/States'

const PHONE_PATTERN = /^[6-9]\d{9}$/

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(-10)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

/**
 * "Continue with Phone" — Firebase Phone Authentication (native, no
 * reCAPTCHA — see lib/firebaseAuth.ts). Additive to LoginScreen's
 * email/password login, never a replacement. On success, signIn() flips the
 * root layout into its authenticated state; app/_layout.tsx's redirect
 * effect sends the buyer to /complete-profile or the dashboard depending on
 * `profileComplete` — no manual navigation needed here, same pattern as
 * LoginScreen/RegisterScreen.
 */
export function PhoneLoginScreen() {
  const { signIn } = useAuth()

  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const firebaseReady = isFirebaseAuthAvailable()

  const handleSendOtp = async () => {
    setError('')
    const normalized = normalizePhone(phone)
    if (!PHONE_PATTERN.test(normalized)) {
      setError('Enter a valid 10-digit Indian mobile number.')
      return
    }

    setBusy(true)
    try {
      const result = await sendOtp(`+91${normalized}`)
      setConfirmation(result)
      setPhone(normalized)
      setCode('')
      setStep('otp')
    } catch (err) {
      setError(firebaseErrorMessage(err, "Couldn't send the code. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyOtp = async () => {
    setError('')
    if (!confirmation) {
      setError('Session expired — please request a new code.')
      setStep('phone')
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.')
      return
    }

    setBusy(true)
    try {
      const idToken = await confirmOtp(confirmation, code)
      const res = await loginBuyerFirebase(idToken)
      await signIn(res.token, res.user)
    } catch (err) {
      setError(firebaseErrorMessage(err, 'Invalid or expired code. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setBusy(true)
    try {
      const result = await sendOtp(`+91${phone}`)
      setConfirmation(result)
      setCode('')
    } catch (err) {
      setError(firebaseErrorMessage(err, "Couldn't resend the code. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  if (!firebaseReady) {
    return (
      <Screen scroll>
        <ScreenHeader title="Verify Your Phone Number" backFallback="/login" />
        <View style={styles.form}>
          <InlineNotice
            tone="warn"
            message="Phone-OTP login isn't available on this build yet — use email and password instead."
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen scroll>
      <ScreenHeader
        title={step === 'phone' ? 'Verify Your Phone Number' : 'Enter Verification Code'}
        backFallback="/login"
      />

      <View style={styles.form}>
        {error ? <InlineNotice tone="warn" message={error} /> : null}

        {step === 'phone' ? (
          <>
            <Text style={styles.intro}>We&apos;ll send a one-time code to verify your number.</Text>
            <TextField
              label="Mobile number"
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              maxLength={10}
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => void handleSendOtp()}
            />
            <Button
              label="Send OTP"
              onPress={() => void handleSendOtp()}
              loading={busy}
              size="lg"
              block
              style={styles.submit}
            />
          </>
        ) : (
          <>
            <Text style={styles.intro}>
              Code sent to +91 {phone}.{' '}
              <Text
                style={styles.link}
                onPress={() => {
                  setStep('phone')
                  setCode('')
                  setError('')
                }}
              >
                Change number
              </Text>
            </Text>
            <TextField
              label="6-digit code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => void handleVerifyOtp()}
            />
            <Button
              label="Verify OTP"
              onPress={() => void handleVerifyOtp()}
              loading={busy}
              size="lg"
              block
              style={styles.submit}
            />
            <TouchableOpacity onPress={() => void handleResend()} disabled={busy}>
              <Text style={styles.resendLink}>Resend OTP</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: SCREEN_PADDING },
  intro: { fontSize: 12.5, color: colors.muted, lineHeight: 19, marginBottom: spacing.lg },
  submit: { marginTop: spacing.sm },
  link: { color: colors.gold, fontWeight: '600' },
  resendLink: {
    textAlign: 'center',
    color: colors.gold,
    fontSize: 13,
    fontWeight: '500',
    marginTop: spacing.lg,
  },
})
