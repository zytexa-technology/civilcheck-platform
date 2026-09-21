import { useEffect, useRef } from 'react'
import { Linking, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { adClickUrl, trackImpression, type FeedAd } from '../api/ads.api'
import { colors, radius, shadows, spacing } from '../theme'

// In-feed advertisement for the Buyer App. Labelled "ADVERTISEMENT" and laid out differently from a
// property card so it cannot be mistaken for a listing.
//
// Impression rule: counted once, when at least half of the card has been on screen for a continuous
// second. Visibility is sampled with measureInWindow (no scroll plumbing in the feed screen) and the
// sampler stops the moment the impression is sent. The server ignores repeats of the same token, so
// re-renders and retries cannot double-count.
const SAMPLE_MS = 400
const VISIBLE_RATIO = 0.5
const VISIBLE_HOLD_MS = 1000

// Cloudinary can render a still frame of a video by swapping the extension — keeps the feed light
// (no video player dependency, no autoplay cost while scrolling). Tapping opens the ad itself.
const posterFor = (ad: FeedAd) =>
  ad.creativeType === 'VIDEO' ? ad.creativeUrl.replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg') : ad.creativeUrl

export function AdFeedCard({ ad, onDismiss }: { ad: FeedAd; onDismiss: (id: string) => void }) {
  const ref = useRef<View>(null)
  const sent = useRef(false)
  const visibleSince = useRef<number | null>(null)
  const { height: windowHeight } = useWindowDimensions()

  useEffect(() => {
    const timer = setInterval(() => {
      if (sent.current) return
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (sent.current || !h) return
        const visible = Math.max(0, Math.min(y + h, windowHeight) - Math.max(y, 0))
        if (visible / h >= VISIBLE_RATIO) {
          if (visibleSince.current === null) visibleSince.current = Date.now()
          else if (Date.now() - visibleSince.current >= VISIBLE_HOLD_MS) {
            sent.current = true
            clearInterval(timer)
            void trackImpression(ad.token).catch(() => {
              sent.current = false // server never saw it; the same token is safe to retry
            })
          }
        } else {
          visibleSince.current = null
        }
      })
    }, SAMPLE_MS)
    return () => clearInterval(timer)
  }, [ad.token, windowHeight])

  const open = () => void Linking.openURL(adClickUrl(ad)).catch(() => {})

  return (
    <View ref={ref} collapsable={false} style={[styles.card, shadows.card]} accessibilityLabel="Advertisement">
      <View style={styles.head}>
        <Text style={styles.label}>ADVERTISEMENT</Text>
        <TouchableOpacity onPress={() => onDismiss(ad.id)} accessibilityRole="button" accessibilityLabel="Dismiss this advertisement" hitSlop={10}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={open} activeOpacity={0.9} accessibilityRole="link">
        <Image source={{ uri: posterFor(ad) }} style={styles.media} contentFit="cover" />
        {ad.creativeType === 'VIDEO' ? (
          <View style={styles.play}>
            <Text style={styles.playText}>▶</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Text style={styles.business}>{ad.businessName}</Text>
      <Text style={styles.title}>{ad.title}</Text>
      <Text style={styles.desc}>{ad.description}</Text>
      <TouchableOpacity style={styles.cta} onPress={open} accessibilityRole="button">
        <Text style={styles.ctaText}>{ad.ctaText}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: colors.muted, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  close: { fontSize: 18, color: colors.muted },
  media: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  play: { position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  playText: { color: '#fff', fontSize: 14 },
  business: { fontSize: 11.5, color: colors.muted, marginTop: spacing.sm },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 },
  desc: { fontSize: 13, color: colors.text, lineHeight: 19, marginTop: 4 },
  cta: { alignSelf: 'flex-start', backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9, marginTop: spacing.sm },
  ctaText: { color: colors.onGold, fontWeight: '700', fontSize: 13 },
})
