import { Router } from 'express'
import { PartnerRole } from '@prisma/client'
import { listingCreateSchema, listingUpdateSchema } from '@civilcheck/shared'
import * as listingController from '../controllers/listing.controller.js'
import { sellerMiddleware, requireSellerRole } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

const router = Router()

// Saari listing routes ke liye sellerMiddleware zaroori hai
// Matlab — sirf approved seller hi listings manage kar sakta hai
//
// Listings are the expert persona's professional-report work (Bar Council /
// engineer verification) — requireSellerRole(EXPERT) keeps an OWNER
// account from creating or managing them via a replayed JWT.
const expertOnly = requireSellerRole(PartnerRole.EXPERT)

// POST   /api/seller/listings       → Naya listing banao (Zod: 17 report fields)
router.post('/', sellerMiddleware, expertOnly, validateBody(listingCreateSchema), listingController.createListing)

// GET    /api/seller/listings       → Apni saari listings dekho
router.get('/', sellerMiddleware, expertOnly, listingController.getMyListings)

// GET    /api/seller/listings/:id   → Single listing detail
router.get('/:id', sellerMiddleware, expertOnly, listingController.getSingleListing)

// PUT    /api/seller/listings/:id   → Listing update karo
router.put(
  '/:id',
  sellerMiddleware,
  expertOnly,
  validateBody(listingUpdateSchema),
  listingController.updateListing
)

// DELETE /api/seller/listings/:id   → Listing delete karo
router.delete('/:id', sellerMiddleware, expertOnly, listingController.deleteListing)

export default router
