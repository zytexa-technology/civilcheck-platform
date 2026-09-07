import type { ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'

/** Plain surface panel with the app's border treatment. */
export function Card({
  children,
  style,
  inset = true,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Apply the standard screen gutter as a horizontal margin. */
  inset?: boolean
}) {
  return (
    <View style={[styles.card, inset && styles.inset, style]}>{children}</View>
  )
}

/** Card with an icon + title header, used throughout the report screens. */
export function SectionCard({
  icon,
  iconBackground = colors.surface3,
  title,
  children,
  style,
}: {
  icon: string
  iconBackground?: string
  title: string
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.card, styles.inset, styles.sectionCard, style]}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: iconBackground }]}>
          <Text style={styles.sectionIconGlyph}>{icon}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

/** Key/value row. `last` drops the divider so the card ends cleanly. */
export function DetailRow({
  label,
  value,
  valueColor,
  last = false,
  children,
}: {
  label: string
  value?: string
  valueColor?: string
  last?: boolean
  /** Renders in place of `value` — for a Pill or a pressable. */
  children?: ReactNode
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children ?? (
        <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>
          {value ?? '—'}
        </Text>
      )}
    </View>
  )
}

/** Two-column grid of small labelled facts. */
export function InfoGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View key={item.label} style={styles.gridItem}>
          <Text style={styles.gridLabel}>{item.label}</Text>
          <Text style={styles.gridValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  )
}

/** Section heading that sits outside a card. */
export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitleText}>{children}</Text>
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  inset: { marginHorizontal: SCREEN_PADDING },
  sectionCard: { paddingHorizontal: 14, paddingVertical: 0 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconGlyph: { fontSize: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 12, color: colors.muted, flexShrink: 0 },
  rowValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
    flex: 1,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: spacing.sm },
  gridItem: { width: '46%' },
  gridLabel: { fontSize: 10, color: colors.muted, marginBottom: 2 },
  gridValue: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING,
    marginBottom: spacing.md,
  },
  sectionTitleText: { fontSize: 14, fontWeight: '700', color: colors.text },
})
