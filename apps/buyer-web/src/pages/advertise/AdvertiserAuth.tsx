import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../../api/advertiser.api'
import { Button } from '../../components/Button'
import { Input } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { errorMessage } from '../../lib/errors'

export default function AdvertiserAuth() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [f, setF] = useState({ name: '', companyName: '', email: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') await login(f.email.trim(), f.password)
      else await register({ name: f.name.trim(), companyName: f.companyName.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, password: f.password })
      navigate('/advertiser/dashboard')
    } catch (err) {
      setError(errorMessage(err, mode === 'login' ? 'Could not log in.' : 'Could not create your advertiser account.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <h1 className="h2" style={{ marginBottom: 6 }}>
        {mode === 'login' ? 'Advertiser log in' : 'Create your advertiser account'}
      </h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        This account is only for advertising on CivilCheck — it is separate from a buyer or partner account.
      </p>
      {error ? <InlineNotice tone="warn" message={error} /> : null}
      <form onSubmit={(e) => void submit(e)} className="stack card" style={{ marginTop: 12 }}>
        {mode === 'register' ? (
          <>
            <Input label="Your name" value={f.name} onChange={(e) => set('name', e.target.value)} required />
            <Input label="Business / company name" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} required />
            <Input label="Phone (optional)" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          </>
        ) : null}
        <Input label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required />
        <Input
          label="Password"
          type="password"
          value={f.password}
          onChange={(e) => set('password', e.target.value)}
          hint={mode === 'register' ? 'At least 8 characters with a letter and a number.' : undefined}
          required
        />
        <Button type="submit" size="lg" block loading={busy}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </Button>
      </form>
      <p style={{ marginTop: 14, fontSize: 13, textAlign: 'center' }}>
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }} style={{ background: 'none', border: 'none', color: 'var(--cc-gold)', cursor: 'pointer' }}>
          {mode === 'login' ? 'New here? Create an advertiser account' : 'Already have an account? Log in'}
        </button>
      </p>
    </div>
  )
}
