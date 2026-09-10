// ─────────────────────────────────────────────────────────────────────────
//  LocationCapture.jsx — real GPS pin capture (Google Maps integration
//  foundation, Phase 2). Uses the browser's real Geolocation API — no fake
//  coordinates, no placeholder pin. Replaces the old "Google Map Location"
//  optional-document upload slot, which asked a seller to upload a
//  screenshot instead of actually capturing a location.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from 'react'

export default function LocationCapture({ latitude, longitude, onCapture }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const capture = () => {
    if (!navigator.geolocation) {
      setError('Yeh browser location capture support nahi karta.')
      return
    }
    setBusy(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onCapture(pos.coords.latitude, pos.coords.longitude)
        setBusy(false)
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED
          ? 'Location permission denied — browser settings me allow karein.'
          : 'Location capture nahi ho saka — dobara try karein.')
        setBusy(false)
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  const hasLocation = latitude != null && longitude != null

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 7, fontWeight: 600 }}>
        Property Location *
      </label>
      <button
        type="button"
        className="chip ink up"
        onClick={capture}
        disabled={busy}
        style={{ cursor: busy ? 'default' : 'pointer' }}
      >
        {busy ? 'Capturing…' : hasLocation ? '📍 Update Location' : '📍 Use My Current Location'}
      </button>
      {!hasLocation && !error && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Required — this pin is what buyers see on the map, so submission is blocked until it's captured.
        </div>
      )}
      {hasLocation && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Pinned: {latitude.toFixed(5)}, {longitude.toFixed(5)}{' '}
          <a
            href={`https://www.google.com/maps?q=${latitude},${longitude}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--blue, #2b5c8f)' }}
          >
            view on map
          </a>
        </div>
      )}
      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  )
}
