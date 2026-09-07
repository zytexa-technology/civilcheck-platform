// SuperAdmin-only self-service password reset (email OTP via Resend).
// No signup exists anywhere in this app, and this flow only ever succeeds
// for the SUPER_ADMIN-role account — the backend silently no-ops for a
// SUB_ADMIN/VIEWER email (see passwordReset.service.ts), so this UI never
// needs to know or reveal which case it hit.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  requestAdminPasswordReset,
  verifyAdminPasswordResetOtp,
  resetAdminPassword,
} from '../api/auth.api'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [stage, setStage] = useState('email') // 'email' | 'otp' | 'password' | 'done'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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

  const handleSendCode = async () => {
    if (!email.trim()) { setError('Enter your email'); return }
    setLoading(true); setError('')
    try {
      const data = await requestAdminPasswordReset(email.trim())
      setInfo(data.message)
      setStage('otp')
      startCooldown()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setLoading(true); setError('')
    try {
      await requestAdminPasswordReset(email.trim())
      startCooldown()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit code'); return }
    setLoading(true); setError('')
    try {
      await verifyAdminPasswordResetOtp(email.trim(), otp)
      setStage('password')
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code')
    } finally { setLoading(false) }
  }

  const handleReset = async () => {
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    try {
      await resetAdminPassword(email.trim(), otp, newPassword, confirmPassword)
      setStage('done')
    } catch (err) {
      setError(err.response?.data?.message || 'That code is invalid or has expired. Please request a new one.')
    } finally { setLoading(false) }
  }

  return (
    <div style={s.bg}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { border-color: #3b82f6 !important; outline: none; }
        .login-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(#1f2535 1px, transparent 1px)', backgroundSize: '28px 28px', opacity: 0.4, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,.12), transparent)', pointerEvents: 'none' }} />

      <div style={s.box}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 14px' }}>
            🛡️
          </div>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 26, fontWeight: 800, color: '#e8eaf0' }}>
            CivilCheck
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 5, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>
            Reset Super Admin Password
          </div>
        </div>

        {error && <div style={s.errorBox}>❌ {error}</div>}
        {info && stage === 'otp' && <div style={s.infoBox}>✉️ {info}</div>}

        {stage === 'email' && (
          <>
            <div style={s.field}>
              <label style={s.label}>Email Address</label>
              <input
                type="email"
                placeholder="admin@civilcheck.in"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                style={s.input}
                autoFocus
              />
            </div>
            <button className="login-btn" onClick={handleSendCode} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Sending…' : 'Send reset code →'}
            </button>
          </>
        )}

        {stage === 'otp' && (
          <>
            <div style={s.field}>
              <label style={s.label}>6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                style={{ ...s.input, letterSpacing: '6px', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                autoFocus
              />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                Code expires in 10 minutes. Check the inbox for {email}.
              </div>
            </div>
            <button className="login-btn" onClick={handleVerify} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Verifying…' : 'Verify code →'}
            </button>
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || loading}
              style={{ ...s.linkBtn, marginTop: 12, opacity: cooldown > 0 ? 0.5 : 1 }}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </>
        )}

        {stage === 'password' && (
          <>
            <div style={s.field}>
              <label style={s.label}>New Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError('') }}
                style={s.input}
                autoFocus
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Confirm Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleReset()}
                style={s.input}
              />
            </div>
            <button className="login-btn" onClick={handleReset} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Updating…' : 'Update password →'}
            </button>
          </>
        )}

        {stage === 'done' && (
          <>
            <div style={s.infoBox}>✅ Your password has been reset. You can now log in with your new password.</div>
            <button className="login-btn" onClick={() => navigate('/login')} style={s.btn}>
              Go to login →
            </button>
          </>
        )}

        {stage !== 'done' && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link to="/login" style={{ fontSize: 12.5, color: '#9ca3af' }}>← Back to login</Link>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, color: '#9ca3af', fontSize: 12, borderTop: '1px solid #1f2535', paddingTop: 20 }}>
          Zytexa Technology LLP · Authorized Access Only
        </div>
      </div>
    </div>
  )
}

const s = {
  bg: { minHeight: '100vh', background: '#080b10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif", padding: 16, position: 'relative' },
  box: { position: 'relative', background: '#111318', border: '1px solid #1f2535', borderRadius: 18, padding: '36px 32px', width: 380, maxWidth: '100%', boxShadow: '0 32px 80px rgba(0,0,0,.6)' },
  errorBox: { background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 16 },
  infoBox: { background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 8, padding: '10px 14px', color: '#93c5fd', fontSize: 13, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 7, fontWeight: 600, letterSpacing: '.3px' },
  input: { width: '100%', background: '#181c24', border: '1px solid #1f2535', borderRadius: 9, padding: '11px 14px', color: '#e8eaf0', fontSize: 14, transition: 'border-color .15s', fontFamily: "'Poppins', sans-serif" },
  btn: { width: '100%', padding: '13px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', color: '#fff', fontSize: 15, fontWeight: 700, marginTop: 4, transition: 'all .2s', fontFamily: "'Poppins', sans-serif" },
  linkBtn: { width: '100%', padding: '8px', borderRadius: 9, border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12.5, fontFamily: "'Poppins', sans-serif" },
}
