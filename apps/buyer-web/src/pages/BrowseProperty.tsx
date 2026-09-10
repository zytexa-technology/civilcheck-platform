import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchProperties } from '../api/property.api'
import { searchOwnerProperties } from '../api/ownerProperty.api'
import { PropertyCard, OwnerPropertyCard } from '../components/PropertyCard'
import { Button } from '../components/Button'
import { Input, Select } from '../components/Field'
import { LoadingState } from '../components/States'
import { PropertyType } from '@civilcheck/shared'
import { errorMessage } from '../lib/errors'
import { humanize } from '../lib/format'
import { getBuyerLocation, geolocationErrorMessage, type Coordinates, type GeolocationErrorReason } from '../lib/geolocation'
import type { FreePreviewProperty, OwnerProperty } from '../types/api'

type SearchState = 'idle' | 'loading' | 'done'

// "Browse Property" — distinct from Home's feed. A buyer who already knows a
// specific property/location searches CivilCheck's existing records (both
// Expert reports and Owner listings) for a match; if nothing turns up, they
// can ask CivilCheck to find one — a VerificationRequest(source=DISCOVERY)
// (Step 4E), not a new request model and not the legacy SpecialRequest flow
// (kept at /account/requests/new for in-flight legacy requests only).
export default function BrowseProperty() {
  const navigate = useNavigate()

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [tehsil, setTehsil] = useState('')
  const [khasra, setKhasra] = useState('')
  const [propertyType, setPropertyType] = useState('')

  const [state, setState] = useState<SearchState>('idle')
  const [error, setError] = useState('')
  const [listings, setListings] = useState<FreePreviewProperty[]>([])
  const [ownerProperties, setOwnerProperties] = useState<OwnerProperty[]>([])

  // Requested once via the button below and shared across every result
  // card — never per-card, never automatically, never persisted.
  const [buyerCoords, setBuyerCoords] = useState<Coordinates | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<GeolocationErrorReason | null>(null)

  const handleLocate = async () => {
    setLocating(true)
    setGeoError(null)
    const result = await getBuyerLocation()
    setLocating(false)
    if (result.coords) setBuyerCoords(result.coords)
    else setGeoError(result.error)
  }

  const query = [address, khasra].filter(Boolean).join(' ').trim()

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault()
    if (!query && !city && !tehsil && !propertyType) return
    setState('loading')
    setError('')
    try {
      const [listingRes, ownerRes] = await Promise.all([
        searchProperties({
          query: query || undefined,
          city: city || undefined,
          tehsil: tehsil || undefined,
          propertyType: (propertyType as (typeof PropertyType)[keyof typeof PropertyType]) || undefined,
          limit: 10,
        }),
        searchOwnerProperties({
          query: query || undefined,
          city: city || undefined,
          tehsil: tehsil || undefined,
          propertyType: (propertyType as (typeof PropertyType)[keyof typeof PropertyType]) || undefined,
          limit: 10,
        }),
      ])
      setListings(listingRes.results)
      setOwnerProperties(ownerRes.results)
      setState('done')
    } catch (err) {
      setError(errorMessage(err, 'Search failed. Please try again.'))
      setState('idle')
    }
  }

  const found = listings.length + ownerProperties.length > 0
  const searched = state === 'done'

  // Property Discovery flow (Step 4E) — "no result" now leads to a real
  // VerificationRequest(source=DISCOVERY), not the legacy SpecialRequest
  // flow (still reachable at /account/requests/new for in-flight legacy
  // requests, just no longer linked from here).
  const goRequestSearch = () => {
    navigate('/account/discovery-request/new', { state: { address, city, tehsil, khasraNumber: khasra, propertyType } })
  }

  return (
    <div className="container page" style={{ maxWidth: 700 }}>
      <h1 className="h2" style={{ marginBottom: 6 }}>
        Browse Property
      </h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Know a specific property? Search CivilCheck's records by address, city, tehsil, or
        khasra/survey number.
      </p>

      <form onSubmit={(e) => void handleSearch(e)} className="stack card" style={{ marginBottom: 24 }}>
        <Input label="Address / Locality" value={address} onChange={(e) => setAddress(e.target.value)} />
        <div className="row">
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} style={{ flex: 1 }} />
          <Input label="Tehsil" value={tehsil} onChange={(e) => setTehsil(e.target.value)} style={{ flex: 1 }} />
        </div>
        <Input
          label="Khasra / Survey number (optional)"
          value={khasra}
          onChange={(e) => setKhasra(e.target.value)}
        />
        <Select label="Property type (optional)" value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
          <option value="">Any type</option>
          {Object.values(PropertyType).map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
        <Button type="submit" size="lg" block loading={state === 'loading'}>
          Search
        </Button>
      </form>

      {state === 'loading' ? <LoadingState label="Searching CivilCheck's records…" /> : null}

      {error ? <p className="muted" style={{ color: 'var(--cc-red)', fontSize: 13 }}>{error}</p> : null}

      {searched && found ? (
        <>
          <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {!buyerCoords ? (
              <Button variant="secondary" size="sm" loading={locating} onClick={() => void handleLocate()}>
                📍 Use my location to show distance
              </Button>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>📍 Showing distance from your current location</span>
            )}
            {geoError ? (
              <span className="muted" style={{ fontSize: 11.5 }}>{geolocationErrorMessage(geoError)}</span>
            ) : null}
          </div>
          <div className="grid" style={{ marginBottom: 24 }}>
            {listings.map((p) => (
              <PropertyCard key={`listing-${p.id}`} property={p} buyerCoords={buyerCoords} />
            ))}
            {ownerProperties.map((p) => (
              <OwnerPropertyCard key={`owner-${p.id}`} property={p} buyerCoords={buyerCoords} />
            ))}
          </div>
        </>
      ) : null}

      {searched && !found ? (
        <div className="card center" style={{ padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }} aria-hidden="true">
            🔍
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            Can't find the property you're looking for?
          </h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 16, maxWidth: 420, margin: '0 auto 16px' }}>
            Submit the details and an eligible Expert or Admin will research it for you.
          </p>
          <Button onClick={goRequestSearch}>Request a Property Search</Button>
        </div>
      ) : null}
    </div>
  )
}
