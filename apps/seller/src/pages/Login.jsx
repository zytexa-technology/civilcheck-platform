// ─────────────────────────────────────────────────────────────────────────
//  Login.jsx  —  Seller / Partner Portal login
//
//  Email + password auth (replaces phone OTP — MSG91 removed). Phone stays
//  mandatory as a stored contact field, not a login credential.
//
//  FLOW:
//  ┌─ LANDING ─────────────────────────────────────────────────────────────┐
//  │  Log In (existing partner)  |  Become a Partner (new signup)          │
//  └───────────────────────────────────────────────────────────────────────┘
//        │                              │
//        ▼ email + password             ▼ Basic Profile → Role select
//     Dashboard                      Dashboard
//
//  Role backend (Seller.partnerRole) me save hota hai — isliye kisi bhi
//  device se login karo, sahi portal khulta hai.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { sellerLogin, sellerLoginFirebase, sellerRegister } from '../api/auth.api'
import { getSellerProfile } from '../api/seller.api'
import { sendOtp, confirmOtp, isFirebaseConfigured } from '../lib/firebaseAuth'
import { Seal, Icon } from '../components/Icon'
import { toast } from '../components/ui'

const PHONE_OTP_RECAPTCHA_ID = 'phone-otp-recaptcha'

// The field only ever wants a bare 10-digit number — the "+91" is shown as
// its own fixed prefix box, never typed. But a user who pastes the number
// the way Firebase Console itself displays it ("+91 9999900000") or types
// "919999900000" out of habit ends up with a raw value longer than 10
// characters; stripping non-digits alone would then need truncating to the
// LAST 10 digits (the actual number), not the first 10 (which chops real
// digits off the front). Handles a redundant "+91"/"91" prefix, or a
// domestic "0"-prefixed dialing habit, before falling back to a plain slice.
function normalizeIndianMobile(raw) {
  let digits = raw.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

const STATES = ['Rajasthan', 'Delhi', 'Maharashtra', 'Uttar Pradesh', 'Karnataka', 'Gujarat', 'Madhya Pradesh']

// Reporter is now a real partner role (Phase 4A) — content sourcing,
// moderation and the reward ledger all have real backend support, so it is
// offered here alongside Owner and Expert.
const ROLE_OPTS = [
  { id: 'OWNER',    emo: '🏠', name: 'Property Owner',    tone: 'green', tag: 'Instant',              desc: 'Apni property verify karke list karna chahta hoon.' },
  { id: 'REPORTER', emo: '📝', name: 'Reporter',          tone: 'green', tag: 'Instant',              desc: 'Property information source karke moderation ke liye submit karunga — reward points kamaunga.' },
  { id: 'EXPERT',   emo: '⚖️', name: 'Property Expert',   tone: 'amber', tag: 'Super Admin Approval', desc: 'Legal verification aur professional paid reports provide karunga.' },
]

// Property Expert professional-evidence step — only the enum values that
// already exist in the schema (Profession), nothing invented.
const PROFESSIONS = [
  { value: 'LAWYER',              label: 'Advocate / Lawyer' },
  { value: 'CIVIL_ENGINEER',      label: 'Civil Engineer' },
  { value: 'TEHSIL_EXPERT',       label: 'Patwari / Tehsildar / Revenue Officer' },
  { value: 'PROPERTY_CONSULTANT', label: 'Property Consultant' },
]

// Placeholder copy — the real, lawyer-drafted Seller T&C (PDF Section 10.3)
// doesn't exist yet. This text must be replaced before real sellers register.
const TC_PLACEHOLDER_TEXT =
  "I agree to CivilCheck's Seller Terms & Conditions and Privacy Policy, including the accuracy obligations and penalty clauses for incorrect listings."

const emailValid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
const passwordValid = (v) => v.length >= 8 && /[A-Za-z]/.test(v) && /[0-9]/.test(v)

export default function Login() {
  const navigate = useNavigate()
  const { login, seller } = useAuth()

  // landing → login | profile → role
  const [step, setStep] = useState('landing')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', city: '', state: '', profession: '', licenseNumber: '', yearsOfExperience: '' })
  const [role, setRole] = useState('')
  const [tcAccepted, setTcAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Phone-OTP login (additive — email/password above stays the default).
  const [loginMethod, setLoginMethod] = useState('password') // 'password' | 'phone'
  const [otpStage, setOtpStage] = useState('phone') // 'phone' | 'code'
  const [otpPhone, setOtpPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpConfirmation, setOtpConfirmation] = useState(null)

  // Pehle se logged-in? → dashboard
  useEffect(() => { if (seller) navigate('/dashboard', { replace: true }) }, [seller, navigate])

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // ── LOGIN ─────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!emailValid(loginForm.email) || !loginForm.password) {
      setErr('Enter a valid email and password')
      return
    }
    setErr(''); setBusy(true)
    try {
      const data = await sellerLogin(loginForm.email.trim(), loginForm.password)
      if (data.success) {
        await finalizeLogin(data.token, data.seller)
      } else {
        setErr(data.message || 'Login failed')
      }
    } catch (e) {
      setErr(e.response?.data?.message || 'Invalid email or password')
    } finally { setBusy(false) }
  }

  // ── PHONE-OTP LOGIN (additive) ─────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(otpPhone)) { setErr('Enter a valid 10-digit mobile number'); return }
    setErr(''); setBusy(true)
    try {
      const confirmation = await sendOtp(`+91${otpPhone}`, PHONE_OTP_RECAPTCHA_ID)
      setOtpConfirmation(confirmation)
      setOtpStage('code')
    } catch (e) {
      setErr(e?.message || "Couldn't send the code. Please try again.")
    } finally { setBusy(false) }
  }

  const handleVerifyOtp = async () => {
    if (!otpConfirmation) { setErr('Session expired — request a new code'); setOtpStage('phone'); return }
    if (!/^\d{6}$/.test(otpCode)) { setErr('Enter the 6-digit code'); return }
    setErr(''); setBusy(true)
    try {
      const idToken = await confirmOtp(otpConfirmation, otpCode)
      const data = await sellerLoginFirebase(idToken)
      if (data.success) {
        await finalizeLogin(data.token, data.seller)
      } else {
        setErr(data.message || 'Login failed')
      }
    } catch (e) {
      setErr(e.response?.data?.message || e?.message || 'Invalid or expired code')
    } finally { setBusy(false) }
  }

  // ── SAVE BASIC PROFILE (register step 1) ──────────────────────────────
  const saveProfile = () => {
    if (!form.name.trim())        { setErr('Full name zaroori'); return }
    if (form.phone.length !== 10) { setErr('10-digit mobile number zaroori'); return }
    if (!emailValid(form.email))  { setErr('Valid email zaroori'); return }
    if (!passwordValid(form.password)) { setErr('Password kam se kam 8 characters, 1 letter aur 1 number ke saath'); return }
    if (!form.city.trim())        { setErr('City zaroori'); return }
    if (!form.state)              { setErr('State select karein'); return }
    setErr(''); setStep('role')
  }

  // ── CONFIRM ROLE → REGISTER → dashboard (register step 2) ─────────────
  const confirmRole = async () => {
    if (!role) { setErr('Ek role choose karein'); return }
    // Property Expert requires meaningful professional evidence before it
    // even reaches the backend — mirrors sellerRegistrationSchema's
    // superRefine (profession + yearsOfExperience required for EXPERT).
    if (role === 'EXPERT') {
      if (!form.profession) { setErr('Profession select karein'); return }
      if (form.yearsOfExperience === '' || Number(form.yearsOfExperience) < 0) {
        setErr('Years of experience daaliye (0 ya usse zyada)'); return
      }
    }
    if (!tcAccepted) { setErr('Terms & Conditions accept karna zaroori hai'); return }
    setErr(''); setBusy(true)
    try {
      const data = await sellerRegister({
        phone: form.phone,
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        city: form.city.trim(),
        state: form.state,
        partnerRole: role,
        ...(role === 'EXPERT' ? {
          profession: form.profession,
          licenseNumber: form.licenseNumber.trim() || undefined,
          yearsOfExperience: Number(form.yearsOfExperience),
        } : {}),
        // Backend requires tcAccepted: true literally — without it every
        // registration was rejected with a 400 (see roadmap.md Day 1).
        tcAccepted: true,
        // "Digital signature" (PDF 6.1) — the seller's typed full name,
        // already collected in the profile step, doubles as this.
        digitalSignature: form.name.trim(),
      })
      if (data.success) {
        login(data.token, data.seller, [role])
        navigate('/dashboard', { replace: true })
      } else {
        setErr(data.message || 'Register nahi hua')
      }
    } catch (e) {
      const status = e.response?.status
      if (status === 409) {
        toast('Yeh phone ya email pehle se registered hai — login karein')
        setStep('login')
        setLoginForm({ email: form.email, password: '' })
      } else {
        setErr(e.response?.data?.message || e.response?.data?.errors?.[0]?.message || 'Register nahi hua — dobara try karo')
      }
    } finally { setBusy(false) }
  }

  // ── LOGIN finalize: profile se partnerRole nikaal ke portal kholo ─────
  const finalizeLogin = async (token, sellerData) => {
    localStorage.setItem('seller_token', token) // axios interceptor ke liye
    let s = sellerData
    let r = null
    try {
      const prof = await getSellerProfile()
      if (prof?.seller) { s = prof.seller; r = prof.seller.partnerRole }
    } catch { /* verify wala seller use karo */ }
    r = r || s?.partnerRole || 'OWNER'
    login(token, s, [r])
    navigate('/dashboard', { replace: true })
  }

  const BrandSmall = <div className="brand"><Seal size="sm" /><b>CivilCheck</b></div>

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="auth">

      {/* ===== LANDING ===== */}
      {step === 'landing' && (
        <div className="auth-card">
          <div className="brand">
            <Seal size="md" />
            <div><b>CivilCheck</b><div className="tag">PARTNER PORTAL</div></div>
          </div>
          <div className="eyebrow">Welcome</div>
          <h1 style={{ fontSize: 26, margin: '8px 0 6px' }} className="dev">Partner Portal me aaiye</h1>
          <p className="muted small dev" style={{ marginBottom: 24 }}>
            Property Owner, Reporter aur Expert partners ke liye. Buyer platform alag hai.
          </p>

          <button
            className="btn btn-seal btn-block"
            onClick={() => { setErr(''); setStep('login') }}
          >
            <Icon name="lock" size={18} />
            Log In
          </button>

          <button
            className="btn btn-ghost btn-block"
            style={{ marginTop: 11 }}
            onClick={() => { setErr(''); setStep('profile') }}
          >
            Become a Partner — Sign Up
          </button>

          <p className="xs muted dev" style={{ textAlign: 'center', marginTop: 18 }}>
            Continue karke aap Terms & Privacy Policy se sehmat hote hain.
          </p>
        </div>
      )}

      {/* ===== LOGIN ===== */}
      {step === 'login' && (
        <div className="auth-card">
          {BrandSmall}
          <div className="eyebrow">Welcome back</div>
          <h1 style={{ fontSize: 22, margin: '6px 0 5px' }} className="dev">Log In</h1>

          <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--line)' }}>
            {['password', 'phone'].map((m) => (
              <button
                key={m}
                type="button"
                className="btn"
                style={{
                  flex: 1,
                  borderRadius: 0,
                  borderBottom: loginMethod === m ? '2px solid var(--seal)' : '2px solid transparent',
                  fontWeight: loginMethod === m ? 700 : 500,
                  color: loginMethod === m ? 'inherit' : 'var(--muted)',
                }}
                onClick={() => { setLoginMethod(m); setErr(''); setOtpStage('phone') }}
              >
                {m === 'password' ? 'Email & password' : 'Phone number'}
              </button>
            ))}
          </div>

          {err && <ErrorBox msg={err} />}

          {loginMethod === 'password' ? (
            <>
              <p className="muted small dev" style={{ marginBottom: 22 }}>Apna email aur password daaliye</p>
              <div className="field">
                <label>Email <span className="req">*</span></label>
                <input
                  className="control" type="email" autoFocus
                  placeholder="you@example.com" value={loginForm.email}
                  onChange={(e) => { setLoginForm((f) => ({ ...f, email: e.target.value })); setErr('') }}
                />
              </div>
              <div className="field">
                <label>Password <span className="req">*</span></label>
                <input
                  className="control" type="password"
                  placeholder="Your password" value={loginForm.password}
                  onChange={(e) => { setLoginForm((f) => ({ ...f, password: e.target.value })); setErr('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
              <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 8 }}>
                <Link to="/forgot-password" className="xs muted">Forgot password?</Link>
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={handleLogin} disabled={busy}>
                {busy ? 'Logging in…' : 'Log In'}
              </button>
            </>
          ) : !isFirebaseConfigured ? (
            <p className="muted small dev" style={{ marginBottom: 8 }}>
              Phone-OTP login is not available on this deployment yet — use email and password instead.
            </p>
          ) : (
            <>
              <div id={PHONE_OTP_RECAPTCHA_ID} />
              {otpStage === 'phone' ? (
                <>
                  <div className="field">
                    <label>Mobile Number <span className="req">*</span></label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div className="control" style={{ width: 56, flex: 'none', display: 'grid', placeItems: 'center', fontWeight: 600 }}>+91</div>
                      <input
                        className="control" inputMode="numeric" maxLength={13}
                        placeholder="10-digit number" value={otpPhone}
                        onChange={(e) => { setOtpPhone(normalizeIndianMobile(e.target.value)); setErr('') }}
                      />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={handleSendOtp} disabled={busy}>
                    {busy ? 'Sending…' : 'Send code'}
                  </button>
                </>
              ) : (
                <>
                  <p className="muted small dev" style={{ marginBottom: 12 }}>
                    Code sent to +91 {otpPhone}.{' '}
                    <button type="button" className="btn" style={{ padding: 0, color: 'var(--seal)' }} onClick={() => { setOtpStage('phone'); setOtpCode(''); setErr('') }}>
                      Change number
                    </button>
                  </p>
                  <div className="field">
                    <label>6-digit code <span className="req">*</span></label>
                    <input
                      className="control" inputMode="numeric" maxLength={6}
                      placeholder="000000" value={otpCode}
                      onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr('') }}
                      onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                    />
                  </div>
                  <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={handleVerifyOtp} disabled={busy}>
                    {busy ? 'Verifying…' : 'Verify & log in'}
                  </button>
                </>
              )}
            </>
          )}

          <button className="btn btn-block" style={{ color: 'var(--muted)', marginTop: 6 }} onClick={() => { setErr(''); setStep('profile') }}>
            New partner? Sign up
          </button>
          <button className="btn btn-block" style={{ color: 'var(--muted)', marginTop: 2 }} onClick={() => setStep('landing')}>
            ← Back
          </button>
        </div>
      )}

      {/* ===== PROFILE (register step 1) ===== */}
      {step === 'profile' && (
        <div className="auth-card auth-wide">
          <div className="eyebrow">Step 1 of 2</div>
          <h1 style={{ fontSize: 24, margin: '6px 0 4px' }} className="dev">Basic Profile</h1>
          <p className="muted small dev" style={{ marginBottom: 22 }}>Signup ke liye thodi si jaankari.</p>
          {err && <ErrorBox msg={err} />}
          <div className="row">
            <div className="field"><label>Full Name <span className="req">*</span></label>
              <input className="control" placeholder="Aapka poora naam" value={form.name} onChange={(e) => setField('name', e.target.value)} /></div>
            <div className="field"><label>Mobile Number <span className="req">*</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="control" style={{ width: 56, flex: 'none', display: 'grid', placeItems: 'center', fontWeight: 600 }}>+91</div>
                <input
                  className="control" inputMode="numeric" maxLength={10}
                  placeholder="10-digit number" value={form.phone}
                  onChange={(e) => setField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                />
              </div>
            </div>
          </div>
          <div className="row">
            <div className="field"><label>Email <span className="req">*</span></label>
              <input className="control" type="email" placeholder="name@email.com" value={form.email} onChange={(e) => setField('email', e.target.value)} /></div>
            <div className="field"><label>Password <span className="req">*</span></label>
              <input className="control" type="password" placeholder="At least 8 characters" value={form.password} onChange={(e) => setField('password', e.target.value)} /></div>
          </div>
          <div className="row">
            <div className="field"><label>City <span className="req">*</span></label>
              <input className="control" placeholder="Jaipur" value={form.city} onChange={(e) => setField('city', e.target.value)} /></div>
            <div className="field"><label>State <span className="req">*</span></label>
              <select className="control" value={form.state} onChange={(e) => setField('state', e.target.value)}>
                <option value="">Select state</option>
                {STATES.map((st) => <option key={st}>{st}</option>)}
              </select></div>
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={saveProfile}>Save & Continue</button>
          <button className="btn btn-block" style={{ color: 'var(--muted)', marginTop: 6 }} onClick={() => setStep('landing')}>← Back</button>
        </div>
      )}

      {/* ===== ROLE (register step 2 — single select) ===== */}
      {step === 'role' && (
        <div className="auth-card auth-wide">
          <div className="eyebrow">Step 2 of 2</div>
          <h1 style={{ fontSize: 24, margin: '6px 0 4px' }} className="dev">Choose your partner role</h1>
          <p className="muted small dev" style={{ marginBottom: 22 }}>Sirf EK role choose karein — aage yahi aapka portal hoga.</p>
          {err && <ErrorBox msg={err} />}
          {ROLE_OPTS.map((r) => {
            const on = role === r.id
            return (
              <button key={r.id} className={`opt-card ${on ? 'sel' : ''}`} onClick={() => setRole(r.id)}>
                <div className="emo">{r.emo}</div>
                <div style={{ flex: 1 }}>
                  <h3 className="dev">{r.name} <span className={`chip ${r.tone}`}>{r.tag}</span></h3>
                  <p className="small muted dev">{r.desc}</p>
                </div>
                <div className="tick">{on && <Icon name="check" size={14} stroke={3} />}</div>
              </button>
            )
          })}

          {/* Property Expert — professional evidence (KYC hardening). Never
              implies signup itself means verified — explicit approval notice
              below, and kycStatus stays PENDING until Super Admin approves. */}
          {role === 'EXPERT' && (
            <div className="card" style={{ padding: 16, margin: '4px 0 14px', background: 'var(--amber-soft, #fff7e6)' }}>
              <p className="small dev" style={{ fontWeight: 600, marginBottom: 12 }}>
                ⚠️ Property Expert applications require Super Admin approval. Completing
                this form does not mean you are verified yet — an admin reviews your
                professional details and documents before approval.
              </p>
              <div className="row">
                <div className="field"><label>Profession <span className="req">*</span></label>
                  <select className="control" value={form.profession} onChange={(e) => setField('profession', e.target.value)}>
                    <option value="">Select profession</option>
                    {PROFESSIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select></div>
                <div className="field"><label>Years of Experience <span className="req">*</span></label>
                  <input
                    className="control" type="number" min="0" max="80"
                    placeholder="e.g. 5" value={form.yearsOfExperience}
                    onChange={(e) => setField('yearsOfExperience', e.target.value)}
                  /></div>
              </div>
              <div className="field">
                <label>License / Registration Number <span className="opt">(where applicable)</span></label>
                <input
                  className="control" placeholder="e.g. Bar Council enrollment number"
                  value={form.licenseNumber} onChange={(e) => setField('licenseNumber', e.target.value)}
                />
              </div>
              <p className="xs muted dev" style={{ marginTop: 4 }}>
                You'll upload your professional certificate and identity document for review
                after signup, on your KYC & Documents page.
              </p>
            </div>
          )}

          <label
            className="small"
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '18px 0 8px', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={tcAccepted}
              onChange={(e) => setTcAccepted(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span className="muted">{TC_PLACEHOLDER_TEXT}</span>
          </label>
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 8 }}
            onClick={confirmRole}
            disabled={busy || !tcAccepted}
          >
            {busy ? 'Setup ho raha hai…' : 'Enter Partner Portal'}
          </button>
          <button className="btn btn-block" style={{ color: 'var(--muted)', marginTop: 6 }} onClick={() => setStep('profile')}>← Back</button>
        </div>
      )}
    </div>
  )
}

function ErrorBox({ msg }) {
  return (
    <div className="dev" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 11, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
      ⚠️ {msg}
    </div>
  )
}
