// ─────────────────────────────────────────────────────────────────────────────
// Content Control (PDF 5.4) — property categories, the cities/tehsils database,
// global disclaimer text and in-app banner announcements.
//
// DELETE is a soft delete (active = false) across all four. Two reasons:
// audit-log targets must stay resolvable forever, and a listing that already
// references a category or a tehsil must not be orphaned by an admin tidying
// up a dropdown. "Create" therefore revives a matching inactive row instead of
// colliding with its unique constraint.
// ─────────────────────────────────────────────────────────────────────────────
import { Prisma, type BannerAudience } from '@prisma/client'
import prisma from '../lib/prisma.js'
import type {
  BannerCreateInput,
  BannerUpdateInput,
  DisclaimerUpsertInput,
  PropertyCategoryCreateInput,
  PropertyCategoryUpdateInput,
  ServiceAreaCreateInput,
  ServiceAreaUpdateInput,
  SupportKnowledgeUpsertInput,
} from '@civilcheck/shared'

export type ContentFailureCode = 'NOT_FOUND' | 'DUPLICATE'

export type ContentResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ContentFailureCode; message: string }

// Prisma raises P2002 when a unique constraint is violated. Every create/update
// below races against a concurrent one, so this is caught rather than
// pre-checked — a findFirst + create pair has a window between the two.
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

function isMissingRow(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTY CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

export async function listCategories(includeInactive: boolean) {
  return prisma.propertyCategory.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  })
}

export async function createCategory(input: PropertyCategoryCreateInput) {
  // A soft-deleted slug is revived rather than rejected: to an admin, adding
  // "Residential" back after removing it should just work.
  const existing = await prisma.propertyCategory.findUnique({ where: { slug: input.slug } })

  if (existing) {
    if (existing.active) {
      return {
        ok: false as const,
        code: 'DUPLICATE' as const,
        message: `Category "${input.slug}" already exists`,
      }
    }
    const revived = await prisma.propertyCategory.update({
      where: { id: existing.id },
      data: { ...input, active: true },
    })
    return { ok: true as const, data: revived }
  }

  try {
    return { ok: true as const, data: await prisma.propertyCategory.create({ data: input }) }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false as const,
        code: 'DUPLICATE' as const,
        message: `Category "${input.slug}" already exists`,
      }
    }
    throw err
  }
}

export async function updateCategory(id: string, input: PropertyCategoryUpdateInput) {
  try {
    return { ok: true as const, data: await prisma.propertyCategory.update({ where: { id }, data: input }) }
  } catch (err) {
    if (isMissingRow(err)) {
      return { ok: false as const, code: 'NOT_FOUND' as const, message: 'Category not found' }
    }
    if (isUniqueViolation(err)) {
      return {
        ok: false as const,
        code: 'DUPLICATE' as const,
        message: `Category "${input.slug}" already exists`,
      }
    }
    throw err
  }
}

export async function deactivateCategory(id: string) {
  try {
    return {
      ok: true as const,
      data: await prisma.propertyCategory.update({ where: { id }, data: { active: false } }),
    }
  } catch (err) {
    if (isMissingRow(err)) {
      return { ok: false as const, code: 'NOT_FOUND' as const, message: 'Category not found' }
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE AREAS (cities / tehsils)
// ─────────────────────────────────────────────────────────────────────────────

export async function listServiceAreas(includeInactive: boolean, city?: string) {
  const where: Prisma.ServiceAreaWhereInput = {}
  if (!includeInactive) where.active = true
  if (city) where.city = { contains: city, mode: 'insensitive' }

  return prisma.serviceArea.findMany({
    where,
    orderBy: [{ state: 'asc' }, { city: 'asc' }, { tehsil: 'asc' }],
  })
}

// City-level rollup for the buyer app's coverage picker: one entry per city
// with its tehsils nested, rather than a flat list the client has to group.
export async function listCoverage() {
  const areas = await prisma.serviceArea.findMany({
    where: { active: true },
    orderBy: [{ state: 'asc' }, { city: 'asc' }, { tehsil: 'asc' }],
  })

  const byCity = new Map<string, { state: string; city: string; tehsils: string[] }>()

  for (const area of areas) {
    const key = `${area.state}::${area.city}`
    const entry = byCity.get(key) ?? { state: area.state, city: area.city, tehsils: [] }
    entry.tehsils.push(area.tehsil)
    byCity.set(key, entry)
  }

  return [...byCity.values()]
}

export async function createServiceArea(input: ServiceAreaCreateInput) {
  const existing = await prisma.serviceArea.findUnique({
    where: { city_tehsil: { city: input.city, tehsil: input.tehsil } },
  })

  if (existing) {
    if (existing.active) {
      return {
        ok: false as const,
        code: 'DUPLICATE' as const,
        message: `${input.city} / ${input.tehsil} already exists`,
      }
    }
    const revived = await prisma.serviceArea.update({
      where: { id: existing.id },
      data: { ...input, active: true },
    })
    return { ok: true as const, data: revived }
  }

  try {
    return { ok: true as const, data: await prisma.serviceArea.create({ data: input }) }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false as const,
        code: 'DUPLICATE' as const,
        message: `${input.city} / ${input.tehsil} already exists`,
      }
    }
    throw err
  }
}

export async function updateServiceArea(id: string, input: ServiceAreaUpdateInput) {
  try {
    return { ok: true as const, data: await prisma.serviceArea.update({ where: { id }, data: input }) }
  } catch (err) {
    if (isMissingRow(err)) {
      return { ok: false as const, code: 'NOT_FOUND' as const, message: 'Service area not found' }
    }
    if (isUniqueViolation(err)) {
      return {
        ok: false as const,
        code: 'DUPLICATE' as const,
        message: 'Us city/tehsil ka entry already maujood hai',
      }
    }
    throw err
  }
}

export async function deactivateServiceArea(id: string) {
  try {
    return {
      ok: true as const,
      data: await prisma.serviceArea.update({ where: { id }, data: { active: false } }),
    }
  } catch (err) {
    if (isMissingRow(err)) {
      return { ok: false as const, code: 'NOT_FOUND' as const, message: 'Service area not found' }
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCLAIMERS
// ─────────────────────────────────────────────────────────────────────────────

export async function listDisclaimers(includeInactive: boolean) {
  return prisma.disclaimer.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { key: 'asc' },
  })
}

export async function getDisclaimer(key: string) {
  return prisma.disclaimer.findUnique({ where: { key } })
}

// Upsert by key. `version` increments only when the body actually changes, so
// a report can pin the wording it was issued under and a title-only edit does
// not invalidate every pinned reference.
export async function upsertDisclaimer(input: DisclaimerUpsertInput, adminId: string) {
  const existing = await prisma.disclaimer.findUnique({ where: { key: input.key } })

  if (!existing) {
    const created = await prisma.disclaimer.create({
      data: { ...input, version: 1, updatedBy: adminId },
    })
    return { data: created, bodyChanged: true }
  }

  const bodyChanged = existing.body !== input.body

  const updated = await prisma.disclaimer.update({
    where: { key: input.key },
    data: {
      title: input.title,
      body: input.body,
      active: input.active,
      updatedBy: adminId,
      ...(bodyChanged ? { version: { increment: 1 } } : {}),
    },
  })

  return { data: updated, bodyChanged }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORT KNOWLEDGE BASE (Phase 4C) — same key-upsert shape as disclaimers,
// minus the pinned-version concept (nothing "pins" a knowledge entry the way
// a purchased report pins a disclaimer's wording). This is the ONLY source
// the AI support assistant is allowed to ground answers in — see
// services/support.service.ts's loadKnowledge() and lib/aiSupport.ts's
// header for why that boundary matters.
// ─────────────────────────────────────────────────────────────────────────────

export async function listSupportKnowledge(includeInactive: boolean) {
  return prisma.supportKnowledgeEntry.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ topic: 'asc' }, { key: 'asc' }],
  })
}

export async function upsertSupportKnowledge(input: SupportKnowledgeUpsertInput, adminId: string) {
  return prisma.supportKnowledgeEntry.upsert({
    where: { key: input.key },
    create: { ...input, updatedBy: adminId },
    update: {
      topic: input.topic,
      question: input.question,
      answer: input.answer,
      active: input.active,
      updatedBy: adminId,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// BANNER ANNOUNCEMENTS
// ─────────────────────────────────────────────────────────────────────────────

export async function listBanners(includeInactive: boolean) {
  return prisma.bannerAnnouncement.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { createdAt: 'desc' },
  })
}

// What an app should actually display right now: active, targeted at this
// audience, and inside its scheduling window. Null bounds mean "unbounded",
// which is why each is expressed as an OR against null.
export async function listLiveBanners(audience: BannerAudience) {
  const now = new Date()

  return prisma.bannerAnnouncement.findMany({
    where: {
      active: true,
      audience: audience === 'ALL' ? undefined : { in: ['ALL', audience] },
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function createBanner(input: BannerCreateInput, adminId: string) {
  return prisma.bannerAnnouncement.create({ data: { ...input, createdBy: adminId } })
}

export async function updateBanner(id: string, input: BannerUpdateInput) {
  try {
    return { ok: true as const, data: await prisma.bannerAnnouncement.update({ where: { id }, data: input }) }
  } catch (err) {
    if (isMissingRow(err)) {
      return { ok: false as const, code: 'NOT_FOUND' as const, message: 'Banner not found' }
    }
    throw err
  }
}

export async function deactivateBanner(id: string) {
  try {
    return {
      ok: true as const,
      data: await prisma.bannerAnnouncement.update({ where: { id }, data: { active: false } }),
    }
  } catch (err) {
    if (isMissingRow(err)) {
      return { ok: false as const, code: 'NOT_FOUND' as const, message: 'Banner not found' }
    }
    throw err
  }
}
