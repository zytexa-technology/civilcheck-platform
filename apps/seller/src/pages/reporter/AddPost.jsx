// ─────────────────────────────────────────────────────────────────────────
//  reporter/AddPost.jsx  —  post property information/news (photo, source)
//  A Reporter is sourcing publicly available information (a newspaper
//  cutting, a public notice, etc.), not creating a property listing — there
//  is no ownership claim, no moderation gate. Submit karte hi post live hai.
// ─────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react'
import { createReporterPost } from '../../api/seller.api'
import { uploadToCloudinary, UploadError } from '../../api/cloudinaryUpload'
import { Card, Field, PageHead, SectionTitle, toast } from '../../components/ui'

function PhotoUpload({ images, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const { url, mock } = await uploadToCloudinary(file, 'reporter-post-image')
      onChange([...images, url])
      if (mock) setError('Cloudinary mock mode — koi real file store nahi hui abhi (production credentials chahiye).')
    } catch (err) {
      setError(err instanceof UploadError ? err.message : (err?.response?.data?.message || 'Upload fail ho gaya — dobara try karein'))
    } finally {
      setUploading(false)
    }
  }

  const remove = (i) => onChange(images.filter((_, idx) => idx !== i))

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 7, fontWeight: 600 }}>
        Photos (newspaper cutting, notice, etc.)
      </label>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleFile} />
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        style={{ border: '2px dashed var(--line-2)', borderRadius: 10, padding: '18px 16px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-2)' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
          {uploading ? 'Uploading…' : '+ Add Photo'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>JPG, PNG, WEBP — max 10MB each</div>
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      {images.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {images.map((url, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '7px 10px' }}>
              <span style={{ color: 'var(--verified, #137a56)' }}>✓</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.split('/').pop()}</span>
              <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue, #2b5c8f)' }}>view</a>
              <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12.5 }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ReporterAddPost({ go }) {
  const [form, setForm] = useState({ title: '', description: '', city: '', tehsil: '', sourceName: '', images: [] })
  const [busy, setBusy] = useState(false)

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (form.images.length === 0) { toast('Kam se kam ek photo daaliye'); return }
    setBusy(true)
    try {
      await createReporterPost({
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        city: form.city.trim() || undefined,
        tehsil: form.tehsil.trim() || undefined,
        sourceName: form.sourceName.trim() || undefined,
        images: form.images,
      })
      toast('Posted — buyer feed me live hai')
      go?.('dash')
    } catch (e) {
      toast(e.response?.data?.message || 'Post nahi hua — dobara try karo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title="Post a Property Update" subtitle="Submit karte hi yeh Buyer info feed me turant live ho jaata hai — koi admin approval nahi." />

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card style={{ padding: 22 }}>
          <SectionTitle>Post Details</SectionTitle>

          <Field label="Title">
            <input className="control" placeholder="e.g. Plot for sale — Malviya Nagar (newspaper ad)"
              value={form.title} onChange={(e) => setField('title', e.target.value)} />
          </Field>

          <Field label="Description">
            <textarea className="control" rows={3} placeholder="Any extra context worth sharing…"
              value={form.description} onChange={(e) => setField('description', e.target.value)} />
          </Field>

          <div className="row">
            <Field label="City / Locality">
              <input className="control" placeholder="Jaipur"
                value={form.city} onChange={(e) => setField('city', e.target.value)} />
            </Field>
            <Field label="Tehsil">
              <input className="control" placeholder="e.g. Sanganer"
                value={form.tehsil} onChange={(e) => setField('tehsil', e.target.value)} />
            </Field>
          </div>

          <Field label="Source" hint="Newspaper name or where this was found (optional)">
            <input className="control" placeholder="e.g. Rajasthan Patrika, 12 Aug"
              value={form.sourceName} onChange={(e) => setField('sourceName', e.target.value)} />
          </Field>

          <PhotoUpload images={form.images} onChange={(images) => setField('images', images)} />

          <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
            {busy ? 'Posting…' : 'Post — Goes Live Immediately'}
          </button>
        </Card>

        <Card style={{ padding: '18px 22px' }}>
          <SectionTitle>How Reporting Works</SectionTitle>
          <div className="flow" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <p className="small muted dev">1. Photo (newspaper cutting, notice, etc.) aur thodi context daalo.</p>
            <p className="small muted dev">2. Post karte hi yeh Buyer info feed me turant dikhta hai — koi review wait nahi.</p>
            <p className="small muted dev">3. Yeh property listing nahi hai — "Reported by CivilCheck Reporter" ke saath dikhta hai, koi Verified badge nahi milta.</p>
            <p className="small muted dev">4. Reward points automatic nahi milte — sirf SuperAdmin manual adjustment se.</p>
          </div>
        </Card>
      </div>
    </>
  )
}
