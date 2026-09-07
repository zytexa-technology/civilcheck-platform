import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getDisclaimer } from '../api/content.api'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'

// ─────────────────────────────────────────────────────────────────────────────
// Legal copy the admin publishes through Content Control, so it can be updated
// without shipping a new build.
//
// The endpoint 404s for any key that has not been published yet, which is the
// normal state on a fresh install — so a miss silently falls back to the copy
// baked in here rather than showing an error. Disclaimers are compliance text:
// something must always render.
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACKS: Record<string, string> = {
  report:
    'CivilCheck provides information gathered by independent verified professionals. This is not legal advice and does not substitute a qualified advocate’s opinion. Verify independently before any financial transaction.',
  purchase:
    'Report contents reflect public records available on the research date shown. CivilCheck does not guarantee that a property is free of disputes.',
  // Phase 4A — Reporter-sourced properties. Keep in sync with the seeded
  // Disclaimer row (key: reporter-property-disclaimer), which is the
  // admin-editable source of truth; this is only the offline/pre-publish
  // fallback.
  'reporter-property-disclaimer':
    'Please request professional verification before making any purchase decision. The platform does not guarantee the authenticity of third-party uploaded property information.',
}

const GENERIC_FALLBACK =
  'CivilCheck is an information service, not legal advice. Verify independently before any financial transaction.'

interface DisclaimerProps {
  /** Content Control key — e.g. "report". */
  disclaimerKey?: string
  /** Override both the fetched copy and the built-in fallback. */
  text?: string
}

export function Disclaimer({ disclaimerKey = 'report', text }: DisclaimerProps) {
  const [body, setBody] = useState<string>(
    text ?? FALLBACKS[disclaimerKey] ?? GENERIC_FALLBACK,
  )

  useEffect(() => {
    if (text) return

    let cancelled = false

    void (async () => {
      try {
        const { disclaimer } = await getDisclaimer(disclaimerKey)
        if (!cancelled && disclaimer.body) setBody(disclaimer.body)
      } catch {
        // Not published, or offline — the fallback already on screen stands.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [disclaimerKey, text])

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        <Text style={styles.bold}>Disclaimer: </Text>
        {body}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: SCREEN_PADDING,
    marginTop: spacing.md,
    padding: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  text: { fontSize: 10, color: colors.muted, lineHeight: 16 },
  bold: { color: colors.text, fontWeight: '700' },
})
