import { Request, Response } from 'express'
import prisma from '../lib/prisma.js'
import logger from '../lib/logger.js'
import { sendInApp } from '../services/notification.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — kisi bhi controller se seller ke liye in-app notification banao
// (import karke use karo: await createNotification(sellerId, {...}))
//
// Row creation ab notification.service.ts ka kaam hai — yeh sirf existing
// call sites ke liye wrapper hai. Email/SMS bhi chahiye to seedhe
// notifySeller() use karo.
// ─────────────────────────────────────────────────────────────────────────────
export const createNotification = async (
  sellerId: string,
  data: { type: string; title: string; body: string }
) => {
  await sendInApp({ sellerId }, data)
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/notifications  → list + unread count
// ─────────────────────────────────────────────────────────────────────────────
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const sellerId = req.seller!.id
    const notifications = await prisma.notification.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unreadCount = await prisma.notification.count({
      where: { sellerId, read: false },
    })
    res.json({ success: true, notifications, unreadCount })
  } catch (err) {
    // Full error logged server-side only (QA audit 2026-08-03, finding #9).
    logger.error('[getNotifications]', err)
    res.status(500).json({ success: false, message: 'Failed to load notifications' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/seller/notifications/:id/read  → ek notification read
// ─────────────────────────────────────────────────────────────────────────────
export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const sellerId = req.seller!.id
    const id = String(req.params.id)   // string | string[] -> string (Prisma string chahta hai)
    // Ownership check — dusre seller ki notification na chhede
    const n = await prisma.notification.findFirst({ where: { id, sellerId } })
    if (!n) { res.status(404).json({ success: false, message: 'Notification not found' }); return }
    await prisma.notification.update({ where: { id }, data: { read: true } })
    res.json({ success: true })
  } catch (err) {
    // Full error logged server-side only (QA audit 2026-08-03, finding #9).
    logger.error('[markNotificationRead]', err)
    res.status(500).json({ success: false, message: 'Update failed' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/seller/notifications/mark-all-read  → saari read
// ─────────────────────────────────────────────────────────────────────────────
export const markAllNotificationsRead = async (req: Request, res: Response) => {
  try {
    const sellerId = req.seller!.id
    await prisma.notification.updateMany({
      where: { sellerId, read: false },
      data: { read: true },
    })
    res.json({ success: true })
  } catch (err) {
    // Same leak as getNotifications/markNotificationRead above, fixed in
    // the same pass (QA audit 2026-08-03, finding #9).
    logger.error('[markAllNotificationsRead]', err)
    res.status(500).json({ success: false, message: 'Update failed' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUYER IN-APP INBOX (Phase 4C) — same shape as the seller endpoints above,
// scoped by userId instead of sellerId. Kept in this same file rather than a
// second notification controller: it's the same Notification model (now
// buyer-capable — see schema.prisma), the same read/mark-read operations,
// just a different owning column. Every notifyBuyerAlert() call (verification
// lifecycle, cancellation, refunds, claims, support) writes the rows this
// reads.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/notifications  → list + unread count
export const getMyNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unreadCount = await prisma.notification.count({ where: { userId, read: false } })
    res.json({ success: true, notifications, unreadCount })
  } catch (err) {
    logger.error('[getMyNotifications]', err)
    res.status(500).json({ success: false, message: 'Failed to load notifications' })
  }
}

// POST /api/notifications/:id/read
export const markMyNotificationRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const id = String(req.params.id)
    const n = await prisma.notification.findFirst({ where: { id, userId } })
    if (!n) { res.status(404).json({ success: false, message: 'Notification not found' }); return }
    await prisma.notification.update({ where: { id }, data: { read: true } })
    res.json({ success: true })
  } catch (err) {
    logger.error('[markMyNotificationRead]', err)
    res.status(500).json({ success: false, message: 'Update failed' })
  }
}

// POST /api/notifications/mark-all-read
export const markAllMyNotificationsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } })
    res.json({ success: true })
  } catch (err) {
    logger.error('[markAllMyNotificationsRead]', err)
    res.status(500).json({ success: false, message: 'Update failed' })
  }
}