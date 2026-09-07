// Seller/Partner self-service password reset (email OTP via Resend).
// Reuses the same "auth"/"auth-card" shell + control/field/btn classes as
// Login.jsx so this looks like a natural extension of it, not a bolt-on.
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Seal } from '../components/Icon'
import {
  requestSellerPasswordReset,
  verifySellerPasswordResetOtp,
  resetSellerPassword,
} from '../api/auth.api'

function ErrorBox({ msg }) {
  return (
    <div className="dev" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 11, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
      ⚠️ {msg}
    </div>
  )
}

function InfoBox({ msg }) {
  return (
    <div className="dev" style={{ background: 'var(--seal-soft, #eef2ff)', color: 'var(--seal, #4338ca)', borderRadius: 11, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
      ✉️ {msg}
    </div>
  )
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [stage, setStage] = useState('email') // 'email' | 'otp' | 'password' | 'done'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
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
    if (!email.trim()) { setErr('Enter your email'); return }
    setBusy(true); setErr('')
    try {
      const data = await requestSellerPasswordReset(email.trim())
      setInfo(data.message)
      setStage('otp')
      startCooldown()
    } catch (e) {
      setErr(e.response?.data?.message || 'Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setBusy(true); setErr('')
    try {
      await requestSellerPasswordReset(email.trim())
      startCooldown()
    } catch (e) {
      setErr(e.response?.data?.message || 'Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(otp)) { setErr('Enter the 6-digit code'); return }
    setBusy(true); setErr('')
    try {
      await verifySellerPasswordResetOtp(email.trim(), otp)
      setStage('password')
    } catch (e) {
      setErr(e.response?.data?.message || 'Invalid or expired code')
    } finally { setBusy(false) }
  }

  const handleReset = async () => {
    if (newPassword.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { setErr('Passwords do not match'); return }
    setBusy(true); setErr('')
    try {
      await resetSellerPassword(email.trim(), otp, newPassword, confirmPassword)
      setStage('done')
    } catch (e) {
      setErr(e.response?.data?.message || 'That code is invalid or has expired. Please request a new one.')
    } finally { setBusy(false) }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand"><Seal size="md" /><div><b>CivilCheck</b><div className="tag">PARTNER PORTAL</div></div></div>
        <div className="eyebrow">Reset password</div>
        <h1 style={{ fontSize: 22, margin: '6px 0 5px' }} className="dev">Forgot Password</h1>

        {err && <ErrorBox msg={err} />}
        {info && stage === 'otp' && <InfoBox msg={info} />}

        {stage === 'email' && (
          <>
            <p className="muted small dev" style={{ marginBottom: 22 }}>Apna registered email daaliye.</p>
            <div className="field">
              <label>Email <span className="req">*</span></label>
              <input
                className="control" type="email" autoFocus
                placeholder="you@example.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setErr('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
            </div>
            <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={handleSend} disabled={busy}>
              {busy ? 'Sending…' : 'Send reset code'}
            </button>
          </>
        )}

        {stage === 'otp' && (
          <>
            <div className="field">
              <label>6-digit code <span className="req">*</span></label>
              <input
                className="control" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                placeholder="123456" value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setErr('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                style={{ letterSpacing: '6px', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                autoFocus
              />
              <p className="xs muted" style={{ marginTop: 6 }}>Code expires in 10 minutes. Check the inbox for {email}.</p>
            </div>
            <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={handleVerify} disabled={busy}>
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
            <button
              className="btn btn-block"
              style={{ marginTop: 10, opacity: cooldown > 0 ? 0.5 : 1 }}
              onClick={handleResend}
              disabled={cooldown > 0 || busy}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </>
        )}

        {stage === 'password' && (
          <>
            <div className="field">
              <label>New Password <span className="req">*</span></label>
              <input
                className="control" type="password" autoFocus
                placeholder="At least 8 characters" value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setErr('') }}
              />
            </div>
            <div className="field">
              <label>Confirm Password <span className="req">*</span></label>
              <input
                className="control" type="password"
                placeholder="Re-enter password" value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErr('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleReset()}
              />
            </div>
            <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={handleReset} disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </>
        )}

        {stage === 'done' && (
          <>
            <InfoBox msg="Your password has been reset. You can now log in with your new password." />
            <button className="btn btn-primary btn-block" onClick={() => navigate('/login')}>Go to Log In</button>
          </>
        )}

        {stage !== 'done' && (
          <p className="xs muted dev" style={{ textAlign: 'center', marginTop: 18 }}>
            <Link to="/login">← Back to Log In</Link>
          </p>
        )}
      </div>
    </div>
  )
}
