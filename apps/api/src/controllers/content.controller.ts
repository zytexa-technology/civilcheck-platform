// ─────────────────────────────────────────────────────────────────────────────
// Content Control (PDF 5.4) — thin request/response layer over
// content.service.ts. Every write records an audit row; every read honours
// ?includeInactive for admins (soft-deleted rows stay visible to them, and
// only to them).
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response } from 'express'
import type { BannerAudience } from '@prisma/client'
import * as content from '../services/content.service.js'
import { AuditAction, recordAudit } from '../services/audit.service.js'

// ?includeInactive=true — anything else, including absence, means false.
function wantsInactive(req: Request): boolean {
  return req.query.includeInactive === 'true'
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTY CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/content/categories
export const listCategories = async (req: Request, res: Response) => {
  const categories = await content.listCategories(wantsInactive(req))
  res.json({ success: true, total: categories.length, categories })
}

// POST /api/admin/content/categories
export const createCategory = async (req: Request, res: Response) => {
  const result = await content.createCategory(req.body)

  if (!result.ok) {
    res.status(409).json({ success: false, message: result.message })
    return
  }

  await recordAudit(req, {
    action: AuditAction.CATEGORY_CREATE,
    target: `PropertyCategory:${result.data.id}`,
    details: `Created category "${result.data.label}" (${result.data.slug})`,
  })

  res.status(201).json({ success: true, message: 'Category create ho gayi', category: result.data })
}

// PATCH /api/admin/content/categories/:id
export const updateCategory = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const result = await content.updateCategory(id, req.body)

  if (!result.ok) {
    res.status(result.code === 'NOT_FOUND' ? 404 : 409).json({
      success: false,
      message: result.message,
    })
    return
  }

  await recordAudit(req, {
    action: AuditAction.CATEGORY_UPDATE,
    target: `PropertyCategory:${id}`,
    details: `Updated fields: ${Object.keys(req.body).join(', ')}`,
  })

  res.json({ success: true, message: 'Category update ho gayi', category: result.data })
}

// DELETE /api/admin/content/categories/:id  (soft delete)
export const deleteCategory = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const result = await content.deactivateCategory(id)

  if (!result.ok) {
    res.status(404).json({ success: false, message: result.message })
    return
  }

  await recordAudit(req, {
    action: AuditAction.CATEGORY_DELETE,
    target: `PropertyCategory:${id}`,
    details: `Deactivated category "${result.data.label}"`,
  })

  res.json({ success: true, message: 'Category deactivate ho gayi (soft delete)' })
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE AREAS (cities / tehsils)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/content/service-areas
export const listServiceAreas = async (req: Request, res: Response) => {
  const city = typeof req.query.city === 'string' ? req.query.city : undefined
  const areas = await content.listServiceAreas(wantsInactive(req), city)
  res.json({ success: true, total: areas.length, serviceAreas: areas })
}

// POST /api/admin/content/service-areas
export const createServiceArea = async (req: Request, res: Response) => {
  const result = await content.createServiceArea(req.body)

  if (!result.ok) {
    res.status(409).json({ success: false, message: result.message })
    return
  }

  await recordAudit(req, {
    action: AuditAction.SERVICE_AREA_CREATE,
    target: `ServiceArea:${result.data.id}`,
    details: `Added ${result.data.city} / ${result.data.tehsil} (${result.data.state})`,
  })

  res.status(201).json({ success: true, message: 'Service area added', serviceArea: result.data })
}

// PATCH /api/admin/content/service-areas/:id
export const updateServiceArea = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const result = await content.updateServiceArea(id, req.body)

  if (!result.ok) {
    res.status(result.code === 'NOT_FOUND' ? 404 : 409).json({
      success: false,
      message: result.message,
    })
    return
  }

  await recordAudit(req, {
    action: AuditAction.SERVICE_AREA_UPDATE,
    target: `ServiceArea:${id}`,
    details: `Updated fields: ${Object.keys(req.body).join(', ')}`,
  })

  res.json({ success: true, message: 'Service area updated', serviceArea: result.data })
}

// DELETE /api/admin/content/service-areas/:id  (soft delete)
export const deleteServiceArea = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const result = await content.deactivateServiceArea(id)

  if (!result.ok) {
    res.status(404).json({ success: false, message: result.message })
    return
  }

  await recordAudit(req, {
    action: AuditAction.SERVICE_AREA_DELETE,
    target: `ServiceArea:${id}`,
    details: `Deactivated ${result.data.city} / ${result.data.tehsil}`,
  })

  res.json({ success: true, message: 'Service area deactivated (soft delete)' })
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCLAIMERS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/content/disclaimers
export const listDisclaimers = async (req: Request, res: Response) => {
  const disclaimers = await content.listDisclaimers(wantsInactive(req))
  res.json({ success: true, total: disclaimers.length, disclaimers })
}

// PUT /api/admin/content/disclaimers
// Upsert by key — one endpoint covers "write the report disclaimer" whether or
// not one already exists, which is how the settings screen actually behaves.
export const upsertDisclaimer = async (req: Request, res: Response) => {
  const { data, bodyChanged } = await content.upsertDisclaimer(req.body, req.admin!.id)

  await recordAudit(req, {
    action: AuditAction.DISCLAIMER_UPDATE,
    target: `Disclaimer:${data.key}`,
    details: bodyChanged
      ? `Body changed — now version ${data.version}`
      : `Metadata updated — version unchanged (${data.version})`,
  })

  res.json({
    success: true,
    message: bodyChanged
      ? `Disclaimer saved (version ${data.version})`
      : 'Disclaimer updated — the body was unchanged, so the version was not bumped',
    disclaimer: data,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORT KNOWLEDGE BASE (Phase 4C) — the only source the AI assistant may
// ground answers in. SUPER_ADMIN only, same as every other content write.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/content/support-knowledge
export const listSupportKnowledge = async (req: Request, res: Response) => {
  const entries = await content.listSupportKnowledge(wantsInactive(req))
  res.json({ success: true, total: entries.length, entries })
}

// PUT /api/admin/content/support-knowledge — upsert by key
export const upsertSupportKnowledge = async (req: Request, res: Response) => {
  const entry = await content.upsertSupportKnowledge(req.body, req.admin!.id)

  await recordAudit(req, {
    action: AuditAction.SUPPORT_KNOWLEDGE_UPDATE,
    target: `SupportKnowledgeEntry:${entry.key}`,
    details: `${entry.topic}: "${entry.question}"`,
  })

  res.json({ success: true, message: 'Knowledge entry saved', entry })
}

// ─────────────────────────────────────────────────────────────────────────────
// BANNER ANNOUNCEMENTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/content/banners
export const listBanners = async (req: Request, res: Response) => {
  const banners = await content.listBanners(wantsInactive(req))
  res.json({ success: true, total: banners.length, banners })
}

// POST /api/admin/content/banners
export const createBanner = async (req: Request, res: Response) => {
  const banner = await content.createBanner(req.body, req.admin!.id)

  await recordAudit(req, {
    action: AuditAction.BANNER_CREATE,
    target: `Banner:${banner.id}`,
    details: `Created ${banner.severity} banner for ${banner.audience}: "${banner.title}"`,
  })

  res.status(201).json({ success: true, message: 'Banner created', banner })
}

// PATCH /api/admin/content/banners/:id
export const updateBanner = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const result = await content.updateBanner(id, req.body)

  if (!result.ok) {
    res.status(404).json({ success: false, message: result.message })
    return
  }

  await recordAudit(req, {
    action: AuditAction.BANNER_UPDATE,
    target: `Banner:${id}`,
    details: `Updated fields: ${Object.keys(req.body).join(', ')}`,
  })

  res.json({ success: true, message: 'Banner updated', banner: result.data })
}

// DELETE /api/admin/content/banners/:id  (soft delete)
export const deleteBanner = async (req: Request, res: Response) => {
  const id = req.params.id as string
  const result = await content.deactivateBanner(id)

  if (!result.ok) {
    res.status(404).json({ success: false, message: result.message })
    return
  }

  await recordAudit(req, {
    action: AuditAction.BANNER_DELETE,
    target: `Banner:${id}`,
    details: `Deactivated banner "${result.data.title}"`,
  })

  res.json({ success: true, message: 'Banner deactivated (soft delete)' })
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC READS — no auth. Buyer app / seller panel need the content that
// Content Control publishes, otherwise the whole feature writes to nowhere.
// Only live, active rows are exposed; nothing here reveals admin state.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/content/categories
export const publicCategories = async (_req: Request, res: Response) => {
  const categories = await content.listCategories(false)
  res.json({
    success: true,
    categories: categories.map((c) => ({
      slug: c.slug,
      label: c.label,
      description: c.description,
      propertyType: c.propertyType,
    })),
  })
}

// GET /api/content/coverage  → cities with their tehsils
export const publicCoverage = async (_req: Request, res: Response) => {
  const coverage = await content.listCoverage()
  res.json({ success: true, total: coverage.length, coverage })
}

// GET /api/content/disclaimers/:key
export const publicDisclaimer = async (req: Request, res: Response) => {
  const key = req.params.key as string
  const disclaimer = await content.getDisclaimer(key)

  if (!disclaimer || !disclaimer.active) {
    res.status(404).json({ success: false, message: 'Disclaimer not found' })
    return
  }

  res.json({
    success: true,
    disclaimer: {
      key: disclaimer.key,
      title: disclaimer.title,
      body: disclaimer.body,
      version: disclaimer.version,
      updatedAt: disclaimer.updatedAt,
    },
  })
}

// GET /api/content/banners?audience=BUYERS
export const publicBanners = async (req: Request, res: Response) => {
  const raw = typeof req.query.audience === 'string' ? req.query.audience.toUpperCase() : 'ALL'
  const allowed: BannerAudience[] = ['ALL', 'BUYERS', 'SELLERS', 'ADMINS']
  const audience = (allowed as string[]).includes(raw) ? (raw as BannerAudience) : 'ALL'

  const banners = await content.listLiveBanners(audience)

  res.json({
    success: true,
    total: banners.length,
    banners: banners.map((b) => ({
      id: b.id,
      title: b.title,
      body: b.body,
      severity: b.severity,
      audience: b.audience,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
    })),
  })
}
