// ─────────────────────────────────────────────────────────────────────────
//  MediaUpload.jsx — reusable property image/video upload widget
//  (Phase 2 — Property System). Same real Cloudinary signed-upload pattern
//  as documents (cloudinaryUpload.js) — `purposeImage`/`purposeVideo` pick
//  the right upload-signature purpose (e.g. 'listing-image'/'listing-video'
//  vs 'property-image'/'property-video'), which the backend signs with
//  different allowed formats/max size per kind (see lib/cloudinary.ts).
// ─────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { uploadToCloudinary, UploadError } from '../api/cloudinaryUpload'

function MediaRow({ label, accept, hint, purpose, urls, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // re-selecting the same file must re-fire onChange
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const { url, mock } = await uploadToCloudinary(file, purpose)
      onChange([...urls, url])
      if (mock) {
        setError('Cloudinary mock mode — koi real file store nahi hui abhi (production credentials chahiye).')
      }
    } catch (err) {
      setError(err instanceof UploadError
        ? err.message
        : (err?.response?.data?.message || 'Upload fail ho gaya — dobara try karein'))
    } finally {
      setUploading(false)
    }
  }

  const remove = (i) => onChange(urls.filter((_, idx) => idx !== i))

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 7, fontWeight: 600 }}>
        {label}
      </label>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleFile} />
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        style={{ border: '2px dashed var(--line-2)', borderRadius: 10, padding: '18px 16px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-2)' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
          {uploading ? 'Uploading…' : `+ Add ${label}`}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{hint}</div>
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      {urls.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {urls.map((url, i) => (
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

// purposePrefix: 'listing' | 'property' — picks 'listing-image'/'listing-video'
// or 'property-image'/'property-video' as the upload-signature purpose.
export default function MediaUpload({ purposePrefix, images, videos, onImagesChange, onVideosChange }) {
  return (
    <div style={{ marginTop: 4 }}>
      <MediaRow
        label="Photos"
        accept=".jpg,.jpeg,.png,.webp"
        hint="JPG, PNG, WEBP — max 10MB each"
        purpose={`${purposePrefix}-image`}
        urls={images}
        onChange={onImagesChange}
      />
      <MediaRow
        label="Videos"
        accept=".mp4,.mov,.webm"
        hint="MP4, MOV, WEBM — max 100MB each"
        purpose={`${purposePrefix}-video`}
        urls={videos}
        onChange={onVideosChange}
      />
    </div>
  )
}
