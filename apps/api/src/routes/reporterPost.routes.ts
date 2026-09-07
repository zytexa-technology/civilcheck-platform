import { Router } from 'express'
import { PartnerRole } from '@prisma/client'
import { reporterPostCreateSchema, reporterPostUpdateSchema } from '@civilcheck/shared'
import * as reporterPostController from '../controllers/reporterPost.controller.js'
import { sellerMiddleware, requireSellerRole } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

const router = Router()

// requireSellerRole(REPORTER) stops an Owner/Expert account from replaying
// its JWT against Reporter-persona content CRUD it never registered for —
// same reasoning as property-owner.routes.ts's ownerOnly.
const reporterOnly = requireSellerRole(PartnerRole.REPORTER)

// POST   /api/seller/reporter-posts       → new post, live immediately
router.post(
  '/',
  sellerMiddleware,
  reporterOnly,
  validateBody(reporterPostCreateSchema),
  reporterPostController.createPost
)

// GET    /api/seller/reporter-posts       → own posts
router.get('/', sellerMiddleware, reporterOnly, reporterPostController.getMyPosts)

// GET    /api/seller/reporter-posts/:id   → single own post
router.get('/:id', sellerMiddleware, reporterOnly, reporterPostController.getMyPost)

// PATCH  /api/seller/reporter-posts/:id   → update own post
router.patch(
  '/:id',
  sellerMiddleware,
  reporterOnly,
  validateBody(reporterPostUpdateSchema),
  reporterPostController.updatePost
)

// DELETE /api/seller/reporter-posts/:id   → soft-remove own post
router.delete('/:id', sellerMiddleware, reporterOnly, reporterPostController.deleteMyPost)

export default router
