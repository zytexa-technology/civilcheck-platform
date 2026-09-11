import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { colors, spacing } from '../theme'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'

interface AuthRequiredSheetProps {
  visible: boolean
  onClose: () => void
  /** e.g. "like this property", "save this property", "request verification". */
  action: string
}

/**
 * The one "account required" sheet, reused for every write action a guest
 * can reach on an otherwise-public screen — Like/Save/Comment, Request
 * Verification, Unlock a report, Watch a property. Mirrors Buyer Web's
 * AuthRequiredModal.tsx (same copy, same Create Account / Log In choice);
 * browsing itself never triggers this.
 */
export function AuthRequiredSheet({ visible, onClose, action }: AuthRequiredSheetProps) {
  const router = useRouter()

  const go = (path: '/login' | '/register') => {
    onClose()
    router.push(path)
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sign in required">
      <View style={styles.wrap}>
        <Text style={styles.icon} accessibilityElementsHidden>
          🔒
        </Text>
        <Text style={styles.title}>Create an account to {action}</Text>
        <Text style={styles.body}>
          Browsing CivilCheck is always free — signing in just lets us keep this tied to your
          account.
        </Text>
        <Button label="Create Account" size="lg" block onPress={() => go('/register')} style={styles.createBtn} />
        <Button label="Log In" size="lg" variant="secondary" block onPress={() => go('/login')} />
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingBottom: spacing.sm },
  icon: { fontSize: 38, marginBottom: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 6 },
  body: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.lg,
    maxWidth: 280,
  },
  createBtn: { marginBottom: spacing.sm },
})
