import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '../theme'
import type { VerificationRequestStatus } from '../types/api'

const STEPS: { key: string; label: string; reachedAt: VerificationRequestStatus[] }[] = [
  { key: 'requested', label: 'Requested', reachedAt: ['OPEN', 'ACCEPTED', 'ADVANCE_PAYMENT_PENDING', 'ADVANCE_PAID', 'IN_PROGRESS', 'COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED'] },
  { key: 'accepted', label: 'Professional accepted', reachedAt: ['ACCEPTED', 'ADVANCE_PAYMENT_PENDING', 'ADVANCE_PAID', 'IN_PROGRESS', 'COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED'] },
  { key: 'advance', label: 'Advance payment', reachedAt: ['ADVANCE_PAID', 'IN_PROGRESS', 'COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED'] },
  { key: 'progress', label: 'Verification in progress', reachedAt: ['IN_PROGRESS', 'COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED'] },
  { key: 'completed', label: 'Findings submitted', reachedAt: ['COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED'] },
  { key: 'final', label: 'Final payment', reachedAt: ['FULLY_PAID', 'REPORT_UNLOCKED'] },
  { key: 'unlocked', label: 'Report unlocked', reachedAt: ['REPORT_UNLOCKED'] },
]

/**
 * Vertical progress tracker for the verification lifecycle — deliberately
 * vertical, not the horizontal row the brief sketches, so it never overflows
 * on a narrow phone. Steps reflect the real backend status machine
 * (verification.service.ts) — "current" is whichever reached step is last,
 * not a separately-maintained index that could drift from the real status.
 */
export function VerificationStepper({ status }: { status: VerificationRequestStatus }) {
  if (status === 'CANCELLED') {
    return (
      <View style={styles.cancelledWrap}>
        <Text style={styles.cancelledIcon}>✋</Text>
        <Text style={styles.cancelledText}>This request was cancelled</Text>
      </View>
    )
  }

  let currentIndex = -1
  STEPS.forEach((step, i) => {
    if (step.reachedAt.includes(status)) currentIndex = i
  })

  return (
    <View style={styles.wrap}>
      {STEPS.map((step, i) => {
        const done = i <= currentIndex
        const isCurrent = i === currentIndex
        const isLast = i === STEPS.length - 1
        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, done && styles.dotDone, isCurrent && styles.dotCurrent]}>
                {done && !isCurrent ? <Text style={styles.dotCheck}>✓</Text> : null}
              </View>
              {!isLast ? <View style={[styles.line, done && i < currentIndex && styles.lineDone]} /> : null}
            </View>
            <Text style={[styles.label, done && styles.labelDone, isCurrent && styles.labelCurrent]}>
              {step.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const DOT = 18

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rail: { width: DOT, alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.surface3,
    borderWidth: 2,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.gold, borderColor: colors.gold },
  dotCurrent: { backgroundColor: colors.bg, borderColor: colors.gold },
  dotCheck: { fontSize: 10, fontWeight: '700', color: colors.onGold },
  line: { width: 2, flex: 1, minHeight: 22, backgroundColor: colors.border2 },
  lineDone: { backgroundColor: colors.gold },
  label: {
    flex: 1,
    fontSize: 12.5,
    color: colors.muted,
    marginLeft: spacing.sm,
    paddingBottom: 22,
  },
  labelDone: { color: colors.text, fontWeight: '500' },
  labelCurrent: { color: colors.gold, fontWeight: '700' },
  cancelledWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cancelledIcon: { fontSize: 18 },
  cancelledText: { fontSize: 13, fontWeight: '600', color: colors.red },
})
