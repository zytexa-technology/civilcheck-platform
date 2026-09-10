import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { buyerLoginSchema } from '@civilcheck/shared'
import { loginBuyer, loginBuyerFirebase } from '../../api/auth.api'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/Button'
import { Input } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { PhoneOtpForm } from '../../components/PhoneOtpForm'
import { errorCode, errorMessage, errorStatus } from '../../lib/errors'

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { signIn } = useAuth()

  // Email/password stays the default, primary method — phone-OTP is an
  // additive alternate tab, never a replacement.
  const [method, setMethod] = useState<'password' | 'phone'>('password')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const goToNext = () => {
    const next = params.get('next')
    navigate(next && next.startsWith('/') ? next : '/account', { replace: true })
  }

  const handlePhoneVerified = async (idToken: string) => {
    const res = await loginBuyerFirebase(idToken)
    signIn(res.token, res.user)

    // A phone-OTP buyer only ever has `phone` on record until they fill in
    // name/city/state — send them to complete that first rather than
    // dropping them straight on the dashboard with no name to show.
    if (!res.user.profileComplete) {
      const next = params.get('next')
      navigate(`/complete-profile${next ? `?next=${encodeURIComponent(next)}` : ''}`, { replace: true })
      return
    }

    goToNext()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')

    const parsed = buyerLoginSchema.safeParse({ email, password })
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        if (issue.path[0]) errs[String(issue.path[0])] = issue.message
      }
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    setBusy(true)
    try {
      const res = await loginBuyer(parsed.data.email, parsed.data.password)
      signIn(res.token, res.user)
      goToNext()
    } catch (err) {
      // Signup Email Verification — send an unverified account straight to
      // the OTP screen instead of showing a dead-end error.
      if (errorCode(err) === 'EMAIL_NOT_VERIFIED') {
        const next = params.get('next')
        navigate(`/verify-email?email=${encodeURIComponent(parsed.data.email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`)
        return
      }
      if (errorStatus(err) === 401) {
        setFormError('Incorrect email or password.')
      } else {
        setFormError(errorMessage(err, "Couldn't sign in. Please try again."))
      }
    } finally {
      setBusy(false)
    }
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
          Welcome back
        </h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 24, fontSize: 13 }}>
          Log in to track your reports and verification requests.
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--line, #e5e5e5)' }}>
          {(['password', 'phone'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMethod(m)
                setFormError('')
              }}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'none',
                border: 'none',
                borderBottom: method === m ? '2px solid var(--gold, #b8860b)' : '2px solid transparent',
                fontWeight: method === m ? 600 : 500,
                color: method === m ? 'inherit' : 'var(--muted)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {m === 'password' ? 'Email & password' : 'Phone number'}
            </button>
          ))}
        </div>

        {formError ? (
          <div style={{ marginBottom: 16 }}>
            <InlineNotice tone="warn" message={formError} />
          </div>
        ) : null}

        {method === 'password' ? (
          <form onSubmit={(e) => void handleSubmit(e)} className="stack" noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
            />
            <p style={{ textAlign: 'right', marginTop: -8, fontSize: 12.5 }}>
              <Link to="/forgot-password" className="muted">Forgot password?</Link>
            </p>
            <Button type="submit" size="lg" block loading={busy}>
              Log in
            </Button>
          </form>
        ) : (
          <PhoneOtpForm onVerified={handlePhoneVerified} />
        )}

        <p className="muted" style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
          New to CivilCheck? <Link to="/register" className="gold-text" style={{ fontWeight: 600 }}>Create an account</Link>
        </p>
      </div>
    </div>
  )
}
