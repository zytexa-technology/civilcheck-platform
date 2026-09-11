import client from './client'
import type {
  FeedCommentsResponse,
  FeedTargetType,
  LikeToggleResponse,
  PostCommentResponse,
  SaveToggleResponse,
} from '../types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Social Engagement (Buyer Mobile Phase 3) — same endpoints Buyer Web's
// feed.api.ts already calls, ported here since this file didn't exist on
// mobile before this phase. No new backend route: like/save/comments were
// already implemented and already live for the Home merged feed.
//
// deleteComment (`DELETE /api/feed/comments/:commentId`) exists server-side
// but is never called from Buyer Web's own UI either — kept out of scope
// here for the same reason, matching Web's actual behavior rather than the
// full backend surface.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/feed/:targetType/:targetId/like — toggles. Requires login. */
export async function toggleLike(targetType: FeedTargetType, targetId: string): Promise<LikeToggleResponse> {
  const { data } = await client.post<LikeToggleResponse>(`/feed/${targetType}/${targetId}/like`)
  return data
}

/** POST /api/feed/:targetType/:targetId/save — toggles. Requires login. */
export async function toggleSave(targetType: FeedTargetType, targetId: string): Promise<SaveToggleResponse> {
  const { data } = await client.post<SaveToggleResponse>(`/feed/${targetType}/${targetId}/save`)
  return data
}

/** GET /api/feed/:targetType/:targetId/comments — public read. */
export async function getComments(
  targetType: FeedTargetType,
  targetId: string,
  page = 1,
): Promise<FeedCommentsResponse> {
  const { data } = await client.get<FeedCommentsResponse>(`/feed/${targetType}/${targetId}/comments`, {
    params: { page },
  })
  return data
}

/** POST /api/feed/:targetType/:targetId/comments — requires login. */
export async function postComment(
  targetType: FeedTargetType,
  targetId: string,
  body: string,
): Promise<PostCommentResponse> {
  const { data } = await client.post<PostCommentResponse>(`/feed/${targetType}/${targetId}/comments`, { body })
  return data
}
