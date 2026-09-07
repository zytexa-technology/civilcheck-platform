import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, spacing } from '../theme'

const STARS = [1, 2, 3, 4, 5] as const

interface StarRatingProps {
  value: number
  /** Omit to render read-only. */
  onChange?: (rating: number) => void
  size?: number
}

/** 1-5 stars. The API rejects anything outside that range (reviewCreateSchema). */
export function StarRating({ value, onChange, size = 30 }: StarRatingProps) {
  const readOnly = !onChange

  return (
    <View style={styles.row} accessibilityRole={readOnly ? 'text' : 'radiogroup'}>
      {STARS.map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onChange?.(star)}
          disabled={readOnly}
          hitSlop={6}
          accessibilityRole={readOnly ? undefined : 'radio'}
          accessibilityState={{ selected: star <= value }}
          accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
        >
          <Text style={[styles.star, { fontSize: size }, star <= value && styles.filled]}>
            {star <= value ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  star: { color: colors.dim },
  filled: { color: colors.gold },
})
