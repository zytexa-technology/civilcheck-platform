// ─────────────────────────────────────────────────────────────────────────
//  shared/Profile.jsx  —  Profile
//
//  Seller = one role, set at registration (Seller.partnerRole on the
//  backend) — there's nothing to "manage" beyond viewing it. The old
//  Manage Roles panel here toggled addRole/removeRole, which are no-ops
//  under the single-role model (see AuthContext.jsx) — removed (roadmap.md
//  Day 1) rather than ship a control that silently does nothing.
//  Settings toggles below are still local-only (no backend endpoint for
//  notification preferences yet) — noted, not fixed here.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { updateSellerProfile } from '../../api/seller.api'
import { Card, Chip, PageHead, Field, Modal, toast } from '../../components/ui'

const ROLE_META = {
  owner:  { emo: '🏠', name: 'Property Owner',  desc: 'Apni property verify & list karein', tag: 'Instant', tone: 'green' },
  expert: { emo: '⚖️', name: 'Property Expert', desc: 'Legal verification & paid reports',  tag: 'Super Admin Approval', tone: 'amber' },
}
const SETTINGS = ['Email Notifications', 'SMS Alerts', 'WhatsApp Updates', 'Marketing Emails']

export default function Profile() {
  const { seller, activeRole, logoutSeller, refreshSeller } = useAuth()
  const [toggles, setToggles] = useState({ 'Email Notifications': true, 'SMS Alerts': true })

  // ── Edit Profile modal (real: PATCH /seller/profile → name, bankAccount, ifsc) ──
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [ef, setEf]             = useState({ name: '', email: '', city: '', state: '', bankAccount: '', ifsc: '' })

  const openEdit = () => {
    setEf({
      name: seller?.name || '',
      email: seller?.email || '',
      city: seller?.city || '',
      state: seller?.state || '',
      bankAccount: seller?.bankAccount || '',
      ifsc: seller?.ifsc || '',
    })
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!ef.name.trim()) { toast('Name zaroori hai'); return }
    setSaving(true)
    try {
      const res = await updateSellerProfile({
        name: ef.name.trim(),
        email: ef.email.trim() || undefined,
        city: ef.city.trim() || undefined,
        state: ef.state.trim() || undefined,
        bankAccount: ef.bankAccount.trim() || undefined,
        ifsc: ef.ifsc.trim() || undefined,
      })
      if (res?.success) {
        await refreshSeller?.()      // context me fresh seller
        toast('Profile updated')
        setEditOpen(false)
      } else {
        toast(res?.message || 'Update nahi hua')
      }
    } catch (err) {
      toast(err?.response?.data?.message || 'Update nahi hua')
    } finally {
      setSaving(false)
    }
  }

  const initial = (seller?.name?.[0] || 'P').toUpperCase()
  const flip = (s) => setToggles((t) => ({ ...t, [s]: !t[s] }))
  const roleMeta = ROLE_META[activeRole] || ROLE_META.owner

  return (
    <>
      <PageHead title="Profile" subtitle="Apni jaankari aur partner status." />

      <div className="grid g2" style={{ alignItems: 'start' }}>
        {/* Left: profile + settings */}
        <div>
          <Card style={{ padding: 24, textAlign: 'center', marginBottom: 16 }}>
            <div className="avatar lg" style={{ margin: '0 auto 12px' }}>{initial}</div>
            <h3 className="dev" style={{ fontSize: 19 }}>{seller?.name || 'Partner'}</h3>
            <p className="small muted">+91 {seller?.phone || '—'}{seller?.city ? ` • ${seller.city}` : ''}</p>
            <button className="btn btn-light btn-sm" style={{ marginTop: 14 }} onClick={openEdit}>Edit Profile</button>
          </Card>

          <Card>
            <div className="dev" style={{ padding: '14px 18px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Settings</div>
            {SETTINGS.map((s) => (
              <div key={s} className="li">
                <div className="tx"><b className="dev">{s}</b></div>
                <div className={`tg ${toggles[s] ? 'on' : ''}`} onClick={() => flip(s)} />
              </div>
            ))}
            <div style={{ padding: '14px 18px' }}>
              <button className="btn btn-danger btn-sm" onClick={logoutSeller}>Log Out</button>
            </div>
          </Card>
        </div>

        {/* Right: partner status — read-only, real fields from the seller record */}
        <div>
          <Card style={{ padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="opt-card" style={{ border: 'none', padding: 0, margin: 0, flex: 1, background: 'transparent' }}>
              <div className="emo">{roleMeta.emo}</div>
              <div style={{ flex: 1 }}>
                <h3 className="dev">{roleMeta.name} <Chip tone={roleMeta.tone}>{roleMeta.tag}</Chip></h3>
                <p className="small muted dev">{roleMeta.desc}</p>
              </div>
            </div>
          </Card>
          <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="li" style={{ padding: 0 }}>
              <div className="tx"><b className="dev">KYC Status</b></div>
              <Chip tone={seller?.kycStatus === 'APPROVED' ? 'green' : seller?.kycStatus === 'SUSPENDED' ? 'red' : 'amber'}>
                {seller?.kycStatus || 'PENDING'}
              </Chip>
            </div>
            <div className="li" style={{ padding: 0 }}>
              <div className="tx"><b className="dev">Badge</b></div>
              <Chip tone="ink">{seller?.badge || 'BRONZE'}</Chip>
            </div>
            {typeof seller?.accuracyScore === 'number' && (
              <div className="li" style={{ padding: 0 }}>
                <div className="tx"><b className="dev">Accuracy Score</b></div>
                <span className="small">{seller.accuracyScore}%</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    {/* ── Edit Profile Modal ── */}
      <Modal
        open={editOpen}
        title="Edit Profile"
        onClose={() => setEditOpen(false)}
        footer={<>
          <button className="btn btn-light" onClick={() => setEditOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </>}
      >
        <Field label="Full Name" required>
          <input className="control" value={ef.name} onChange={(e) => setEf((f) => ({ ...f, name: e.target.value }))} placeholder="Aapka poora naam" />
        </Field>
        <Field label="Email">
          <input className="control" type="email" value={ef.email} onChange={(e) => setEf((f) => ({ ...f, email: e.target.value }))} placeholder="name@email.com" />
        </Field>
        <div className="row">
          <Field label="City">
            <input className="control" value={ef.city} onChange={(e) => setEf((f) => ({ ...f, city: e.target.value }))} placeholder="Jaipur" />
          </Field>
          <Field label="State">
            <input className="control" value={ef.state} onChange={(e) => setEf((f) => ({ ...f, state: e.target.value }))} placeholder="Rajasthan" />
          </Field>
        </div>
        <Field label="Bank Account Number">
          <input className="control" value={ef.bankAccount} onChange={(e) => setEf((f) => ({ ...f, bankAccount: e.target.value.replace(/\D/g, '') }))} placeholder="Settlement ke liye" />
        </Field>
        <Field label="IFSC Code">
          <input className="control" value={ef.ifsc} onChange={(e) => setEf((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))} placeholder="e.g. SBIN0001234" />
        </Field>
        <p className="xs muted dev" style={{ marginTop: 4 }}>
          Phone aur profession KYC se linked hain — yahan se change nahi hote.
        </p>
      </Modal>
    </>
  )
}