import { Router } from 'express'
import * as notificationController from '../controllers/notification.controller.js'
import { sellerMiddleware, authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

// Saari routes seller token maangti hain
// NOTE: '/mark-all-read' ko '/:id/read' se PEHLE rakha hai warna :id use pakad leta
router.get('/', sellerMiddleware, notificationController.getNotifications)
router.post('/mark-all-read', sellerMiddleware, notificationController.markAllNotificationsRead)
router.post('/:id/read', sellerMiddleware, notificationController.markNotificationRead)

export default router

// ─── BUYER IN-APP INBOX (Phase 4C) — mounted at /api/notifications ─────────
// Same route shape as the seller router above, scoped to the authenticated
// buyer (req.user.id) instead of a seller.
export const buyerNotificationRouter = Router()

buyerNotificationRouter.get('/', authMiddleware, notificationController.getMyNotifications)
buyerNotificationRouter.post(
  '/mark-all-read',
  authMiddleware,
  notificationController.markAllMyNotificationsRead
)
buyerNotificationRouter.post('/:id/read', authMiddleware, notificationController.markMyNotificationRead)
