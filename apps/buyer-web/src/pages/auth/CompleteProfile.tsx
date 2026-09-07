import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { buyerProfileSchema } from '@civilcheck/shared'
import { updateProfile } from '../../api/auth.api'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Input } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatPhone } from '../../lib/format'

/**
 * Post-phone-login onboarding gate. A buyer who signs in via Firebase
 * phone-OTP (see Login.tsx's handlePhoneVerified) only ever has `phone` on
 * record — no name/city/state until they fill this in. Reuses the exact
 * same `buyerProfileSchema` + `PATCH /auth/profile` (`updateProfile`) as
 * AccountOverview's "Edit profile" form; this is a dedicated first-run
 * screen, not a second profile system.
 */
export default function CompleteProfile() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [city, setCity] = useState(user?.city ?? '')
  const [stateVal, setStateVal] = useState(user?.state ?? '')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (!user) return null

  const nextPath = () => {
    const next = params.get('next')
    return next && next.startsWith('/') ? next : '/account'
  }

  // Direct/repeat visit with an already-complete profile — nothing to do,
  // send them on rather than showing the form again.
  if (user.profileComplete && !done) {
    return <Navigate to={nextPath()} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')

    const parsed = buyerProfileSchema.safeParse({
      name,
      city,
      state: stateVal,
      email: email || undefined,
    })
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
      await updateProfile(parsed.data)
      await refreshUser() // updates the displayed name everywhere immediately
      setDone(true)
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save your profile.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container page center" style={{ minHeight: '70vh' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Card>
          {done ? (
            <div className="stack">
              <h1 className="h2" style={{ marginBottom: 4 }}>
                Profile completed successfully.
              </h1>
              <p className="muted" style={{ marginBottom: 4, fontSize: 13 }}>
                Welcome, {name}.
              </p>
              <Button size="lg" block onClick={() => navigate(nextPath(), { replace: true })}>
                Continue to Dashboard
              </Button>
            </div>
          ) : (
            <>
              <h1 className="h2" style={{ marginBottom: 4 }}>
                Complete Your Profile
              </h1>
              <p className="muted" style={{ marginBottom: 20, fontSize: 13 }}>
                Just a few details before you continue.
              </p>

              <div style={{ marginBottom: 18 }}>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>
                  Phone Number
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{formatPhone(user.phone)}</span>
                  <span style={{ color: 'var(--cc-gold, #b8860b)', fontSize: 12.5, fontWeight: 600 }}>
                    ✓ Verified
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  Your phone number has been verified.
                </p>
              </div>

              {formError ? (
                <div style={{ marginBottom: 16 }}>
                  <InlineNotice tone="warn" message={formError} />
                </div>
              ) : null}

              <form onSubmit={(e) => void handleSubmit(e)} className="stack" noValidate>
                <Input
                  label="Full name *"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={fieldErrors.name}
                />
                <Input
                  label="Email (optional)"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={fieldErrors.email}
                />
                <Input label="City *" value={city} onChange={(e) => setCity(e.target.value)} error={fieldErrors.city} />
                <Input
                  label="State *"
                  value={stateVal}
                  onChange={(e) => setStateVal(e.target.value)}
                  error={fieldErrors.state}
                />
                <Button type="submit" size="lg" block loading={busy}>
                  Complete Profile
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
