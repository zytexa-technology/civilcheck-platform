import type { ReactNode } from 'react'
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme'

interface ScreenProps {
  children: ReactNode
  /** Wrap the content in a ScrollView. Off for screens that own their own list. */
  scroll?: boolean
  /** Supplying this adds pull-to-refresh. Only meaningful with `scroll`. */
  onRefresh?: () => void
  refreshing?: boolean
  /** Pinned below the scroll area — e.g. a paywall CTA that must stay visible. */
  footer?: ReactNode
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
}

/**
 * The page shell every screen sits in.
 *
 * Screens used to hardcode `paddingTop: 50` to clear the status bar, which is
 * wrong on devices with a different safe area (and on Android, where it is
 * usually far too much). This reads the real inset instead.
 */
export function Screen({
  children,
  scroll = false,
  onRefresh,
  refreshing = false,

  footer,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets()

  if (!scroll) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }, style]}>{children}</View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }, style]}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          { paddingBottom: insets.bottom + 24 },
          contentContainerStyle,
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.gold}
              colors={[colors.gold]}
              progressBackgroundColor={colors.surface}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>

      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  footer: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
})
