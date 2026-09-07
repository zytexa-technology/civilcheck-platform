import { useState } from 'react'
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'

/**
 * Horizontal media gallery for a property's photos/videos — images open a
 * lightweight in-app lightbox; videos open in the device's player via
 * Linking, since this app has no inline video player. Renders nothing when
 * there is no media, so callers don't need their own empty-check.
 */
export function MediaGallery({ images, videos }: { images: string[]; videos: string[] }) {
  const [preview, setPreview] = useState<string | null>(null)

  if (images.length === 0 && videos.length === 0) return null

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {images.map((url, index) => (
          <TouchableOpacity
            key={url}
            onPress={() => setPreview(url)}
            accessibilityRole="button"
            accessibilityLabel={`View photo ${index + 1}`}
          >
            <Image source={url} style={styles.thumb} contentFit="cover" transition={150} />
          </TouchableOpacity>
        ))}
        {videos.map((url, index) => (
          <TouchableOpacity
            key={url}
            onPress={() => void Linking.openURL(url)}
            style={[styles.thumb, styles.videoThumb]}
            accessibilityRole="button"
            accessibilityLabel={`Play video ${index + 1}`}
          >
            <Text style={styles.playIcon}>▶</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <TouchableOpacity
          style={styles.lightbox}
          activeOpacity={1}
          onPress={() => setPreview(null)}
          accessibilityRole="button"
          accessibilityLabel="Close photo preview"
        >
          {preview ? <Image source={preview} style={styles.lightboxImage} contentFit="contain" /> : null}
          <Text style={styles.lightboxHint}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

const THUMB_SIZE = 112

const styles = StyleSheet.create({
  row: { paddingHorizontal: SCREEN_PADDING, gap: spacing.sm, paddingBottom: spacing.sm },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  playIcon: { fontSize: 26, color: colors.text },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(6,8,12,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: { width: '100%', height: '80%' },
  lightboxHint: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: colors.muted,
  },
})
