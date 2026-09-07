import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing } from '../theme'
import { Button } from './Button'

// ─────────────────────────────────────────────────────────────────────────────
// The three things a data-backed view can be showing instead of data.
//
// Every list screen used to hand-roll these as bare <Text> with slightly
// different copy and no retry affordance — an error was indistinguishable from
// an empty result.
// ─────────────────────────────────────────────────────────────────────────────

export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.block}>
      <ActivityIndicator color={colors.gold} />
      {label ? <Text style={styles.caption}>{label}</Text> : null}
    </View>
  )
}

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.description}>{message}</Text>
      {onRetry ? (
        <Button label="Try again" onPress={onRetry} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  )
}

/** Inline banner for a non-blocking problem, where content is still shown. */
export function InlineNotice({ message, tone = 'info' }: { message: string; tone?: 'info' | 'warn' }) {
  const palette =
    tone === 'warn'
      ? { bg: colors.amberDim, border: colors.amberBorder, text: colors.amber }
      : { bg: colors.blueDim, border: colors.blueBorder, text: colors.blue }

  return (
    <View
      style={[styles.notice, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <Text style={[styles.noticeText, { color: palette.text }]}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  icon: { fontSize: 30 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },
  description: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  caption: { fontSize: 11.5, color: colors.muted, marginTop: spacing.sm },
  action: { marginTop: spacing.sm },
  notice: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeText: { fontSize: 11.5, lineHeight: 17, fontWeight: '500' },
})
