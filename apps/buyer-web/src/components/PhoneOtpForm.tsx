import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth'
import { sendOtp, confirmOtp, createRecaptchaVerifier, disposeRecaptchaVerifier } from '../lib/firebaseAuth'
import { IS_FIREBASE_CONFIGURED } from '../config/env'
import { Button } from './Button'
import { Input } from './Field'
import { InlineNotice } from './States'

const RECAPTCHA_CONTAINER_ID = 'phone-otp-recaptcha'
const PHONE_PATTERN = /^[6-9]\d{9}$/

interface PhoneOtpFormProps {
  /** Called with the Firebase ID token once the user has verified their OTP. */
  onVerified: (idToken: string) => Promise<void>
}

/**
 * Phone-OTP entry — Firebase Phone Authentication handles OTP generation,
 * delivery, and verification entirely; this component only ever collects a
 * phone number and the code the user received, and hands the resulting
 * Firebase ID token to `onVerified`. It never sees, stores, or checks an OTP
 * value itself.
 */
export function PhoneOtpForm({ onVerified }: PhoneOtpFormProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Held for the lifetime of this mounted form — created lazily (on the
  // first Send-code attempt, not eagerly in an effect), reused across
  // retries against the same phone number, and disposed exactly once on
  // unmount. This is what makes verifier creation idempotent: a second
  // concurrent/duplicate call to getVerifier() (StrictMode's double-effect
  // pass, a double-click, or re-entering this step) sees the ref already
  // set and reuses it instead of rendering a second reCAPTCHA widget into
  // the same DOM container — which is what throws Firebase's "reCAPTCHA has
  // already been rendered in this element" error.
  const verifierRef = useRef<RecaptchaVerifier | null>(null)

  const disposeVerifier = () => {
    if (verifierRef.current) {
      disposeRecaptchaVerifier(verifierRef.current)
      verifierRef.current = null
    }
  }

  const getVerifier = (): RecaptchaVerifier => {
    if (!verifierRef.current) {
      verifierRef.current = createRecaptchaVerifier(RECAPTCHA_CONTAINER_ID)
    }
    return verifierRef.current
  }

  // Unmounts on: switching to the Email & password tab, or leaving the
  // login page entirely. Safe to run twice (React StrictMode mounts every
  // component, cleans it up, then mounts it again in dev) since disposing
  // an already-null ref is a no-op.
  useEffect(() => {
    return () => disposeVerifier()
  }, [])

  if (!IS_FIREBASE_CONFIGURED) {
    return (
      <InlineNotice tone="warn" message="Phone-OTP login is not available on this deployment yet — use email and password below." />
    )
  }

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!PHONE_PATTERN.test(phone)) {
      setError('Enter a valid 10-digit Indian mobile number.')
      return
    }

    setBusy(true)
    try {
      const verifier = getVerifier()
      const result = await sendOtp(`+91${phone}`, verifier)
      setConfirmation(result)
      setStep('otp')
    } catch (err) {
      // The widget may be left solved/consumed or in an inconsistent state
      // after a failed attempt — dispose it so the next Send-code click
      // (requirement: "cleanly reset the verifier so the user can retry")
      // renders a fresh one instead of reusing a possibly-broken instance.
      disposeVerifier()
      setError(err instanceof Error ? err.message : "Couldn't send the code. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!confirmation) {
      setError('Session expired — please request a new code.')
      setStep('phone')
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.')
      return
    }

    setBusy(true)
    try {
      const idToken = await confirmOtp(confirmation, code)
      await onVerified(idToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* Firebase's abuse-prevention widget — invisible, renders nothing
          itself, but the container must exist in the DOM before sendOtp()
          is called. */}
      <div id={RECAPTCHA_CONTAINER_ID} />

      {error ? (
        <div style={{ marginBottom: 16 }}>
          <InlineNotice tone="warn" message={error} />
        </div>
      ) : null}

      {step === 'phone' ? (
        <form onSubmit={(e) => void handleSendOtp(e)} className="stack" noValidate>
          <Input
            label="Mobile number"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="10-digit mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          <Button type="submit" size="lg" block loading={busy}>
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void handleVerifyOtp(e)} className="stack" noValidate>
          <p className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
            Code sent to +91 {phone}.{' '}
            <button
              type="button"
              className="gold-text"
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
              onClick={() => {
                setStep('phone')
                setCode('')
                setError('')
              }}
            >
              Change number
            </button>
          </p>
          <Input
            label="6-digit code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <Button type="submit" size="lg" block loading={busy}>
            Verify &amp; log in
          </Button>
        </form>
      )}
    </div>
  )
}
