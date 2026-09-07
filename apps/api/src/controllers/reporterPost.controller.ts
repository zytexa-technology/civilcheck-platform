import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'

// ─────────────────────────────────────────────────────────────────────────────
//  REPORTER POST CONTROLLER
//
//  A Reporter sources property information/news from public material (a
//  newspaper cutting, a public notice, etc.) — this is content, not a
//  property listing, so there is no ownership claim, no document-health
//  score and no moderation gate. A post is PUBLISHED the instant it is
//  created; only a SuperAdmin can remove one afterward (admin.controller.ts).
//
//  Every seller-side route here is gated requireSellerRole(REPORTER), so
//  req.seller.partnerRole is always REPORTER and a row this controller
//  creates can never be attributed to anyone else.
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/seller/reporter-posts → new post (status PUBLISHED, live immediately)
export const createPost = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { title, description, images, sourceName, sourceDate, city, tehsil } = req.body

  const post = await prisma.reporterPost.create({
    data: {
      sellerId,
      title: title || null,
      description: description || null,
      images: Array.isArray(images) ? images : [],
      sourceName: sourceName || null,
      sourceDate: sourceDate || null,
      city: city || null,
      tehsil: tehsil || null,
      // No approval/verification gate — live immediately, visible to buyers
      // as soon as this request returns. A SuperAdmin can still remove it
      // afterward (deleteReporterPost in admin.controller.ts).
      status: 'PUBLISHED',
    },
  })

  res.status(201).json({ success: true, message: 'Posted — live in the buyer feed now.', post })
}

// GET /api/seller/reporter-posts → own posts (removed hidden by default)
export const getMyPosts = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { status } = req.query

  const where: Prisma.ReporterPostWhereInput = { sellerId }
  if (status === 'REMOVED') where.status = 'REMOVED'
  else where.status = 'PUBLISHED'

  const posts = await prisma.reporterPost.findMany({ where, orderBy: { createdAt: 'desc' } })
  res.json({ success: true, total: posts.length, posts })
}

// GET /api/seller/reporter-posts/:id
export const getMyPost = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  const post = await prisma.reporterPost.findUnique({ where: { id } })
  if (!post || post.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Post not found' })
    return
  }
  res.json({ success: true, post })
}

// PATCH /api/seller/reporter-posts/:id → own post only
export const updatePost = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  const existing = await prisma.reporterPost.findUnique({ where: { id } })
  if (!existing || existing.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Post not found' })
    return
  }

  const { title, description, images, sourceName, sourceDate, city, tehsil } = req.body
  const updated = await prisma.reporterPost.update({
    where: { id },
    data: {
      title: title !== undefined ? title : existing.title,
      description: description !== undefined ? description : existing.description,
      images: Array.isArray(images) ? images : existing.images,
      sourceName: sourceName !== undefined ? sourceName : existing.sourceName,
      sourceDate: sourceDate !== undefined ? sourceDate : existing.sourceDate,
      city: city !== undefined ? city : existing.city,
      tehsil: tehsil !== undefined ? tehsil : existing.tehsil,
    },
  })

  res.json({ success: true, message: 'Post updated.', post: updated })
}

// DELETE /api/seller/reporter-posts/:id → own post only, soft-remove
export const deleteMyPost = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const id = req.params.id as string

  const post = await prisma.reporterPost.findUnique({ where: { id } })
  if (!post || post.sellerId !== sellerId) {
    res.status(404).json({ success: false, message: 'Post not found' })
    return
  }

  await prisma.reporterPost.update({ where: { id }, data: { status: 'REMOVED' } })
  res.json({ success: true, message: 'Post removed.' })
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC BUYER-FACING FEED — no auth, exposes only display-safe fields
// ─────────────────────────────────────────────────────────────────────────────

function formatFeedPost(post: {
  id: string
  title: string | null
  description: string | null
  images: string[]
  sourceName: string | null
  sourceDate: Date | null
  city: string | null
  tehsil: string | null
  createdAt: Date
}) {
  return {
    id: post.id,
    title: post.title,
    description: post.description,
    images: post.images,
    sourceName: post.sourceName,
    sourceDate: post.sourceDate,
    city: post.city,
    tehsil: post.tehsil,
    postedAt: post.createdAt,
    reportedBy: 'CivilCheck Reporter',
  }
}

// GET /api/reporter-posts?city=&page=&limit= → public scrolling feed
export const getPublicFeed = async (req: Request, res: Response) => {
  const { city } = req.query
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20))

  const where: Prisma.ReporterPostWhereInput = { status: 'PUBLISHED' }
  if (typeof city === 'string' && city.trim()) where.city = { equals: city.trim(), mode: 'insensitive' }

  const [posts, total] = await Promise.all([
    prisma.reporterPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reporterPost.count({ where }),
  ])

  res.json({
    success: true,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    posts: posts.map(formatFeedPost),
  })
}

// GET /api/reporter-posts/:id
export const getPublicPost = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const post = await prisma.reporterPost.findUnique({ where: { id } })
  if (!post || post.status !== 'PUBLISHED') {
    res.status(404).json({ success: false, message: 'Post not found' })
    return
  }
  res.json({ success: true, post: formatFeedPost(post) })
}
