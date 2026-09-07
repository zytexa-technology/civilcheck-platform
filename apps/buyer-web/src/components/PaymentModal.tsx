import { useEffect, useState } from 'react'
import { mockCheckout } from '../api/mockPayment'
import { openRazorpayCheckout } from '../api/razorpay'
import { errorMessage } from '../lib/errors'
import { formatRupees } from '../lib/format'
import { Button } from './Button'
import { InlineNotice } from './States'
import type { CheckoutOrder, CheckoutResult } from '../types/api'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  /** Fired after the caller's verify step has succeeded. */
  onSuccess: () => void
  order: CheckoutOrder | null
  /** null when the API runs in mock mode; a real key id otherwise. */
  razorpayKeyId: string | null
  /** Calls the caller's own /verify endpoint. Must throw on failure. */
  onPaid: (result: CheckoutResult) => Promise<void>
  priceLabel?: string
  successTitle?: string
  successMessage?: string
  successButtonLabel?: string
  prefill?: { name?: string; email?: string; contact?: string }
}

/**
 * Payment confirmation modal — the buyer-web fill for the gap apps/buyer
 * deliberately left open (PaymentSheet.tsx refuses to "pay" whenever a live
 * key is configured, since it has no real Checkout SDK wired in). Here, a
 * real razorpayKeyId opens the actual Razorpay Checkout.js widget
 * (src/api/razorpay.ts); only when the backend reports mock mode
 * (razorpayKeyId === null) does this fall back to the same dev-only signed
 * mock the mobile app uses. Either path ends by calling the caller's own
 * /verify endpoint — the server, never the client, decides whether a payment
 * actually unlocked anything.
 */
export function PaymentModal({
  open,
  onClose,
  onSuccess,
  order,
  razorpayKeyId,
  onPaid,
  priceLabel,
  successTitle = 'Payment successful!',
  successMessage = 'Your payment has been confirmed.',
  successButtonLabel = 'Continue',
  prefill,
}: PaymentModalProps) {
  const [paid, setPaid] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      // Deferred a microtask: this is the modal's own close-reset, not
      // something a caller triggers, so it must not run synchronously
      // inside the effect body.
      queueMicrotask(() => {
        setPaid(false)
        setPaying(false)
        setError('')
      })
    }
  }, [open])

  if (!open) return null

  const amount = priceLabel ?? (order ? formatRupees(order.amount / 100) : '—')
  const live = Boolean(razorpayKeyId)

  const handlePay = async () => {
    if (!order) return
    setPaying(true)
    setError('')
    try {
      const result: CheckoutResult = live
        ? await openRazorpayCheckout({ order, keyId: razorpayKeyId as string, prefill })
        : mockCheckout(order.id)
      await onPaid(result)
      setPaid(true)
    } catch (err) {
      setError(errorMessage(err, 'The payment could not be confirmed. Please try again.'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />

        {paid ? (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: 44 }} aria-hidden="true">
              🎉
            </span>
            <h3 style={{ fontSize: 19, fontWeight: 700 }}>{successTitle}</h3>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 300 }}>
              {successMessage}
            </p>
            <Button size="lg" block onClick={onSuccess}>
              {successButtonLabel}
            </Button>
          </div>
        ) : (
          <div className="stack">
            <div className="spread">
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Complete payment</h3>
              <span className="pill" style={{ background: 'var(--cc-green-dim)', color: 'var(--cc-green)' }}>
                🔒 Secure
              </span>
            </div>

            {error ? <InlineNotice tone="warn" message={error} /> : null}

            <div className="card" style={{ padding: 14 }}>
              <div className="detail-row">
                <span className="detail-row__label">Amount</span>
                <span className="detail-row__value">{amount}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">GST</span>
                <span className="detail-row__value">Included</span>
              </div>
              <div className="detail-row" style={{ borderBottom: 'none' }}>
                <span className="detail-row__label" style={{ fontWeight: 700, color: 'var(--cc-text)' }}>
                  Total payable
                </span>
                <span className="detail-row__value gold-text" style={{ fontSize: 14 }}>
                  {amount}
                </span>
              </div>
            </div>

            <Button size="lg" block loading={paying} disabled={!order} onClick={() => void handlePay()}>
              {live ? `Pay ${amount} with Razorpay` : `Pay ${amount}`}
            </Button>

            <p className="muted" style={{ fontSize: 10.5, textAlign: 'center' }}>
              {live
                ? 'You will be redirected to Razorpay’s secure checkout.'
                : '⚡ Test mode — no real money will be charged.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
