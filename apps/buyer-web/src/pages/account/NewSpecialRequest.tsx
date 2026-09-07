import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { specialRequestCreateSchema, PropertyType } from '@civilcheck/shared'
import { createSpecialRequest, verifySpecialRequestAdvance } from '../../api/specialRequest.api'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/Button'
import { Input, Select, Textarea } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { PaymentModal } from '../../components/PaymentModal'
import { errorMessage } from '../../lib/errors'
import { formatRupees, humanize } from '../../lib/format'
import type { CheckoutOrder } from '../../types/api'

const TIERS = [
  { amount: 999, label: 'Basic', desc: 'A quick check against public records' },
  { amount: 2499, label: 'Standard', desc: 'Site visit plus document review' },
  { amount: 4999, label: 'Deep dive', desc: 'Full investigation with expert opinion' },
]

// Handoff shape from Browse Property's "Can't find the property you're
// looking for?" CTA — SpecialRequest has no khasra/survey field, so that
// value (if the buyer entered one) is folded into the questions prefill
// instead of dropped.
interface BrowsePropertyHandoff {
  address?: string
  city?: string
  khasraNumber?: string
  propertyType?: string
}

export default function NewSpecialRequest() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const handoff = (location.state as BrowsePropertyHandoff | null) ?? null

  const [address, setAddress] = useState(handoff?.address ?? '')
  const [city, setCity] = useState(handoff?.city ?? '')
  const [tehsil, setTehsil] = useState('')
  const [propertyType, setPropertyType] = useState<string>(handoff?.propertyType || PropertyType.RESIDENTIAL)
  const [questions, setQuestions] = useState(
    handoff?.khasraNumber ? `Khasra/Survey number: ${handoff.khasraNumber}` : '',
  )
  const [advanceAmount, setAdvanceAmount] = useState(999)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const [requestId, setRequestId] = useState<string | null>(null)
  const [order, setOrder] = useState<CheckoutOrder | null>(null)
  const [keyId, setKeyId] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')

    const parsed = specialRequestCreateSchema.safeParse({
      address,
      city,
      tehsil,
      propertyType,
      questions,
      documents: [],
      advanceAmount,
    })
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
      const res = await createSpecialRequest(parsed.data)
      setRequestId(res.requestId)
      setOrder(res.order)
      setKeyId(res.razorpayKeyId)
      setPayOpen(true)
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't submit your request."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="h2" style={{ marginBottom: 20 }}>
        Request custom research
      </h1>

      {formError ? (
        <div style={{ marginBottom: 16 }}>
          <InlineNotice tone="warn" message={formError} />
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="stack card" noValidate>
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} error={fieldErrors.address} />
        <div className="row">
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} error={fieldErrors.city} style={{ flex: 1 }} />
          <Input label="Tehsil" value={tehsil} onChange={(e) => setTehsil(e.target.value)} error={fieldErrors.tehsil} style={{ flex: 1 }} />
        </div>
        <Select label="Property type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
          {Object.values(PropertyType).map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
        <Textarea
          label="What do you want us to find out?"
          rows={4}
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          error={fieldErrors.questions}
          hint="Minimum 10 characters."
        />

        <div>
          <div className="field__label" style={{ marginBottom: 8 }}>
            Research depth
          </div>
          <div className="stack">
            {TIERS.map((tier) => (
              <button
                key={tier.amount}
                type="button"
                onClick={() => setAdvanceAmount(tier.amount)}
                className="card"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderColor: advanceAmount === tier.amount ? 'var(--cc-gold)' : 'var(--cc-border)',
                  background: advanceAmount === tier.amount ? 'var(--cc-gold-dim)' : 'var(--cc-surface)',
                }}
              >
                <div className="spread">
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{tier.label}</span>
                  <span className="gold-text" style={{ fontWeight: 700 }}>
                    {formatRupees(tier.amount)}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                  {tier.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        <Button type="submit" size="lg" block loading={busy}>
          Continue to payment
        </Button>
      </form>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        order={order}
        razorpayKeyId={keyId}
        prefill={{ name: user?.name ?? undefined, email: user?.email ?? undefined, contact: user?.phone }}
        successTitle="Request submitted!"
        successMessage="An expert will review your request and get started shortly."
        successButtonLabel="View request"
        onPaid={async (result) => {
          if (requestId) await verifySpecialRequestAdvance(requestId, result)
        }}
        onSuccess={() => {
          setPayOpen(false)
          if (requestId) navigate(`/account/requests/${requestId}`)
        }}
      />
    </div>
  )
}
