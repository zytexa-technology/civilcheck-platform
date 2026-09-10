import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { loginBuyer } from '../api/auth.api'
import { useAuth } from '../context/AuthContext'
import { errorCode, errorMessage } from '../lib/errors'
import { colors, SCREEN_PADDING, shadows, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { TextField } from '../components/TextField'
import { InlineNotice } from '../components/States'

export function LoginScreen() {
  const router = useRouter()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await loginBuyer(email.trim(), password)
      // signIn flips the root layout into its authenticated state, which
      // redirects to the tabs — no manual navigation needed here.
      await signIn(result.token, result.user)
    } catch (err) {
      // Signup Email Verification — send an unverified account straight to
      // the OTP screen instead of a dead-end "wrong password" error.
      if (errorCode(err) === 'EMAIL_NOT_VERIFIED') {
        router.push({ pathname: '/verify-email', params: { email: email.trim() } })
        return
      }
      setError(errorMessage(err, 'Invalid email or password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <View style={styles.brandIcon}>
          <Text style={styles.brandIconGlyph}>🏛️</Text>
        </View>
        <Text style={styles.brandName}>CivilCheck</Text>
        <Text style={styles.brandTagline}>
          Check any property&apos;s legal health before you invest.
        </Text>
      </View>

      {error ? <InlineNotice tone="warn" message={error} /> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
        returnKeyType="next"
      />

      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secureTextEntry
        editable={!loading}
        returnKeyType="go"
        onSubmitEditing={() => void handleLogin()}
      />

      <TouchableOpacity onPress={() => router.push('/forgot-password')} disabled={loading} style={styles.forgotWrap}>
        <Text style={styles.forgotLink}>Forgot password?</Text>
      </TouchableOpacity>

      <Button label="Log in" onPress={() => void handleLogin()} loading={loading} size="lg" block />

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <Button
        label="Continue with Phone"
        onPress={() => router.push('/phone-login')}
        variant="secondary"
        size="lg"
        block
        disabled={loading}
      />

      <TouchableOpacity onPress={() => router.push('/register')} disabled={loading}>
        <Text style={styles.link}>New to CivilCheck? Create an account</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        By continuing you agree to our Terms & Privacy Policy.{'\n'}
        Information service — not legal advice.
      </Text>
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
  brandIcon: {
    width: 72,
    height: 72,
    backgroundColor: colors.gold,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.glow,
  },
  brandIconGlyph: { fontSize: 36 },
  brandName: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  brandTagline: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 250,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  forgotWrap: { alignItems: 'flex-end', marginBottom: spacing.md, marginTop: -4 },
  forgotLink: { fontSize: 12.5, color: colors.muted, fontWeight: '500' },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border2 },
  dividerText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  link: {
    textAlign: 'center',
    color: colors.gold,
    fontSize: 13,
    fontWeight: '500',
    marginTop: spacing.lg,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.muted,
    marginTop: spacing.xl,
    lineHeight: 18,
  },
})
