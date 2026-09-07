// ─────────────────────────────────────────────────────────────────────────────
// Public reads for Content Control (PDF 5.4).
//
// No auth: this is the content the admin publishes FOR the buyer app and the
// seller panel — a category list or a disclaimer that only admins can read
// would never reach a user. Only active, in-window rows are exposed; admin
// state (inactive rows, createdBy, version history) stays behind /api/admin.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import * as contentController from '../controllers/content.controller.js'

const router = Router()

// GET /api/content/categories        → published property categories
router.get('/categories', contentController.publicCategories)

// GET /api/content/coverage          → cities with their tehsils
router.get('/coverage', contentController.publicCoverage)

// GET /api/content/banners?audience= → banners live right now
router.get('/banners', contentController.publicBanners)

// GET /api/content/disclaimers/:key  → e.g. /api/content/disclaimers/report
router.get('/disclaimers/:key', contentController.publicDisclaimer)

export default router
