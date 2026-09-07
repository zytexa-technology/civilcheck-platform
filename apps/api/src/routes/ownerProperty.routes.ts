import { Router } from 'express'
import * as ownerPropertyController from '../controllers/ownerProperty.controller.js'

const router = Router()

// ─── BUYER-FACING OWNER PROPERTIES — fully public, free ───────────────────
// Owner self-verification, separate from Listing. No purchase, no price —
// see property-owner.controller.ts's module comment / roadmap for the
// product decision. Owner-uploaded documents are never exposed here. Admin
// approval gates visibility only — it is not presented to buyers as a
// CivilCheck "Verified" claim (see ownerProperty.controller.ts's header
// comment).

// GET /api/owner-properties/search?query=&city=&propertyType=
router.get('/search', ownerPropertyController.searchOwnerProperties)

// GET /api/owner-properties/trending?city=
// NOTE: before /:id — otherwise "trending" is read as an id.
router.get('/trending', ownerPropertyController.getTrendingOwnerProperties)

// GET /api/owner-properties/:id
router.get('/:id', ownerPropertyController.getOwnerPropertyById)

export default router
