// ─────────────────────────────────────────────────────────────────────────
//  owner/Dashboard.jsx  —  Property Owner dashboard  (REAL /seller/properties)
//  RAKHNA: src/pages/owner/Dashboard.jsx  (replace)
//
//  YAHAN SE REUSE: PropTile, propStatus, propertyFromApi
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getMyProperties, deleteProperty, updateProperty } from '../../api/seller.api'
import { Icon, Seal } from '../../components/Icon'
import { Card, StatCard, Chip, PageHead, SectionTitle, Field, Modal, toast } from '../../components/ui'

// ─── STATUS META ────────────────────────────────────────────────────────────
export function propStatus(s) {
  return {
    // Direct-publish business rule — Owner listing no longer waits on admin
    // approval, so the buyer-visible ('approved') status now reads
    // "Published" here instead of "Approved". 'pending'/'rejected' labels are
    // kept only for any legacy row still in that state from before this
    // change — a new submission can never reach them.
    approved:  ['green', 'Published'],
    pending:   ['amber', 'Pending Review'],
    rejected:  ['red',   'Rejected'],
    draft:     ['ink',   'Draft'],
    deleted:   ['ink',   'Deleted'],
    published: ['green', 'Published'],
  }[s] || ['ink', s]
}

// backend Property → frontend tile shape (status enum → lowercase)
export function propertyFromApi(p) {
  return {
    id: p.id,
    title: p.title,
    area: p.area,
    age: p.age || '—',
    city: p.city || '',
    status: (p.status || 'PENDING').toLowerCase(),
    views: p.views || 0,
    health: p.health ?? 30,
    documents: Array.isArray(p.documents) ? p.documents : [],
  }
}

// ═══════════════════════════════════════════════════════════════════════════
export default function OwnerDashboard({ go }) {
  const { seller } = useAuth()
  const firstName = seller?.name?.split(' ')[0] || 'Owner'

  const [props, setProps] = useState([])
  const [loadError, setLoadError] = useState(false)

  const load = () => {
    let live = true
    setLoadError(false)
    getMyProperties()
      .then((data) => { if (live) setProps((data?.properties || []).map(propertyFromApi)) })
      .catch(() => { if (live) setLoadError(true) })
    return () => { live = false }
  }

  useEffect(load, [])

  const active = props.filter((p) => p.status !== 'deleted')
  const ap = active.filter((p) => p.status === 'approved').length
  const dr = active.filter((p) => p.status === 'draft').length
  const vw = active.reduce((a, p) => a + (p.views || 0), 0)

  const handleDelete = async (id) => {
    try {
      await deleteProperty(id)
      setProps((list) => list.map((p) => (p.id === id ? { ...p, status: 'deleted' } : p)))
      toast('Property Deleted me move ho gayi')
    } catch (e) {
      toast(e.response?.data?.message || 'Delete nahi hua — dobara try karo')
    }
  }

  const handleUpdated = (updatedApi) => {
    const updated = propertyFromApi(updatedApi)
    setProps((list) => list.map((p) => (p.id === updated.id ? updated : p)))
  }

  return (
    <>
      <PageHead
        title={`Namaste, ${firstName}`}
        subtitle="Property Owner ka maqsad property ki authenticity prove karna hai — ye earning module nahi hai."
      />

      {/* Status banner */}
      <Card style={{ padding: 20, marginBottom: 20, background: 'linear-gradient(120deg,#14273f,#1f3a58)', color: '#fff', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', border: 'none' }}>
        <Seal size="lg" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="eyebrow" style={{ color: '#d8b25f' }}>Owner Listings</div>
          <h3 className="dev" style={{ fontSize: 20, margin: '4px 0', color: '#fff' }}>{ap} Published</h3>
          <p className="small dev" style={{ color: 'rgba(255,255,255,.65)' }}>
            Buyers ko property ki details free mein dikhti hain — documents sirf aapke paas surakshit rehte hain.
          </p>
        </div>
        <button className="btn btn-seal" onClick={() => go?.('add')}>+ Add Property</button>
      </Card>

      {/* Stats — "Pending Review" removed (direct-publish means a new
          submission is never pending); replaced with a plain total count. */}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard icon="props" color="#137a56" value={ap} label="Published" trend="▲" />
        <StatCard icon="add"   color="#B67A12" value={active.length} label="Total Properties" />
        <StatCard icon="file"  color="#2b5c8f" value={dr} label="Drafts" />
        <StatCard icon="chart" color="#B0812F" value={vw} label="Total Views" trend="▲ 8%" />
      </div>

      {/* Workflow — direct-publish: no admin approval gate for Owner
          listing (Property VERIFICATION, requested by a Buyer afterward, is
          a separate, unchanged flow shown elsewhere). */}
      <SectionTitle right={<Chip tone="ink">Turant publish</Chip>}>Listing Workflow</SectionTitle>
      <Card style={{ marginBottom: 22 }}>
        <div className="flow">
          <span className="step done">Upload Property</span><span className="arw">→</span>
          <span className="step">Published to Buyers</span>
        </div>
      </Card>

      {/* Recent properties */}
      <SectionTitle right={<button className="btn btn-light btn-sm" onClick={() => go?.('props')}>View all</button>}>
        Recent Properties
      </SectionTitle>
      {loadError && (
        <Card style={{ padding: '14px 18px', marginBottom: 16, borderColor: 'var(--danger)' }}>
          <p className="small dev" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
            Properties load nahi hui.
            <button className="btn btn-light btn-sm" onClick={load}>Retry</button>
          </p>
        </Card>
      )}
      {active.length ? (
        <div className="prop-grid">
          {active.slice(0, 3).map((p) => <PropTile key={p.id} p={p} onDelete={handleDelete} onUpdated={handleUpdated} />)}
        </div>
      ) : !loadError ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted dev">Abhi koi property nahi — pehli property add karo!</p>
        </Card>
      ) : null}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  PropTile — reusable property card
// ═══════════════════════════════════════════════════════════════════════════
export function PropTile({ p, onDelete, onUpdated }) {
  const [st0, st1] = propStatus(p.status)
  const [preview, setPreview] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <div className="card prop">
        <div className="banner">
          <span className="ph">Property Photo</span>
          <span className={`badge chip ${st0}`}>{st1}</span>
        </div>
        <div className="body">
          <b style={{ fontSize: 15 }} className="dev">{p.title}</b>
          <div className="small muted" style={{ marginTop: 4 }}>{p.area} sq.ft • {p.age} • {p.views} views</div>
          <div className="health">
            <div className="ring" style={{ '--p': p.health }} data-v={p.health} />
            <div>
              <div className="small" style={{ fontWeight: 600 }}>Health Score</div>
              <div className="xs muted">Docs & verification</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn btn-light btn-sm" onClick={() => setPreview(true)}>View Details</button>
            {p.status !== 'deleted' && (
              <button className="btn btn-light btn-sm" onClick={() => setEditing(true)}>Edit</button>
            )}
            {p.status !== 'deleted' && (
              <button className="btn btn-sm" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={() => onDelete?.(p.id)}>Delete</button>
            )}
          </div>
        </div>
      </div>

      {/* Details modal — real submitted data + real uploaded documents.
          There is no buyer-facing product for Property yet (buyer search
          only queries Listing), so this intentionally does not pretend to
          be a "buyer preview" of a feature that does not exist. */}
      <Modal open={preview} title={p.title} onClose={() => setPreview(false)}>
        <div className="card prop" style={{ marginBottom: 16 }}>
          <div className="banner">
            <span className="ph">Property Photo</span>
            <span className={`badge chip ${propStatus(p.status)[0]}`}>{propStatus(p.status)[1]}</span>
          </div>
        </div>
        <div className="card" style={{ padding: '4px 16px', marginBottom: 16 }}>
          {[
            `Area: ${p.area} sq.ft`,
            `Age: ${p.age}`,
            p.city && `City: ${p.city}`,
            `Health Score: ${p.health}/100`,
          ].filter(Boolean).map((x) => (
            <div className="docrow" key={x}>
              <div className="ic" style={{ background: 'var(--verified-soft)' }}>
                <Icon name="check" size={14} stroke={2.6} style={{ color: 'var(--verified)' }} />
              </div>
              <div className="nm dev">{x}</div>
            </div>
          ))}
        </div>
        <h4 className="dev" style={{ fontSize: 14, marginBottom: 8 }}>Documents ({p.documents.length})</h4>
        {p.documents.length === 0 ? (
          <p className="muted dev xs">Koi document upload nahi hua.</p>
        ) : (
          <div className="card" style={{ padding: '4px 16px' }}>
            {p.documents.map((url, i) => (
              <div className="docrow" key={url}>
                <div className="ic"><Icon name="file" size={14} /></div>
                <div className="nm dev">Document {i + 1}</div>
                <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--verified, #137a56)', fontSize: 12 }}>View</a>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Edit modal — real PUT /seller/properties/:id; direct-publish means
          an edit no longer resets status / pulls the property off Buyer view */}
      <EditPropertyModal
        open={editing}
        property={p}
        onClose={() => setEditing(false)}
        onSaved={(updatedApi) => { onUpdated?.(updatedApi); setEditing(false) }}
      />
    </>
  )
}

function EditPropertyModal({ open, property, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', area: '', age: '', city: '' })
  const [busy, setBusy] = useState(false)

  // Reload form fields whenever a different property is opened for editing.
  useEffect(() => {
    if (open) {
      setForm({
        title: property.title || '',
        area: property.area || '',
        age: property.age === '—' ? '' : (property.age || ''),
        city: property.city || '',
      })
    }
  }, [open, property])

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) { toast('Title daaliye'); return }
    if (!form.area.trim())  { toast('Area daaliye'); return }
    setBusy(true)
    try {
      const { property: updated } = await updateProperty(property.id, {
        title: form.title.trim(),
        area: form.area,
        age: form.age || null,
        city: form.city,
      })
      toast('Property updated')
      onSaved?.(updated)
    } catch (e) {
      toast(e.response?.data?.message || 'Update nahi hua — dobara try karo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={`Edit — ${property.title}`} onClose={onClose}>
      <Field label="Property Title" required>
        <input className="control" value={form.title} onChange={(e) => setField('title', e.target.value)} />
      </Field>
      <div className="row">
        <Field label="Area (sq.ft)" required>
          <input className="control" inputMode="numeric"
            value={form.area} onChange={(e) => setField('area', e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Property Age">
          <input className="control" placeholder="5 yrs / New" value={form.age} onChange={(e) => setField('age', e.target.value)} />
        </Field>
      </div>
      <Field label="City / Locality">
        <input className="control" value={form.city} onChange={(e) => setField('city', e.target.value)} />
      </Field>
      <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save Changes'}
      </button>
    </Modal>
  )
}
