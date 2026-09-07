import { Router } from 'express'
import * as propertyController from '../controllers/property.controller.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

// ─── SAARI PROPERTY ROUTES PUBLIC HAIN ───────────────────────────────────
// Buyers bina login ke bhi search kar sakte hain
// Lekin getPropertyById mein agar token hai toh purchased report bhi milegi

// Property search karo — full-text search (address/city/tehsil/khasra/survey)
// GET /api/properties/search?query=vaishali&city=jaipur
// optionalAuth: login zaroori nahi, par token ho toh search history log hoti hai
router.get('/search', optionalAuthMiddleware, propertyController.searchProperties)

// Buyer ke last 10 unique searches — login zaroori (buyer-specific history)
// GET /api/properties/searches
// NOTE: /:id se PEHLE — warna "searches" ko :id samajh liya jaata
router.get('/searches', authMiddleware, propertyController.getSearchHistory)

// FREE case check — "Case Hai Ya Nahi?"
// GET /api/properties/check?address=Plot 45 Vaishali Nagar
router.get('/check', propertyController.freeCaseCheck)

// Trending properties — most viewed
// GET /api/properties/trending?city=jaipur
router.get('/trending', propertyController.getTrendingProperties)

// Unified property feed (Property System — Phase 2) — Expert reports +
// Owner listings combined. GET /api/properties/feed?city=&propertyType=
// NOTE: before /:id — otherwise "feed" is read as an id.
router.get('/feed', propertyController.getPropertyFeed)

// Profile → Saved/Liked properties (Buyer Experience redesign).
// GET /api/properties/mine?kind=saved|liked — NOTE: before /:id, same reason.
router.get('/mine', authMiddleware, propertyController.getMyEngagedProperties)

// Single property detail — free preview ya paid report
// GET /api/properties/:id
// NOTE: yeh route LAST mein hona chahiye — warna /check ko bhi :id samajh lega
router.get('/:id', propertyController.getPropertyById)

export default router
