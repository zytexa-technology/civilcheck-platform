import { useEffect, useState } from 'react'
import { Keyboard, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { getComments, postComment } from '../api/feed.api'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../lib/errors'
import { formatDate } from '../lib/format'
import { colors, spacing } from '../theme'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { TextField } from './TextField'
import { InlineNotice } from './States'
import type { FeedComment, FeedTargetType } from '../types/api'

interface CommentSheetProps {
  visible: boolean
  onClose: () => void
  targetType: FeedTargetType
  targetId: string
  commentCount: number
  onCommentPosted: () => void
}

/**
 * Comment thread for one Home-feed item — Buyer Mobile Phase 3. Same
 * GET/POST /feed/:targetType/:targetId/comments contract Buyer Web's
 * FeedCard already uses, as a bottom sheet instead of an inline expanding
 * panel (native mobile pattern, reusing the existing BottomSheet shell also
 * used by PaymentSheet/ReviewSheet/FlagSheet). Deliberately no edit/delete —
 * Web's own UI never exposes those either, even though a delete endpoint
 * exists server-side.
 */
export function CommentSheet({
  visible,
  onClose,
  targetType,
  targetId,
  commentCount,
  onCommentPosted,
}: CommentSheetProps) {
  const router = useRouter()
  const { status } = useAuth()
  const [comments, setComments] = useState<FeedComment[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')

  // Lazy-load once per mount, same as Web — reopening the sheet doesn't
  // refetch an already-loaded thread.
  useEffect(() => {
    if (visible && comments === null) {
      getComments(targetType, targetId)
        .then((res) => setComments(res.comments))
        .catch((err) => setLoadError(errorMessage(err, "Couldn't load comments.")))
    }
  }, [visible, comments, targetType, targetId])

  useEffect(() => {
    if (!visible) {
      setDraft('')
      setPostError('')
    }
  }, [visible])

  const handleSubmit = async () => {
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    setPostError('')
    try {
      const res = await postComment(targetType, targetId, body)
      setComments((prev) => [
        { id: res.comment.id, body: res.comment.body, createdAt: res.comment.createdAt, userId: res.comment.userId, userName: 'You' },
        ...(prev ?? []),
      ])
      setDraft('')
      Keyboard.dismiss()
      onCommentPosted()
    } catch (err) {
      setPostError(errorMessage(err, "Couldn't post your comment."))
    } finally {
      setPosting(false)
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Comments (${commentCount})`}>
      {loadError ? (
        <InlineNotice tone="warn" message={loadError} />
      ) : (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {comments === null ? (
            <Text style={styles.helper}>Loading comments…</Text>
          ) : comments.length === 0 ? (
            <Text style={styles.helper}>No comments yet. Be the first to comment.</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.row}>
                <View style={styles.rowHead}>
                  <Text style={styles.author}>{c.userName}</Text>
                  <Text style={styles.meta}>{formatDate(c.createdAt)}</Text>
                </View>
                <Text style={styles.body}>{c.body}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {postError ? <InlineNotice tone="warn" message={postError} /> : null}

      {status === 'authenticated' ? (
        <View style={styles.composerRow}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment…"
            editable={!posting}
            style={styles.composerField}
          />
          <Button label="Post" onPress={() => void handleSubmit()} loading={posting} disabled={!draft.trim()} />
        </View>
      ) : (
        // Guest browsing (Final Parity Batch, Task 1) — commenting is an
        // account-linked write, same as Buyer Web's FeedCard gates via
        // AuthRequiredModal. Viewing the thread above stays open to guests;
        // only the composer is replaced, rather than stacking a second sheet
        // on top of this one.
        <TouchableOpacity
          style={styles.signInRow}
          onPress={() => {
            onClose()
            router.push('/login')
          }}
          accessibilityRole="button"
        >
          <Text style={styles.signInText}>🔒 Sign in to comment</Text>
        </TouchableOpacity>
      )}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  list: { maxHeight: 260, marginBottom: spacing.sm },
  helper: { fontSize: 12, color: colors.muted, paddingVertical: spacing.md, textAlign: 'center' },
  row: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  author: { fontSize: 12, fontWeight: '700', color: colors.text },
  meta: { fontSize: 10, color: colors.dim },
  body: { fontSize: 12.5, color: colors.text, lineHeight: 18 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
  composerField: { flex: 1, marginBottom: 0 },
  signInRow: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border2,
  },
  signInText: { fontSize: 12.5, fontWeight: '600', color: colors.gold },
})
