import { useEffect, useRef, useState } from 'react'
import { adClickUrl, trackImpression, type FeedAd } from '../api/ads.api'

// An in-feed advertisement. Deliberately labelled "ADVERTISEMENT" and shaped differently from a
// property card so it can never be mistaken for a listing.
//
// Impression rule: counted only when at least half of the card is on screen for one continuous
// second. The server issued `ad.token` when it served the ad and ignores repeats of the same token,
// so re-renders, scrolling back and forth and retries cannot double-count; `sent` also stops a
// second request from this component.
const VISIBLE_RATIO = 0.5
const VISIBLE_MS = 1000

export function AdCard({ ad, onDismiss }: { ad: FeedAd; onDismiss: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const sent = useRef(false)
  const [playing, setPlaying] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || sent.current || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
          if (!timer && !sent.current) {
            timer = setTimeout(() => {
              if (sent.current) return
              sent.current = true
              observer.disconnect()
              void trackImpression(ad.token).catch(() => {
                sent.current = false // server never saw it; the same token is safe to retry
              })
            }, VISIBLE_MS)
          }
        } else if (timer) {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: [0, VISIBLE_RATIO, 1] },
    )
    observer.observe(el)
    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
    }
  }, [ad.token])

  const toggleVideo = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  return (
    <div ref={ref} className="card" style={{ position: 'relative', overflow: 'hidden' }} aria-label="Advertisement">
      <div className="spread" style={{ marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: 0.8,
            color: 'var(--cc-muted)',
            border: '1px solid var(--cc-border)',
            borderRadius: 6,
            padding: '2px 8px',
          }}
        >
          ADVERTISEMENT
        </span>
        <button
          type="button"
          onClick={() => onDismiss(ad.id)}
          aria-label="Dismiss this advertisement"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--cc-muted)' }}
        >
          ✕
        </button>
      </div>

      <div style={{ borderRadius: 10, overflow: 'hidden', background: '#000', position: 'relative' }}>
        {ad.creativeType === 'VIDEO' ? (
          <>
            {/* Muted autoplay (never forces sound); the buyer can pause/play. */}
            <video
              ref={videoRef}
              src={ad.creativeUrl}
              muted
              loop
              playsInline
              autoPlay
              preload="metadata"
              style={{ width: '100%', maxHeight: 420, display: 'block', objectFit: 'cover' }}
            />
            <button
              type="button"
              onClick={toggleVideo}
              aria-label={playing ? 'Pause video' : 'Play video'}
              style={{ position: 'absolute', bottom: 8, right: 8, border: 'none', borderRadius: 999, padding: '4px 10px', cursor: 'pointer', background: 'rgba(0,0,0,.6)', color: '#fff' }}
            >
              {playing ? '⏸' : '▶'}
            </button>
          </>
        ) : (
          <img src={ad.creativeUrl} alt={ad.title} loading="lazy" style={{ width: '100%', maxHeight: 420, display: 'block', objectFit: 'cover' }} />
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {ad.businessName}
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{ad.title}</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>{ad.description}</p>
        <a
          href={adClickUrl(ad)}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="btn btn--primary"
          style={{ display: 'inline-block', marginTop: 10, textDecoration: 'none' }}
        >
          {ad.ctaText}
        </a>
      </div>
    </div>
  )
}
