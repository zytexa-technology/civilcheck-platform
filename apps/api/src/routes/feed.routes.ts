// ─────────────────────────────────────────────────────────────────────────────
// Buyer Web social feed engagement — Like / Save / Comment. Mounted at
// /api/feed. The merged feed READ itself still lives at GET /api/properties/
// feed (property.routes.ts) — this router only covers the write/interaction
// side, which is symmetric across all three feed sources.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { feedCommentCreateSchema } from '@civilcheck/shared'
import * as feedController from '../controllers/feed.controller.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

const router = Router()

router.get('/:targetType/:targetId/comments', feedController.getComments)
router.post(
  '/:targetType/:targetId/comments',
  authMiddleware,
  validateBody(feedCommentCreateSchema),
  feedController.postComment
)
router.post('/:targetType/:targetId/like', authMiddleware, feedController.like)
router.post('/:targetType/:targetId/save', authMiddleware, feedController.save)
router.delete('/comments/:commentId', authMiddleware, feedController.removeComment)

export default router
