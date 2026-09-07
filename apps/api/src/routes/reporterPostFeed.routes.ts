import { Router } from 'express'
import * as reporterPostController from '../controllers/reporterPost.controller.js'

const router = Router()

// ─── BUYER-FACING REPORTER FEED — fully public, no auth ───────────────────
// Property-information/news content, not a property listing — never carries
// a "Verified" badge or any moderation-status language.

// GET /api/reporter-posts?city=&page=&limit=
router.get('/', reporterPostController.getPublicFeed)

// GET /api/reporter-posts/:id
router.get('/:id', reporterPostController.getPublicPost)

export default router
