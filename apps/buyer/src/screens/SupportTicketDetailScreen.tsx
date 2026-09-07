import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { getSupportTicketById, postSupportMessage } from '../api/support.api'
import { errorMessage, errorStatus } from '../lib/errors'
import { formatDate, humanize, supportTicketTone } from '../lib/format'
import { colors, radius, spacing } from '../theme'
import { Button } from '../components/Button'
import { Pill } from '../components/Pill'
import { Screen } from '../components/Screen'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorState, InlineNotice, LoadingState } from '../components/States'
import { TextField } from '../components/TextField'
import type { SupportMessage, SupportTicket } from '../types/api'

const SENDER_LABEL: Record<SupportMessage['sender'], string> = {
  USER: 'You',
  AI: 'CivilCheck Assistant',
  ADMIN: 'Support agent',
  SYSTEM: 'CivilCheck',
}

// Posting a message that matches the backend's human-request pattern is what
// actually triggers escalation (support.service.ts / aiSupport.ts) — there is
// no separate "escalate" endpoint, so this button just sends an explicit ask.
const TALK_TO_HUMAN_MESSAGE = "I'd like to talk to a human agent, please."

export function SupportTicketDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const scrollRef = useRef<ScrollView>(null)

  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
      setError('No ticket was selected.')
      return
    }
    setError('')
    try {
      const response = await getSupportTicketById(id)
      setTicket(response.ticket)
      setMessages(response.messages)
    } catch (err) {
      setError(
        errorStatus(err) === 404
          ? 'This ticket no longer exists.'
          : errorMessage(err, "Couldn't load this ticket."),
      )
    }
  }, [id])

  useEffect(() => {
    void (async () => {
      await load()
      setLoading(false)
    })()
  }, [load])

  const send = async (body: string) => {
    if (!id || !body.trim()) return
    setSending(true)
    try {
      const response = await postSupportMessage(id, body.trim())
      setTicket(response.ticket)
      setDraft('')
      const detail = await getSupportTicketById(id)
      setMessages(detail.messages)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    } catch (err) {
      setError(errorMessage(err, "Couldn't send your message."))
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Support" backFallback="/support" />
        <LoadingState />
      </Screen>
    )
  }

  if (!ticket) {
    return (
      <Screen>
        <ScreenHeader title="Support" backFallback="/support" />
        <ErrorState message={error || 'Ticket not found.'} onRetry={() => void load()} />
      </Screen>
    )
  }

  const tone = supportTicketTone(ticket.status)
  const closed = ticket.status === 'CLOSED'

  return (
    <Screen
      footer={
        closed ? (
          <View style={styles.closedFooter}>
            <Text style={styles.closedText}>
              This ticket is closed — start a new ticket for further help.
            </Text>
            <Button label="New ticket" onPress={() => router.replace('/support/new')} block />
          </View>
        ) : (
          <View style={styles.composer}>
            {error ? <InlineNotice tone="warn" message={error} /> : null}
            <TouchableOpacity
              onPress={() => void send(TALK_TO_HUMAN_MESSAGE)}
              disabled={sending}
              style={styles.humanLink}
              accessibilityRole="button"
            >
              <Text style={styles.humanLinkText}>🧑‍💼 Talk to a human</Text>
            </TouchableOpacity>
            <View style={styles.composerRow}>
              <TextField
                value={draft}
                onChangeText={setDraft}
                placeholder="Type your message…"
                editable={!sending}
                style={styles.composerField}
              />
              <Button
                label="Send"
                onPress={() => void send(draft)}
                loading={sending}
                disabled={!draft.trim()}
              />
            </View>
          </View>
        )
      }
    >
      <ScreenHeader title={ticket.subject} subtitle={humanize(ticket.category)} backFallback="/support" />

      <View style={styles.statusRow}>
        <Pill tone={tone} />
        <Text style={styles.statusMeta}>Updated {formatDate(ticket.updatedAt)}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.map((message) => {
          const mine = message.sender === 'USER'
          return (
            <View key={message.id} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={styles.bubbleSender}>{SENDER_LABEL[message.sender]}</Text>
                <Text style={[styles.bubbleBody, mine && styles.bubbleBodyMine]}>{message.body}</Text>
              </View>
            </View>
          )
        })}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  statusMeta: { fontSize: 10.5, color: colors.muted },
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: spacing.xs,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleMine: { backgroundColor: colors.gold },
  bubbleSender: { fontSize: 9.5, fontWeight: '700', color: colors.muted, marginBottom: 3 },
  bubbleBody: { fontSize: 12.5, color: colors.text, lineHeight: 18 },
  bubbleBodyMine: { color: colors.onGold },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  humanLink: { alignSelf: 'flex-start' },
  humanLinkText: { fontSize: 11, fontWeight: '600', color: colors.gold },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  composerField: { flex: 1, marginBottom: 0 },
  closedFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  closedText: { fontSize: 11.5, color: colors.muted, textAlign: 'center' },
})
