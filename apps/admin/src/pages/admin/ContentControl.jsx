import { useState, useEffect } from 'react'
import {
  listCategories, createCategory, updateCategory, deleteCategory,
  listServiceAreas, createServiceArea, updateServiceArea, deleteServiceArea,
  listDisclaimers, upsertDisclaimer,
  listBanners, createBanner, updateBanner, deleteBanner,
} from '../../api/content.api'
import { useAuth } from '../../context/AuthContext'
import { canManageContent } from '../../utils/permissions'
import { Badge, Button, Card, PageHead, ResponsiveTable, Tabs, Toast } from '../../components/ui'

const PROPERTY_TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'AGRICULTURAL', 'PLOT']
const BANNER_AUDIENCES = ['ALL', 'BUYERS', 'SELLERS', 'ADMINS']
const BANNER_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL']

export default function ContentControl() {
  const { admin } = useAuth()
  const canManage = canManageContent(admin?.role)
  const [tab, setTab] = useState('categories')
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  return (
    <div>
      <PageHead title="Content control" subtitle="Categories, service areas, disclaimers & banners — platform-wide, instantly live" />

      <div style={{ marginBottom: 20 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'categories', label: 'Categories' },
            { value: 'service-areas', label: 'Service areas' },
            { value: 'disclaimers', label: 'Disclaimers' },
            { value: 'banners', label: 'Banners' },
          ]}
        />
      </div>

      {!canManage && (
        <div className="badge grey" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          🔒 Your role has read-only access to content control.
        </div>
      )}

      {tab === 'categories' && <CategoriesTab canManage={canManage} showToast={showToast} />}
      {tab === 'service-areas' && <ServiceAreasTab canManage={canManage} showToast={showToast} />}
      {tab === 'disclaimers' && <DisclaimersTab canManage={canManage} />}
      {tab === 'banners' && <BannersTab canManage={canManage} showToast={showToast} />}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}

// ─── CATEGORIES ─────────────────────────────────────────────────────────────
function CategoriesTab({ canManage, showToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ slug: '', label: '', description: '', propertyType: '', sortOrder: 0 })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true)
    listCategories(true).then((d) => setItems(d.categories || [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const submit = async () => {
    if (!form.slug.trim() || !form.label.trim()) { setErr('Slug and label are both required'); return }
    setSaving(true); setErr('')
    try {
      await createCategory({
        slug: form.slug.trim(), label: form.label.trim(), description: form.description.trim() || undefined,
        propertyType: form.propertyType || undefined, sortOrder: Number(form.sortOrder) || 0,
      })
      setForm({ slug: '', label: '', description: '', propertyType: '', sortOrder: 0 })
      load()
    } catch (e) { setErr(e.response?.data?.message || 'Create failed') } finally { setSaving(false) }
  }

  const toggleActive = async (item) => {
    if (item.active && !window.confirm(`Deactivate "${item.label}"? This is platform-wide and instant.`)) return
    try {
      if (item.active) await deleteCategory(item.id)
      else await updateCategory(item.id, { active: true })
      showToast(`✅ ${item.label} ${item.active ? 'deactivated' : 'reactivated'}`)
      load()
    } catch (e) { showToast(`❌ ${e.response?.data?.message || 'Update failed'}`) }
  }

  const columns = [
    { key: 'slug', header: 'Slug', render: (c) => <code className="small muted">{c.slug}</code> },
    { key: 'label', header: 'Label' },
    { key: 'propertyType', header: 'Property type', render: (c) => c.propertyType || '—' },
    { key: 'sortOrder', header: 'Sort' },
    { key: 'active', header: 'Status', render: (c) => <Badge tone={c.active ? 'green' : 'grey'}>{c.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: 'Actions', render: (c) => canManage && <Button size="sm" variant="ghost" onClick={() => toggleActive(c)}>{c.active ? 'Deactivate' : 'Reactivate'}</Button> },
  ]

  return (
    <div>
      {canManage && (
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <div className="row">
            <input className="control" placeholder="Slug (e.g. residential)" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            <input className="control" placeholder="Label (e.g. Residential)" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            <select className="control" value={form.propertyType} onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))}>
              <option value="">No property-type link</option>
              {PROPERTY_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className="control" type="number" placeholder="Sort order" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
          </div>
          <input className="control" placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ marginTop: 10 }} />
          {err && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>❌ {err}</p>}
          <Button variant="primary" onClick={submit} disabled={saving} style={{ marginTop: 10 }}>{saving ? 'Adding…' : '+ Add category'}</Button>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable columns={columns} rows={loading ? [] : items} getRowKey={(c) => c.id} emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No categories yet'}</div>} />
      </Card>
    </div>
  )
}

// ─── SERVICE AREAS ──────────────────────────────────────────────────────────
function ServiceAreasTab({ canManage, showToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ state: 'Rajasthan', city: '', tehsil: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true)
    listServiceAreas(true).then((d) => setItems(d.serviceAreas || [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const submit = async () => {
    if (!form.city.trim() || !form.tehsil.trim()) { setErr('City and tehsil are both required'); return }
    setSaving(true); setErr('')
    try {
      await createServiceArea({ state: form.state.trim() || 'Rajasthan', city: form.city.trim(), tehsil: form.tehsil.trim() })
      setForm({ state: 'Rajasthan', city: '', tehsil: '' })
      load()
    } catch (e) { setErr(e.response?.data?.message || 'Create failed') } finally { setSaving(false) }
  }

  const toggleActive = async (item) => {
    if (item.active && !window.confirm(`Deactivate ${item.city}, ${item.tehsil}? This is platform-wide and instant.`)) return
    try {
      if (item.active) await deleteServiceArea(item.id)
      else await updateServiceArea(item.id, { active: true })
      showToast(`✅ ${item.city} ${item.active ? 'deactivated' : 'reactivated'}`)
      load()
    } catch (e) { showToast(`❌ ${e.response?.data?.message || 'Update failed'}`) }
  }

  const columns = [
    { key: 'state', header: 'State' },
    { key: 'city', header: 'City' },
    { key: 'tehsil', header: 'Tehsil' },
    { key: 'active', header: 'Status', render: (a) => <Badge tone={a.active ? 'green' : 'grey'}>{a.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: 'Actions', render: (a) => canManage && <Button size="sm" variant="ghost" onClick={() => toggleActive(a)}>{a.active ? 'Deactivate' : 'Reactivate'}</Button> },
  ]

  return (
    <div>
      {canManage && (
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <div className="row">
            <input className="control" placeholder="State" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            <input className="control" placeholder="City (e.g. Jaipur)" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            <input className="control" placeholder="Tehsil (e.g. Sanganer)" value={form.tehsil} onChange={(e) => setForm((f) => ({ ...f, tehsil: e.target.value }))} />
          </div>
          {err && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>❌ {err}</p>}
          <Button variant="primary" onClick={submit} disabled={saving} style={{ marginTop: 10 }}>{saving ? 'Adding…' : '+ Add service area'}</Button>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable columns={columns} rows={loading ? [] : items} getRowKey={(a) => a.id} emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No service areas yet'}</div>} />
      </Card>
    </div>
  )
}

// ─── DISCLAIMERS ────────────────────────────────────────────────────────────
function DisclaimersTab({ canManage }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ key: '', title: '', body: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true)
    listDisclaimers(true).then((d) => setItems(d.disclaimers || [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const startEdit = (d) => { setEditing(d.key); setForm({ key: d.key, title: d.title, body: d.body }); setErr('') }
  const startNew = () => { setEditing('new'); setForm({ key: '', title: '', body: '' }); setErr('') }

  const submit = async () => {
    if (!form.key.trim() || !form.title.trim() || form.body.trim().length < 20) {
      setErr('Key and title are required, and the body must be at least 20 characters'); return
    }
    setSaving(true); setErr('')
    try {
      await upsertDisclaimer({ key: form.key.trim(), title: form.title.trim(), body: form.body.trim() })
      setEditing(null)
      load()
    } catch (e) { setErr(e.response?.data?.message || 'Save failed') } finally { setSaving(false) }
  }

  const columns = [
    { key: 'key', header: 'Key', render: (d) => <code className="small muted">{d.key}</code> },
    { key: 'title', header: 'Title' },
    { key: 'version', header: 'Version', render: (d) => `v${d.version}` },
    { key: 'active', header: 'Status', render: (d) => <Badge tone={d.active ? 'green' : 'grey'}>{d.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: 'Actions', render: (d) => canManage && <Button size="sm" variant="ghost" onClick={() => startEdit(d)}>Edit</Button> },
  ]

  return (
    <div>
      {canManage && editing === null && <Button variant="primary" onClick={startNew} style={{ marginBottom: 16 }}>+ New disclaimer</Button>}

      {canManage && editing !== null && (
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <input className="control" placeholder="Key (e.g. report-footer)" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} disabled={editing !== 'new'} style={{ marginBottom: 8 }} />
          <input className="control" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={{ marginBottom: 8 }} />
          <textarea className="control" placeholder="Disclaimer body (min 20 characters)" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={4} />
          {err && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>❌ {err}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable columns={columns} rows={loading ? [] : items} getRowKey={(d) => d.key} emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No disclaimers yet'}</div>} />
      </Card>
    </div>
  )
}

// ─── BANNERS ────────────────────────────────────────────────────────────────
function BannersTab({ canManage, showToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', body: '', audience: 'ALL', severity: 'INFO' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true)
    listBanners(true).then((d) => setItems(d.banners || [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) { setErr('Title and body are both required'); return }
    setSaving(true); setErr('')
    try {
      await createBanner({ title: form.title.trim(), body: form.body.trim(), audience: form.audience, severity: form.severity })
      setForm({ title: '', body: '', audience: 'ALL', severity: 'INFO' })
      load()
    } catch (e) { setErr(e.response?.data?.message || 'Create failed') } finally { setSaving(false) }
  }

  const toggleActive = async (item) => {
    if (item.active && !window.confirm(`Deactivate "${item.title}"? This is platform-wide and instant.`)) return
    try {
      if (item.active) await deleteBanner(item.id)
      else await updateBanner(item.id, { active: true })
      showToast(`✅ ${item.title} ${item.active ? 'deactivated' : 'reactivated'}`)
      load()
    } catch (e) { showToast(`❌ ${e.response?.data?.message || 'Update failed'}`) }
  }

  const columns = [
    { key: 'title', header: 'Title' },
    { key: 'audience', header: 'Audience' },
    { key: 'severity', header: 'Severity' },
    { key: 'active', header: 'Status', render: (b) => <Badge tone={b.active ? 'green' : 'grey'}>{b.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: 'Actions', render: (b) => canManage && <Button size="sm" variant="ghost" onClick={() => toggleActive(b)}>{b.active ? 'Deactivate' : 'Reactivate'}</Button> },
  ]

  return (
    <div>
      {canManage && (
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <input className="control" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={{ marginBottom: 8 }} />
          <textarea className="control" placeholder="Body" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={2} style={{ marginBottom: 8 }} />
          <div className="row">
            <select className="control" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
              {BANNER_AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="control" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
              {BANNER_SEVERITIES.map((sv) => <option key={sv} value={sv}>{sv}</option>)}
            </select>
          </div>
          {err && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>❌ {err}</p>}
          <Button variant="primary" onClick={submit} disabled={saving} style={{ marginTop: 10 }}>{saving ? 'Adding…' : '+ Add banner'}</Button>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ResponsiveTable columns={columns} rows={loading ? [] : items} getRowKey={(b) => b.id} emptyState={<div style={{ padding: 32, textAlign: 'center' }} className="muted small">{loading ? '⏳ Loading…' : 'No banners yet'}</div>} />
      </Card>
    </div>
  )
}
