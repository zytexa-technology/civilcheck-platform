import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { passwordResetSchema } from '@civilcheck/shared'
import { requestPasswordReset, verifyPasswordResetOtp, resetPassword } from '../../api/auth.api'
import { Button } from '../../components/Button'
import { Input } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { errorMessage } from '../../lib/errors'

type Stage = 'email' | 'otp' | 'password' | 'done'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [info, setInfo] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const startCooldown = () => {
    setCooldown(60)
    const iv = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(iv); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const handleSend = async () => {
    if (!email.trim()) { setFormError('Enter your email'); return }
    setBusy(true); setFormError('')
    try {
      const res = await requestPasswordReset(email.trim())
      setInfo(res.message)
      setStage('otp')
      startCooldown()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally { setBusy(false) }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setBusy(true); setFormError('')
    try {
      await requestPasswordReset(email.trim())
      startCooldown()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally { setBusy(false) }
  }

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(otp)) { setFormError('Enter the 6-digit code'); return }
    setBusy(true); setFormError('')
    try {
      await verifyPasswordResetOtp(email.trim(), otp)
      setStage('password')
    } catch (err) {
      setFormError(errorMessage(err, 'Invalid or expired code'))
    } finally { setBusy(false) }
  }

  const handleReset = async () => {
    const parsed = passwordResetSchema.safeParse({ email: email.trim(), otp, newPassword, confirmPassword })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Check your input and try again.')
      return
    }
    setBusy(true); setFormError('')
    try {
      await resetPassword(email.trim(), otp, newPassword, confirmPassword)
      setStage('done')
    } catch (err) {
      setFormError(errorMessage(err, 'That code is invalid or has expired. Please request a new one.'))
    } finally { setBusy(false) }
  }

  return (
    <div className="container page center" style={{ minHeight: '70vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 32 }}>
        <div className="center" style={{ marginBottom: 22 }}>
          <span className="brand__mark" style={{ width: 44, height: 44, fontSize: 20 }} aria-hidden="true">C</span>
        </div>
        <h1 className="h2" style={{ textAlign: 'center', marginBottom: 6 }}>Reset your password</h1>

        {formError ? <div style={{ marginBottom: 16 }}><InlineNotice tone="warn" message={formError} /></div> : null}
        {info && stage === 'otp' ? <div style={{ marginBottom: 16 }}><InlineNotice tone="info" message={info} /></div> : null}

        {stage === 'email' && (
          <form onSubmit={(e) => { e.preventDefault(); void handleSend() }} className="stack" noValidate>
            <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" size="lg" block loading={busy}>Send reset code</Button>
          </form>
        )}

        {stage === 'otp' && (
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
            <p className="muted" style={{ fontSize: 12 }}>Code expires in 10 minutes. Check the inbox for {email}.</p>
            <Button type="submit" size="lg" block loading={busy}>Verify code</Button>
            <Button type="button" variant="ghost" size="sm" block disabled={cooldown > 0 || busy} onClick={() => void handleResend()}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Button>
          </form>
        )}

        {stage === 'password' && (
          <form onSubmit={(e) => { e.preventDefault(); void handleReset() }} className="stack" noValidate>
            <Input label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <Input label="Confirm password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <Button type="submit" size="lg" block loading={busy}>Update password</Button>
          </form>
        )}

        {stage === 'done' && (
          <>
            <InlineNotice tone="info" message="Your password has been reset. You can now log in with your new password." />
            <Button size="lg" block style={{ marginTop: 16 }} onClick={() => navigate('/login')}>Go to login</Button>
          </>
        )}

        {stage !== 'done' && (
          <p className="muted" style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
            <Link to="/login" className="gold-text">← Back to login</Link>
          </p>
        )}
      </div>
    </div>
  )
}
