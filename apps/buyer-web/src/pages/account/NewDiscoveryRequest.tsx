import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PropertyType } from '@civilcheck/shared'
import { createVerificationRequest, getVerificationConfig } from '../../api/verification.api'
import { Button } from '../../components/Button'
import { Input, Select } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { errorStatus } from '../../lib/errors'
import { formatRupees, humanize } from '../../lib/format'

// Property Discovery flow (Step 4E) — the Verification Marketplace's OWN
// creation flow (see VerifyPropertyCTA.tsx), not a new pricing model: the
// buyer states an initial offer/budget (never a payment) that must clear
// the platform's minimum; an Expert then accepts it as-is or counters via a
// quote. This is deliberately NOT NewSpecialRequest.tsx's fixed-tier
// (₹999/2,499/4,999) pattern — that belongs to the separate, legacy
// SpecialRequest flow, kept fully intact and untouched by this page.

// Handoff shape from Browse Property's "Can't find the property you're
// looking for?" CTA (see BrowseProperty.tsx's goRequestSearch).
interface BrowsePropertyHandoff {
  address?: string
  city?: string
  tehsil?: string
  khasraNumber?: string
  propertyType?: string
}

export default function NewDiscoveryRequest() {
  const navigate = useNavigate()
  const location = useLocation()
  const handoff = (location.state as BrowsePropertyHandoff | null) ?? null

  const [address, setAddress] = useState(handoff?.address ?? '')
  const [city, setCity] = useState(handoff?.city ?? '')
  const [tehsil, setTehsil] = useState(handoff?.tehsil ?? '')
  // Browse Property's own Property Type filter is optional (a buyer may
  // search without one) — but a Discovery request always requires one, per
  // the backend contract, so a handoff value is only ever a starting point,
  // never a way to skip this field's own required validation below.
  const [propertyType, setPropertyType] = useState(handoff?.propertyType || '')
  const [khasra, setKhasra] = useState(handoff?.khasraNumber ?? '')

  const [minFee, setMinFee] = useState<number | null>(null)
  const [amount, setAmount] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void getVerificationConfig()
      .then((res) => {
        if (!live) return
        setMinFee(res.minVerificationFee)
        setAmount((prev) => prev || String(res.minVerificationFee))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!address.trim() || address.trim().length < 5) errs.address = 'Enter the full address or locality (at least 5 characters).'
    if (!city.trim() || city.trim().length < 2) errs.city = 'City is required.'
    if (!propertyType) errs.propertyType = 'Select a property type.'
    const numericAmount = Number(amount)
    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      errs.amount = 'Enter a valid budget amount.'
    } else if (minFee != null && numericAmount < minFee) {
      errs.amount = `Your budget must be at least ${formatRupees(minFee)}.`
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return // prevent double submit
    setFormError('')
    if (!validate()) return

    setBusy(true)
    try {
      const res = await createVerificationRequest({
        source: 'DISCOVERY',
        initialOfferAmount: Number(amount),
        desiredAddress: address.trim(),
        desiredCity: city.trim(),
        desiredTehsil: tehsil.trim() || undefined,
        desiredPropertyType: propertyType,
        desiredKhasraOrSurvey: khasra.trim() || undefined,
      })
      navigate(`/account/verifications/${res.request.id}`)
    } catch (err) {
      const status = errorStatus(err)
      if (status === 400) setFormError('Please check your property search details.')
      else if (status === 401) setFormError('Please log in again to continue.')
      else if (status === 409) setFormError('A similar property search request already exists.')
      else if (status === 429) setFormError('Too many requests. Please try again shortly.')
      else setFormError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="h2" style={{ marginBottom: 6 }}>
        Request a Property Search
      </h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
        We couldn't find a matching property. Tell us what you're looking for and our verified
        experts can search for it.
      </p>

      {formError ? (
        <div style={{ marginBottom: 16 }}>
          <InlineNotice tone="warn" message={formError} />
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="stack card" noValidate>
        <Input
          label="Address / Locality"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={fieldErrors.address}
        />
        <div className="row">
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} error={fieldErrors.city} style={{ flex: 1 }} />
          <Input
            label="Tehsil (optional)"
            value={tehsil}
            onChange={(e) => setTehsil(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        <Select
          label="Property type"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
          error={fieldErrors.propertyType}
        >
          <option value="">Select a property type</option>
          {Object.values(PropertyType).map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
        <Input
          label="Khasra / Survey number (optional)"
          value={khasra}
          onChange={(e) => setKhasra(e.target.value)}
        />

        <Input
          label="Your search & verification budget (₹)"
          type="number"
          min={minFee ?? 1}
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={fieldErrors.amount}
          hint={minFee != null ? `Minimum ${formatRupees(minFee)}.` : undefined}
        />
        <InlineNotice
          tone="info"
          message="This is your initial offer, not a payment. Experts will quote against it — you'll only pay once you accept a quote, and only 50% up front."
        />

        <Button type="submit" size="lg" block loading={busy}>
          Submit Request
        </Button>
      </form>
    </div>
  )
}
