// Mandatory first-login password change — reached either straight after
// login (Login.jsx checks `mustChangePassword` in the login response) or via
// a 403 PASSWORD_CHANGE_REQUIRED redirect from any other admin route (see
// api/axios.js's response interceptor). Also usable as a general voluntary
// password change any time afterward — the backend endpoint (POST
// /admin/change-password) isn't first-login-specific, it just happens to
// also clear the flag when one is set.
//
// Distinct from ForgotPassword.jsx (email-OTP recovery, no current password
// needed) — this always requires proving the current/temporary password.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { changeOwnPassword } from '../api/admin.api'
import { useAuth } from '../context/AuthContext'

export default function ChangePassword() {
  const navigate = useNavigate()
  const { logoutAdmin } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!currentPassword) { setError('Enter your current (or temporary) password'); return }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('New password must include at least one letter and one number')
      return
    }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    if (newPassword === currentPassword) { setError('New password must be different from the current password'); return }

    setLoading(true)
    setError('')
    try {
      await changeOwnPassword(currentPassword, newPassword)
      // Session/token is still valid — mustChangePassword is now cleared
      // server-side, so every other route works normally from here on.
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.errors?.[0]?.message || 'Could not change password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.bg}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { border-color: #f0a500 !important; outline: none; }
        .login-btn:hover { opacity: 0.9; transform: translateY(-1px); }
      `}</style>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(#e4e7ec 1px, transparent 1px)', backgroundSize: '28px 28px', opacity: 0.4, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,.12), transparent)', pointerEvents: 'none' }} />

      <div style={s.box}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, #f0a500, #ffc233)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 14px' }}>
            🔑
          </div>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 26, fontWeight: 800, color: '#12141c' }}>
            CivilCheck
          </div>
          <div style={{ fontSize: 11, color: '#5b6472', marginTop: 5, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>
            Change Your Password
          </div>
        </div>

        <div style={s.infoBox}>
          🔒 For security, you must set your own password before continuing. Enter the temporary
          password from your welcome email, then choose a new one.
        </div>

        {error && <div style={s.errorBox}>❌ {error}</div>}

        <div style={s.field}>
          <label style={s.label}>Current / Temporary Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setError('') }}
            style={s.input}
            autoFocus
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>New Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setError('') }}
            style={s.input}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Confirm New Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            style={s.input}
          />
        </div>

        <button className="login-btn" onClick={handleSubmit} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Updating…' : 'Change password →'}
        </button>

        <button
          onClick={() => { logoutAdmin(); navigate('/login') }}
          style={{ ...s.linkBtn, marginTop: 12 }}
        >
          Log out
        </button>

        <div style={{ textAlign: 'center', marginTop: 24, color: '#5b6472', fontSize: 12, borderTop: '1px solid #e4e7ec', paddingTop: 20 }}>
          Zytexa Technology LLP · Authorized Access Only
        </div>
      </div>
    </div>
  )
}

const s = {
  bg: { minHeight: '100vh', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif", padding: 16, position: 'relative' },
  box: { position: 'relative', background: '#ffffff', border: '1px solid #e4e7ec', borderRadius: 18, padding: '36px 32px', width: 380, maxWidth: '100%', boxShadow: '0 24px 60px rgba(16,24,40,.1)' },
  errorBox: { background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.25)', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontSize: 13, marginBottom: 16 },
  infoBox: { background: 'rgba(37,99,235,.08)', border: '1px solid rgba(37,99,235,.25)', borderRadius: 8, padding: '10px 14px', color: '#1d4ed8', fontSize: 13, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, color: '#5b6472', marginBottom: 7, fontWeight: 600, letterSpacing: '.3px' },
  input: { width: '100%', background: '#ffffff', border: '1px solid #e4e7ec', borderRadius: 9, padding: '11px 14px', color: '#12141c', fontSize: 14, transition: 'border-color .15s', fontFamily: "'Poppins', sans-serif" },
  btn: { width: '100%', padding: '13px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #f0a500, #ffc233)', color: '#1a1200', fontSize: 15, fontWeight: 700, marginTop: 4, transition: 'all .2s', fontFamily: "'Poppins', sans-serif" },
  linkBtn: { width: '100%', padding: '8px', borderRadius: 9, border: 'none', background: 'none', cursor: 'pointer', color: '#5b6472', fontSize: 12.5, fontFamily: "'Poppins', sans-serif" },
}
