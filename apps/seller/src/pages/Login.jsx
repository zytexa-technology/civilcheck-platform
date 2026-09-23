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
//        ▼ email + password             ▼ Basic Profile → Role select →
//     Dashboard                        Identity Verification (DigiLocker —
//                                      same for every partner role) →
//                                      email verification
//
//  Role backend (Seller.partnerRole) me save hota hai — isliye kisi bhi
//  device se login karo, sahi portal khulta hai.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  sellerLogin, sellerLoginFirebase, sellerRegister, verifyEmail, resendVerificationEmail,
  getSignupIdentityConfig, startSignupDigilocker, getSignupDigilockerStatus,
} from '../api/auth.api'
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

// Mandatory Terms & Conditions / Privacy Policy consent (Terms & Consent
// Implementation) — the general Terms/Privacy content now exists (Content
// Control Disclaimer keys "terms-and-conditions"/"privacy-policy", see
// apps/api/scripts/seed-legal-content.ts) and is linked below, not just
// named in plain text. This checkbox is still the one place that sets
// tcAccepted === true, which the backend (seller.controller.ts's
// sellerRegister) uses to both satisfy the existing KYC-completeness
// compliance flag AND record a proper versioned/timestamped
// TermsAcceptance row — see terms.service.ts. The accuracy-obligations/
// penalty-clause sentence remains supplementary text describing this
// codebase's real strike/penalty system (Seller.strikeCount), not invented
// legal copy.
const TC_SUFFIX_TEXT =
  ', including the accuracy obligations and penalty clauses for incorrect listings.'

const emailValid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
const passwordValid = (v) => v.length >= 8 && /[A-Za-z]/.test(v) && /[0-9]/.test(v)

export default function Login() {
  const navigate = useNavigate()
  const { login, seller } = useAuth()

  // landing → login | profile → role → verify-email
  const [step, setStep] = useState('landing')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', password: '', confirmPassword: '', city: '', state: '', profession: '', licenseNumber: '', yearsOfExperience: '' })
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

  // Signup Email Verification — the OTP screen after registration (and the
  // recovery path when handleLogin gets EMAIL_NOT_VERIFIED back).
  const [verifyEmailAddr, setVerifyEmailAddr] = useState('')
  const [emailOtp, setEmailOtp] = useState('')
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0)
  const [resendMessage, setResendMessage] = useState('')

  // Identity Verification step (DigiLocker) — identical for Owner, Reporter
  // and Expert. `skipEnabled` and `available` come from the backend's single
  // source of truth (config/identityVerification.ts) via
  // GET /seller/signup/identity-config, so this screen never hardcodes the
  // skip decision — and the backend enforces the same rule regardless.
  //   skipEnabled true  → "Skip for now" is offered (approval still pending)
  //   available   false → provider not configured; verification genuinely
  //                       cannot run yet and we say so rather than pretend
  const [identityCfg, setIdentityCfg] = useState({ loaded: false, skipEnabled: true, available: false })
  const [identityBusy, setIdentityBusy] = useState(false)
  const [identityNotice, setIdentityNotice] = useState('')
  // 'NOT_CONNECTED' | 'PENDING' | 'VERIFIED' | 'FAILED' — only ever set from
  // the server's view of the session, never assumed locally.
  const [digilockerStatus, setDigilockerStatus] = useState('NOT_CONNECTED')

  // Opaque pre-account session token. Kept in sessionStorage so it survives
  // the full-page redirect out to DigiLocker and back; it carries no identity
  // data on its own and is single-use server-side.
  const readSignupToken = () => {
    try { return sessionStorage.getItem('digilocker_signup_token') || '' } catch { return '' }
  }
  const writeSignupToken = (t) => {
    try { if (t) sessionStorage.setItem('digilocker_signup_token', t) } catch { /* private mode */ }
  }
  const clearSignupToken = () => {
    try { sessionStorage.removeItem('digilocker_signup_token') } catch { /* private mode */ }
  }

  const startEmailOtpCooldown = () => {
    setEmailOtpCooldown(60)
    const iv = setInterval(() => {
      setEmailOtpCooldown((c) => {
        if (c <= 1) { clearInterval(iv); return 0 }
        return c - 1
      })
    }, 1000)
  }

  // Pehle se logged-in? → dashboard
  useEffect(() => { if (seller) navigate('/dashboard', { replace: true }) }, [seller, navigate])

  // On entering the Identity Verification step, ask the backend whether
  // DigiLocker is mandatory and whether the provider is configured. Failing
  // closed on the "required" flag would strand the user, and failing open on
  // "available" would promise a provider that cannot run — so a failed
  // lookup keeps the safe defaults (optional, unavailable) and the step still
  // offers "Skip for now".
  useEffect(() => {
    if (step !== 'kyc') return
    let cancelled = false
    getSignupIdentityConfig()
      .then((d) => {
        if (!cancelled) setIdentityCfg({ loaded: true, skipEnabled: !!d.skipEnabled, available: !!d.available })
      })
      .catch(() => {
        // Safe defaults: never silently hide Skip on a lookup failure (that
        // would strand the user), and never claim the provider is available.
        if (!cancelled) setIdentityCfg({ loaded: true, skipEnabled: true, available: false })
      })
    return () => { cancelled = true }
  }, [step])

  // Returning from DigiLocker: the backend redirects to /login?digilocker=<code>
  // with only a fixed result code — no tokens or identity data in the URL. Land
  // the user back on the identity step, then read the REAL status from the
  // server (the code alone is never treated as proof of verification).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('digilocker')
    if (!code) return

    params.delete('digilocker')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))

    const MESSAGES = {
      success: '',
      cancelled: 'You cancelled DigiLocker verification. You can try again.',
      failed: 'DigiLocker verification could not be completed. Please try again.',
      unavailable: 'DigiLocker is temporarily unavailable. Please try again later.',
      session_expired: 'Your verification session expired. Please start again.',
    }
    setStep('kyc')
    setIdentityNotice(MESSAGES[code] ?? MESSAGES.failed)

    const token = readSignupToken()
    if (!token) { setDigilockerStatus('NOT_CONNECTED'); return }
    getSignupDigilockerStatus(token)
      .then((d) => setDigilockerStatus(d.status || 'NOT_CONNECTED'))
      .catch(() => setDigilockerStatus('NOT_CONNECTED'))
  }, [])

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
      // Signup Email Verification — send an unverified account straight to
      // the OTP screen instead of a dead-end "wrong password" error.
      if (e.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        setVerifyEmailAddr(loginForm.email.trim())
        setErr(''); setStep('verify-email')
        return
      }
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
    if (form.address.trim().length < 10) { setErr('Poora address daaliye (kam se kam 10 characters)'); return }
    if (!passwordValid(form.password)) { setErr('Password kam se kam 8 characters, 1 letter aur 1 number ke saath'); return }
    if (form.password !== form.confirmPassword) { setErr('Passwords match nahi karte'); return }
    if (!form.city.trim())        { setErr('City zaroori'); return }
    if (!form.state)              { setErr('State select karein'); return }
    setErr(''); setStep('role')
  }

  // ── CONFIRM ROLE → REGISTER → dashboard (register step 2) ─────────────
  const confirmRole = async () => {
    if (!role) { setErr('Ek role choose karein'); return }
    // Property Expert requires a profession before it even reaches the
    // backend — mirrors sellerRegistrationSchema's superRefine. Years of
    // Experience is OPTIONAL: only validated (must not be negative) when the
    // user actually enters something; left blank, it is simply not sent.
    if (role === 'EXPERT') {
      if (!form.profession) { setErr('Profession select karein'); return }
      if (form.yearsOfExperience !== '' && Number(form.yearsOfExperience) < 0) {
        setErr('Years of experience 0 ya usse zyada honi chahiye'); return
      }
    }
    if (!tcAccepted) { setErr('Terms & Conditions accept karna zaroori hai'); return }
    // Every partner role (Reporter / Owner / Expert) reaches the same
    // DigiLocker identity step before the account is created.
    setErr(''); setStep('kyc')
  }

  // ── Identity: start the real DigiLocker OAuth round trip ──────────────
  // Nothing here fabricates a verified state: the server creates a
  // pre-account session, we navigate the browser to DigiLocker, and the only
  // thing that can produce VERIFIED is the provider callback.
  const handleDigilockerVerify = async () => {
    setErr(''); setIdentityNotice(''); setIdentityBusy(true)
    try {
      const data = await startSignupDigilocker(readSignupToken() || undefined)
      if (!data?.authorizationUrl) throw new Error('no authorization url')
      writeSignupToken(data.signupToken)
      window.location.assign(data.authorizationUrl) // full redirect out to DigiLocker
    } catch (e) {
      setIdentityBusy(false)
      setIdentityNotice(
        e.response?.status === 503
          ? 'DigiLocker verification is not available yet.'
          : 'Could not start DigiLocker verification. Please try again.'
      )
    }
  }

  // ── COMPLETE SIGNUP → REGISTER ────────────────────────────────────────
  // Sends the pre-account DigiLocker session token when one exists. The
  // server decides what it is worth: with skip enabled an unverified signup
  // is allowed and nothing is marked verified; with skip disabled the token
  // must resolve to a genuinely VERIFIED session or registration is refused.
  // Either way this cannot be bypassed from the client.
  const completeSignup = async () => {
    setErr(''); setBusy(true)
    try {
      const signupToken = readSignupToken()
      const data = await sellerRegister({
        ...(signupToken ? { digilockerSignupToken: signupToken } : {}),
        phone: form.phone,
        name: form.name.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        city: form.city.trim(),
        state: form.state,
        partnerRole: role,
        ...(role === 'EXPERT' ? {
          profession: form.profession,
          licenseNumber: form.licenseNumber.trim() || undefined,
          // Optional — omitted entirely when left blank, never a fake 0.
          ...(form.yearsOfExperience !== '' ? { yearsOfExperience: Number(form.yearsOfExperience) } : {}),
        } : {}),
        // Backend requires tcAccepted: true literally — without it every
        // registration was rejected with a 400 (see roadmap.md Day 1).
        tcAccepted: true,
        // "Digital signature" (PDF 6.1) — the seller's typed full name,
        // already collected in the profile step, doubles as this.
        digitalSignature: form.name.trim(),
      })
      if (data.success) {
        // The signup session is single-use and now spent (or was never
        // needed) — drop it so a later signup cannot reuse it.
        clearSignupToken()
        // Signup Email Verification — no token yet; the account is
        // unverified until the emailed OTP is confirmed on the next step.
        setVerifyEmailAddr(data.email || form.email.trim())
        setStep('verify-email')
      } else {
        setErr(data.message || 'Register nahi hua')
      }
    } catch (e) {
      const status = e.response?.status
      const code = e.response?.data?.code
      if (code === 'DIGILOCKER_VERIFICATION_REQUIRED' || code === 'PARTNER_ROLE_REQUIRED') {
        // Server refused: verification is mandatory and was not completed.
        // Re-read the real status so the screen reflects the server, not a guess.
        setErr(e.response.data.message)
        const t = readSignupToken()
        if (t) getSignupDigilockerStatus(t).then((d) => setDigilockerStatus(d.status || 'NOT_CONNECTED')).catch(() => {})
      } else if (status === 409) {
        toast('Yeh phone ya email pehle se registered hai — login karein')
        setStep('login')
        setLoginForm({ email: form.email, password: '' })
      } else {
        setErr(e.response?.data?.message || e.response?.data?.errors?.[0]?.message || 'Register nahi hua — dobara try karo')
      }
    } finally { setBusy(false) }
  }

  // ── VERIFY EMAIL (register step 3) ─────────────────────────────────────
  const handleVerifyEmail = async () => {
    if (!/^\d{6}$/.test(emailOtp)) { setErr('Enter the 6-digit code'); return }
    setErr(''); setBusy(true)
    try {
      const data = await verifyEmail(verifyEmailAddr, emailOtp)
      if (data.success) {
        // role may be '' if we got here via handleLogin's EMAIL_NOT_VERIFIED
        // recovery path rather than fresh registration — finalizeLogin
        // already knows how to fall back to the seller's own partnerRole.
        await finalizeLogin(data.token, data.seller)
      } else {
        setErr(data.message || 'Verification failed')
      }
    } catch (e) {
      setErr(e.response?.data?.message || 'Invalid or expired code')
    } finally { setBusy(false) }
  }

  const handleResendEmailOtp = async () => {
    if (emailOtpCooldown > 0) return
    setErr(''); setBusy(true)
    try {
      const data = await resendVerificationEmail(verifyEmailAddr)
      setResendMessage(data.message || '')
      startEmailOtpCooldown()
    } catch (e) {
      setErr(e.response?.data?.message || "Couldn't resend the code. Please try again.")
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
            Property Owner, Reporter aur Expert partners ke liye. User platform alag hai.
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
            <div className="field"><label>Address <span className="req">*</span></label>
              <input className="control" placeholder="Aapka poora address" value={form.address} onChange={(e) => setField('address', e.target.value)} /></div>
          </div>
          <div className="row">
            <div className="field"><label>Password <span className="req">*</span></label>
              <input className="control" type="password" placeholder="At least 8 characters" value={form.password} onChange={(e) => setField('password', e.target.value)} /></div>
            <div className="field"><label>Confirm Password <span className="req">*</span></label>
              <input className="control" type="password" placeholder="Re-enter password" value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} /></div>
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
                <div className="field"><label>Years of Experience <span className="opt">(optional)</span></label>
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
            <span className="muted">
              I agree to CivilCheck&apos;s{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--seal, #B67A12)' }}>Partner Terms &amp; Conditions</Link>
              {' '}and{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--seal, #B67A12)' }}>Privacy Policy</Link>
              {TC_SUFFIX_TEXT}
            </span>
          </label>
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 8 }}
            onClick={confirmRole}
            disabled={busy || !tcAccepted}
          >
            Continue to Identity Verification
          </button>
          <button className="btn btn-block" style={{ color: 'var(--muted)', marginTop: 6 }} onClick={() => setStep('profile')}>← Back</button>
        </div>
      )}

      {/* ===== IDENTITY VERIFICATION (register step 3 — DigiLocker) =====
           Identical for Property Owner, Reporter and Expert. No Aadhaar
           number, OTP or photo is collected anywhere in signup. Whether the
           step can be skipped comes from the backend
           (config/identityVerification.ts) — never hardcoded here, and the
           server enforces the same rule. */}
      {step === 'kyc' && (
        <div className="auth-card auth-wide">
          <div className="eyebrow">Step 3 of 3</div>
          <h1 style={{ fontSize: 24, margin: '6px 0 4px' }} className="dev">Verify your identity with DigiLocker</h1>
          <p className="muted small dev" style={{ marginBottom: 22 }}>
            DigiLocker verifies your identity securely — you do not need to enter your Aadhaar
            number or upload any Aadhaar document.
          </p>
          {err && <ErrorBox msg={err} />}

          <div className="card" style={{ padding: 18, marginBottom: 14 }}>
            {digilockerStatus === 'VERIFIED' ? (
              <div className="dev" style={{ color: 'var(--success, #1a7f4b)', fontWeight: 700, fontSize: 14 }}>
                ✓ DigiLocker verification successful
              </div>
            ) : (
              <>
                <button
                  className="btn btn-primary btn-block"
                  onClick={handleDigilockerVerify}
                  disabled={busy || identityBusy}
                >
                  {identityBusy ? 'Redirecting to DigiLocker…' : 'Verify with DigiLocker'}
                </button>

                {/* Honest status — only ever what the server reports. Nothing
                    here can mark the partner verified. */}
                <div className="small dev" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--muted)' }}>○</span>
                  <span className="muted">
                    {digilockerStatus === 'FAILED' ? 'Verification failed — you can try again' : 'Not verified'}
                  </span>
                </div>
              </>
            )}

            {identityCfg.loaded && !identityCfg.available && !identityNotice && digilockerStatus !== 'VERIFIED' && (
              <p className="xs muted dev" style={{ marginTop: 10, lineHeight: 1.6 }}>
                DigiLocker verification is not available yet.
              </p>
            )}
            {identityNotice && (
              <p className="xs dev" style={{ marginTop: 10, lineHeight: 1.6, color: 'var(--ink)' }}>
                {identityNotice}
              </p>
            )}
          </div>

          {/* Once verified, this is how the partner finishes. */}
          {digilockerStatus === 'VERIFIED' && (
            <button className="btn btn-primary btn-block" onClick={completeSignup} disabled={busy}>
              {busy ? 'Setup ho raha hai…' : 'Complete Signup'}
            </button>
          )}

          {/* Skip sits BELOW the DigiLocker section and exists only while
              DIGILOCKER_SIGNUP_SKIP_ENABLED is true. Flipping that to false
              removes it here AND makes sellerRegister refuse an unverified
              signup — the button is never the only gate. */}
          {identityCfg.skipEnabled && digilockerStatus !== 'VERIFIED' && (
            <>
              <p className="xs muted dev" style={{ textAlign: 'center', marginTop: 4, marginBottom: 8, lineHeight: 1.6 }}>
                DigiLocker verification is currently optional while verification approval is being
                completed. You can complete it later from Dashboard → KYC.
              </p>
              <button
                className="btn btn-block" style={{ color: 'var(--muted)' }}
                onClick={completeSignup} disabled={busy || identityBusy}
              >
                {busy ? 'Setup ho raha hai…' : 'Skip for now'}
              </button>
            </>
          )}

          <button className="btn btn-block" style={{ color: 'var(--muted)', marginTop: 6 }} onClick={() => { setErr(''); setStep('role') }}>← Back</button>
        </div>
      )}

      {/* ===== VERIFY PARTNER EMAIL (register step 3 / login recovery) ===== */}
      {step === 'verify-email' && (
        <div className="auth-card">
          {BrandSmall}
          <div className="eyebrow">Almost there</div>
          <h1 style={{ fontSize: 22, margin: '6px 0 5px' }} className="dev">Verify your Partner email</h1>
          <p className="muted small dev" style={{ marginBottom: 22 }}>
            We've sent a verification code to {verifyEmailAddr}
          </p>
          {err && <ErrorBox msg={err} />}
          {resendMessage && (
            <div className="dev" style={{ background: 'var(--info-soft, #eef4ff)', color: 'var(--info, #2b5c8f)', borderRadius: 11, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
              {resendMessage}
            </div>
          )}
          <div className="field">
            <label>6-digit code</label>
            <input
              className="control" inputMode="numeric" maxLength={6}
              placeholder="000000" value={emailOtp}
              style={{ letterSpacing: 6, textAlign: 'center', fontSize: 18, fontWeight: 700 }}
              onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          <p className="xs muted dev" style={{ marginTop: -6, marginBottom: 12 }}>Code expires in 10 minutes.</p>
          <button className="btn btn-primary btn-block" onClick={handleVerifyEmail} disabled={busy}>
            {busy ? 'Verifying…' : 'Verify Email'}
          </button>
          <button
            className="btn btn-block" style={{ color: 'var(--muted)', marginTop: 6 }}
            onClick={handleResendEmailOtp} disabled={busy || emailOtpCooldown > 0}
          >
            {emailOtpCooldown > 0 ? `Resend OTP in ${emailOtpCooldown}s` : 'Resend OTP'}
          </button>
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
