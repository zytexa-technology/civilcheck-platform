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
import type { FreePreviewProperty, OwnerProperty } from '../types/api'

type SearchState = 'idle' | 'loading' | 'done'

// "Browse Property" — distinct from Home's feed. A buyer who already knows a
// specific property/location searches CivilCheck's existing records (both
// Expert reports and Owner listings) for a match; if nothing turns up, they
// can ask CivilCheck to research it (reusing the existing SpecialRequest
// flow at /account/requests/new rather than a new request model).
export default function BrowseProperty() {
  const navigate = useNavigate()

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [khasra, setKhasra] = useState('')
  const [propertyType, setPropertyType] = useState('')

  const [state, setState] = useState<SearchState>('idle')
  const [error, setError] = useState('')
  const [listings, setListings] = useState<FreePreviewProperty[]>([])
  const [ownerProperties, setOwnerProperties] = useState<OwnerProperty[]>([])

  const query = [address, khasra].filter(Boolean).join(' ').trim()

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault()
    if (!query && !city && !propertyType) return
    setState('loading')
    setError('')
    try {
      const [listingRes, ownerRes] = await Promise.all([
        searchProperties({
          query: query || undefined,
          city: city || undefined,
          propertyType: (propertyType as (typeof PropertyType)[keyof typeof PropertyType]) || undefined,
          limit: 10,
        }),
        searchOwnerProperties({
          query: query || undefined,
          city: city || undefined,
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

  const goRequestSearch = () => {
    navigate('/account/requests/new', { state: { address, city, khasraNumber: khasra, propertyType } })
  }

  return (
    <div className="container page" style={{ maxWidth: 700 }}>
      <h1 className="h2" style={{ marginBottom: 6 }}>
        Browse Property
      </h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Know a specific property? Search CivilCheck's records by address, city, or khasra/survey
        number.
      </p>

      <form onSubmit={(e) => void handleSearch(e)} className="stack card" style={{ marginBottom: 24 }}>
        <Input label="Address / Locality" value={address} onChange={(e) => setAddress(e.target.value)} />
        <div className="row">
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} style={{ flex: 1 }} />
          <Input
            label="Khasra / Survey number"
            value={khasra}
            onChange={(e) => setKhasra(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
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
        <div className="grid" style={{ marginBottom: 24 }}>
          {listings.map((p) => (
            <PropertyCard key={`listing-${p.id}`} property={p} />
          ))}
          {ownerProperties.map((p) => (
            <OwnerPropertyCard key={`owner-${p.id}`} property={p} />
          ))}
        </div>
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
