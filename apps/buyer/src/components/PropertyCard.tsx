import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { colors, radius, shadows, spacing } from '../theme'
import { formatDate, formatRupees, humanize, riskTone, sellerBadgeLabel } from '../lib/format'
import { Pill } from './Pill'
import type { FreePreviewProperty, OwnerProperty, ReporterPost } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Media-first property card — one cover image (first of images/videos, a
// property always has at least a placeholder), risk/verified status and
// uploader attribution overlaid on the image itself, then a compact action
// row (View details / Map / Verify). Replaces the earlier text-only list
// row: the data (images[], videos[], mapUrl) already existed on both types
// since Phase 2, it just was never rendered — expo-image was already an
// installed dependency with nothing in the app actually using it.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_BLURHASH = 'L6PZfSjE.AyE_3t7t7R**0o#DgR4'

interface PropertyCardProps {
  property: FreePreviewProperty
  onPress: () => void
}

export function PropertyCard({ property, onPress }: PropertyCardProps) {
  const tone = riskTone(property.riskBadge)
  const location = property.tehsil ? `${property.tehsil}, ${property.city}` : property.city
  const cover = property.images[0] ?? property.videos[0]

  return (
    <View style={[styles.card, shadows.card]}>
      <TouchableOpacity onPress={onPress} accessibilityRole="button" activeOpacity={0.9}>
        <View style={styles.mediaWrap}>
          {cover ? (
            <Image
              source={cover}
              style={styles.media}
              contentFit="cover"
              placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
              transition={200}
            />
          ) : (
            <View style={[styles.media, styles.mediaFallback]}>
              <Text style={styles.mediaFallbackText}>🏠</Text>
            </View>
          )}

          <View style={styles.mediaTopRow}>
            <View style={styles.uploaderTag}>
              <Text style={styles.uploaderTagText}>{humanize(property.uploadedBy)}</Text>
            </View>
            <Pill tone={tone} />
          </View>

          <View style={styles.scrim}>
            <Text style={styles.name} numberOfLines={2}>
              {property.address}
            </Text>
            <Text style={styles.meta}>
              📍 {location} · 👁 {property.views ?? 0}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.foot}>
        <View style={styles.grow}>
          <Text style={styles.seller}>{sellerBadgeLabel(property.sellerBadge)}</Text>
          <Text style={styles.price}>{formatRupees(property.price)}</Text>
        </View>
        <CardActions onDetails={onPress} mapUrl={property.mapUrl} source="LISTING" targetId={property.id} />
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner properties are a different product: owner self-published, free to
// view, nothing to unlock. The card deliberately looks unlike the paid
// one — no price, no risk badge — so the two are never confused. Admin
// approval gates visibility only — it is never presented as a "Verified"
// claim, so this card never renders a verification badge.
// ─────────────────────────────────────────────────────────────────────────────

interface OwnerPropertyCardProps {
  property: OwnerProperty
  onPress: () => void
}

export function OwnerPropertyCard({ property, onPress }: OwnerPropertyCardProps) {
  const cover = property.images[0] ?? property.videos[0]

  return (
    <View style={[styles.card, shadows.card]}>
      <TouchableOpacity onPress={onPress} accessibilityRole="button" activeOpacity={0.9}>
        <View style={styles.mediaWrap}>
          {cover ? (
            <Image
              source={cover}
              style={styles.media}
              contentFit="cover"
              placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
              transition={200}
            />
          ) : (
            <View style={[styles.media, styles.mediaFallback]}>
              <Text style={styles.mediaFallbackText}>🏠</Text>
            </View>
          )}

          <View style={styles.mediaTopRow}>
            <View style={styles.uploaderTag}>
              <Text style={styles.uploaderTagText}>{humanize(property.uploadedBy)}</Text>
            </View>
          </View>

          <View style={styles.scrim}>
            <Text style={styles.name} numberOfLines={2}>
              {property.title}
            </Text>
            <Text style={styles.meta}>
              📍 {property.city ?? 'Location not listed'} · {property.area}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <HealthBar value={property.health} />

      <View style={styles.foot}>
        <View style={styles.grow}>
          <Text style={styles.seller}>
            {property.ownerName ? `👤 ${property.ownerName}` : 'Listed by owner'}
          </Text>
          <Text style={styles.freeLabel}>Free to view</Text>
        </View>
        <CardActions onDetails={onPress} mapUrl={property.mapUrl} source="PROPERTY" targetId={property.id} />
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporter posts are informational content, not a property listing — this
// card must look and behave nothing like PropertyCard/OwnerPropertyCard: no
// price, no risk badge, no health bar, no verify/details actions, no
// verification claim of any kind. Just the photo, a caption and clear
// "Reported by CivilCheck Reporter" attribution, for a scrolling feed.
// ─────────────────────────────────────────────────────────────────────────────

export function ReporterPostCard({ post }: { post: ReporterPost }) {
  const router = useRouter()
  const cover = post.images[0]
  const location = post.tehsil ? `${post.tehsil}, ${post.city}` : post.city

  return (
    <View style={[styles.postCard, shadows.card]}>
      {cover ? (
        <Image
          source={cover}
          style={styles.postMedia}
          contentFit="cover"
          placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
          transition={200}
        />
      ) : (
        <View style={[styles.postMedia, styles.mediaFallback]}>
          <Text style={styles.mediaFallbackText}>📰</Text>
        </View>
      )}
      <View style={styles.postBody}>
        {post.title ? <Text style={styles.postTitle}>{post.title}</Text> : null}
        {post.description ? <Text style={styles.postDesc}>{post.description}</Text> : null}
        {location ? <Text style={styles.postMeta}>📍 {location}</Text> : null}
        <View style={styles.postFoot}>
          <View style={styles.uploaderTagStatic}>
            <Text style={styles.uploaderTagText}>📝 {post.reportedBy}</Text>
          </View>
          <Text style={styles.postSource}>
            {post.sourceName ? `${post.sourceName} · ` : ''}
            {formatDate(post.postedAt)}
          </Text>
        </View>

        {/* Reporter posts are informational only, never a real Property or
            listing — this hands off to the Property Discovery flow (a plain
            desired-location VerificationRequest), never to a real
            listingId/propertyId. The buyer still has to pick a property type
            and refine the address themselves; ReporterPost carries neither. */}
        <TouchableOpacity
          style={styles.postVerifyBtn}
          onPress={() =>
            router.push({
              pathname: '/discovery-request/new',
              params: { address: post.title ?? '', city: post.city ?? '', tehsil: post.tehsil ?? '' },
            })
          }
          accessibilityRole="button"
        >
          <Text style={styles.postVerifyBtnText}>🔎 Verify This Property</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

/** View details / View map / Verify — shared by both card variants. */
function CardActions({
  onDetails,
  mapUrl,
  source,
  targetId,
}: {
  onDetails: () => void
  mapUrl: string | null
  source: 'LISTING' | 'PROPERTY'
  targetId: string
}) {
  const router = useRouter()

  return (
    <View style={styles.actions}>
      {mapUrl ? (
        <TouchableOpacity
          style={styles.actionIcon}
          onPress={() => void Linking.openURL(mapUrl)}
          accessibilityRole="button"
          accessibilityLabel="View on map"
        >
          <Text style={styles.actionIconText}>🗺️</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={styles.actionVerify}
        onPress={() => router.push(source === 'LISTING' ? `/report/${targetId}` : `/owner-properties/${targetId}`)}
        accessibilityRole="button"
      >
        <Text style={styles.actionVerifyText}>🔎 Verify</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionPrimary} onPress={onDetails} accessibilityRole="button">
        <Text style={styles.actionPrimaryText}>Details</Text>
      </TouchableOpacity>
    </View>
  )
}

/** Property.health is a 0-100 document/verification score set by the owner flow. */
function HealthBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  const colour = clamped >= 70 ? colors.green : clamped >= 40 ? colors.amber : colors.red

  return (
    <View style={styles.healthWrap}>
      <View style={styles.healthRow}>
        <Text style={styles.healthLabel}>Document health</Text>
        <Text style={[styles.healthValue, { color: colour }]}>{clamped}%</Text>
      </View>
      <View style={styles.healthTrack}>
        <View style={[styles.healthFill, { width: `${clamped}%`, backgroundColor: colour }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  grow: { flex: 1 },
  mediaWrap: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.surface2,
  },
  media: { width: '100%', height: '100%' },
  mediaFallback: { alignItems: 'center', justifyContent: 'center' },
  mediaFallbackText: { fontSize: 34, opacity: 0.35 },
  mediaTopRow: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  uploaderTag: {
    backgroundColor: 'rgba(10,12,16,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
  },
  uploaderTagText: { fontSize: 10, fontWeight: '700', color: colors.text },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,12,16,0.78)',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 9,
  },
  name: { fontSize: 13.5, fontWeight: '700', color: '#fff', lineHeight: 18 },
  meta: { fontSize: 10.5, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  seller: { fontSize: 10.5, color: colors.muted },
  price: { fontSize: 15, fontWeight: '700', color: colors.gold, marginTop: 2 },
  freeLabel: { fontSize: 11, fontWeight: '600', color: colors.green, marginTop: 2 },
  postCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  postMedia: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surface2 },
  postBody: { padding: spacing.md },
  postTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text, marginBottom: 4 },
  postDesc: { fontSize: 12, color: colors.muted, lineHeight: 17, marginBottom: 6 },
  postMeta: { fontSize: 11, color: colors.muted, marginBottom: spacing.sm },
  postFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  postSource: { fontSize: 10.5, color: colors.dim },
  postVerifyBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.goldDim,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  postVerifyBtnText: { fontSize: 11, fontWeight: '700', color: colors.gold },
  uploaderTagStatic: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
  },
  healthWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  healthLabel: { fontSize: 10, color: colors.muted },
  healthValue: { fontSize: 10, fontWeight: '700' },
  healthTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface3,
    overflow: 'hidden',
  },
  healthFill: { height: '100%', borderRadius: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconText: { fontSize: 14 },
  actionVerify: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.goldDim,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  actionVerifyText: { fontSize: 11, fontWeight: '700', color: colors.gold },
  actionPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.gold,
  },
  actionPrimaryText: { fontSize: 11, fontWeight: '700', color: colors.onGold },
})
