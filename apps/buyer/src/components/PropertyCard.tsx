import { useState } from 'react'
import { Alert, Linking, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import * as ExpoLinking from 'expo-linking'
import { useRouter } from 'expo-router'
import { toggleLike, toggleSave } from '../api/feed.api'
import { useAuth } from '../context/AuthContext'
import { colors, radius, shadows, spacing } from '../theme'
import { errorMessage } from '../lib/errors'
import { formatDate, formatDistance, formatRupees, haversineDistanceKm, humanize, riskTone, sellerBadgeLabel } from '../lib/format'
import type { Coordinates } from '../lib/geolocation'
import { AuthRequiredSheet } from './AuthRequiredSheet'
import { CommentSheet } from './CommentSheet'
import { Pill } from './Pill'
import type { FeedItem, FeedTargetType, FreePreviewProperty, OwnerProperty, ReporterPost } from '../types/api'

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
  /** Buyer Mobile Phase 4B — set only by a screen that has its own "Use my
   * location" control (SearchScreen); undefined everywhere else (Home,
   * Saved Properties), matching Buyer Web's identical optional prop exactly
   * — Web's own Home feed/Saved Properties have no location feature either. */
  buyerCoords?: Coordinates | null
}

export function PropertyCard({ property, onPress, buyerCoords }: PropertyCardProps) {
  const tone = riskTone(property.riskBadge)
  const location = property.tehsil ? `${property.tehsil}, ${property.city}` : property.city
  const cover = property.images[0] ?? property.videos[0]
  const distanceLabel = buyerCoords
    ? formatDistance(haversineDistanceKm(buyerCoords.latitude, buyerCoords.longitude, property.latitude, property.longitude))
    : null

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
              {distanceLabel ? ` · ${distanceLabel}` : ''}
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
  /** Buyer Mobile Phase 4B — same optional, screen-supplied prop as PropertyCard above. */
  buyerCoords?: Coordinates | null
}

export function OwnerPropertyCard({ property, onPress, buyerCoords }: OwnerPropertyCardProps) {
  const cover = property.images[0] ?? property.videos[0]
  const distanceLabel = buyerCoords
    ? formatDistance(haversineDistanceKm(buyerCoords.latitude, buyerCoords.longitude, property.latitude, property.longitude))
    : null

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
              {distanceLabel ? ` · ${distanceLabel}` : ''}
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

// ─────────────────────────────────────────────────────────────────────────────
// Buyer Mobile Phase 2 — the merged Home feed's card (GET /properties/feed,
// `getPropertyFeed`). Mirrors Buyer Web's own FeedCard.tsx: a feed item is
// its own presentational shape (FeedItem), not the richer per-detail-page
// types (FreePreviewProperty/OwnerProperty/ReporterPost) above — Web itself
// doesn't reuse PropertyCard/OwnerPropertyCard/ReporterPostCard for its Home
// feed either, for the same reason. Renders EXPERT_REPORT/OWNER_LISTING with
// the same visual language as PropertyCard/OwnerPropertyCard (reusing
// CardActions below), and REPORTER_POST with the same layout/Verify CTA as
// ReporterPostCard — informational only, never a Property, never a detail
// route, `onPress` is simply unused for it.
// ─────────────────────────────────────────────────────────────────────────────

interface FeedItemCardProps {
  item: FeedItem
  /** Ignored for REPORTER_POST — a Reporter Post has no detail route. */
  onPress: () => void
  /** Buyer Mobile Phase 3 — bubbles a like/save/comment-count change back up
   * to the caller's own feed array, same as Buyer Web's FeedCard `onChange`.
   * This component holds no local copy of isLiked/likeCount/etc itself — it
   * always renders straight from `item`, so a parent-level refresh (e.g.
   * pull-to-refresh) can never be shadowed by stale local state. */
  onChange?: (next: FeedItem) => void
}

/** FeedItem.source -> the engagement endpoints' own target-type union — a
 * DIFFERENT union from `source`, not the same values renamed. */
function targetTypeFor(source: FeedItem['source']): FeedTargetType {
  if (source === 'EXPERT_REPORT') return 'LISTING'
  if (source === 'OWNER_LISTING') return 'PROPERTY'
  return 'REPORTER_POST'
}

// Share (Final Parity Batch, Task 4) — Buyer Web's FeedCard.tsx shares
// `${window.location.origin}${detailHref}`, a Buyer Web URL. Mobile has no
// equivalent public web domain configured anywhere in this project (no
// EXPO_PUBLIC_WEB_URL, no apps/buyer-web deployment URL checked into either
// app), and fabricating one would be exactly the "invent an incompatible
// URL structure" this task says not to do. What the project DOES already
// have is this app's own configured deep-link scheme (app.json's
// "scheme": "civilcheckbuyer", wired to Expo Router's file-based routes by
// default) — ExpoLinking.createURL builds a correct, environment-aware link
// against it (civilcheckbuyer://report/<id>, etc). A Reporter Post has no
// detail route on Web either, so it links to the feed the same way Web's
// `shareUrl` falls back to '/reporter-feed'.
function detailPath(item: FeedItem): string | null {
  if (item.source === 'EXPERT_REPORT') return `report/${item.id}`
  if (item.source === 'OWNER_LISTING') return `owner-properties/${item.id}`
  return null
}

function shareUrl(item: FeedItem): string {
  return ExpoLinking.createURL(detailPath(item) ?? 'reporter-feed')
}

export function FeedItemCard({ item, onPress, onChange }: FeedItemCardProps) {
  const router = useRouter()
  const { status } = useAuth()
  const cover = item.images[0] ?? item.videos[0]
  const location = item.tehsil ? `${item.tehsil}, ${item.city}` : item.city

  // One shared in-flight flag for both Like and Save, matching Buyer Web's
  // own FeedCard exactly (a single `busy` state there too) — simplest way to
  // guarantee a rapid double-tap on either action can never fire a second
  // request while the first is still pending.
  const [busy, setBusy] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  // Guest browsing (Final Parity Batch, Task 1) — Home's merged feed is
  // public, but Like/Save are account-linked writes, exactly like Buyer
  // Web's FeedCard gates them via AuthRequiredModal. `authAction` holds the
  // sheet's copy (e.g. "like this property") while it's open, null when closed.
  const [authAction, setAuthAction] = useState<string | null>(null)

  const handleLike = () => {
    if (status !== 'authenticated') {
      setAuthAction('like this property')
      return
    }
    if (busy) return
    setBusy(true)
    toggleLike(targetTypeFor(item.source), item.id)
      .then((res) => onChange?.({ ...item, isLiked: res.liked, likeCount: res.likeCount }))
      .catch((err) => Alert.alert("Couldn't update like", errorMessage(err)))
      .finally(() => setBusy(false))
  }

  const handleSave = () => {
    if (status !== 'authenticated') {
      setAuthAction('save this property')
      return
    }
    if (busy) return
    setBusy(true)
    toggleSave(targetTypeFor(item.source), item.id)
      .then((res) => onChange?.({ ...item, isSaved: res.saved, saveCount: res.saveCount }))
      .catch((err) => Alert.alert("Couldn't update save", errorMessage(err)))
      .finally(() => setBusy(false))
  }

  const authSheet = (
    <AuthRequiredSheet visible={authAction !== null} onClose={() => setAuthAction(null)} action={authAction ?? 'continue'} />
  )

  // Share — browsing-level action, never gated (Web's own Share never
  // requires an account either). A cancelled native share sheet resolves
  // normally (dismissedAction), not a rejection, so only a genuine failure
  // shows an alert.
  const handleShare = async () => {
    try {
      const link = shareUrl(item)
      await Share.share({
        title: item.title,
        message: location ? `${item.title} — ${location}\n${link}` : `${item.title}\n${link}`,
        url: link,
      })
    } catch (err) {
      Alert.alert("Couldn't share", errorMessage(err))
    }
  }

  const socialRow = (
    <View style={styles.socialRow}>
      <TouchableOpacity
        style={styles.socialBtn}
        onPress={handleLike}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={item.isLiked ? 'Unlike' : 'Like'}
      >
        <Text style={[styles.socialBtnText, item.isLiked && styles.socialBtnTextActive]}>
          {item.isLiked ? '❤️' : '🤍'} {item.likeCount}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.socialBtn}
        onPress={() => setCommentsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Comments"
      >
        <Text style={styles.socialBtnText}>💬 {item.commentCount}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.socialBtn}
        onPress={() => void handleShare()}
        accessibilityRole="button"
        accessibilityLabel="Share"
      >
        <Text style={styles.socialBtnText}>↗️ Share</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.socialBtn}
        onPress={handleSave}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={item.isSaved ? 'Unsave' : 'Save'}
      >
        <Text style={[styles.socialBtnText, item.isSaved && styles.socialBtnTextActive]}>
          {item.isSaved ? '🔖' : '📑'} Save
        </Text>
      </TouchableOpacity>
    </View>
  )

  const commentSheet = (
    <CommentSheet
      visible={commentsOpen}
      onClose={() => setCommentsOpen(false)}
      targetType={targetTypeFor(item.source)}
      targetId={item.id}
      commentCount={item.commentCount}
      onCommentPosted={() => onChange?.({ ...item, commentCount: item.commentCount + 1 })}
    />
  )

  if (item.source === 'REPORTER_POST') {
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
          <Text style={styles.postTitle}>{item.title}</Text>
          {location ? <Text style={styles.postMeta}>📍 {location}</Text> : null}
          <View style={styles.postFoot}>
            <View style={styles.uploaderTagStatic}>
              <Text style={styles.uploaderTagText}>📝 {humanize(item.uploadedBy)}</Text>
            </View>
            <Text style={styles.postSource}>{formatDate(item.createdAt)}</Text>
          </View>

          {/* Same Discovery handoff as ReporterPostCard — never a real
              listingId/propertyId, the buyer still picks a property type
              and refines the address themselves. Social engagement and
              verification are deliberately separate actions. */}
          <TouchableOpacity
            style={styles.postVerifyBtn}
            onPress={() =>
              router.push({
                pathname: '/discovery-request/new',
                params: { address: item.title ?? '', city: item.city ?? '', tehsil: item.tehsil ?? '' },
              })
            }
            accessibilityRole="button"
          >
            <Text style={styles.postVerifyBtnText}>🔎 Verify This Property</Text>
          </TouchableOpacity>
        </View>
        {socialRow}
        {commentSheet}
        {authSheet}
      </View>
    )
  }

  const tone = item.riskBadge ? riskTone(item.riskBadge) : null

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
              <Text style={styles.uploaderTagText}>{humanize(item.uploadedBy)}</Text>
            </View>
            {tone ? <Pill tone={tone} /> : null}
          </View>

          <View style={styles.scrim}>
            <Text style={styles.name} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.meta}>
              📍 {location ?? 'Location not listed'} · 👁 {item.views ?? 0}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.foot}>
        <View style={styles.grow}>
          <Text style={styles.seller}>{sellerBadgeLabel(item.sellerBadge)}</Text>
          {item.isFree || item.price == null ? (
            <Text style={styles.freeLabel}>Free to view</Text>
          ) : (
            <Text style={styles.price}>{formatRupees(item.price)}</Text>
          )}
        </View>
        <CardActions
          onDetails={onPress}
          mapUrl={item.mapUrl}
          source={item.source === 'EXPERT_REPORT' ? 'LISTING' : 'PROPERTY'}
          targetId={item.id}
        />
      </View>

      {socialRow}
      {commentSheet}
      {authSheet}
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
  // ─── Social engagement row (Buyer Mobile Phase 3) ───────────────────────
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  socialBtn: { paddingVertical: 6, paddingHorizontal: 4, minWidth: 44, minHeight: 32, justifyContent: 'center' },
  socialBtnText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  socialBtnTextActive: { color: colors.gold },
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
