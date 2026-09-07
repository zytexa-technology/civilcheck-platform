import { useState } from 'react'

/**
 * Property media gallery — desktop-adapted from apps/buyer's horizontal
 * scroller. A large lead image plus a 2x2 grid of the rest (web convention
 * for a marketplace gallery), collapsing to a single lead image on mobile.
 * Renders nothing when there is no media.
 */
export function MediaGallery({ images, videos }: { images: string[]; videos: string[] }) {
  const [preview, setPreview] = useState<string | null>(null)
  const items = [...images.map((url) => ({ url, kind: 'image' as const })), ...videos.map((url) => ({ url, kind: 'video' as const }))]

  if (items.length === 0) return null

  const [lead, ...rest] = items
  const extra = rest.slice(0, 3)
  const remaining = rest.length - extra.length

  return (
    <>
      <div className="gallery">
        <GalleryTile item={lead} className="gallery__main" onOpen={setPreview} />
        {extra.map((item, i) => (
          <div key={item.url} className={i === extra.length - 1 && remaining > 0 ? 'gallery__more' : undefined}>
            <GalleryTile item={item} onOpen={setPreview} />
            {i === extra.length - 1 && remaining > 0 ? (
              <div className="gallery__more-count">+{remaining} more</div>
            ) : null}
          </div>
        ))}
      </div>

      {preview ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
          onClick={() => setPreview(null)}
        >
          <img src={preview} alt="" />
        </div>
      ) : null}
    </>
  )
}

function GalleryTile({
  item,
  className,
  onOpen,
}: {
  item: { url: string; kind: 'image' | 'video' }
  className?: string
  onOpen: (url: string) => void
}) {
  if (item.kind === 'video') {
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className={className} aria-label="Play video">
        <video src={item.url} muted />
      </a>
    )
  }

  return (
    <img
      src={item.url}
      alt=""
      className={className}
      loading="lazy"
      onClick={() => onOpen(item.url)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen(item.url)
      }}
    />
  )
}
