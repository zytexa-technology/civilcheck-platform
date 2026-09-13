import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getDisclaimer } from '../api/content.api'
import { errorMessage } from '../lib/errors'
import { colors, SCREEN_PADDING, spacing } from '../theme'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorState, LoadingState } from '../components/States'

// Mandatory Terms & Conditions acceptance system — this is now the general
// platform Terms & Conditions (Content Control Disclaimer key
// "terms-and-conditions"), matching Buyer Web's identical Terms.tsx exactly
// (same backend, same content). The narrower, 7-day-claim-window-specific
// disclaimer this screen used to show (key "verification-terms") is not
// removed — it's still on file and still served for any future contextual
// use — it's simply superseded here by the general Terms, whose own
// "7-Day Claim Window" section covers the same ground. See
// apps/api/scripts/seed-legal-content.ts for the initial seed.
const DISCLAIMER_KEY = 'terms-and-conditions'

export function TermsScreen() {
  const [title, setTitle] = useState('Terms & Conditions')
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
      setError(errorMessage(err, "Couldn't load the Terms & Conditions."))
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
