import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PropertyType, LEGAL_REPORT_MIN_AMOUNT, LEGAL_REPORT_MIN_AMOUNT_MESSAGE } from '@civilcheck/shared'
import { createVerificationRequest, getVerificationConfig } from '../../api/verification.api'
import { Button } from '../../components/Button'
import { Input, Select, Textarea } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { errorMessage, errorStatus } from '../../lib/errors'
import { formatRupees, humanize } from '../../lib/format'

// "Request for Legal Reports" (formerly Custom Research). There are no fixed plans any more:
// the buyer enters their own offer (minimum ₹2,499, no maximum). The request goes into the
// existing verification marketplace — Experts accept the offer or counter it, the buyer
// accepts one, and the existing 50% + 50% payments then run on the agreed price. Nothing is
// charged when this form is submitted.

// Handoff shape from Browse Property's "Can't find the property you're looking for?" CTA.
interface BrowsePropertyHandoff {
  address?: string
  city?: string
  tehsil?: string
  khasraNumber?: string
  propertyType?: string
}

export default function NewSpecialRequest() {
  const navigate = useNavigate()
  const location = useLocation()
  const handoff = (location.state as BrowsePropertyHandoff | null) ?? null

  const [address, setAddress] = useState(handoff?.address ?? '')
  const [city, setCity] = useState(handoff?.city ?? '')
  const [tehsil, setTehsil] = useState(handoff?.tehsil ?? '')
  const [propertyType, setPropertyType] = useState<string>(handoff?.propertyType || PropertyType.RESIDENTIAL)
  const [questions, setQuestions] = useState(
    handoff?.khasraNumber ? `Khasra/Survey number: ${handoff.khasraNumber}` : '',
  )
  const [minAmount, setMinAmount] = useState<number>(LEGAL_REPORT_MIN_AMOUNT)
  const [amount, setAmount] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void getVerificationConfig()
      .then((res) => {
        if (live && res.legalReportMinAmount) setMinAmount(res.legalReportMinAmount)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (address.trim().length < 5) errs.address = 'Address must be at least 5 characters.'
    if (city.trim().length < 2) errs.city = 'City is required.'
    if (tehsil.trim().length < 2) errs.tehsil = 'Tehsil is required.'
    if (questions.trim().length < 10) errs.questions = 'Describe what you want checked (min 10 characters).'
    const n = Number(amount)
    if (!amount || !Number.isFinite(n) || n <= 0) errs.amount = 'Enter your offer amount.'
    else if (n < minAmount) errs.amount = LEGAL_REPORT_MIN_AMOUNT_MESSAGE
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setFormError('')
    if (!validate()) return

    setBusy(true)
    try {
      const res = await createVerificationRequest({
        source: 'DISCOVERY',
        initialOfferAmount: Number(amount),
        desiredAddress: address.trim(),
        desiredCity: city.trim(),
        desiredTehsil: tehsil.trim(),
        desiredPropertyType: propertyType,
        questions: questions.trim(),
      })
      navigate(`/account/verifications/${res.request.id}`)
    } catch (err) {
      const status = errorStatus(err)
      if (status === 409) setFormError('You already have an active request for this location and property type.')
      else setFormError(errorMessage(err, "Couldn't submit your request."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="h2" style={{ marginBottom: 20 }}>
        Request for Legal Reports
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

        <Input
          label="Your Offer Amount (₹)"
          type="number"
          inputMode="numeric"
          min={minAmount}
          step="1"
          placeholder="Enter your offer"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={fieldErrors.amount}
          hint={`Enter your offer. Minimum ${formatRupees(minAmount)}; there is no maximum.`}
        />
        <InlineNotice
          tone="info"
          message="This is your offer, not a payment. Experts can accept it or counter with their own price — you only pay after you accept a price, and only 50% up front."
        />

        <Button type="submit" size="lg" block loading={busy}>
          Submit request
        </Button>
      </form>
    </div>
  )
}
