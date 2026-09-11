import { Link, useNavigate } from 'react-router-dom'
import { Badge, Tag } from './Badge'
import { formatRupees, formatDate, formatDistance, haversineDistanceKm, humanize, riskTone, sellerBadgeLabel } from '../lib/format'
import type { Coordinates } from '../lib/geolocation'
import type { FreePreviewProperty, OwnerProperty, ReporterPost } from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Media-first property card — web port of apps/buyer's PropertyCard. Same
// visual language (cover image, uploader/risk overlay, price/seller footer,
// map + verify + details actions), rebuilt with react-router Links instead
// of expo-router push and a plain <img> instead of expo-image.
// ─────────────────────────────────────────────────────────────────────────────

function CardActions({
  detailsHref,
  mapUrl,
  verifyHref,
}: {
  detailsHref: string
  mapUrl: string | null
  verifyHref: string
}) {
  const navigate = useNavigate()

  return (
    <div className="property-card__actions">
      {mapUrl ? (
        <a
          className="action-icon"
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View on map"
          onClick={(e) => e.stopPropagation()}
        >
          🗺️
        </a>
      ) : null}
      <button
        type="button"
        className="action-verify"
        onClick={(e) => {
          e.stopPropagation()
          navigate(verifyHref)
        }}
      >
        🔎 Verify
      </button>
      <Link to={detailsHref} className="btn btn--primary btn--sm">
        Details
      </Link>
    </div>
  )
}

export function PropertyCard({
  property,
  buyerCoords,
}: {
  property: FreePreviewProperty
  /** Already-resolved buyer location, shared from the page — a card never requests it itself. */
  buyerCoords?: Coordinates | null
}) {
  const tone = riskTone(property.riskBadge)
  const location = property.tehsil ? `${property.tehsil}, ${property.city}` : property.city
  const cover = property.images[0] ?? property.videos[0]
  const detailsHref = `/reports/${property.id}`
  const distanceLabel = buyerCoords
    ? formatDistance(haversineDistanceKm(buyerCoords.latitude, buyerCoords.longitude, property.latitude, property.longitude))
    : null

  return (
    <article className="property-card">
      <Link to={detailsHref} className="property-card__media" aria-label={property.address}>
        {cover ? (
          <img src={cover} alt="" loading="lazy" />
        ) : (
          <div className="property-card__media-fallback" aria-hidden="true">
            🏠
          </div>
        )}
        <div className="property-card__top">
          <Tag>{`Posted by ${humanize(property.uploadedBy)}`}</Tag>
          <Badge tone={tone} />
        </div>
        <div className="property-card__scrim">
          <div className="property-card__name">{property.address}</div>
          <div className="property-card__meta">
            📍 {location} · 👁 {property.views ?? 0}
            {distanceLabel ? ` · ${distanceLabel}` : ''}
          </div>
        </div>
      </Link>

      <div className="property-card__foot">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 10.5 }}>
            {sellerBadgeLabel(property.sellerBadge)}
          </div>
          <div className="property-card__price">{formatRupees(property.price)}</div>
        </div>
        <CardActions
          detailsHref={detailsHref}
          mapUrl={property.mapUrl}
          verifyHref={`${detailsHref}?verify=1`}
        />
      </div>
    </article>
  )
}

function HealthBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  const colour = clamped >= 70 ? 'var(--cc-green)' : clamped >= 40 ? 'var(--cc-amber)' : 'var(--cc-red)'

  return (
    <div className="health-bar">
      <div className="health-bar__row">
        <span className="muted">Document health</span>
        <span style={{ color: colour, fontWeight: 700 }}>{clamped}%</span>
      </div>
      <div className="health-bar__track">
        <div className="health-bar__fill" style={{ width: `${clamped}%`, background: colour }} />
      </div>
    </div>
  )
}

export function OwnerPropertyCard({
  property,
  buyerCoords,
}: {
  property: OwnerProperty
  /** Already-resolved buyer location, shared from the page — a card never requests it itself. */
  buyerCoords?: Coordinates | null
}) {
  const cover = property.images[0] ?? property.videos[0]
  const detailsHref = `/owner-properties/${property.id}`
  const distanceLabel = buyerCoords
    ? formatDistance(haversineDistanceKm(buyerCoords.latitude, buyerCoords.longitude, property.latitude, property.longitude))
    : null

  return (
    <article className="property-card">
      <Link to={detailsHref} className="property-card__media" aria-label={property.title}>
        {cover ? (
          <img src={cover} alt="" loading="lazy" />
        ) : (
          <div className="property-card__media-fallback" aria-hidden="true">
            🏠
          </div>
        )}
        <div className="property-card__top">
          <Tag>{`Posted by ${humanize(property.uploadedBy)}`}</Tag>
        </div>
        <div className="property-card__scrim">
          <div className="property-card__name">{property.title}</div>
          <div className="property-card__meta">
            📍 {property.city ?? 'Location not listed'} · {property.area}
            {distanceLabel ? ` · ${distanceLabel}` : ''}
          </div>
        </div>
      </Link>

      <HealthBar value={property.health} />

      <div className="property-card__foot">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 10.5 }}>
            {property.ownerName ? `👤 ${property.ownerName}` : 'Listed by owner'}
          </div>
          <div style={{ color: 'var(--cc-green)', fontWeight: 600, fontSize: 11, marginTop: 2 }}>
            Free to view
          </div>
        </div>
        <CardActions
          detailsHref={detailsHref}
          mapUrl={property.mapUrl}
          verifyHref={`${detailsHref}?verify=1`}
        />
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporter posts are informational content, not a property listing — this
// card must look and behave nothing like PropertyCard/OwnerPropertyCard: no
// price, no risk badge, no health bar, no "Verify"/"Details" actions, no
// verification claim of any kind. Just the photo, a caption and clear
// "Reported by CivilCheck Reporter" attribution, for a scrolling feed.
// ─────────────────────────────────────────────────────────────────────────────
export function ReporterPostCard({ post }: { post: ReporterPost }) {
  const navigate = useNavigate()
  const cover = post.images[0]
  const location = post.tehsil ? `${post.tehsil}, ${post.city}` : post.city

  // Buyer Verification Experience enhancement — a Reporter Post is
  // informational only (no address/propertyType, no ownership claim), so
  // "verifying" it reuses the existing Property Discovery (source:
  // 'DISCOVERY') request flow instead of inventing a new one: the post's
  // title/city/tehsil are handed off as a starting point on the same
  // "can't find the property" form BrowseProperty already uses, and the
  // buyer fills in the rest (address, property type). This never creates or
  // pretends to create a Property record, and never represents the Reporter
  // as the owner.
  const goVerify = () => {
    navigate('/account/discovery-request/new', {
      state: {
        address: post.title ?? '',
        city: post.city ?? '',
        tehsil: post.tehsil ?? '',
      },
    })
  }

  return (
    <article className="reporter-post-card">
      {cover ? (
        <img className="reporter-post-card__media" src={cover} alt="" loading="lazy" />
      ) : (
        <div className="reporter-post-card__media reporter-post-card__media--fallback" aria-hidden="true">
          📰
        </div>
      )}
      <div className="reporter-post-card__body">
        {post.title ? <div className="reporter-post-card__title">{post.title}</div> : null}
        {post.description ? <p className="muted reporter-post-card__desc">{post.description}</p> : null}
        {location ? <div className="muted reporter-post-card__meta">📍 {location}</div> : null}
        <div className="reporter-post-card__foot">
          <Tag>{`📝 ${post.reportedBy}`}</Tag>
          <span className="muted" style={{ fontSize: 11 }}>
            {post.sourceName ? `${post.sourceName} · ` : ''}
            {formatDate(post.postedAt)}
          </span>
        </div>
        <button type="button" className="btn btn--secondary btn--sm" style={{ marginTop: 10, width: '100%' }} onClick={goVerify}>
          🔎 Verify This Property
        </button>
      </div>
    </article>
  )
}
