import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { buyerRegisterSchema } from '@civilcheck/shared'
import { registerBuyer } from '../../api/auth.api'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/Button'
import { Input } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { errorMessage, errorStatus } from '../../lib/errors'

export default function Register() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { signIn } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')

    const parsed = buyerRegisterSchema.safeParse({ name, email, phone, password })
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
      const res = await registerBuyer(parsed.data)
      signIn(res.token, res.user)
      const next = params.get('next')
      navigate(next && next.startsWith('/') ? next : '/account', { replace: true })
    } catch (err) {
      if (errorStatus(err) === 409) {
        setFormError('An account with this email already exists.')
      } else {
        setFormError(errorMessage(err, "Couldn't create your account. Please try again."))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container page center" style={{ minHeight: '70vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        <div className="center" style={{ marginBottom: 22 }}>
          <span className="brand__mark" style={{ width: 44, height: 44, fontSize: 20 }} aria-hidden="true">
            C
          </span>
        </div>
        <h1 className="h2" style={{ textAlign: 'center', marginBottom: 6 }}>
          Create your account
        </h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 24, fontSize: 13 }}>
          Search reports, request verification, and track your properties.
        </p>

        {formError ? (
          <div style={{ marginBottom: 16 }}>
            <InlineNotice tone="warn" message={formError} />
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="stack" noValidate>
          <Input label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} />
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} />
          <Input
            label="Mobile number"
            type="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={fieldErrors.phone}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            hint={!fieldErrors.password ? 'At least 8 characters, with a letter and a number.' : undefined}
          />
          <Button type="submit" size="lg" block loading={busy}>
            Create account
          </Button>
        </form>

        <p className="muted" style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
          Already have an account? <Link to="/login" className="gold-text" style={{ fontWeight: 600 }}>Log in</Link>
        </p>
      </div>
    </div>
  )
}
