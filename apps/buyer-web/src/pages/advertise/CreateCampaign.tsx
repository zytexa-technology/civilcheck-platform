import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  AD_MIN_BUDGET_MESSAGE,
  AD_REFERENCE_CPM_RUPEES,
  AD_MIN_BUDGET_RUPEES,
} from '@civilcheck/shared'
import {
  createCampaign,
  getAdvertiserToken,
  getConfig,
  startPayment,
  uploadCreative,
  verifyPayment,
  type AdvertiserConfig,
  type PayResponse,
} from '../../api/advertiser.api'
import { Button } from '../../components/Button'
import { Input, Select, Textarea } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { PaymentModal } from '../../components/PaymentModal'
import { errorMessage } from '../../lib/errors'
import { formatRupees } from '../../lib/format'

// Create Advertisement -> upload creative -> budget (min ₹100, no max) -> review -> pay.
// Paying moves the campaign to PENDING_APPROVAL; nothing goes live until a Superadmin approves.
export default function CreateCampaign() {
  const navigate = useNavigate()
  const [cfg, setCfg] = useState<AdvertiserConfig | null>(null)
  const [f, setF] = useState({
    businessName: '', title: '', description: '', ctaText: 'Learn More', destinationUrl: '', budget: '', platform: 'BOTH',
    startDate: '', endDate: '',
  })
  const [creative, setCreative] = useState<{ url: string; type: 'IMAGE' | 'VIDEO'; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [pay, setPay] = useState<PayResponse | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    void getConfig().then(setCfg).catch(() => {})
  }, [])

  if (!getAdvertiserToken()) return <Navigate to="/advertiser/login" replace />

  const cpm = cfg?.cpm ?? AD_REFERENCE_CPM_RUPEES
  const minBudget = cfg?.minBudget ?? AD_MIN_BUDGET_RUPEES
  const budgetNum = Number(f.budget)
  // Estimated impressions = budget / CPM * 1000 — labelled an estimate: actual delivery may vary.
  const estimate = Number.isFinite(budgetNum) && budgetNum >= minBudget ? Math.floor((budgetNum / cpm) * 1000) : null

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setFormError('')
    try {
      const up = await uploadCreative(file)
      setCreative({ url: up.url, type: up.type, name: file.name })
    } catch (err) {
      setFormError(errorMessage(err, 'Upload failed.'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (f.businessName.trim().length < 2) e.businessName = 'Enter the advertiser / business name.'
    if (f.title.trim().length < 2) e.title = 'Enter an advertisement title.'
    if (f.description.trim().length < 2) e.description = 'Enter a description.'
    if (f.ctaText.trim().length < 2) e.ctaText = 'Enter the button text (e.g. Shop Now).'
    try {
      const u = new URL(f.destinationUrl.trim())
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad')
    } catch {
      e.destinationUrl = 'Enter a valid http:// or https:// link.'
    }
    if (!creative) e.creative = 'Upload an image or video for your advertisement.'
    if (!f.budget || !Number.isFinite(budgetNum)) e.budget = 'Enter your advertising budget.'
    else if (!Number.isInteger(budgetNum) || budgetNum < minBudget) e.budget = AD_MIN_BUDGET_MESSAGE
    if (f.endDate && new Date(f.endDate).getTime() <= Date.now()) e.endDate = 'End date must be in the future.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (busy || !validate() || !creative) return
    setBusy(true)
    setFormError('')
    try {
      let id = campaignId
      if (!id) {
        const c = await createCampaign({
          businessName: f.businessName.trim(), title: f.title.trim(), description: f.description.trim(),
          creativeType: creative.type, creativeUrl: creative.url, ctaText: f.ctaText.trim(),
          destinationUrl: f.destinationUrl.trim(), budget: budgetNum, platform: f.platform as 'WEB' | 'MOBILE' | 'BOTH',
          startDate: f.startDate ? new Date(f.startDate).toISOString() : undefined,
          endDate: f.endDate ? new Date(f.endDate).toISOString() : undefined,
        })
        id = c.id
        setCampaignId(id)
      }
      setPay(await startPayment(id))
      setPayOpen(true)
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't create your campaign."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 className="h2" style={{ marginBottom: 16 }}>Create Advertisement</h1>
      {formError ? <div style={{ marginBottom: 12 }}><InlineNotice tone="warn" message={formError} /></div> : null}

      <form onSubmit={(e) => void submit(e)} className="stack card" noValidate>
        <Input label="Advertiser / business name" value={f.businessName} onChange={(e) => set('businessName', e.target.value)} error={errors.businessName} />
        <Input label="Advertisement title" value={f.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="e.g. Flat 50% Off" />
        <Textarea label="Description" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} error={errors.description} />

        <div>
          <div className="field__label" style={{ marginBottom: 6 }}>Image or video *</div>
          <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>
            {creative ? 'Replace creative' : 'Upload creative'}
          </Button>
          {creative ? (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>✓ {creative.name}</div>
              {creative.type === 'IMAGE' ? (
                <img src={creative.url} alt="Preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
              ) : (
                <video src={creative.url} muted controls style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
              )}
            </div>
          ) : null}
          {errors.creative ? <span className="field__error" role="alert">{errors.creative}</span> : null}
        </div>

        <div className="row">
          <Input label="Button text (CTA)" value={f.ctaText} onChange={(e) => set('ctaText', e.target.value)} error={errors.ctaText} style={{ flex: 1 }} />
          <Select label="Show on" value={f.platform} onChange={(e) => set('platform', e.target.value)}>
            <option value="BOTH">Web + Mobile app</option>
            <option value="WEB">Web only</option>
            <option value="MOBILE">Mobile app only</option>
          </Select>
        </div>
        <Input label="Destination URL" value={f.destinationUrl} onChange={(e) => set('destinationUrl', e.target.value)} error={errors.destinationUrl} placeholder="https://example.com" />

        <div className="row">
          <Input label="Start date (optional)" type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} style={{ flex: 1 }} />
          <Input label="End date (optional)" type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} error={errors.endDate} style={{ flex: 1 }} />
        </div>

        <Input
          label="Advertising budget (₹)"
          type="number"
          inputMode="numeric"
          min={minBudget}
          step="1"
          value={f.budget}
          onChange={(e) => set('budget', e.target.value)}
          error={errors.budget}
          hint={`Minimum ${formatRupees(minBudget)}. There is no maximum.`}
        />
        <InlineNotice
          tone="info"
          message={
            estimate != null
              ? `Estimated impressions: ${estimate.toLocaleString('en-IN')} (${formatRupees(cpm)} per 1,000 impressions). Actual delivery may vary. You pay exactly ${formatRupees(budgetNum)} — no extra fees, and clicks are never charged.`
              : `${formatRupees(cpm)} per 1,000 impressions. Enter a budget to see your estimated impressions.`
          }
        />

        <Button type="submit" size="lg" block loading={busy} disabled={campaignId !== null && payOpen}>
          {estimate != null ? `Review & pay ${formatRupees(budgetNum)}` : 'Review & pay'}
        </Button>
      </form>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        order={pay?.order ?? null}
        razorpayKeyId={pay?.razorpayKeyId ?? null}
        priceLabel={formatRupees(budgetNum || 0)}
        successTitle="Payment successful"
        successMessage="Payment received. Once the payment is confirmed your campaign moves to pending approval, and we'll email you as soon as it is reviewed."
        successButtonLabel="Go to my dashboard"
        onPaid={async (r) => {
          if (campaignId) await verifyPayment(campaignId, r)
        }}
        onSuccess={() => navigate('/advertiser/dashboard')}
      />
    </div>
  )
}
