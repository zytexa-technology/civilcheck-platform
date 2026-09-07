import type { ReactNode } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { colors, SCREEN_PADDING, spacing } from '../theme'

interface ScreenHeaderProps {
  title: string
  subtitle?: string
  /** Show a back chevron. Defaults to on for anything pushed onto the stack. */
  showBack?: boolean
  /**
   * Where to go when there is nothing to pop back to (deep link, cold start).
   * Typed as Href rather than string so `experiments.typedRoutes` validates it
   * against the real route tree.
   */
  backFallback?: Href
  right?: ReactNode
}

export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  backFallback = '/',
  right,
}: ScreenHeaderProps) {
  const router = useRouter()

  const handleBack = () => {
    // canGoBack() is false when this screen was opened directly by a deep link,
    // where router.back() would be a no-op and trap the user.
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace(backFallback)
    }
  }

  return (
    <View style={styles.header}>
      {showBack ? (
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backGlyph}>←</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  )
}

/** Square icon button matching the header's back control. */
export function HeaderIconButton({
  glyph,
  onPress,
  accessibilityLabel,
}: {
  glyph: string
  onPress?: () => void
  accessibilityLabel: string
}) {
  return (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.iconGlyph}>{glyph}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { fontSize: 16, color: colors.text },
  iconGlyph: { fontSize: 15 },
  titleWrap: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 11, color: colors.muted, marginTop: 1 },
})
