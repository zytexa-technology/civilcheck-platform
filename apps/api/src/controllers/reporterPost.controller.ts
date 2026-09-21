import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import {
  DUPLICATE_POST_MESSAGE,
  FingerprintError,
  fingerprintImages,
  normalizeAddress,
} from '../services/reporterPostDedupe.service.js'

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

// Duplicate rule: same normalized address + at least one identical image
// fingerprint on another PUBLISHED post (any Reporter; `excludeId` keeps an
// edit from colliding with the post being edited). The advisory lock is keyed
// on the address, so two Reporters posting the same property at the same
// instant are serialized and exactly one wins — the check and the write below
// would otherwise race.
class DuplicatePostError extends Error {}

async function lockAndCheckDuplicate(
  tx: Prisma.TransactionClient,
  addressNormalized: string,
  imageHashes: string[],
  excludeId?: string
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${addressNormalized}))`
  const clash = await tx.reporterPost.findFirst({
    where: {
      status: 'PUBLISHED',
      addressNormalized,
      imageHashes: { hasSome: imageHashes },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  // Deliberately says nothing about who posted the original or which post it is.
  if (clash) throw new DuplicatePostError()
}

function handlePostWriteError(err: unknown, res: Response): boolean {
  if (err instanceof DuplicatePostError) {
    res.status(409).json({ success: false, code: 'DUPLICATE_POST', message: DUPLICATE_POST_MESSAGE })
    return true
  }
  if (err instanceof FingerprintError) {
    res.status(err.status).json({ success: false, message: err.message })
    return true
  }
  return false
}

// POST /api/seller/reporter-posts → new post (status PUBLISHED, live immediately)
export const createPost = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { title, description, images, sourceName, sourceDate, city, tehsil, address } = req.body
  const imageList: string[] = Array.isArray(images) ? images : []

  try {
    const addressNormalized = normalizeAddress(address)
    const imageHashes = await fingerprintImages(imageList)

    const post = await prisma.$transaction(async (tx) => {
      await lockAndCheckDuplicate(tx, addressNormalized, imageHashes)
      return tx.reporterPost.create({
        data: {
          sellerId,
          title: title || null,
          description: description || null,
          images: imageList,
          sourceName: sourceName || null,
          sourceDate: sourceDate || null,
          city: city || null,
          tehsil: tehsil || null,
          address,
          addressNormalized,
          imageHashes,
          // No approval/verification gate — live immediately, visible to buyers
          // as soon as this request returns. A SuperAdmin can still remove it
          // afterward (deleteReporterPost in admin.controller.ts).
          status: 'PUBLISHED',
        },
      })
    })

    res.status(201).json({ success: true, message: 'Posted — live in the user feed now.', post: stripInternal(post) })
  } catch (err) {
    if (handlePostWriteError(err, res)) return
    throw err
  }
}

// imageHashes/addressNormalized are dedupe internals — never returned to clients.
function stripInternal<T extends { addressNormalized?: unknown; imageHashes?: unknown }>(post: T) {
  const { addressNormalized: _a, imageHashes: _h, ...rest } = post
  return rest
}

// GET /api/seller/reporter-posts → own posts (removed hidden by default)
export const getMyPosts = async (req: Request, res: Response) => {
  const sellerId = req.seller!.id
  const { status } = req.query

  const where: Prisma.ReporterPostWhereInput = { sellerId }
  if (status === 'REMOVED') where.status = 'REMOVED'
  else where.status = 'PUBLISHED'

  const posts = await prisma.reporterPost.findMany({ where, orderBy: { createdAt: 'desc' } })
  res.json({ success: true, total: posts.length, posts: posts.map(stripInternal) })
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
  res.json({ success: true, post: stripInternal(post) })
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

  const { title, description, images, sourceName, sourceDate, city, tehsil, address } = req.body

  // Posts created before the location requirement have no address on file —
  // they can't be edited until one is supplied, so every saved post ends up
  // with a real property location.
  const effectiveAddress: string | null = address !== undefined ? address : existing.address
  if (!effectiveAddress) {
    res.status(400).json({
      success: false,
      message: 'Property location / address is required. Please add it to save your changes.',
    })
    return
  }

  try {
    const imageList: string[] = Array.isArray(images) ? images : existing.images
    const addressNormalized = normalizeAddress(effectiveAddress)

    // Reuse the stored fingerprint for an image that is already on this post;
    // only genuinely new/unfingerprinted URLs are fetched and hashed.
    const known = new Map<string, string>()
    existing.images.forEach((u, i) => {
      const h = existing.imageHashes[i]
      if (h) known.set(u, h)
    })
    const missing = imageList.filter((u) => !known.has(u))
    const fresh = missing.length ? await fingerprintImages(missing) : []
    missing.forEach((u, i) => known.set(u, fresh[i] as string))
    const imageHashes = imageList.map((u) => known.get(u) as string)

    const updated = await prisma.$transaction(async (tx) => {
      // The post being edited is excluded, so it never collides with itself.
      await lockAndCheckDuplicate(tx, addressNormalized, imageHashes, id)
      return tx.reporterPost.update({
        where: { id },
        data: {
          title: title !== undefined ? title : existing.title,
          description: description !== undefined ? description : existing.description,
          images: imageList,
          sourceName: sourceName !== undefined ? sourceName : existing.sourceName,
          sourceDate: sourceDate !== undefined ? sourceDate : existing.sourceDate,
          city: city !== undefined ? city : existing.city,
          tehsil: tehsil !== undefined ? tehsil : existing.tehsil,
          address: effectiveAddress,
          addressNormalized,
          imageHashes,
        },
      })
    })

    res.json({ success: true, message: 'Post updated.', post: stripInternal(updated) })
  } catch (err) {
    if (handlePostWriteError(err, res)) return
    throw err
  }
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
  address: string | null
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
    address: post.address,
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
