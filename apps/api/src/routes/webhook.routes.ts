import { Router } from 'express'
import { handleRazorpayWebhook } from '../controllers/webhook.controller.js'

// No auth middleware and no JSON parser here — the request is authenticated by
// its HMAC signature over the raw body, which express.raw() (mounted ahead of
// express.json() in index.ts) leaves intact on req.body.
const router = Router()

router.post('/', handleRazorpayWebhook)

export default router
