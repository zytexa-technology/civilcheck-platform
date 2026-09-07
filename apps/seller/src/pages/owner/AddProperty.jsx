// ─────────────────────────────────────────────────────────────────────────
//  owner/AddProperty.jsx  —  nayi property submit  (REAL /seller/properties
//  + REAL Cloudinary signed upload — same helper as seller/KYC.jsx)
//  RAKHNA: src/pages/owner/AddProperty.jsx  (replace)
// ─────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { createProperty } from '../../api/seller.api'
import { uploadToCloudinary, UploadError } from '../../api/cloudinaryUpload'
import { Icon } from '../../components/Icon'
import { Card, Chip, Field, PageHead, SectionTitle, toast } from '../../components/ui'
import MediaUpload from '../../components/MediaUpload'
import LocationCapture from '../../components/LocationCapture'

// `type` is the machine key the backend checks against
// REQUIRED_PROPERTY_DOCUMENT_TYPES (packages/shared/src/validation.ts) — it
// must submit all 8 exactly once, so every document sent to the API now
// carries its type, not just a bare URL (audit 2026-09-01, finding #1: the
// backend used to only count "8 URLs", never checking which document each
// one actually was).
const REQ_DOCS = [
  { label: 'Sale Deed', type: 'SALE_DEED' },
  { label: 'Registry', type: 'REGISTRY' },
  { label: 'Khata', type: 'KHATA' },
  { label: 'Mutation', type: 'MUTATION' },
  { label: 'Property Tax Receipt', type: 'PROPERTY_TAX_RECEIPT' },
  { label: 'Electricity Bill', type: 'ELECTRICITY_BILL' },
  { label: 'Owner Aadhaar', type: 'OWNER_AADHAAR' },
  { label: 'PAN Card', type: 'PAN_CARD' },
]
// Property Photos/Videos and Google Map Location used to live here as fake
// document-upload slots (a "location" was just an uploaded screenshot).
// Phase 2 gives them real backing instead — MediaUpload (images/videos
// fields) and LocationCapture (real GPS) below.
//
// Optional docs stay plain labels — the backend never checks their type
// against anything, they're just extra evidence attached to the submission.
const OPT_DOCS = ['NOC', 'Builder Documents', 'Encumbrance Certificate']

export default function OwnerAddProperty({ go }) {
  const { seller } = useAuth()
  const [form, setForm] = useState({
    title: '', area: '', age: '', city: seller?.city || '',
    tehsil: '', address: '', images: [], videos: [], latitude: null, longitude: null,
  })
  // name → { url, mock, name } once uploaded to Cloudinary; nothing here
  // reports "uploaded" until a real URL comes back.
  const [uploaded, setUploaded] = useState({})
  const [uploading, setUploading] = useState('') // doc name currently in flight
  const [busy, setBusy] = useState(false)

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleFile = async (name, file) => {
    setUploading(name)
    try {
      const { url, mock } = await uploadToCloudinary(file, 'property-document')
      setUploaded((u) => ({ ...u, [name]: { url, mock, name: file.name } }))
    } catch (err) {
      toast(err instanceof UploadError
        ? err.message
        : (err?.response?.data?.message || 'Upload fail ho gaya — dobara try karein'))
    } finally {
      setUploading('')
    }
  }

  const anyMock = Object.values(uploaded).some((d) => d.mock)

  const submit = async () => {
    if (!form.title.trim()) { toast('Title daaliye'); return }
    if (!form.area.trim())  { toast('Area daaliye'); return }
    // REQ_DOCS were shown as mandatory ("*", red chip) but never actually
    // blocked submission — the backend now enforces the full type
    // composition too, but this stops the wasted round-trip and matches
    // seller/NewListing.jsx's existing step-gating discipline (QA audit
    // 2026-08-03, finding #6).
    const missingDocs = REQ_DOCS.filter((d) => !uploaded[d.label])
    if (missingDocs.length) { toast(`Mandatory documents missing: ${missingDocs.map((d) => d.label).join(', ')}`); return }
    setBusy(true)
    try {
      // Each document is now tagged with its type — required docs use the
      // machine key the backend validates against; optional docs use their
      // own label (never checked, just stored as extra evidence).
      const requiredDocs = REQ_DOCS.map((d) => ({ type: d.type, url: uploaded[d.label].url }))
      const optionalDocs = OPT_DOCS.filter((d) => uploaded[d]).map((d) => ({ type: d, url: uploaded[d].url }))
      await createProperty({
        title: form.title.trim(),
        area: form.area,
        age: form.age || 'New',
        city: form.city,
        tehsil: form.tehsil || undefined,
        address: form.address || undefined,
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        images: form.images,
        videos: form.videos,
        documents: [...requiredDocs, ...optionalDocs],
      })
      toast('Submitted — Pending Review')
      go?.('dash')
    } catch (e) {
      toast(e.response?.data?.message || 'Submit nahi hua — dobara try karo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title="Add Property" subtitle="Submit karte hi listing Pending Review me jayegi. Super Admin approval ke baad buyers ko dikhne lagegi." />

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card style={{ padding: 22 }}>
          <h3 className="dev" style={{ fontSize: 16, marginBottom: 16 }}>Property Details</h3>

          <Field label="Property Title" required>
            <input className="control" placeholder="e.g. 2BHK Flat, Malviya Nagar"
              value={form.title} onChange={(e) => setField('title', e.target.value)} />
          </Field>

          <div className="row">
            <Field label="Area (sq.ft)" required>
              <input className="control" inputMode="numeric" placeholder="1200"
                value={form.area} onChange={(e) => setField('area', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Property Age">
              <input className="control" placeholder="5 yrs / New"
                value={form.age} onChange={(e) => setField('age', e.target.value)} />
            </Field>
          </div>

          <div className="row">
            <Field label="City / Locality">
              <input className="control" placeholder={seller?.city || 'Jaipur'}
                value={form.city} onChange={(e) => setField('city', e.target.value)} />
            </Field>
            <Field label="Tehsil">
              <input className="control" placeholder="e.g. Sanganer"
                value={form.tehsil} onChange={(e) => setField('tehsil', e.target.value)} />
            </Field>
          </div>

          <Field label="Address">
            <input className="control" placeholder="Full address"
              value={form.address} onChange={(e) => setField('address', e.target.value)} />
          </Field>

          <MediaUpload
            purposePrefix="property"
            images={form.images}
            videos={form.videos}
            onImagesChange={(images) => setField('images', images)}
            onVideosChange={(videos) => setField('videos', videos)}
          />

          <LocationCapture
            latitude={form.latitude}
            longitude={form.longitude}
            onCapture={(lat, lng) => { setField('latitude', lat); setField('longitude', lng) }}
          />

          {anyMock && (
            <div className="xs" style={{ color: 'var(--amber, #B67A12)', marginBottom: 12 }}>
              ⚠️ Cloudinary mock mode — koi real file store nahi hui abhi (production credentials chahiye).
            </div>
          )}

          <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
            {busy ? 'Submit ho raha hai…' : 'Submit for Review'}
          </button>
        </Card>

        <div>
          <Card style={{ padding: '18px 22px', marginBottom: 16 }}>
            <SectionTitle right={<Chip tone="red">Mandatory</Chip>}>
              <span style={{ fontSize: 15 }}>Required Documents</span>
            </SectionTitle>
            {REQ_DOCS.map((d) => (
              <DocRow key={d.label} name={d.label} required
                picked={uploaded[d.label]} busy={uploading === d.label}
                onFile={(file) => handleFile(d.label, file)}
                onClear={() => setUploaded((u) => { const n = { ...u }; delete n[d.label]; return n })} />
            ))}
          </Card>

          <Card style={{ padding: '18px 22px' }}>
            <SectionTitle right={<Chip tone="ink">Optional</Chip>}>
              <span style={{ fontSize: 15 }}>Optional Documents</span>
            </SectionTitle>
            {OPT_DOCS.map((d) => (
              <DocRow key={d} name={d}
                picked={uploaded[d]} busy={uploading === d}
                onFile={(file) => handleFile(d, file)}
                onClear={() => setUploaded((u) => { const n = { ...u }; delete n[d]; return n })} />
            ))}
          </Card>
        </div>
      </div>
    </>
  )
}

// One row per document: pick → uploads to Cloudinary → shows a real "view"
// link once stored, or an upload error if it failed. Nothing here is marked
// uploaded until Cloudinary actually returns a URL.
function DocRow({ name, required, picked, busy, onFile, onClear }) {
  const inputRef = useRef(null)

  const handleChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // re-selecting the same file must re-fire onChange
    if (file) onFile(file)
  }

  return (
    <div className="docrow">
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleChange} />
      <div className="ic"><Icon name="file" size={16} /></div>
      <div className="nm dev">
        {name}{required && <span className="req"> *</span>}
        {picked && !picked.mock && (
          <>
            {' · '}
            <a href={picked.url} target="_blank" rel="noreferrer" style={{ color: 'var(--verified, #137a56)' }}>view</a>
          </>
        )}
      </div>
      {picked ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="chip green"><Icon name="check" size={12} stroke={3} /> Uploaded</span>
          <button className="chip ink up" onClick={onClear}>Remove</button>
        </span>
      ) : (
        <button className="chip ink up" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      )}
    </div>
  )
}
