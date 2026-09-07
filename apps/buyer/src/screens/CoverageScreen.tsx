import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { getCoverage } from '../api/content.api'
import { errorMessage } from '../lib/errors'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Card } from '../components/Card'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { CoverageArea } from '../types/api'

/** Cities and tehsils CivilCheck has verified experts in (Content Control). */
export function CoverageScreen() {
  const router = useRouter()

  const [coverage, setCoverage] = useState<CoverageArea[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await getCoverage()
      setCoverage(response.coverage)
    } catch (err) {
      setError(errorMessage(err, "Couldn't load our service areas."))
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await load()
      setLoading(false)
    })()
  }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <Screen scroll refreshing={refreshing} onRefresh={() => void handleRefresh()}>
      <ScreenHeader title="Where we operate" backFallback="/profile" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void handleRefresh()} />
      ) : coverage.length === 0 ? (
        <EmptyState
          icon="📍"
          title="Service areas not published"
          description="We haven't published our coverage list yet. You can still request a custom check for any property."
          actionLabel="Request a custom check"
          onAction={() => router.push('/requests/new')}
        />
      ) : (
        <>
          <Text style={styles.intro}>
            We have verified experts in these tehsils. Outside them, a custom check may take
            longer to assign.
          </Text>

          {coverage.map((area) => (
            <Card key={`${area.state}-${area.city}`}>
              <Text style={styles.city}>{area.city}</Text>
              <Text style={styles.state}>{area.state}</Text>
              <View style={styles.tehsils}>
                {area.tehsils.map((tehsil) => (
                  <View key={tehsil} style={styles.tehsilChip}>
                    <Text style={styles.tehsilText}>{tehsil}</Text>
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  )
}


const styles = StyleSheet.create({
  intro: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    paddingHorizontal: SCREEN_PADDING,
    marginBottom: spacing.lg,
  },
  city: { fontSize: 14, fontWeight: '700', color: colors.text },
  state: { fontSize: 10.5, color: colors.muted, marginTop: 2 },
  tehsils: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
  },
  tehsilChip: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  tehsilText: { fontSize: 11, color: colors.text },
})
