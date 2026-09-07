import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getTwoFactorStatus, setupTwoFactor, enableTwoFactor, disableTwoFactor, linkAdminFirebase } from '../../api/auth.api'
import { sendOtp, confirmOtp, isFirebaseConfigured } from '../../lib/firebaseAuth'
import { useAuth } from '../../context/AuthContext'
import { Button, Card, Field, LoadingState, PageHead } from '../../components/ui'

const PHONE_LINK_RECAPTCHA_ID = 'phone-link-recaptcha'

// ─────────────────────────────────────────────────────────────────────────
// Admin 2FA enrollment. Three states, read off /2fa/status:
//   enabled            → offer disable (costs password + a live code)
//   enrollmentPending  → a secret was issued but never confirmed; resume
//   neither            → fresh enrolment
// ─────────────────────────────────────────────────────────────────────────
export default function Security() {
  const { admin } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Phone-OTP login linking (additive) — SuperAdmin cannot link one, the
  // backend refuses it; the hardcoded/legacy SuperAdmin login stays the only
  // path for that account.
  const [linkStage, setLinkStage] = useState('phone') // 'phone' | 'code'
  const [linkPhone, setLinkPhone] = useState('')
  const [linkCode, setLinkCode] = useState('')
  const [linkConfirmation, setLinkConfirmation] = useState(null)
  const [linking, setLinking] = useState(false)
  const [linkNotice, setLinkNotice] = useState('')

  const [enrolling, setEnrolling] = useState(false)
  const [secret, setSecret] = useState(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [confirming, setConfirming] = useState(false)

  const [showDisable, setShowDisable] = useState(false)
  const [disablePass, setDisablePass] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disabling, setDisabling] = useState(false)

  useEffect(() => { loadStatus() }, [])

  const loadStatus = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await getTwoFactorStatus()
      setStatus(d.twoFactor)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load 2FA status')
    } finally {
      setLoading(false)
    }
  }

  const handleSetup = async () => {
    setEnrolling(true); setError(''); setNotice('')
    try {
      const d = await setupTwoFactor()
      setSecret({ otpauthUri: d.otpauthUri, secret: d.secret })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start setup')
    } finally {
      setEnrolling(false)
    }
  }

  const handleEnable = async () => {
    if (confirmCode.length !== 6) { setError('Enter the 6-digit code'); return }
    setConfirming(true); setError('')
    try {
      await enableTwoFactor(confirmCode)
      setSecret(null); setConfirmCode('')
      setNotice('✅ 2FA enabled — a code will now be required at every login')
      await loadStatus()
    } catch (err) {
      setConfirmCode('')
      setError(err.response?.data?.message || 'Could not verify the code')
    } finally {
      setConfirming(false)
    }
  }

  const handleDisable = async () => {
    if (!disablePass.trim() || disableCode.length !== 6) {
      setError('Both your password and a 6-digit code are required')
      return
    }
    setDisabling(true); setError('')
    try {
      await disableTwoFactor(disablePass, disableCode)
      setShowDisable(false); setDisablePass(''); setDisableCode('')
      setNotice('2FA disabled. Re-enabling it is strongly recommended.')
      await loadStatus()
    } catch (err) {
      setDisableCode('')
      setError(err.response?.data?.message || 'Failed to disable')
    } finally {
      setDisabling(false)
    }
  }

  const handleSendLinkOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(linkPhone)) { setError('Enter a valid 10-digit mobile number'); return }
    setError(''); setLinking(true)
    try {
      const confirmation = await sendOtp(`+91${linkPhone}`, PHONE_LINK_RECAPTCHA_ID)
      setLinkConfirmation(confirmation)
      setLinkStage('code')
    } catch (err) {
      setError(err?.message || "Couldn't send the code. Please try again.")
    } finally { setLinking(false) }
  }

  const handleConfirmLink = async () => {
    if (!linkConfirmation) { setError('Session expired — request a new code'); setLinkStage('phone'); return }
    if (linkCode.length !== 6) { setError('Enter the 6-digit code'); return }
    setError(''); setLinking(true)
    try {
      const idToken = await confirmOtp(linkConfirmation, linkCode)
      await linkAdminFirebase(idToken)
      setLinkNotice('✅ Phone linked — you can now log in with phone-OTP as an alternative to email/password.')
      setLinkStage('phone'); setLinkPhone(''); setLinkCode(''); setLinkConfirmation(null)
    } catch (err) {
      setError(err.response?.data?.message || err?.message || 'Could not verify the code')
    } finally { setLinking(false) }
  }

  if (loading) return <LoadingState />

  const enabled = status?.enabled
  const pending = status?.enrollmentPending

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHead title="Security" subtitle="Two-factor authentication for your admin account" />

      {error && (
        <div className="badge red" style={{ display: 'block', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>❌ {error}</div>
      )}
      {notice && (
        <div className="badge green" style={{ display: 'block', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>{notice}</div>
      )}

      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>{enabled ? '🔒' : '🔓'}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Two-factor authentication</div>
            <div style={{ fontSize: 13, color: enabled ? 'var(--green)' : 'var(--amber)', marginTop: 2 }}>
              {enabled ? 'Enabled — login needs a 6-digit code' : pending ? 'Setup started but never confirmed' : 'Not enabled — your account is protected by password only'}
            </div>
          </div>
        </div>
      </Card>

      {!enabled && !secret && (
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <p className="small muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
            You will scan a QR code with Google Authenticator (or any TOTP app), then confirm one 6-digit code to activate it.
            {pending && ' A previous setup was left unconfirmed — starting again issues a fresh secret and invalidates the old one.'}
          </p>
          <Button variant="primary" onClick={handleSetup} disabled={enrolling}>{enrolling ? '⏳ Starting…' : pending ? 'Restart setup' : 'Set up 2FA'}</Button>
        </Card>
      )}

      {secret && (
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Scan this code</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ background: '#fff', padding: 12, borderRadius: 10 }}>
              <QRCodeSVG value={secret.otpauthUri} size={168} level="M" />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>Can&apos;t scan? Enter this key manually:</div>
              <code style={{ display: 'block', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 12px', fontSize: 13, wordBreak: 'break-all' }}>{secret.secret}</code>

              <div style={{ marginTop: 18 }}>
                <Field label="Enter the 6-digit code to confirm">
                  <input
                    className="control"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={confirmCode}
                    onChange={(e) => { setConfirmCode(e.target.value.replace(/\D/g, '')); setError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleEnable()}
                    style={{ letterSpacing: '6px', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                    autoFocus
                  />
                </Field>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="primary" onClick={handleEnable} disabled={confirming}>{confirming ? '⏳ Verifying…' : 'Confirm & enable'}</Button>
                <Button variant="ghost" onClick={() => { setSecret(null); setConfirmCode(''); setError('') }}>Cancel</Button>
              </div>
              <p className="small muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
                Cancelling leaves the secret issued but inactive — nothing changes about your login until you confirm a code.
              </p>
            </div>
          </div>
        </Card>
      )}

      {enabled && (
        <Card style={{ padding: 20 }}>
          {!showDisable ? (
            <>
              <p className="small muted" style={{ lineHeight: 1.6, marginBottom: 14 }}>
                Disabling removes the second factor and clears the stored secret. To move 2FA to a new device, disable here and set it up again.
              </p>
              <Button variant="danger" onClick={() => { setShowDisable(true); setError('') }}>Disable 2FA</Button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Confirm it&apos;s you</div>
              <p className="small muted" style={{ marginBottom: 14 }}>Both your password and a live code are required.</p>
              <Field label="Password">
                <input className="control" type="password" placeholder="••••••••" value={disablePass} onChange={(e) => { setDisablePass(e.target.value); setError('') }} />
              </Field>
              <Field label="Authenticator code">
                <input
                  className="control"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={disableCode}
                  onChange={(e) => { setDisableCode(e.target.value.replace(/\D/g, '')); setError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleDisable()}
                  style={{ letterSpacing: '6px', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                />
              </Field>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="danger" onClick={handleDisable} disabled={disabling}>{disabling ? '⏳ Disabling…' : 'Confirm disable'}</Button>
                <Button variant="ghost" onClick={() => { setShowDisable(false); setDisablePass(''); setDisableCode(''); setError('') }}>Cancel</Button>
              </div>
            </>
          )}
        </Card>
      )}

      {admin?.role !== 'SUPER_ADMIN' && (
        <Card style={{ padding: 20, marginTop: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Phone-OTP login</div>
          <p className="small muted" style={{ lineHeight: 1.6, marginBottom: 14 }}>
            Link your phone number to also be able to log in with an OTP, as an alternative to email/password. This is additive — your existing email/password login keeps working exactly as before.
          </p>

          {!isFirebaseConfigured ? (
            <div className="badge grey" style={{ display: 'block', padding: '10px 14px', borderRadius: 8, fontSize: 12.5, textTransform: 'none', letterSpacing: 0 }}>
              Phone-OTP login is not available on this deployment yet.
            </div>
          ) : (
            <>
              {linkNotice && (
                <div className="badge green" style={{ display: 'block', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>{linkNotice}</div>
              )}
              <div id={PHONE_LINK_RECAPTCHA_ID} />
              {linkStage === 'phone' ? (
                <>
                  <Field label="Mobile number">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div className="control" style={{ width: 56, flex: 'none', display: 'grid', placeItems: 'center', fontWeight: 600 }}>+91</div>
                      <input
                        className="control" inputMode="numeric" maxLength={10}
                        placeholder="10-digit number" value={linkPhone}
                        onChange={(e) => { setLinkPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                      />
                    </div>
                  </Field>
                  <Button variant="primary" onClick={handleSendLinkOtp} disabled={linking}>{linking ? '⏳ Sending…' : 'Send code'}</Button>
                </>
              ) : (
                <>
                  <p className="small muted" style={{ marginBottom: 10 }}>
                    Code sent to +91 {linkPhone}.{' '}
                    <Button variant="ghost" onClick={() => { setLinkStage('phone'); setLinkCode(''); setError('') }} style={{ padding: 0, minHeight: 'auto' }}>Change number</Button>
                  </p>
                  <Field label="6-digit code">
                    <input
                      className="control" inputMode="numeric" maxLength={6}
                      placeholder="123456" value={linkCode}
                      onChange={(e) => { setLinkCode(e.target.value.replace(/\D/g, '')); setError('') }}
                      onKeyDown={(e) => e.key === 'Enter' && handleConfirmLink()}
                      style={{ letterSpacing: '6px', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                    />
                  </Field>
                  <Button variant="primary" onClick={handleConfirmLink} disabled={linking}>{linking ? '⏳ Verifying…' : 'Verify & link'}</Button>
                </>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}
