import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resendVerificationEmail, verifyEmail } from '../../api/auth.api'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/Button'
import { Input } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { errorMessage } from '../../lib/errors'

// Signup Email Verification — the OTP step Register.tsx redirects to right
// after signup. Same email-OTP UX as ForgotPassword.tsx (this codebase's one
// existing precedent for an OTP-entry screen), just for the "new account"
// flow instead of a password reset: verifying here IS the action (issues a
// session), there's no separate third step.
export default function VerifyEmail() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { signIn } = useAuth()

  const email = params.get('email') || ''
  const next = params.get('next')

  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const startCooldown = () => {
    setCooldown(60)
    const iv = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(iv)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setFormError('Enter the 6-digit code')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const res = await verifyEmail(email, otp)
      signIn(res.token, res.user)
      navigate(next && next.startsWith('/') ? next : '/account', { replace: true })
    } catch (err) {
      setFormError(errorMessage(err, 'Invalid or expired code'))
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setBusy(true)
    setFormError('')
    setResendMessage('')
    try {
      const res = await resendVerificationEmail(email)
      setResendMessage(res.message)
      startCooldown()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!email) {
    return (
      <div className="container page center" style={{ minHeight: '70vh' }}>
        <div className="card" style={{ width: '100%', maxWidth: 400, padding: 32 }}>
          <InlineNotice tone="warn" message="No email to verify. Please sign up again." />
          <Button size="lg" block style={{ marginTop: 16 }} onClick={() => navigate('/register')}>
            Back to sign up
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container page center" style={{ minHeight: '70vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 32 }}>
        <div className="center" style={{ marginBottom: 22 }}>
          <span className="brand__mark" style={{ width: 44, height: 44, fontSize: 20 }} aria-hidden="true">
            C
          </span>
        </div>
        <h1 className="h2" style={{ textAlign: 'center', marginBottom: 6 }}>
          Verify your email
        </h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 24, fontSize: 13 }}>
          We've sent a verification code to {email}
        </p>

        {formError ? (
          <div style={{ marginBottom: 16 }}>
            <InlineNotice tone="warn" message={formError} />
          </div>
        ) : null}
        {resendMessage ? (
          <div style={{ marginBottom: 16 }}>
            <InlineNotice tone="info" message={resendMessage} />
          </div>
        ) : null}

        <form onSubmit={(e) => { e.preventDefault(); void handleVerify() }} className="stack" noValidate>
          <Input
            label="6-digit code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            style={{ letterSpacing: 6, textAlign: 'center', fontSize: 18, fontWeight: 700 }}
          />
          <p className="muted" style={{ fontSize: 12 }}>Code expires in 10 minutes.</p>
          <Button type="submit" size="lg" block loading={busy}>
            Verify Email
          </Button>
          <Button type="button" variant="ghost" size="sm" block disabled={cooldown > 0 || busy} onClick={() => void handleResend()}>
            {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
          </Button>
        </form>

        <p className="muted" style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
          <Link to="/login" className="gold-text">← Back to login</Link>
        </p>
      </div>
    </div>
  )
}
