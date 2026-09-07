// ─────────────────────────────────────────────────────────────────────────────
// Buyer Web social feed — Like / Save / Comment endpoints, shared across all
// three feed sources. See feedEngagement.service.ts for the domain logic.
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response } from 'express'
import type { FeedTargetType } from '@prisma/client'
import {
  FeedError,
  addComment,
  deleteComment,
  listComments,
  toggleLike,
  toggleSave,
} from '../services/feedEngagement.service.js'

const VALID_TARGET_TYPES: FeedTargetType[] = ['LISTING', 'PROPERTY', 'REPORTER_POST']

function parseTargetType(req: Request, res: Response): FeedTargetType | null {
  const targetType = String(req.params.targetType || '').toUpperCase()
  if (!VALID_TARGET_TYPES.includes(targetType as FeedTargetType)) {
    res.status(400).json({ success: false, message: 'Invalid property type' })
    return null
  }
  return targetType as FeedTargetType
}

// POST /api/feed/:targetType/:targetId/like
export const like = async (req: Request, res: Response) => {
  const targetType = parseTargetType(req, res)
  if (!targetType) return
  const targetId = req.params.targetId as string
  const userId = req.user!.id

  try {
    const result = await toggleLike(userId, targetType, targetId)
    res.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof FeedError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// POST /api/feed/:targetType/:targetId/save
export const save = async (req: Request, res: Response) => {
  const targetType = parseTargetType(req, res)
  if (!targetType) return
  const targetId = req.params.targetId as string
  const userId = req.user!.id

  try {
    const result = await toggleSave(userId, targetType, targetId)
    res.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof FeedError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// GET /api/feed/:targetType/:targetId/comments?page=&limit=
export const getComments = async (req: Request, res: Response) => {
  const targetType = parseTargetType(req, res)
  if (!targetType) return
  const targetId = req.params.targetId as string
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20))

  const { comments, total } = await listComments(targetType, targetId, page, limit)
  res.json({
    success: true,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      userId: c.userId,
      userName: c.user.name ?? 'CivilCheck buyer',
    })),
  })
}

// POST /api/feed/:targetType/:targetId/comments
export const postComment = async (req: Request, res: Response) => {
  const targetType = parseTargetType(req, res)
  if (!targetType) return
  const targetId = req.params.targetId as string
  const userId = req.user!.id
  const { body } = req.body as { body: string }

  try {
    const comment = await addComment(userId, targetType, targetId, body ?? '')
    res.status(201).json({
      success: true,
      comment: { id: comment.id, body: comment.body, createdAt: comment.createdAt, userId: comment.userId },
    })
  } catch (err) {
    if (err instanceof FeedError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}

// DELETE /api/feed/comments/:commentId
export const removeComment = async (req: Request, res: Response) => {
  const commentId = req.params.commentId as string
  const userId = req.user!.id

  try {
    await deleteComment(userId, commentId)
    res.json({ success: true, message: 'Comment deleted' })
  } catch (err) {
    if (err instanceof FeedError) {
      res.status(err.status).json({ success: false, message: err.message })
      return
    }
    throw err
  }
}
