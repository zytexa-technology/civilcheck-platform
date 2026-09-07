import { Router } from 'express'
import { PartnerRole } from '@prisma/client'
import { propertyCreateSchema, propertyUpdateSchema } from '@civilcheck/shared'
import * as propertyOwnerController from '../controllers/property-owner.controller.js'
import { sellerMiddleware, requireSellerRole } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

const router = Router()

// Saare owner-property routes ke liye seller login zaroori hai
// (KYC yahan zaroori nahi — Owner ek regular partner hai, professional nahi)
//
// requireSellerRole(OWNER) stops an EXPERT account from replaying its JWT
// against the owner-persona property CRUD it never registered for.
const ownerOnly = requireSellerRole(PartnerRole.OWNER)

// POST   /api/seller/properties       → nayi property
router.post(
  '/',
  sellerMiddleware,
  ownerOnly,
  validateBody(propertyCreateSchema),
  propertyOwnerController.createProperty
)

// GET    /api/seller/properties       → apni saari properties
router.get('/', sellerMiddleware, ownerOnly, propertyOwnerController.getMyProperties)

// GET    /api/seller/properties/:id   → single property
router.get('/:id', sellerMiddleware, ownerOnly, propertyOwnerController.getSingleProperty)

// PUT    /api/seller/properties/:id   → update
router.put(
  '/:id',
  sellerMiddleware,
  ownerOnly,
  validateBody(propertyUpdateSchema),
  propertyOwnerController.updateProperty
)

// DELETE /api/seller/properties/:id   → soft delete
router.delete('/:id', sellerMiddleware, ownerOnly, propertyOwnerController.deleteProperty)

export default router