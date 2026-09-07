import { useEffect, useState } from 'react'
import { flagReport } from '../api/purchase.api'
import { errorMessage } from '../lib/errors'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { TextField } from './TextField'
import { InlineNotice } from './States'

const MIN_REASON_LENGTH = 10

interface FlagSheetProps {
  visible: boolean
  onClose: () => void
  purchaseId: string
  onSubmitted: () => void
}

/**
 * Report an unlocked report as outdated or wrong.
 *
 * The reason must be at least 10 characters (reportFlagCreateSchema); that is
 * enforced here so the buyer gets an inline field error instead of a 400.
 */
export function FlagSheet({ visible, onClose, purchaseId, onSubmitted }: FlagSheetProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')

  useEffect(() => {
    if (!visible) {
      setReason('')
      setError('')
      setFieldError('')
      setSubmitting(false)
    }
  }, [visible])

  const handleSubmit = async () => {
    const trimmed = reason.trim()

    if (trimmed.length < MIN_REASON_LENGTH) {
      setFieldError(`Please describe the problem in at least ${MIN_REASON_LENGTH} characters.`)
      return
    }

    setSubmitting(true)
    setError('')
    setFieldError('')

    try {
      await flagReport(purchaseId, trimmed)
      onSubmitted()
    } catch (err) {
      setError(errorMessage(err, "Couldn't submit the flag. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Report a problem"
      subtitle="Tell us what looks wrong or out of date. An admin will review this report and can penalise the expert if it is inaccurate."
    >
      {error ? <InlineNotice tone="warn" message={error} /> : null}

      <TextField
        label="What's wrong with this report?"
        value={reason}
        onChangeText={(text) => {
          setReason(text)
          setFieldError('')
        }}
        placeholder="e.g. The case was disposed in March but the report still shows it as active."
        multiline
        maxLength={1000}
        editable={!submitting}
        error={fieldError}
      />

      <Button
        label="Submit report"
        onPress={() => void handleSubmit()}
        loading={submitting}
        variant="danger"
        size="lg"
        block
      />
    </BottomSheet>
  )
}
