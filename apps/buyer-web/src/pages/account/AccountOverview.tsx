import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { buyerProfileSchema } from '@civilcheck/shared'
import { updateProfile } from '../../api/auth.api'
import { getMyPurchases } from '../../api/purchase.api'
import { getMyAlerts } from '../../api/alert.api'
import { getMyVerificationRequests } from '../../api/verification.api'
import { getMySpecialRequests } from '../../api/specialRequest.api'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Input } from '../../components/Field'
import { InlineNotice } from '../../components/States'
import { errorMessage } from '../../lib/errors'
import { formatPhone, initial } from '../../lib/format'

export default function AccountOverview() {
  const { user, signOut, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [stats, setStats] = useState<{ reports: number; watching: number; verifications: number; requests: number } | null>(null)

  useEffect(() => {
    void Promise.allSettled([getMyPurchases(), getMyAlerts(), getMyVerificationRequests(), getMySpecialRequests()]).then(
      ([reports, watching, verifications, requests]) => {
        setStats({
          reports: reports.status === 'fulfilled' ? reports.value.total : 0,
          watching: watching.status === 'fulfilled' ? watching.value.total : 0,
          verifications: verifications.status === 'fulfilled' ? verifications.value.total : 0,
          requests: requests.status === 'fulfilled' ? requests.value.total : 0,
        })
      },
    )
  }, [])

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name ?? '')
  const [city, setCity] = useState(user?.city ?? '')
  const [stateVal, setStateVal] = useState(user?.state ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!user) return null

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSaved(false)

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
      await refreshUser()
      setSaved(true)
      setEditing(false)
    } catch (err) {
      setFormError(errorMessage(err, 'Could not update your profile.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Card>
        <div className="row" style={{ marginBottom: 18 }}>
          <span className="avatar" style={{ width: 52, height: 52, fontSize: 18, cursor: 'default' }}>
            {initial(user.name, user.email, user.phone)}
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{user.name || 'CivilCheck buyer'}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {user.email ?? formatPhone(user.phone)}
            </div>
          </div>
        </div>

        {saved ? (
          <div style={{ marginBottom: 14 }}>
            <InlineNotice message="Profile updated." />
          </div>
        ) : null}
        {formError ? (
          <div style={{ marginBottom: 14 }}>
            <InlineNotice tone="warn" message={formError} />
          </div>
        ) : null}

        {editing ? (
          <form onSubmit={(e) => void handleSave(e)} className="stack">
            <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} />
            <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} error={fieldErrors.city} />
            <Input label="State" value={stateVal} onChange={(e) => setStateVal(e.target.value)} error={fieldErrors.state} />
            <div className="row">
              <Button type="submit" loading={busy}>
                Save
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="row">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit profile
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                void signOut()
                navigate('/')
              }}
            >
              Log out
            </Button>
          </div>
        )}
      </Card>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatTile label="Reports" value={stats?.reports} />
        <StatTile label="Watching" value={stats?.watching} />
        <StatTile label="Verifications" value={stats?.verifications} />
        <StatTile label="Custom requests" value={stats?.requests} />
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cc-gold)' }}>{value ?? '—'}</div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
        {label}
      </div>
    </Card>
  )
}
