import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supportTicketCreateSchema, SupportTicketCategory } from '@civilcheck/shared'
import { createSupportTicket } from '../../api/support.api'
import { Button } from '../../components/Button'
import { Input, Select, Textarea } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { humanize } from '../../lib/format'

const CATEGORIES = Object.values(SupportTicketCategory)

export default function NewSupportTicket() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<string>(SupportTicketCategory.OTHER)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')

    const parsed = supportTicketCreateSchema.safeParse({ category, subject, message, attachments: [] })
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        if (issue.path[0]) errs[String(issue.path[0])] = issue.message
      }
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    setBusy(true)
    try {
      const res = await createSupportTicket(parsed.data)
      navigate(`/account/support/${res.ticket.id}`)
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't submit your message. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container page" style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 className="h2" style={{ marginBottom: 20 }}>
        Start a conversation
      </h1>

      {formError ? (
        <div style={{ marginBottom: 16 }}>
          <InlineNotice tone="warn" message={formError} />
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="stack card" noValidate>
        <Select label="What's this about?" value={category} onChange={(e) => setCategory(e.target.value)} error={fieldErrors.category}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </Select>
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} error={fieldErrors.subject} />
        <Textarea
          label="How can we help?"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={fieldErrors.message}
        />
        <Button type="submit" size="lg" block loading={busy}>
          Send
        </Button>
      </form>
    </div>
  )
}
