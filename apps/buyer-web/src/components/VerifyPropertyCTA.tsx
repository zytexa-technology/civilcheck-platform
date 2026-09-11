import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createVerificationRequest, getVerificationConfig } from '../api/verification.api'
import { errorMessage, errorStatus } from '../lib/errors'
import { formatRupees } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { AuthRequiredModal } from './AuthRequiredModal'
import { Button } from './Button'
import { Input } from './Field'
import { InlineNotice } from './States'

/**
 * "Verify Property" — the buyer's entry point into the Verification
 * Marketplace. Shared by the property report page and the verified-property
 * detail page, same as apps/buyer's VerifyPropertyCTA, so the minimum-fee
 * copy and the create → navigate flow live in exactly one place.
 *
 * Buyer Experience correction (2026-09-05): this used to fire
 * createVerificationRequest on a single click with no amount at all — every
 * request silently got the platform's fixed minimum. The buyer must
 * actually choose their own initial offer (a budget, never a payment) here;
 * providers then accept it or counter, and only the buyer's later
 * acceptance of one quote sets the real price. No Razorpay checkout opens
 * anywhere in this component.
 */
export function VerifyPropertyCTA({
  source,
  targetId,
}: {
  source: 'LISTING' | 'PROPERTY'
  targetId: string
}) {
  const navigate = useNavigate()
  const { status } = useAuth()
  const [minFee, setMinFee] = useState<number | null>(null)
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerAmount, setOfferAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [authModalOpen, setAuthModalOpen] = useState(false)

  useEffect(() => {
    let live = true
    void getVerificationConfig()
      .then((res) => {
        if (live) {
          setMinFee(res.minVerificationFee)
          setOfferAmount(String(res.minVerificationFee))
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const handleStart = () => {
    if (status !== 'authenticated') {
      setAuthModalOpen(true)
      return
    }
    setNotice('')
    setOfferOpen(true)
  }

  const handleSubmitOffer = async () => {
    const amount = Number(offerAmount)
    if (!amount || amount <= 0) {
      setNotice('Enter a valid offer amount.')
      return
    }
    if (minFee != null && amount < minFee) {
      setNotice(`Your offer must be at least ${formatRupees(minFee)}.`)
      return
    }

    setBusy(true)
    setNotice('')
    try {
      const response = await createVerificationRequest(
        source === 'LISTING'
          ? { source, listingId: targetId, initialOfferAmount: amount }
          : { source, propertyId: targetId, initialOfferAmount: amount },
      )
      navigate(`/account/verifications/${response.request.id}`)
    } catch (err) {
      if (errorStatus(err) === 409) {
        setNotice('You already have an active verification request for this property.')
      } else {
        setNotice(errorMessage(err, "Couldn't submit your offer."))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ borderColor: 'var(--cc-gold-border)' }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Request professional verification</h3>
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>
        This property can be professionally verified by CivilCheck through an eligible Expert or
        Admin — a licensed lawyer, civil engineer, or revenue officer will personally review it and
        deliver a findings report.
        {minFee != null ? ` Starting from ${formatRupees(minFee)}.` : ''}
      </p>

      {notice ? (
        <div style={{ marginBottom: 12 }}>
          <InlineNotice message={notice} tone="warn" />
        </div>
      ) : null}

      {offerOpen ? (
        <div className="stack" style={{ gap: 10 }}>
          <Input
            label="Your verification offer (₹)"
            type="number"
            min={minFee ?? 1}
            step="1"
            value={offerAmount}
            onChange={(e) => setOfferAmount(e.target.value)}
          />
          <InlineNotice
            tone="info"
            message="This is your initial offer. You will only be charged after you select and accept a provider's quote — nothing is paid now."
          />
          <div className="row">
            <Button onClick={() => void handleSubmitOffer()} loading={busy} block>
              Submit Offer
            </Button>
            <Button variant="secondary" onClick={() => setOfferOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={handleStart} block>
          🔎 Verify This Property
        </Button>
      )}

      <AuthRequiredModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        action="request property verification"
      />
    </div>
  )
}
