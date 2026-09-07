import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { adminLogin, adminLoginFirebase } from '../api/auth.api'
import { useAuth } from '../context/AuthContext'
import { sendOtp, confirmOtp, isFirebaseConfigured } from '../lib/firebaseAuth'

const PHONE_OTP_RECAPTCHA_ID = 'admin-phone-otp-recaptcha'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  // Email/password stays the default, primary method — phone-OTP is an
  // additive alternative, SUB_ADMIN/VIEWER only (SuperAdmin is refused
  // server-side, and this login screen never claims otherwise).
  const [method, setMethod] = useState('password') // 'password' | 'phone'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  // Flipped by a 401 {code:'TOTP_REQUIRED'} — the panel cannot know in advance
  // whether this admin has 2FA enrolled, so the code field only appears once
  // the backend asks for it.
  const [totpStage, setTotpStage] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Phone-OTP state
  const [otpStage, setOtpStage] = useState('phone') // 'phone' | 'code'
  const [otpPhone, setOtpPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpTotp, setOtpTotp] = useState('')
  const [otpTotpStage, setOtpTotpStage] = useState(false)
  const [otpConfirmation, setOtpConfirmation] = useState(null)

  const handleLogin = async () => {
    if (!email.trim()) { setError('Enter your email'); return }
    if (!password.trim()) { setError('Enter your password'); return }
    if (totpStage && !totp.trim()) { setError('Enter the 6-digit code'); return }

    setLoading(true)
    setError('')
    try {
      const data = await adminLogin(email, password, totp.trim())
      login(data.token, data.admin)
      // An unenrolled admin lands on the security page instead of the
      // dashboard — the backend leaves this a prompt, not a hard block, so
      // they can still navigate away if they need to.
      navigate(data.twoFactor?.enrollmentRequired ? '/dashboard/security' : '/dashboard')
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'TOTP_REQUIRED') {
        setTotpStage(true)
        setError('')
      } else if (code === 'TOTP_INVALID') {
        // Codes are single-use, so a rejected one is never worth resubmitting.
        setTotp('')
        setError('Invalid or already-used code — get a fresh one from your authenticator app')
      } else {
        setError(err.response?.data?.message || 'Invalid email ya password')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(otpPhone)) { setError('Enter a valid 10-digit mobile number'); return }
    setError(''); setLoading(true)
    try {
      const confirmation = await sendOtp(`+91${otpPhone}`, PHONE_OTP_RECAPTCHA_ID)
      setOtpConfirmation(confirmation)
      setOtpStage('code')
    } catch (err) {
      setError(err?.message || "Couldn't send the code. Please try again.")
    } finally { setLoading(false) }
  }

  const handleVerifyOtp = async () => {
    if (!otpConfirmation) { setError('Session expired — request a new code'); setOtpStage('phone'); return }
    if (!/^\d{6}$/.test(otpCode)) { setError('Enter the 6-digit code'); return }
    if (otpTotpStage && !otpTotp.trim()) { setError('Enter the 6-digit authenticator code'); return }

    setError(''); setLoading(true)
    try {
      const idToken = await confirmOtp(otpConfirmation, otpCode)
      const data = await adminLoginFirebase(idToken, otpTotp.trim())
      login(data.token, data.admin)
      navigate(data.twoFactor?.enrollmentRequired ? '/dashboard/security' : '/dashboard')
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'TOTP_REQUIRED') {
        setOtpTotpStage(true)
        setError('')
      } else if (code === 'TOTP_INVALID') {
        setOtpTotp('')
        setError('Invalid or already-used code — get a fresh one from your authenticator app')
      } else {
        setError(err.response?.data?.message || err?.message || 'Invalid or expired code')
      }
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

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(#1f2535 1px, transparent 1px)', backgroundSize: '28px 28px', opacity: 0.4, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,.12), transparent)', pointerEvents: 'none' }} />

      {/* Box */}
      <div style={s.box}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 14px' }}>
            🛡️
          </div>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 26, fontWeight: 800, color: '#e8eaf0' }}>
            CivilCheck
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 5, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>
            Super Admin Portal
          </div>
        </div>

        {/* Method toggle — email/password stays default, phone-OTP is additive */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid #1f2535' }}>
          {['password', 'phone'].map(m => (
            <button
              key={m}
              onClick={() => { setMethod(m); setError('') }}
              style={{
                flex: 1, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: method === m ? '2px solid #3b82f6' : '2px solid transparent',
                color: method === m ? '#e8eaf0' : '#9ca3af',
                fontWeight: method === m ? 700 : 500, fontSize: 12.5, fontFamily: "'Poppins', sans-serif",
              }}
            >
              {m === 'password' ? 'Email & Password' : 'Phone OTP'}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={s.errorBox}>❌ {error}</div>
        )}

        {method === 'password' ? (
          <>
            {/* Email */}
            <div style={s.field}>
              <label style={s.label}>Email Address</label>
              <input
                type="email"
                placeholder="admin@civilcheck.in"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={s.input}
                autoFocus
              />
            </div>

            {/* Password */}
            <div style={s.field}>
              <label style={s.label}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  style={{ ...s.input, paddingRight: 44 }}
                />
                <button onClick={() => setShowPass(!showPass)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16, padding: 4 }}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* SuperAdmin-only self-service reset (see ForgotPassword.jsx) —
                hidden once the TOTP stage starts, since a code prompt there
                means the password itself already checked out. */}
            {!totpStage && (
              <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 16 }}>
                <Link to="/forgot-password" style={{ fontSize: 12.5, color: '#9ca3af' }}>
                  Forgot password?
                </Link>
              </div>
            )}

            {/* TOTP — only after the backend asks for it */}
            {totpStage && (
              <div style={s.field}>
                <label style={s.label}>Authenticator Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={totp}
                  onChange={e => { setTotp(e.target.value.replace(/\D/g, '')); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  style={{ ...s.input, letterSpacing: '6px', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                  autoFocus
                />
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                  6-digit code from your authenticator app
                </div>
              </div>
            )}

            <button className="login-btn" onClick={handleLogin} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} />
                  Logging in...
                </span>
              ) : totpStage ? 'Verify & Sign In →' : 'Sign In →'}
            </button>
          </>
        ) : !isFirebaseConfigured ? (
          <div style={{ fontSize: 12.5, color: '#9ca3af', lineHeight: 1.6, marginBottom: 8 }}>
            Phone-OTP login is not available on this deployment yet — use email and password.
          </div>
        ) : (
          <>
            <div id={PHONE_OTP_RECAPTCHA_ID} />
            <div style={{ fontSize: 11.5, color: '#9ca3af', lineHeight: 1.6, marginBottom: 14 }}>
              Only works for accounts that have already linked a phone number from Security settings. SuperAdmin cannot use phone-OTP login.
            </div>
            {otpStage === 'phone' ? (
              <>
                <div style={s.field}>
                  <label style={s.label}>Mobile Number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    value={otpPhone}
                    onChange={e => { setOtpPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                    style={s.input}
                    autoFocus
                  />
                </div>
                <button className="login-btn" onClick={handleSendOtp} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Sending…' : 'Send code'}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
                  Code sent to +91 {otpPhone}.{' '}
                  <button onClick={() => { setOtpStage('phone'); setOtpCode(''); setError('') }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', font: 'inherit' }}>
                    Change number
                  </button>
                </div>
                <div style={s.field}>
                  <label style={s.label}>6-digit code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={otpCode}
                    onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                    style={{ ...s.input, letterSpacing: '6px', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                    autoFocus
                  />
                </div>
                {otpTotpStage && (
                  <div style={s.field}>
                    <label style={s.label}>Authenticator Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="123456"
                      value={otpTotp}
                      onChange={e => { setOtpTotp(e.target.value.replace(/\D/g, '')); setError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                      style={{ ...s.input, letterSpacing: '6px', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                    />
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                      6-digit code from your authenticator app
                    </div>
                  </div>
                )}
                <button className="login-btn" onClick={handleVerifyOtp} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Verifying…' : otpTotpStage ? 'Verify & Sign In →' : 'Verify & Sign In →'}
                </button>
              </>
            )}
          </>
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
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 7, fontWeight: 600, letterSpacing: '.3px' },
  input: { width: '100%', background: '#181c24', border: '1px solid #1f2535', borderRadius: 9, padding: '11px 14px', color: '#e8eaf0', fontSize: 14, transition: 'border-color .15s', fontFamily: "'Poppins', sans-serif" },
  btn: { width: '100%', padding: '13px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', color: '#fff', fontSize: 15, fontWeight: 700, marginTop: 4, transition: 'all .2s', fontFamily: "'Poppins', sans-serif" },
}