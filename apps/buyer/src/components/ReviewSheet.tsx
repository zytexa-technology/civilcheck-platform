import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { reviewPurchase } from '../api/purchase.api'
import { errorMessage, errorStatus } from '../lib/errors'
import { colors, spacing } from '../theme'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { StarRating } from './StarRating'
import { TextField } from './TextField'
import { InlineNotice } from './States'

interface ReviewSheetProps {
  visible: boolean
  onClose: () => void
  purchaseId: string
  /** Fired once the review has been accepted. */
  onSubmitted: () => void
}

/**
 * Rate an unlocked report, 1-5 stars.
 *
 * One review per purchase — a second attempt returns 400. Since there is no
 * endpoint to read a buyer's own review back, that rejection is the only way to
 * discover an existing one, so it is surfaced as a plain explanation rather
 * than an error the buyer should retry.
 */
export function ReviewSheet({ visible, onClose, purchaseId, onSubmitted }: ReviewSheetProps) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible) {
      setRating(0)
      setComment('')
      setError('')
      setSubmitting(false)
    }
  }, [visible])

  const handleSubmit = async () => {
    if (rating < 1) {
      setError('Pick a star rating first.')
      return
    }

    const trimmed = comment.trim()
    // reviewCreateSchema requires 2-1000 characters when a comment is present,
    // so an almost-empty box has to be sent as no comment at all.
    if (trimmed.length === 1) {
      setError('Either write a little more, or leave the comment blank.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await reviewPurchase(purchaseId, {
        rating,
        ...(trimmed ? { comment: trimmed } : {}),
      })
      onSubmitted()
    } catch (err) {
      setError(
        errorStatus(err) === 400
          ? errorMessage(err, 'You have already reviewed this report.')
          : errorMessage(err, "Couldn't submit your review. Please try again."),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Rate this report"
      subtitle="Your rating helps other buyers judge how reliable an expert is."
    >
      {error ? <InlineNotice tone="warn" message={error} /> : null}

      <View style={styles.stars}>
        <StarRating value={rating} onChange={setRating} />
        <Text style={styles.ratingLabel}>{RATING_LABELS[rating] ?? 'Tap to rate'}</Text>
      </View>

      <TextField
        label="Comment (optional)"
        value={comment}
        onChangeText={setComment}
        placeholder="Was the report accurate and complete?"
        multiline
        maxLength={1000}
        editable={!submitting}
      />

      <Button
        label="Submit review"
        onPress={() => void handleSubmit()}
        loading={submitting}
        size="lg"
        block
      />
    </BottomSheet>
  )
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor — inaccurate or unhelpful',
  2: 'Below expectations',
  3: 'Acceptable',
  4: 'Good — accurate and useful',
  5: 'Excellent — exactly what I needed',
}

const styles = StyleSheet.create({
  stars: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  ratingLabel: { fontSize: 12, color: colors.muted },
})
