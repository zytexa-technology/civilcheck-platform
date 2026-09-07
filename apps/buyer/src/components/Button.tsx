import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { colors, radius, spacing } from '../theme'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

interface ButtonProps {
  label: string
  onPress?: () => void
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  /** Stretch to fill the parent's cross axis. */
  block?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  block = false,
  style,
}: ButtonProps) {
  const inactive = disabled || loading

  return (
    <TouchableOpacity
      style={[
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        block && styles.block,
        inactive && styles.inactive,
        style,
      ]}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onGold : colors.text} />
      ) : (
        <Text style={[styles.label, labelStyles[variant], size === 'lg' && styles.labelLg]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

/** Row of buttons that share the available width evenly. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  block: { width: '100%' },
  inactive: { opacity: 0.55 },
  label: { fontSize: 13, fontWeight: '700' },
  labelLg: { fontSize: 14.5 },
  row: { flexDirection: 'row', gap: spacing.sm },
})

const sizeStyles: Record<Size, ViewStyle> = {
  md: { paddingVertical: 12 },
  lg: { paddingVertical: 15 },
}

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.gold },
  secondary: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.border2,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: {
    backgroundColor: colors.redDim,
    borderWidth: 1.5,
    borderColor: colors.redBorder,
  },
}

const labelStyles: Record<Variant, { color: string }> = {
  primary: { color: colors.onGold },
  secondary: { color: colors.text },
  ghost: { color: colors.gold },
  danger: { color: colors.red },
}
