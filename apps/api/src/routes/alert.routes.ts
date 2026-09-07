import { Router } from 'express'
import { deviceTokenSchema, pushPreferenceSchema } from '@civilcheck/shared'
import * as alertController from '../controllers/alert.controller.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

const router = Router()

// Saare alert routes ke liye buyer login zaroori hai

// POST   /api/alerts/subscribe  → Property ke liye alert subscribe karo
router.post('/subscribe', authMiddleware, alertController.subscribeAlert)

// GET    /api/alerts             → Apne active alerts dekho
router.get('/', authMiddleware, alertController.getMyAlerts)

// GET    /api/alerts/history     → Saari alert history
// NOTE: /history pehle — warna :id match kar lega
router.get('/history', authMiddleware, alertController.getAlertHistory)

// PUT    /api/alerts/device-token     → FCM device token register/refresh
router.put(
  '/device-token',
  authMiddleware,
  validateBody(deviceTokenSchema),
  alertController.registerDeviceToken
)

// PUT    /api/alerts/push-preference  → push on/off (off → SMS fallback)
router.put(
  '/push-preference',
  authMiddleware,
  validateBody(pushPreferenceSchema),
  alertController.setPushPreference
)

// DELETE /api/alerts/:id         → Alert cancel karo
router.delete('/:id', authMiddleware, alertController.cancelAlert)

export default router
