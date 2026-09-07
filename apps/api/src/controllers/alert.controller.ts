import { Request, Response } from 'express'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { notifyBuyerAlert } from '../services/notification.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/alerts/subscribe
// ─────────────────────────────────────────────────────────────────────────────
// Buyer kisi property ke case update ke liye subscribe karta hai
// Jab bhi seller us property ki listing update karega → buyer ko notify karenge
// ─────────────────────────────────────────────────────────────────────────────
export const subscribeAlert = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { listingId } = req.body

  if (!listingId) {
    res.status(400).json({ success: false, message: 'listingId is required' })
    return
  }

  // Listing exist karti hai aur approved hai?
  const listing = await prisma.listing.findUnique({
    where: { id: listingId }
  })

  if (!listing || listing.status !== 'APPROVED') {
    res.status(404).json({ success: false, message: 'Property not found' })
    return
  }

  // Kya buyer pehle se subscribe kar chuka hai?
  const existing = await prisma.alert.findFirst({
    where: { userId, listingId }
  })

  if (existing) {
    // Agar inactive tha → reactivate karo
    if (!existing.active) {
      await prisma.alert.update({
        where: { id: existing.id },
        data: { active: true, cancelledAt: null }
      })
      res.json({
        success: true,
        message: 'Alert subscription reactivated!',
        alertId: existing.id
      })
      return
    }

    res.status(409).json({
      success: false,
      message: 'You are already subscribed to alerts for this property'
    })
    return
  }

  // Naya alert subscription banao
  const alert = await prisma.alert.create({
    data: { userId, listingId }
  })

  res.status(201).json({
    success: true,
    message: `Alert set. We will notify you whenever this property is updated.`,
    alertId: alert.id,
    property: {
      address: listing.address,
      city: listing.city,
      riskBadge: listing.riskBadge,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts
// ─────────────────────────────────────────────────────────────────────────────
// Buyer ke saare active alert subscriptions
// Har alert ke saath property ki current status bhi aayegi
// ─────────────────────────────────────────────────────────────────────────────
export const getMyAlerts = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const alerts = await prisma.alert.findMany({
    where: { userId, active: true },
    include: {
      listing: {
        select: {
          id: true,
          address: true,
          city: true,
          tehsil: true,
          riskBadge: true,
          caseExists: true,
          caseStatus: true,
          loanDefault: true,
          status: true,
          researchDate: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  res.json({
    success: true,
    total: alerts.length,
    alerts: alerts.map(a => ({
      alertId: a.id,
      subscribedAt: a.createdAt,
      property: a.listing
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/alerts/:id
// ─────────────────────────────────────────────────────────────────────────────
// Alert subscription cancel karo
// Hard delete nahi karte — sirf inactive karte hain (history rehti hai)
// ─────────────────────────────────────────────────────────────────────────────
export const cancelAlert = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const id = req.params.id as string

  const alert = await prisma.alert.findUnique({ where: { id } })

  // Exist karta hai? Aur is buyer ka hai?
  if (!alert || alert.userId !== userId) {
    res.status(404).json({ success: false, message: 'Alert not found' })
    return
  }

  // Soft delete — active = false + churn timestamp (PDF 5.6 subscriberChurnRate)
  await prisma.alert.update({
    where: { id },
    data: { active: false, cancelledAt: new Date() }
  })

  res.json({
    success: true,
    message: 'Alert subscription cancelled. You will no longer receive updates for this property.'
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts/history
// ─────────────────────────────────────────────────────────────────────────────
// Buyer ke saare alerts — active aur inactive dono
// Useful jab buyer dekhna chahta hai ki usne kaunsi properties watch ki thi
// ─────────────────────────────────────────────────────────────────────────────
export const getAlertHistory = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const alerts = await prisma.alert.findMany({
    where: { userId },
    include: {
      listing: {
        select: {
          id: true,
          address: true,
          city: true,
          riskBadge: true,
          caseExists: true,
          caseStatus: true,
          status: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  res.json({
    success: true,
    total: alerts.length,
    alerts: alerts.map(a => ({
      alertId: a.id,
      active: a.active,
      subscribedAt: a.createdAt,
      property: a.listing
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTION — Alert Trigger
// ─────────────────────────────────────────────────────────────────────────────
// Yeh function tab call hota hai jab seller listing update karta hai
// Sare subscribers ko notify karta hai
// listing.controller.ts ke updateListing mein call karenge
// ─────────────────────────────────────────────────────────────────────────────
export const triggerAlerts = async (
  listingId: string,
  oldCaseStatus: string | null,
  newCaseStatus: string | null,
  newRiskBadge: string
) => {
  // Kya koi update hua jo notify karne layak hai?
  if (oldCaseStatus === newCaseStatus) return

  // Is listing ke saare active subscribers — unke push/sms/email channels ke saath
  const subscribers = await prisma.alert.findMany({
    where: { listingId, active: true },
    include: {
      user: {
        select: { id: true, phone: true, email: true, fcmToken: true, pushEnabled: true },
      },
      listing: { select: { address: true, city: true } },
    },
  })

  if (subscribers.length === 0) return

  const { address, city } = subscribers[0].listing
  const title = 'CivilCheck Alert — property update'
  const body =
    `${address}, ${city} — case status ${oldCaseStatus ?? 'N/A'} → ${newCaseStatus ?? 'N/A'}. ` +
    `Risk badge: ${newRiskBadge}.`

  logger.info(`🔔 Alert trigger — ${subscribers.length} subscriber(s) for listing ${listingId}`)

  // Har subscriber ko uske channels par bhejo (push → sms fallback → email).
  // Per-item catch: ek buyer ka delivery failure baaki subscribers ko block
  // na kare, aur listing-update mutation ko fail na kare.
  await Promise.all(
    subscribers.map((s) =>
      notifyBuyerAlert(
        {
          id: s.user.id,
          phone: s.user.phone,
          email: s.user.email,
          fcmToken: s.user.fcmToken,
          pushEnabled: s.user.pushEnabled,
        },
        {
          title,
          body,
          data: { listingId, type: 'case_update', riskBadge: newRiskBadge },
          email: {
            subject: 'Update on a property report you follow',
            text: body,
            html: `<p>${body}</p><p>— Team CivilCheck</p>`,
          },
          sms: { variables: { name: 'Buyer', status: 'property updated' } },
        }
      ).catch((err) =>
        logger.error(
          `[alerts] notify failed for user ${s.user.id}: ${err instanceof Error ? err.message : err}`
        )
      )
    )
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/alerts/device-token
// ─────────────────────────────────────────────────────────────────────────────
// Buyer apna FCM device token register/refresh karta hai (React Native app se).
// Token save hote hi is buyer ke alerts push par jaane lagenge.
// ─────────────────────────────────────────────────────────────────────────────
export const registerDeviceToken = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { fcmToken } = req.body as { fcmToken: string }

  await prisma.user.update({ where: { id: userId }, data: { fcmToken } })

  res.json({ success: true, message: 'Push device registered.' })
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/alerts/push-preference
// ─────────────────────────────────────────────────────────────────────────────
// Push on/off toggle. Off karne par alerts SMS par fallback ho jaate hain
// (PDF 7.7 — "SMS alerts to buyers who have disabled push notifications").
// ─────────────────────────────────────────────────────────────────────────────
export const setPushPreference = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { enabled } = req.body as { enabled: boolean }

  await prisma.user.update({ where: { id: userId }, data: { pushEnabled: enabled } })

  res.json({
    success: true,
    pushEnabled: enabled,
    message: enabled ? 'Push notifications are on.' : 'Push disabled — alerts will now be sent by SMS.',
  })
}