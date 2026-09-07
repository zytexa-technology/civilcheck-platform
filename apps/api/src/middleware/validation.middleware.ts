import { Request, Response, NextFunction } from 'express'
import type { ZodType } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Generic Zod body validator (roadmap Day 1).
//
// Usage:  router.post('/', validateBody(listingCreateSchema), controller.create)
//
// Parse successful hone par req.body ko PARSED data se replace karta hai —
// matlab controllers ko defaults/transforms applied values milti hain
// (e.g. phone normalized, documents: [] default).
// ─────────────────────────────────────────────────────────────────────────────
export const validateBody =
  <Output>(schema: ZodType<Output>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {})

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(body)',
          message: issue.message,
        })),
      })
      return
    }

    req.body = result.data
    next()
  }
