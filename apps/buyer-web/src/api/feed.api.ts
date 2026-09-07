import client from './client'
import type {
  FeedCommentsResponse,
  FeedTargetType,
  LikeToggleResponse,
  PostCommentResponse,
  SaveToggleResponse,
} from '../types/api'

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

/** DELETE /api/feed/comments/:commentId — owner-only. */
export async function deleteComment(commentId: string): Promise<{ success: boolean; message: string }> {
  const { data } = await client.delete<{ success: boolean; message: string }>(`/feed/comments/${commentId}`)
  return data
}
