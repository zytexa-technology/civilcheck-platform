// ─────────────────────────────────────────────────────────────────────────────
// Buyer Web social feed — Like / Save / Comment on any of the three feed
// sources (Listing = Expert, Property = Owner, ReporterPost = Reporter).
//
// Deliberately polymorphic (FeedTargetType + targetId) rather than three
// near-duplicate models — see the schema comment above PropertyLike. All
// counting here is done with groupBy rather than Prisma relation `_count`,
// because there is no real FK from these models to Listing/Property/
// ReporterPost to count through (see same schema comment).
// ─────────────────────────────────────────────────────────────────────────────
import type { FeedTargetType, PropertyComment } from '@prisma/client'
import prisma from '../lib/prisma.js'

export class FeedError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'FeedError'
    this.status = status
  }
}

// Confirms the target actually exists AND is in the same publicly-visible
// state the feed itself uses — a buyer must not be able to like/save/comment
// on a rejected/pending/removed row just by guessing its id.
export async function assertFeedTargetVisible(targetType: FeedTargetType, targetId: string): Promise<void> {
  let visible = false
  if (targetType === 'LISTING') {
    const row = await prisma.listing.findUnique({ where: { id: targetId }, select: { status: true } })
    visible = row?.status === 'APPROVED'
  } else if (targetType === 'PROPERTY') {
    const row = await prisma.property.findUnique({ where: { id: targetId }, select: { status: true } })
    visible = row?.status === 'APPROVED'
  } else {
    const row = await prisma.reporterPost.findUnique({ where: { id: targetId }, select: { status: true } })
    visible = row?.status === 'PUBLISHED'
  }
  if (!visible) throw new FeedError('Property not found', 404)
}

export async function toggleLike(
  userId: string,
  targetType: FeedTargetType,
  targetId: string
): Promise<{ liked: boolean; likeCount: number }> {
  await assertFeedTargetVisible(targetType, targetId)

  const existing = await prisma.propertyLike.findUnique({
    where: { userId_targetType_targetId: { userId, targetType, targetId } },
  })

  if (existing) {
    await prisma.propertyLike.delete({ where: { id: existing.id } })
  } else {
    await prisma.propertyLike.create({ data: { userId, targetType, targetId } })
  }

  const likeCount = await prisma.propertyLike.count({ where: { targetType, targetId } })
  return { liked: !existing, likeCount }
}

export async function toggleSave(
  userId: string,
  targetType: FeedTargetType,
  targetId: string
): Promise<{ saved: boolean; saveCount: number }> {
  await assertFeedTargetVisible(targetType, targetId)

  const existing = await prisma.propertySave.findUnique({
    where: { userId_targetType_targetId: { userId, targetType, targetId } },
  })

  if (existing) {
    await prisma.propertySave.delete({ where: { id: existing.id } })
  } else {
    await prisma.propertySave.create({ data: { userId, targetType, targetId } })
  }

  const saveCount = await prisma.propertySave.count({ where: { targetType, targetId } })
  return { saved: !existing, saveCount }
}

export async function addComment(
  userId: string,
  targetType: FeedTargetType,
  targetId: string,
  body: string
): Promise<PropertyComment> {
  await assertFeedTargetVisible(targetType, targetId)
  const trimmed = body.trim()
  if (trimmed.length < 1 || trimmed.length > 1000) {
    throw new FeedError('Comment must be between 1 and 1000 characters', 400)
  }
  return prisma.propertyComment.create({ data: { userId, targetType, targetId, body: trimmed } })
}

export async function listComments(
  targetType: FeedTargetType,
  targetId: string,
  page: number,
  limit: number
): Promise<{ comments: (PropertyComment & { user: { name: string | null } })[]; total: number }> {
  const skip = (page - 1) * limit
  const [comments, total] = await Promise.all([
    prisma.propertyComment.findMany({
      where: { targetType, targetId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.propertyComment.count({ where: { targetType, targetId } }),
  ])
  return { comments, total }
}

export async function deleteComment(userId: string, commentId: string): Promise<void> {
  const comment = await prisma.propertyComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.userId !== userId) {
    throw new FeedError('Comment not found', 404)
  }
  await prisma.propertyComment.delete({ where: { id: commentId } })
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk counts/flags for the merged Home feed — one groupBy per metric per
// targetType, not per-row, so a page of N feed items costs a fixed handful
// of queries rather than N.
// ─────────────────────────────────────────────────────────────────────────────
export interface EngagementCounts {
  likeCount: number
  saveCount: number
  commentCount: number
}

export async function getEngagementCounts(
  targetType: FeedTargetType,
  targetIds: string[]
): Promise<Map<string, EngagementCounts>> {
  const map = new Map<string, EngagementCounts>()
  if (targetIds.length === 0) return map

  const [likes, saves, comments] = await Promise.all([
    prisma.propertyLike.groupBy({ by: ['targetId'], where: { targetType, targetId: { in: targetIds } }, _count: true }),
    prisma.propertySave.groupBy({ by: ['targetId'], where: { targetType, targetId: { in: targetIds } }, _count: true }),
    prisma.propertyComment.groupBy({ by: ['targetId'], where: { targetType, targetId: { in: targetIds } }, _count: true }),
  ])

  for (const id of targetIds) map.set(id, { likeCount: 0, saveCount: 0, commentCount: 0 })
  for (const row of likes) map.get(row.targetId)!.likeCount = row._count
  for (const row of saves) map.get(row.targetId)!.saveCount = row._count
  for (const row of comments) map.get(row.targetId)!.commentCount = row._count

  return map
}

export interface ViewerFlags {
  isLiked: boolean
  isSaved: boolean
}

export async function getViewerFlags(
  userId: string | null,
  targetType: FeedTargetType,
  targetIds: string[]
): Promise<Map<string, ViewerFlags>> {
  const map = new Map<string, ViewerFlags>()
  for (const id of targetIds) map.set(id, { isLiked: false, isSaved: false })
  if (!userId || targetIds.length === 0) return map

  const [likes, saves] = await Promise.all([
    prisma.propertyLike.findMany({ where: { userId, targetType, targetId: { in: targetIds } }, select: { targetId: true } }),
    prisma.propertySave.findMany({ where: { userId, targetType, targetId: { in: targetIds } }, select: { targetId: true } }),
  ])
  for (const row of likes) map.get(row.targetId)!.isLiked = true
  for (const row of saves) map.get(row.targetId)!.isSaved = true

  return map
}
