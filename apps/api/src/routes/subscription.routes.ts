import { Router } from 'express'
import { featuredSubscriptionSchema } from '@civilcheck/shared'
import * as subscriptionController from '../controllers/subscription.controller.js'
import { authMiddleware, sellerMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

// Buyer subscriptions — mounted at /api/subscriptions (₹49/mo alerts)
export const buyerSubscriptionRouter = Router()
buyerSubscriptionRouter.post('/alerts', authMiddleware, subscriptionController.subscribeAlerts)
buyerSubscriptionRouter.get('/', authMiddleware, subscriptionController.getMySubscriptions)
buyerSubscriptionRouter.post('/:id/cancel', authMiddleware, subscriptionController.cancelMySubscription)

// Seller subscriptions — mounted at /api/seller/subscriptions (₹499/mo featured)
export const sellerSubscriptionRouter = Router()
sellerSubscriptionRouter.post(
  '/featured',
  sellerMiddleware,
  validateBody(featuredSubscriptionSchema),
  subscriptionController.featureListing
)
sellerSubscriptionRouter.get('/', sellerMiddleware, subscriptionController.getMySellerSubscriptions)
sellerSubscriptionRouter.post(
  '/:id/cancel',
  sellerMiddleware,
  subscriptionController.cancelSellerSubscription
)
