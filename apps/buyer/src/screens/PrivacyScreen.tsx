import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getDisclaimer } from '../api/content.api'
import { errorMessage } from '../lib/errors'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorState, LoadingState } from '../components/States'

// Mandatory Terms & Conditions / Privacy Policy acceptance system — same
// Content Control Disclaimer pattern as TermsScreen.tsx, key
// "privacy-policy". See apps/api/scripts/seed-legal-content.ts.
const DISCLAIMER_KEY = 'privacy-policy'

export function PrivacyScreen() {
  const [title, setTitle] = useState('Privacy Policy')
  const [body, setBody] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setError('')
    try {
      const res = await getDisclaimer(DISCLAIMER_KEY)
      setTitle(res.disclaimer.title)
      setBody(res.disclaimer.body)
    } catch (err) {
      setError(errorMessage(err, "Couldn't load the Privacy Policy."))
    }
  }

  useEffect(() => {
    void (async () => {
      await load()
      setLoading(false)
    })()
  }, [])

  return (
    <Screen scroll>
      <ScreenHeader title={title} backFallback="/profile" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true)
            void (async () => {
              await load()
              setLoading(false)
            })()
          }}
        />
      ) : (
        <View style={styles.body}>
          {(body ?? '').split('\n\n').map((paragraph, i) => (
            <Text key={i} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SCREEN_PADDING },
  paragraph: { fontSize: 13, color: colors.muted, lineHeight: 20, marginBottom: spacing.md },
})
