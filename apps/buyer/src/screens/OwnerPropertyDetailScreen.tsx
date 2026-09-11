import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { getOwnerPropertyById } from '../api/ownerProperty.api'
import { errorMessage, errorStatus } from '../lib/errors'
import { formatDate, humanize, sellerBadgeLabel } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Card, DetailRow, SectionCard } from '../components/Card'
import { LocationMapSection } from '../components/LocationMapSection'
import { MediaGallery } from '../components/MediaGallery'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorState, LoadingState } from '../components/States'
import { VerifyPropertyCTA } from '../components/VerifyPropertyCTA'
import type { OwnerProperty } from '../types/api'

export function OwnerPropertyDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [property, setProperty] = useState<OwnerProperty | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id) {
      setError('No property was selected.')
      return
    }

    setError('')
    try {
      const response = await getOwnerPropertyById(id)
      setProperty(response.property)
    } catch (err) {
      setError(
        errorStatus(err) === 404
          ? 'This property is no longer listed.'
          : errorMessage(err, "Couldn't load this property."),
      )
    }
  }, [id])

  useEffect(() => {
    void (async () => {
      await load()
      setLoading(false)
    })()
  }, [load])

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Owner listing" backFallback="/owner-properties" />
        <LoadingState />
      </Screen>
    )
  }

  if (error || !property) {
    return (
      <Screen>
        <ScreenHeader title="Owner listing" backFallback="/owner-properties" />
        <ErrorState
          message={error || 'Property not found.'}
          onRetry={() => {
            setLoading(true)
            void (async () => {
              await load()
              setLoading(false)
            })()
          }}
        />
      </Screen>
    )
  }

  const health = Math.max(0, Math.min(100, property.health))
  const healthColour = health >= 70 ? colors.green : health >= 40 ? colors.amber : colors.red

  return (
    <Screen scroll>
      <ScreenHeader
        title="Owner listing"
        subtitle={property.title}
        backFallback="/owner-properties"
      />

      <Card>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{humanize(property.uploadedBy)} listing</Text>
        </View>
        <Text style={styles.title}>{property.title}</Text>
        <Text style={styles.meta}>
          📍 {property.city ?? 'Location not listed'} · 👁 {property.views}
        </Text>

        <View style={styles.healthWrap}>
          <View style={styles.healthRow}>
            <Text style={styles.healthLabel}>Document health</Text>
            <Text style={[styles.healthValue, { color: healthColour }]}>{health}%</Text>
          </View>
          <View style={styles.healthTrack}>
            <View
              style={[styles.healthFill, { width: `${health}%`, backgroundColor: healthColour }]}
            />
          </View>
          <Text style={styles.healthHint}>
            How complete the owner&apos;s submitted documentation is. It is not a legal
            clearance or a CivilCheck verification.
          </Text>
        </View>
      </Card>

      <SectionCard icon="🏠" title="Property details">
        <DetailRow label="Area" value={property.area} />
        <DetailRow label="Type" value={humanize(property.propertyType)} />
        <DetailRow label="Age" value={property.age ?? '—'} />
        <DetailRow label="Address" value={property.address ?? '—'} />
        <DetailRow label="Uploaded by" value={humanize(property.uploadedBy)} />
        <DetailRow label="Listed on" value={formatDate(property.listedSince)} last />
      </SectionCard>

      <SectionCard icon="👤" iconBackground={colors.violetDim} title="Owner">
        <DetailRow label="Name" value={property.ownerName ?? '—'} />
        <DetailRow label="Badge" value={sellerBadgeLabel(property.ownerBadge)} last />
      </SectionCard>

      {property.images.length > 0 || property.videos.length > 0 ? (
        <MediaGallery images={property.images} videos={property.videos} />
      ) : null}

      <LocationMapSection
        latitude={property.latitude}
        longitude={property.longitude}
        mapUrl={property.mapUrl}
        address={property.address}
        locationLabel={property.city ?? 'the property'}
      />

      {id ? <VerifyPropertyCTA source="PROPERTY" targetId={id} /> : null}

      <View style={styles.upsell}>
        <Text style={styles.upsellTitle}>Want the legal picture too?</Text>
        <Text style={styles.upsellBody}>
          This listing covers documents the owner submitted, not court records. To check for
          civil cases, loan defaults and encumbrances, search for a paid expert report on this
          address — or request one if it isn&apos;t published yet.
        </Text>
        <Button
          label="Search paid reports"
          variant="secondary"
          onPress={() => router.push('/search')}
          style={styles.upsellButton}
        />
        <Button
          label="Request a custom check"
          variant="ghost"
          onPress={() => router.push('/requests/new')}
        />
      </View>
    </Screen>
  )
}


const styles = StyleSheet.create({
  grow: { flex: 1 },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mediaRowLast: { borderBottomWidth: 0 },
  mediaIcon: { fontSize: 18 },
  mediaName: { fontSize: 12, fontWeight: '600', color: colors.text },
  mediaHint: { fontSize: 10, color: colors.muted, marginTop: 2 },
  mediaGlyph: { fontSize: 15, color: colors.gold },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  tagText: { fontSize: 10, fontWeight: '700', color: colors.muted },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  meta: { fontSize: 11, color: colors.muted },
  healthWrap: { marginTop: spacing.lg },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  healthLabel: { fontSize: 11, color: colors.muted },
  healthValue: { fontSize: 12, fontWeight: '700' },
  healthTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface3,
    overflow: 'hidden',
  },
  healthFill: { height: '100%', borderRadius: 3 },
  healthHint: { fontSize: 10, color: colors.dim, marginTop: 6, lineHeight: 15 },
  upsell: {
    marginHorizontal: SCREEN_PADDING,
    marginTop: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.md,
  },
  upsellTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  upsellBody: {
    fontSize: 11.5,
    color: colors.muted,
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  upsellButton: { marginBottom: spacing.sm },
})
