import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { radius } from '../theme'
import type { Tone } from '../lib/format'

interface PillProps {
  tone: Tone
  /** Override the tone's own label. */
  label?: string
  style?: StyleProp<ViewStyle>
}

/** The small status chip used on cards, list rows and report headers. */
export function Pill({ tone, label, style }: PillProps) {
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }, style]}>
      <Text style={[styles.text, { color: tone.color }]}>{label ?? tone.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 10, fontWeight: '700' },
})
