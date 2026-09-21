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
import { Card, Field, PageHead, toast } from '../../components/ui'
import MediaUpload from '../../components/MediaUpload'
import LocationCapture from '../../components/LocationCapture'

// Same canonical values as Prisma's PropertyType enum / seller/NewListing.jsx
// PROPERTY_FIELDS keys — apps/seller has no dependency on @civilcheck/shared,
// so this mirrors NewListing.jsx's existing pattern of a local, in-sync list
// rather than adding that dependency just for one enum.
const PROPERTY_TYPES = [
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'AGRICULTURAL', label: 'Agricultural' },
  { value: 'PLOT', label: 'Plot' },
]

export default function OwnerAddProperty({ go }) {
  const { seller } = useAuth()
  const [form, setForm] = useState({
    title: '', area: '', age: '', city: seller?.city || '',
    tehsil: '', address: '', propertyType: '', images: [], videos: [], latitude: null, longitude: null,
    // Clear / Dispute (required). The Green/Red indicator users see is derived by the
    // server from this — the Owner never picks a colour.
    propertyStatus: '', disputeType: '',
  })
  // The single mandatory Ownership Document: { url, mock, name } once uploaded to Cloudinary;
  // nothing reports "uploaded" until a real URL comes back.
  const [ownershipDoc, setOwnershipDoc] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleOwnershipFile = async (file) => {
    setUploading(true)
    try {
      const { url, mock } = await uploadToCloudinary(file, 'property-document')
      setOwnershipDoc({ url, mock, name: file.name })
    } catch (err) {
      toast(err instanceof UploadError
        ? err.message
        : (err?.response?.data?.message || 'Upload fail ho gaya — dobara try karein'))
    } finally {
      setUploading(false)
    }
  }

  const anyMock = !!ownershipDoc?.mock

  const submit = async () => {
    if (!form.title.trim()) { toast('Title daaliye'); return }
    if (!form.area.trim())  { toast('Area daaliye'); return }
    if (!form.propertyType) { toast('Property type chuniye'); return }
    if (!form.propertyStatus) { toast('Property Status chuniye — Clear ya Dispute'); return }
    if (form.propertyStatus === 'DISPUTED' && !form.disputeType) { toast('Dispute Type chuniye — Civil, Criminal ya Other'); return }
    if (form.latitude == null || form.longitude == null) {
      toast('Property Location zaroori hai — "Use My Current Location" par click karein')
      return
    }
    // Ownership Document is mandatory — the backend enforces it too ("Ownership document is required.").
    if (!ownershipDoc) { toast('Ownership document is required.'); return }
    setBusy(true)
    try {
      await createProperty({
        title: form.title.trim(),
        area: form.area,
        age: form.age || 'New',
        city: form.city,
        tehsil: form.tehsil || undefined,
        address: form.address || undefined,
        propertyType: form.propertyType,
        propertyStatus: form.propertyStatus,
        disputeType: form.propertyStatus === 'DISPUTED' ? form.disputeType : undefined,
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        images: form.images,
        videos: form.videos,
        documents: [{ type: 'OWNERSHIP_DOCUMENT', url: ownershipDoc.url }],
      })
      toast('Submitted — Published to Users')
      go?.('dash')
    } catch (e) {
      toast(e.response?.data?.message || 'Submit nahi hua — dobara try karo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title="Add Property" subtitle="Submit karte hi listing Users ko turant dikhne lagegi." />

      <div style={{ maxWidth: 760 }}>
        <Card style={{ padding: 22 }}>
          <h3 className="dev" style={{ fontSize: 16, marginBottom: 16 }}>Property Details</h3>

          <Field label="Property Title" required>
            <input className="control" placeholder="e.g. 2BHK Flat, Malviya Nagar"
              value={form.title} onChange={(e) => setField('title', e.target.value)} />
          </Field>

          <Field label="Property Type" required>
            <select className="control" value={form.propertyType} onChange={(e) => setField('propertyType', e.target.value)}>
              <option value="">Select type...</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Property Status" required>
            <select
              className="control" value={form.propertyStatus}
              onChange={(e) => setForm((f) => ({ ...f, propertyStatus: e.target.value, disputeType: e.target.value === 'CLEAR' ? '' : f.disputeType }))}
            >
              <option value="">Select status...</option>
              <option value="CLEAR">Clear</option>
              <option value="DISPUTED">Dispute</option>
            </select>
          </Field>
          {form.propertyStatus === 'DISPUTED' && (
            <Field label="Dispute Type" required>
              <select className="control" value={form.disputeType} onChange={(e) => setField('disputeType', e.target.value)}>
                <option value="">Select dispute type...</option>
                <option value="CIVIL">Civil</option>
                <option value="CRIMINAL">Criminal</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
          )}

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

          <Field label="Ownership Document" required>
            <DocRow
              name="Ownership document" required
              picked={ownershipDoc} busy={uploading}
              onFile={handleOwnershipFile}
              onClear={() => setOwnershipDoc(null)}
            />
          </Field>

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
        {picked ? picked.name : name}{required && !picked && <span className="req"> *</span>}
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
