import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getComments, postComment, toggleLike, toggleSave } from '../api/feed.api'
import { useAuth } from '../context/AuthContext'
import { Badge, Tag } from './Badge'
import { AuthRequiredModal } from './AuthRequiredModal'
import { formatDate, humanize, riskTone } from '../lib/format'
import type { FeedComment, FeedItem, FeedTargetType } from '../types/api'

// FeedItem.source (display-oriented, from GET /properties/feed) → the
// FeedTargetType the engagement endpoints (like/save/comment) key on.
function targetTypeFor(source: FeedItem['source']): FeedTargetType {
  if (source === 'EXPERT_REPORT') return 'LISTING'
  if (source === 'OWNER_LISTING') return 'PROPERTY'
  return 'REPORTER_POST'
}

// Where a feed card's image/title lead to. Reporter posts have no per-post
// detail route (informational content, not a listing — see ReporterPost's
// own schema comment) so they stay expanded in the feed instead.
function detailHref(item: FeedItem): string | null {
  if (item.source === 'EXPERT_REPORT') return `/reports/${item.id}`
  if (item.source === 'OWNER_LISTING') return `/owner-properties/${item.id}`
  return null
}

function shareUrl(item: FeedItem): string {
  const href = detailHref(item) ?? '/reporter-feed'
  return `${window.location.origin}${href}`
}

/**
 * One card in the Home social feed — merges Expert/Owner/Reporter content
 * with a consistent "posted by" attribution and a like/comment/share/save
 * bar. Reuses .property-card's shell/tokens (see PropertyCard.tsx) rather
 * than inventing a new visual language.
 */
export function FeedCard({ item, onChange }: { item: FeedItem; onChange?: (next: FeedItem) => void }) {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [authAction, setAuthAction] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<FeedComment[] | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const href = detailHref(item)
  const location = item.tehsil ? `${item.tehsil}, ${item.city}` : item.city
  const cover = item.images[0] ?? item.videos[0]

  const requireAuth = (action: string, fn: () => void) => {
    if (status !== 'authenticated') {
      setAuthAction(action)
      return
    }
    fn()
  }

  const handleLike = () =>
    requireAuth('like this property', () => {
      if (busy) return
      setBusy(true)
      toggleLike(targetTypeFor(item.source), item.id)
        .then((res) => onChange?.({ ...item, isLiked: res.liked, likeCount: res.likeCount }))
        .catch(() => {})
        .finally(() => setBusy(false))
    })

  const handleSave = () =>
    requireAuth('save this property', () => {
      if (busy) return
      setBusy(true)
      toggleSave(targetTypeFor(item.source), item.id)
        .then((res) => onChange?.({ ...item, isSaved: res.saved, saveCount: res.saveCount }))
        .catch(() => {})
        .finally(() => setBusy(false))
    })

  const handleShare = async () => {
    const url = shareUrl(item)
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, url })
        return
      }
    } catch {
      // user cancelled the native share sheet — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — nothing more we can do without a backend
    }
  }

  // Buyer Verification Experience enhancement — a Reporter Post has no
  // detail route and is informational only (no address/propertyType, no
  // ownership claim), so "verifying" it reuses the existing Property
  // Discovery (source: 'DISCOVERY') request flow instead of inventing a new
  // one: the post's title/city/tehsil are handed off as a starting point on
  // the same "can't find the property" form BrowseProperty already uses,
  // and the buyer fills in the rest (address, property type). This never
  // creates or pretends to create a Property record, and never represents
  // the Reporter as the owner. Bug fix 2026-09-11: this CTA previously only
  // existed on ReporterPostCard (PropertyCard.tsx, the standalone
  // /reporter-feed page) — FeedCard is the component that actually renders
  // a Reporter Post in the main Home feed, and had no verify action at all.
  const goVerify = () =>
    requireAuth('verify this property', () => {
      navigate('/account/discovery-request/new', {
        state: {
          address: item.title ?? '',
          city: item.city ?? '',
          tehsil: item.tehsil ?? '',
        },
      })
    })

  const openComments = () => {
    setCommentsOpen((open) => !open)
    if (!comments) {
      getComments(targetTypeFor(item.source), item.id)
        .then((res) => setComments(res.comments))
        .catch(() => setComments([]))
    }
  }

  const submitComment = () =>
    requireAuth('comment on this property', () => {
      const body = commentDraft.trim()
      if (!body || postingComment) return
      setPostingComment(true)
      postComment(targetTypeFor(item.source), item.id, body)
        .then((res) => {
          setComments((prev) => [
            { id: res.comment.id, body: res.comment.body, createdAt: res.comment.createdAt, userId: res.comment.userId, userName: 'You' },
            ...(prev ?? []),
          ])
          setCommentDraft('')
          onChange?.({ ...item, commentCount: item.commentCount + 1 })
        })
        .catch(() => {})
        .finally(() => setPostingComment(false))
    })

  const media = cover ? (
    <img src={cover} alt="" loading="lazy" />
  ) : (
    <div className="property-card__media-fallback" aria-hidden="true">
      🏠
    </div>
  )

  return (
    <article className="property-card">
      {href ? (
        <Link to={href} className="property-card__media" aria-label={item.title}>
          {media}
          <div className="property-card__top">
            <Tag>{`Posted by ${humanize(item.uploadedBy)}`}</Tag>
            {item.riskBadge ? <Badge tone={riskTone(item.riskBadge)} /> : null}
          </div>
          <div className="property-card__scrim">
            <div className="property-card__name">{item.title}</div>
            <div className="property-card__meta">📍 {location ?? 'Location not listed'}</div>
          </div>
        </Link>
      ) : (
        <div className="property-card__media">
          {media}
          <div className="property-card__top">
            <Tag>{`Posted by ${humanize(item.uploadedBy)}`}</Tag>
          </div>
          <div className="property-card__scrim">
            <div className="property-card__name">{item.title}</div>
            <div className="property-card__meta">📍 {location ?? 'Location not listed'}</div>
          </div>
        </div>
      )}

      <div className="property-card__foot">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 10.5 }}>{formatDate(item.createdAt)}</div>
          {item.price != null ? (
            <div className="property-card__price">₹{item.price.toLocaleString('en-IN')}</div>
          ) : (
            <div style={{ color: 'var(--cc-green)', fontWeight: 600, fontSize: 11, marginTop: 2 }}>Free to view</div>
          )}
        </div>
        {href ? (
          <Link to={href} className="btn btn--primary btn--sm">
            Details
          </Link>
        ) : item.source === 'REPORTER_POST' ? (
          <button type="button" className="btn btn--secondary btn--sm" onClick={goVerify}>
            🔎 Verify This Property
          </button>
        ) : null}
      </div>

      <div className="feed-card__social">
        <button
          type="button"
          className={`feed-card__social-btn${item.isLiked ? ' feed-card__social-btn--active' : ''}`}
          onClick={handleLike}
          aria-pressed={item.isLiked}
        >
          {item.isLiked ? '❤️' : '🤍'} {item.likeCount}
        </button>
        <button type="button" className="feed-card__social-btn" onClick={openComments}>
          💬 {item.commentCount}
        </button>
        <button type="button" className="feed-card__social-btn" onClick={() => void handleShare()}>
          {copied ? '✅ Copied' : '↗️ Share'}
        </button>
        <button
          type="button"
          className={`feed-card__social-btn${item.isSaved ? ' feed-card__social-btn--active' : ''}`}
          onClick={handleSave}
          aria-pressed={item.isSaved}
        >
          {item.isSaved ? '🔖' : '📑'} {item.saveCount}
        </button>
      </div>

      {commentsOpen ? (
        <div className="stack" style={{ padding: '0 14px 14px', gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="control"
              placeholder="Add a comment…"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn--secondary btn--sm" disabled={postingComment} onClick={submitComment}>
              Post
            </button>
          </div>
          {comments === null ? (
            <p className="muted" style={{ fontSize: 12 }}>Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} style={{ fontSize: 12.5 }}>
                <span style={{ fontWeight: 700 }}>{c.userName}</span>{' '}
                <span className="muted" style={{ fontSize: 10.5 }}>{formatDate(c.createdAt)}</span>
                <div>{c.body}</div>
              </div>
            ))
          )}
        </div>
      ) : null}

      <AuthRequiredModal open={authAction !== null} onClose={() => setAuthAction(null)} action={authAction ?? 'continue'} />
    </article>
  )
}
