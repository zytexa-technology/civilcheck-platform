// ─────────────────────────────────────────────────────────────────────────
//  reporter/Dashboard.jsx  —  Reporter dashboard
//  A Reporter posts property information/news (a newspaper cutting, a
//  public notice, etc.) — this is content, not a property listing. There is
//  no admin approval gate: a post is live in the buyer feed the moment it is
//  submitted. YAHAN SE REUSE: postStatus, postFromApi, PostTile
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getMyReporterPosts, deleteReporterPost, updateReporterPost, getRewardSummary } from '../../api/seller.api'
import { Icon, Seal } from '../../components/Icon'
import { Card, StatCard, Chip, PageHead, SectionTitle, Field, Modal, toast } from '../../components/ui'

export function postStatus(s) {
  return {
    published: ['green', 'Published'],
    removed:   ['ink',   'Removed'],
  }[s] || ['ink', s]
}

export function postFromApi(p) {
  return {
    id: p.id,
    title: p.title || 'Untitled post',
    description: p.description || '',
    city: p.city || '',
    status: (p.status || 'PUBLISHED').toLowerCase(),
    images: Array.isArray(p.images) ? p.images : [],
    sourceName: p.sourceName || '',
    createdAt: p.createdAt,
  }
}

export default function ReporterDashboard({ go }) {
  const { seller } = useAuth()
  const firstName = seller?.name?.split(' ')[0] || 'Reporter'

  const [posts, setPosts] = useState([])
  const [loadError, setLoadError] = useState(false)
  const [balance, setBalance] = useState(null)

  const load = () => {
    let live = true
    setLoadError(false)
    getMyReporterPosts()
      .then((data) => { if (live) setPosts((data?.posts || []).map(postFromApi)) })
      .catch(() => { if (live) setLoadError(true) })
    getRewardSummary()
      .then((data) => { if (live) setBalance(data?.summary?.availableBalance ?? 0) })
      .catch(() => {})
    return () => { live = false }
  }

  useEffect(load, [])

  const active = posts.filter((p) => p.status !== 'removed')

  const handleDelete = async (id) => {
    try {
      await deleteReporterPost(id)
      setPosts((list) => list.map((p) => (p.id === id ? { ...p, status: 'removed' } : p)))
      toast('Post remove ho gaya')
    } catch (e) {
      toast(e.response?.data?.message || 'Remove nahi hua — dobara try karo')
    }
  }

  const handleUpdated = (updatedApi) => {
    const updated = postFromApi(updatedApi)
    setPosts((list) => list.map((p) => (p.id === updated.id ? updated : p)))
  }

  return (
    <>
      <PageHead
        title={`Namaste, ${firstName}`}
        subtitle="Property information post karo — submit karte hi buyer feed me live ho jaati hai, koi admin approval nahi chahiye."
      />

      <Card style={{ padding: 20, marginBottom: 20, background: 'linear-gradient(120deg,#14273f,#1f3a58)', color: '#fff', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', border: 'none' }}>
        <Seal size="lg" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="eyebrow" style={{ color: '#d8b25f' }}>Reward Balance</div>
          <h3 className="dev" style={{ fontSize: 20, margin: '4px 0', color: '#fff' }}>{balance ?? '—'} points</h3>
          <p className="small dev" style={{ color: 'rgba(255,255,255,.65)' }}>
            {active.length} live post{active.length === 1 ? '' : 's'} • Reward points sirf Admin manual adjustment se milte hain.
          </p>
        </div>
        <button className="btn btn-seal" onClick={() => go?.('add')}>+ Post a Property Update</button>
      </Card>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard icon="props" color="#137a56" value={active.length} label="Live Posts" trend="▲" />
        <StatCard icon="chart" color="#B0812F" value={balance ?? 0} label="Reward Points" />
      </div>

      <SectionTitle right={<Chip tone="ink">Zero admin approval</Chip>}>How Reporting Works</SectionTitle>
      <Card style={{ marginBottom: 22 }}>
        <div className="flow">
          <span className="step done">Photograph or source information</span><span className="arw">→</span>
          <span className="step done">Post it</span><span className="arw">→</span>
          <span className="step">Live in the Buyer info feed instantly</span>
        </div>
      </Card>

      <SectionTitle right={<button className="btn btn-light btn-sm" onClick={() => go?.('props')}>View all</button>}>
        Recent Posts
      </SectionTitle>
      {loadError && (
        <Card style={{ padding: '14px 18px', marginBottom: 16, borderColor: 'var(--danger)' }}>
          <p className="small dev" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
            Posts load nahi hue.
            <button className="btn btn-light btn-sm" onClick={load}>Retry</button>
          </p>
        </Card>
      )}
      {active.length ? (
        <div className="prop-grid">
          {active.slice(0, 3).map((p) => <PostTile key={p.id} p={p} onDelete={handleDelete} onUpdated={handleUpdated} />)}
        </div>
      ) : !loadError ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted dev">Abhi koi post nahi — pehli property update post karo!</p>
        </Card>
      ) : null}
    </>
  )
}

export function PostTile({ p, onDelete, onUpdated }) {
  const [st0, st1] = postStatus(p.status)
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
          <div className="small muted" style={{ marginTop: 4 }}>{p.city || '—'}{p.sourceName ? ` • ${p.sourceName}` : ''}</div>
          <div className="xs muted" style={{ marginTop: 6 }}>Reported by CivilCheck Reporter</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn btn-light btn-sm" onClick={() => setPreview(true)}>View Details</button>
            {p.status !== 'removed' && (
              <button className="btn btn-light btn-sm" onClick={() => setEditing(true)}>Edit</button>
            )}
            {p.status !== 'removed' && (
              <button className="btn btn-sm" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={() => onDelete?.(p.id)}>Remove</button>
            )}
          </div>
        </div>
      </div>

      <Modal open={preview} title={p.title} onClose={() => setPreview(false)}>
        <div className="card prop" style={{ marginBottom: 16 }}>
          <div className="banner">
            <span className="ph">Property Photo</span>
            <span className={`badge chip ${postStatus(p.status)[0]}`}>{postStatus(p.status)[1]}</span>
          </div>
        </div>
        <div className="card" style={{ padding: '4px 16px', marginBottom: 16 }}>
          {[
            p.city && `City: ${p.city}`,
            p.sourceName && `Source: ${p.sourceName}`,
            'Reported by: CivilCheck Reporter',
          ].filter(Boolean).map((x) => (
            <div className="docrow" key={x}>
              <div className="ic"><Icon name="check" size={14} stroke={2.6} /></div>
              <div className="nm dev">{x}</div>
            </div>
          ))}
        </div>
        {p.description && (
          <p className="small dev" style={{ marginBottom: 16 }}>{p.description}</p>
        )}
        <h4 className="dev" style={{ fontSize: 14, marginBottom: 8 }}>Photos ({p.images.length})</h4>
        {p.images.length === 0 ? (
          <p className="muted dev xs">Koi photo upload nahi hui.</p>
        ) : (
          <div className="card" style={{ padding: '4px 16px' }}>
            {p.images.map((url, i) => (
              <div className="docrow" key={url}>
                <div className="ic"><Icon name="file" size={14} /></div>
                <div className="nm dev">Photo {i + 1}</div>
                <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--verified, #137a56)', fontSize: 12 }}>View</a>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <EditPostModal
        open={editing}
        post={p}
        onClose={() => setEditing(false)}
        onSaved={(updatedApi) => { onUpdated?.(updatedApi); setEditing(false) }}
      />
    </>
  )
}

function EditPostModal({ open, post, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', city: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ title: post.title || '', description: post.description || '', city: post.city || '' })
    }
  }, [open, post])

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setBusy(true)
    try {
      const { post: updated } = await updateReporterPost(post.id, {
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        city: form.city.trim() || undefined,
      })
      toast('Post updated')
      onSaved?.(updated)
    } catch (e) {
      toast(e.response?.data?.message || 'Update nahi hua — dobara try karo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={`Edit — ${post.title}`} onClose={onClose}>
      <Field label="Title">
        <input className="control" value={form.title} onChange={(e) => setField('title', e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea className="control" rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
      </Field>
      <Field label="City / Locality">
        <input className="control" value={form.city} onChange={(e) => setField('city', e.target.value)} />
      </Field>
      <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </Modal>
  )
}
