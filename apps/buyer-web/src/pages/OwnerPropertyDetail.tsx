import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOwnerPropertyById } from '../api/ownerProperty.api'
import { Card, InfoGrid, SectionCard } from '../components/Card'
import { MediaGallery } from '../components/MediaGallery'
import { ErrorState, LoadingState } from '../components/States'
import { Tag } from '../components/Badge'
import { VerifyPropertyCTA } from '../components/VerifyPropertyCTA'
import { errorMessage } from '../lib/errors'
import { formatDate, humanize } from '../lib/format'
import type { OwnerProperty } from '../types/api'

export default function OwnerPropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const [property, setProperty] = useState<OwnerProperty | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    if (!id) return
    queueMicrotask(() => {
      setLoading(true)
      setError('')
    })
    getOwnerPropertyById(id)
      .then((res) => setProperty(res.property))
      .catch((err) => setError(errorMessage(err, "Couldn't load this property.")))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  if (loading) {
    return (
      <div className="container page">
        <LoadingState label="Loading property…" />
      </div>
    )
  }

  if (error || !property || !id) {
    return (
      <div className="container page">
        <ErrorState message={error || 'Property not found.'} onRetry={load} />
      </div>
    )
  }

  const clamped = Math.max(0, Math.min(100, property.health))
  const healthColor = clamped >= 70 ? 'var(--cc-green)' : clamped >= 40 ? 'var(--cc-amber)' : 'var(--cc-red)'
  const location = property.tehsil ? `${property.tehsil}, ${property.city}` : (property.city ?? 'Location not listed')

  return (
    <div className="container page">
      <MediaGallery images={property.images} videos={property.videos} />

      <div className="two-col" style={{ marginTop: 24 }}>
        <div className="stack">
          <div>
            <div className="row" style={{ marginBottom: 8 }}>
              <Tag>{humanize(property.uploadedBy)}</Tag>
            </div>
            <h1 className="h2">{property.title}</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              📍 {location}
              {property.mapUrl ? (
                <>
                  {' · '}
                  <a href={property.mapUrl} target="_blank" rel="noreferrer" className="gold-text">
                    View on map ↗
                  </a>
                </>
              ) : null}
            </p>
          </div>

          <Card>
            <div className="spread" style={{ marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Document health score
              </span>
              <span style={{ fontWeight: 800, color: healthColor }}>{clamped}%</span>
            </div>
            <div className="health-bar__track">
              <div className="health-bar__fill" style={{ width: `${clamped}%`, background: healthColor }} />
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              This score reflects documents the owner has self-uploaded — it is not an independent
              expert assessment or a CivilCheck verification. For a professional opinion, request
              verification below.
            </p>
          </Card>

          <SectionCard icon="🏠" title="Property details">
            <InfoGrid
              items={[
                { label: 'Property type', value: humanize(property.propertyType) },
                { label: 'Area', value: property.area },
                { label: 'Age', value: property.age ?? '—' },
                { label: 'Listed on', value: formatDate(property.listedSince) },
              ]}
            />
          </SectionCard>

          <VerifyPropertyCTA source="PROPERTY" targetId={id} />
        </div>

        <aside className="stack">
          <Card>
            <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--cc-green)', marginBottom: 6 }}>
              Free to view
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              {property.ownerName ? `👤 Listed by ${property.ownerName}` : 'Listed by owner'}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  )
}
