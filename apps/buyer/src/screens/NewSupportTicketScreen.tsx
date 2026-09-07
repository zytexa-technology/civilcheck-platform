import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { createSupportTicket } from '../api/support.api'
import { errorMessage } from '../lib/errors'
import { humanize } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { InlineNotice } from '../components/States'
import { TextField } from '../components/TextField'
import type { SupportTicketCategory } from '../types/api'

const CATEGORIES: SupportTicketCategory[] = [
  'ACCOUNT',
  'PROPERTY',
  'VERIFICATION',
  'PAYMENT',
  'CANCELLATION',
  'CLAIM',
  'PLATFORM',
  'OTHER',
]

const MIN_MESSAGE_LENGTH = 10

export function NewSupportTicketScreen() {
  const router = useRouter()

  const [category, setCategory] = useState<SupportTicketCategory>('ACCOUNT')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = subject.trim().length >= 3 && message.trim().length >= MIN_MESSAGE_LENGTH

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const response = await createSupportTicket({
        category,
        subject: subject.trim(),
        message: message.trim(),
      })
      router.replace(`/support/${response.ticket.id}`)
    } catch (err) {
      setError(errorMessage(err, "Couldn't create your ticket. Please try again."))
      setSubmitting(false)
    }
  }

  return (
    <Screen scroll>
      <ScreenHeader title="New support ticket" backFallback="/support" />

      <View style={styles.form}>
        <Text style={styles.intro}>
          Our AI assistant answers most questions right away. If it can&apos;t help, you can ask
          to talk to a human at any point in the conversation.
        </Text>

        {error ? <InlineNotice tone="warn" message={error} /> : null}

        <Text style={styles.label}>What&apos;s this about?</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((entry) => {
            const active = category === entry
            return (
              <TouchableOpacity
                key={entry}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCategory(entry)}
                disabled={submitting}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {humanize(entry)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <TextField
          label="Subject"
          value={subject}
          onChangeText={setSubject}
          placeholder="e.g. Can't verify my phone number"
          editable={!submitting}
        />

        <TextField
          label="Tell us more"
          value={message}
          onChangeText={setMessage}
          placeholder="Describe your question or issue in detail"
          multiline
          editable={!submitting}
          hint={`Minimum ${MIN_MESSAGE_LENGTH} characters.`}
        />

        <Button
          label="Start conversation"
          onPress={() => void handleSubmit()}
          loading={submitting}
          disabled={!canSubmit}
          size="lg"
          block
          style={styles.submit}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: SCREEN_PADDING },
  intro: { fontSize: 12.5, color: colors.muted, lineHeight: 19, marginBottom: spacing.lg },
  label: { fontSize: 11.5, fontWeight: '500', color: colors.muted, marginBottom: 7 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: spacing.md },
  chip: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { fontSize: 11.5, fontWeight: '500', color: colors.muted },
  chipTextActive: { color: colors.onGold },
  submit: { marginTop: spacing.sm },
})
