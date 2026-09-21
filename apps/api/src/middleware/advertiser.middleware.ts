import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma.js'
import { JWT_SECRET } from '../lib/jwt.js'

// Advertisers are a separate identity from Buyer / Partner / Admin. Their JWT carries
// { advertiserId, purpose: 'advertiser' }; buyer/seller/admin tokens have no advertiserId,
// so they cannot pass here, and an advertiser token has no userId/sellerId/adminId, so it
// cannot pass any of those middlewares either.
declare global {
  namespace Express {
    interface Request {
      advertiser?: { id: string }
    }
  }
}

export const advertiserMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Please log in to your advertiser account.' })
    return
  }
  try {
    const d = jwt.verify(header.slice(7), JWT_SECRET) as { advertiserId?: string; purpose?: string }
    if (d.purpose !== 'advertiser' || !d.advertiserId) throw new Error('not an advertiser token')
    const advertiser = await prisma.advertiser.findUnique({ where: { id: d.advertiserId }, select: { id: true } })
    if (!advertiser) throw new Error('unknown advertiser')
    req.advertiser = { id: advertiser.id }
    next()
  } catch {
    res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' })
  }
}
