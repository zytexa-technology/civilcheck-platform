// ─────────────────────────────────────────────────────────────────────────────
// Seller KYC pipeline (PDF 5.2) — every transition of Seller.kycStatus lives
// here so the guards, the cascade rules and the seller-facing messaging cannot
// drift between call sites.
//
// Three rules hold for all of them:
//
//  1. Transitions are guarded with updateMany + a status predicate, so two
//     admins clicking Approve at the same moment produce one winner and one
//     "already in that state" — never a lost update.
//  2. The caller may hand in an `onCommit` hook that runs INSIDE the same
//     transaction. Audit rows use it, so the action and its evidence commit
//     together or not at all.
//  3. Notifications fire strictly AFTER the transaction commits. An outbound
//     HTTP call inside a transaction would pin a database connection for the
//     length of a third-party round-trip.
// ─────────────────────────────────────────────────────────────────────────────
import type { Prisma, Badge, Seller } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { notifySeller, type DeliveryResult } from './notification.service.js'

// Where the approval/rejection email's CTA link points. No dedicated env var
// exists for this yet (only FRONTEND_URLS, a CORS allowlist covering all
// three frontends together) — SELLER_APP_URL is a new, optional override
// with the same "safe default, env override" shape as
// ADMIN_SESSION_TIMEOUT_MINUTES elsewhere in this codebase. Falls back to
// the seller app's local dev port so this works out of the box in dev.
const SELLER_PORTAL_URL = process.env.SELLER_APP_URL || 'http://localhost:5173'

export type CommitHook = (tx: Prisma.TransactionClient) => Promise<void>

export type KycFailureCode = 'NOT_FOUND' | 'INVALID_STATE'

export type KycResult =
  | { ok: true; seller: Seller; delivery: DeliveryResult[] }
  | { ok: false; code: KycFailureCode; message: string }

// Notification fan-out needs exactly these four fields.
function recipient(seller: Seller) {
  return { id: seller.id, name: seller.name, phone: seller.phone, email: seller.email }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ — the admin review queue (PDF 5.2)
// ─────────────────────────────────────────────────────────────────────────────

// Everything an admin needs to judge an application, including the document
// links themselves — the whole point of the queue is to look at them.
export async function listPendingApplications(page: number, limit: number) {
  const where: Prisma.SellerWhereInput = { kycStatus: 'PENDING' }

  const [sellers, total] = await Promise.all([
    prisma.seller.findMany({
      where,
      orderBy: { createdAt: 'asc' }, // oldest application first — FIFO queue
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.seller.count({ where }),
  ])

  return {
    total,
    page,
    totalPages: Math.ceil(total / limit),
    applications: sellers.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email,
      profession: s.profession,
      licenseNumber: s.licenseNumber,
      yearsOfExperience: s.yearsOfExperience,
      partnerRole: s.partnerRole,
      kycStatus: s.kycStatus,
      kycRejectionReason: s.kycRejectionReason,
      // Verification evidence
      aadhaarVerified: s.aadhaarVerified, // legacy — no longer set by anything, see schema.prisma
      identityVerificationStatus: s.identityVerificationStatus,
      barCouncilDoc: s.barCouncilDoc,
      selfieUrl: s.selfieUrl,
      digitalSignature: s.digitalSignature,
      tcAccepted: s.tcAccepted,
      // Payout readiness — an approved seller with no bank details cannot be
      // settled, so the reviewer should see this before deciding.
      bankDetailsComplete: Boolean(s.bankAccount && s.ifsc),
      // Completeness at a glance, so the queue can be triaged without opening
      // every application.
      documentsComplete: Boolean(s.barCouncilDoc && s.selfieUrl && s.tcAccepted),
      appliedAt: s.createdAt,
    })),
  }
}

export async function getApplication(sellerId: string) {
  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    include: { _count: { select: { listings: true } } },
  })

  if (!seller) return null

  return {
    id: seller.id,
    name: seller.name,
    phone: seller.phone,
    email: seller.email,
    profession: seller.profession,
    licenseNumber: seller.licenseNumber,
    yearsOfExperience: seller.yearsOfExperience,
    partnerRole: seller.partnerRole,
    kycStatus: seller.kycStatus,
    kycRejectionReason: seller.kycRejectionReason,
    badge: seller.badge,
    accuracyScore: seller.accuracyScore,
    totalEarnings: seller.totalEarnings,
    totalListings: seller._count.listings,
    documents: {
      barCouncilDoc: seller.barCouncilDoc,
      selfieUrl: seller.selfieUrl,
      digitalSignature: seller.digitalSignature,
    },
    compliance: {
      aadhaarVerified: seller.aadhaarVerified, // legacy — no longer set by anything, see schema.prisma
      tcAccepted: seller.tcAccepted,
    },
    // Identity document verification (manual review — replaces DigiLocker).
    identityVerification: {
      documentUrl: seller.identityDocumentUrl,
      status: seller.identityVerificationStatus,
      rejectionReason: seller.identityDocumentRejectionReason,
      uploadedAt: seller.identityDocumentUploadedAt,
      reviewedAt: seller.identityDocumentReviewedAt,
    },
    // PAN is masked: the reviewer only needs to confirm one is on file, and an
    // unmasked PAN in an admin API response is a needless PII exposure.
    banking: {
      bankAccountLast4: seller.bankAccount ? seller.bankAccount.slice(-4) : null,
      ifsc: seller.ifsc,
      panOnFile: Boolean(seller.pan),
    },
    appliedAt: seller.createdAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE
// ─────────────────────────────────────────────────────────────────────────────
export async function approveSeller(sellerId: string, onCommit?: CommitHook): Promise<KycResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const seller = await tx.seller.findUnique({ where: { id: sellerId } })
    if (!seller) return { ok: false as const, code: 'NOT_FOUND' as const }

    // A SUSPENDED seller is reinstated through unsuspend, not approve — going
    // straight to APPROVED here would skip the suspension's review.
    const { count } = await tx.seller.updateMany({
      where: { id: sellerId, kycStatus: { in: ['PENDING', 'REJECTED'] } },
      data: { kycStatus: 'APPROVED', kycRejectionReason: null },
    })

    if (count === 0) {
      return {
        ok: false as const,
        code: 'INVALID_STATE' as const,
        current: seller.kycStatus,
      }
    }

    await onCommit?.(tx)
    return { ok: true as const, seller }
  })

  if (!outcome.ok) {
    return {
      ok: false,
      code: outcome.code,
      message:
        outcome.code === 'NOT_FOUND'
          ? 'Seller not found'
          : outcome.current === 'SUSPENDED'
            ? 'Seller is SUSPENDED — call /unsuspend first'
            : 'Seller already approved hai',
    }
  }

  const seller = outcome.seller
  // approveSeller/rejectSeller are only ever reached for a seller who passed
  // through the PENDING KYC gate — Owner/Reporter instant-approve at
  // registration and never land here (see seller.controller.ts's
  // instantApprove) — so this is an Expert application in every real case
  // today. Still branches on partnerRole rather than assuming it, so the
  // generic copy is a safe fallback if that ever changes.
  const isExpert = seller.partnerRole === 'EXPERT'
  const loginUrl = `${SELLER_PORTAL_URL}/`

  const delivery = await notifySeller(recipient(seller), {
    type: 'approval',
    title: 'KYC approved 🎉',
    body: `${seller.name}, your CivilCheck KYC has been approved. You can now create listings.`,
    email: isExpert
      ? {
          subject: 'Your CivilCheck Property Expert Application Has Been Approved',
          text:
            `Hi ${seller.name},\n\n` +
            `Congratulations — your CivilCheck Property Expert application has been reviewed and ` +
            `approved by our team.\n\n` +
            `You can now log in to the CivilCheck Partner Portal, and your verified professional ` +
            `profile and services are available according to your account permissions.\n\n` +
            `Log in to the Partner Portal: ${loginUrl}\n\n` +
            `Welcome aboard.\n\n— Team CivilCheck`,
          html:
            `<p>Hi ${seller.name},</p>` +
            `<p>Congratulations — your CivilCheck Property Expert application has been reviewed ` +
            `and <strong>approved</strong> by our team.</p>` +
            `<p>You can now log in to the CivilCheck Partner Portal, and your verified professional ` +
            `profile and services are available according to your account permissions.</p>` +
            `<p><a href="${loginUrl}" style="display:inline-block;padding:10px 20px;background:#f0a500;` +
            `color:#241503;text-decoration:none;border-radius:6px;font-weight:600;">Login to Partner Portal</a></p>` +
            `<p>Welcome aboard.</p><p>— Team CivilCheck</p>`,
        }
      : {
          subject: 'Your CivilCheck KYC has been approved',
          text:
            `Hi ${seller.name},\n\n` +
            `Your CivilCheck KYC has been approved. You can now create property report listings ` +
            `and start earning.\n\nWelcome aboard.\n\n— Team CivilCheck`,
          html:
            `<p>Hi ${seller.name},</p>` +
            `<p>Your CivilCheck KYC has been <strong>approved</strong>. You can now create property ` +
            `report listings and start earning.</p>` +
            `<p>Welcome aboard.</p><p>— Team CivilCheck</p>`,
        },
    sms: { variables: { name: seller.name, status: 'approved' } },
  })

  return { ok: true, seller, delivery }
}

// ─────────────────────────────────────────────────────────────────────────────
// REJECT
// ─────────────────────────────────────────────────────────────────────────────
export async function rejectSeller(
  sellerId: string,
  reason: string,
  onCommit?: CommitHook
): Promise<KycResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const seller = await tx.seller.findUnique({ where: { id: sellerId } })
    if (!seller) return { ok: false as const, code: 'NOT_FOUND' as const }

    // PENDING only. Rejecting an already-APPROVED seller would strip their
    // status while leaving their live listings published — suspend does that
    // job properly, with the cascade.
    const { count } = await tx.seller.updateMany({
      where: { id: sellerId, kycStatus: 'PENDING' },
      data: { kycStatus: 'REJECTED', kycRejectionReason: reason },
    })

    if (count === 0) {
      return { ok: false as const, code: 'INVALID_STATE' as const, current: seller.kycStatus }
    }

    await onCommit?.(tx)
    return { ok: true as const, seller }
  })

  if (!outcome.ok) {
    return {
      ok: false,
      code: outcome.code,
      message:
        outcome.code === 'NOT_FOUND'
          ? 'Seller not found'
          : outcome.current === 'APPROVED'
            ? 'Seller is already APPROVED — use /suspend to remove them (this also unpublishes their listings)'
            : `Only PENDING applications can be rejected (currently: ${outcome.current})`,
    }
  }

  const seller = outcome.seller
  // Same reasoning as approveSeller — this path is only ever reached for a
  // seller who was in the PENDING KYC gate, which in practice today means
  // an Expert application. See that function's comment.
  const isExpert = seller.partnerRole === 'EXPERT'
  // Defensive only — kycDecisionReasonSchema already requires a real reason
  // (min 10 chars) at the API boundary, so this should never trigger in
  // normal operation. Guards against ever showing blank/undefined text.
  const safeReason = reason && reason.trim() ? reason.trim() : 'No specific reason was provided.'
  const kycUrl = `${SELLER_PORTAL_URL}/dashboard/kyc`

  const delivery = await notifySeller(recipient(seller), {
    type: 'approval',
    title: 'KYC rejected',
    body: `${seller.name}, your KYC was rejected. Reason: ${safeReason}. Please correct your documents and upload them again.`,
    email: isExpert
      ? {
          subject: 'Your CivilCheck Property Expert Application Was Not Approved',
          text:
            `Hi ${seller.name},\n\n` +
            `Your CivilCheck Property Expert application was not approved at this time.\n\n` +
            `Reason: ${safeReason}\n\n` +
            `You can correct the issue and resubmit your professional documents — simply upload a ` +
            `new certificate on your KYC page and your application will return to the review queue ` +
            `automatically.\n\n` +
            `Go to your KYC page: ${kycUrl}\n\n` +
            `— Team CivilCheck`,
          html:
            `<p>Hi ${seller.name},</p>` +
            `<p>Your CivilCheck Property Expert application was not approved at this time.</p>` +
            `<p><strong>Reason:</strong> ${safeReason}</p>` +
            `<p>You can correct the issue and resubmit your professional documents — simply upload a ` +
            `new certificate on your KYC page and your application will return to the review queue ` +
            `automatically.</p>` +
            `<p><a href="${kycUrl}" style="display:inline-block;padding:10px 20px;background:#f0a500;` +
            `color:#241503;text-decoration:none;border-radius:6px;font-weight:600;">Go to KYC page</a></p>` +
            `<p>— Team CivilCheck</p>`,
        }
      : {
          subject: 'Your CivilCheck KYC could not be approved',
          text:
            `Hi ${seller.name},\n\n` +
            `We could not approve your CivilCheck KYC.\n\nReason: ${safeReason}\n\n` +
            `Please correct the issue and re-upload your documents — you can reapply straight away.\n\n` +
            `— Team CivilCheck`,
          html:
            `<p>Hi ${seller.name},</p>` +
            `<p>We could not approve your CivilCheck KYC.</p>` +
            `<p><strong>Reason:</strong> ${safeReason}</p>` +
            `<p>Please correct the issue and re-upload your documents — you can reapply straight away.</p>` +
            `<p>— Team CivilCheck</p>`,
        },
    sms: { variables: { name: seller.name, status: 'rejected', reason: safeReason } },
  })

  return { ok: true, seller, delivery }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUSPEND — cascades to the seller's live listings (PDF 5.2)
// ─────────────────────────────────────────────────────────────────────────────
export async function suspendSeller(
  sellerId: string,
  reason: string,
  onCommit?: CommitHook
): Promise<KycResult & { unpublishedListings?: number }> {
  const outcome = await prisma.$transaction(async (tx) => {
    const seller = await tx.seller.findUnique({ where: { id: sellerId } })
    if (!seller) return { ok: false as const, code: 'NOT_FOUND' as const }

    const { count } = await tx.seller.updateMany({
      where: { id: sellerId, kycStatus: { not: 'SUSPENDED' } },
      data: { kycStatus: 'SUSPENDED' },
    })

    if (count === 0) {
      return { ok: false as const, code: 'INVALID_STATE' as const, current: seller.kycStatus }
    }

    // Same transaction as the suspension: a suspended seller must never be
    // left with live listings, not even for the width of a second statement.
    const unpublished = await tx.listing.updateMany({
      where: { sellerId, status: 'APPROVED' },
      data: { status: 'UNPUBLISHED' },
    })

    await onCommit?.(tx)
    return { ok: true as const, seller, unpublishedListings: unpublished.count }
  })

  if (!outcome.ok) {
    return {
      ok: false,
      code: outcome.code,
      message: outcome.code === 'NOT_FOUND' ? 'Seller not found' : 'Seller is already suspended',
    }
  }

  const seller = outcome.seller
  const delivery = await notifySeller(recipient(seller), {
    type: 'platform',
    title: 'Account suspended',
    body: `${seller.name}, your account has been suspended. Reason: ${reason}. Please contact support.`,
    email: {
      subject: 'Your CivilCheck account has been suspended',
      text:
        `Hi ${seller.name},\n\n` +
        `Your CivilCheck seller account has been suspended and your live listings have been ` +
        `unpublished.\n\nReason: ${reason}\n\n` +
        `If you believe this is a mistake, reply to this email and our team will review it.\n\n` +
        `— Team CivilCheck`,
      html:
        `<p>Hi ${seller.name},</p>` +
        `<p>Your CivilCheck seller account has been <strong>suspended</strong> and your live ` +
        `listings have been unpublished.</p>` +
        `<p><strong>Reason:</strong> ${reason}</p>` +
        `<p>If you believe this is a mistake, reply to this email and our team will review it.</p>` +
        `<p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: seller.name, status: 'suspended', reason } },
  })

  return { ok: true, seller, delivery, unpublishedListings: outcome.unpublishedListings }
}

// ─────────────────────────────────────────────────────────────────────────────
// UNSUSPEND
// ─────────────────────────────────────────────────────────────────────────────
//
// Listings are deliberately NOT re-published. They were unpublished under a
// suspension, so each one goes back through review rather than silently
// reappearing in buyer search.
export async function unsuspendSeller(sellerId: string, onCommit?: CommitHook): Promise<KycResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const seller = await tx.seller.findUnique({ where: { id: sellerId } })
    if (!seller) return { ok: false as const, code: 'NOT_FOUND' as const }

    const { count } = await tx.seller.updateMany({
      where: { id: sellerId, kycStatus: 'SUSPENDED' },
      data: { kycStatus: 'APPROVED' },
    })

    if (count === 0) {
      return { ok: false as const, code: 'INVALID_STATE' as const, current: seller.kycStatus }
    }

    await onCommit?.(tx)
    return { ok: true as const, seller }
  })

  if (!outcome.ok) {
    return {
      ok: false,
      code: outcome.code,
      message:
        outcome.code === 'NOT_FOUND'
          ? 'Seller not found'
          : `Seller is not suspended (currently: ${outcome.current})`,
    }
  }

  const seller = outcome.seller
  const delivery = await notifySeller(recipient(seller), {
    type: 'platform',
    title: 'Account restored',
    body: `${seller.name}, your account has been restored. Please resubmit your previous listings for review.`,
    email: {
      subject: 'Your CivilCheck account has been restored',
      text:
        `Hi ${seller.name},\n\n` +
        `Your CivilCheck seller account has been restored. Listings unpublished during the ` +
        `suspension need to be resubmitted for review.\n\n— Team CivilCheck`,
      html:
        `<p>Hi ${seller.name},</p>` +
        `<p>Your CivilCheck seller account has been <strong>restored</strong>. Listings ` +
        `unpublished during the suspension need to be resubmitted for review.</p>` +
        `<p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: seller.name, status: 'restored' } },
  })

  return { ok: true, seller, delivery }
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────────────────────────────────────
export async function updateBadge(
  sellerId: string,
  badge: Badge,
  onCommit?: CommitHook
): Promise<KycResult & { previousBadge?: Badge }> {
  const outcome = await prisma.$transaction(async (tx) => {
    const seller = await tx.seller.findUnique({ where: { id: sellerId } })
    if (!seller) return { ok: false as const, code: 'NOT_FOUND' as const }

    if (seller.badge === badge) {
      return { ok: false as const, code: 'INVALID_STATE' as const, current: seller.badge }
    }

    await tx.seller.update({ where: { id: sellerId }, data: { badge } })
    await onCommit?.(tx)
    return { ok: true as const, seller }
  })

  if (!outcome.ok) {
    return {
      ok: false,
      code: outcome.code,
      message:
        outcome.code === 'NOT_FOUND'
          ? 'Seller not found'
          : `Seller ka badge already ${outcome.current} hai`,
    }
  }

  const seller = outcome.seller
  const delivery = await notifySeller(recipient(seller), {
    type: 'badge',
    title: `Badge updated — ${badge}`,
    body: `${seller.name}, aapka badge ab ${badge} hai. Commission split isi ke hisaab se lagega.`,
    email: {
      subject: `Your CivilCheck badge is now ${badge}`,
      text:
        `Hi ${seller.name},\n\nYour CivilCheck seller badge is now ${badge}. ` +
        `Your commission split follows your badge tier.\n\n— Team CivilCheck`,
      html:
        `<p>Hi ${seller.name},</p>` +
        `<p>Your CivilCheck seller badge is now <strong>${badge}</strong>. Your commission ` +
        `split follows your badge tier.</p><p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: seller.name, status: `badge ${badge}` } },
  })

  return { ok: true, seller, delivery, previousBadge: seller.badge }
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY DOCUMENT VERIFICATION (manual review — replaces DigiLocker OAuth)
//
// A separate status from kycStatus above — identityVerificationStatus tracks
// review of the uploaded identity document only. A seller can be fully
// KYC-APPROVED (professional credentials, bank details, T&C) while their
// identity document sits PENDING or was never submitted (null); these are
// deliberately independent gates, never folded into one combined status.
// Same guarded-updateMany + notify-after-commit shape as approveSeller/
// rejectSeller above. reviewerAdminId is always the authenticated admin's own
// id (see admin.controller.ts) — never accepted from the request body.
// ─────────────────────────────────────────────────────────────────────────────
export async function approveIdentityDocument(
  sellerId: string,
  reviewerAdminId: string,
  onCommit?: CommitHook
): Promise<KycResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const seller = await tx.seller.findUnique({ where: { id: sellerId } })
    if (!seller) return { ok: false as const, code: 'NOT_FOUND' as const }

    const { count } = await tx.seller.updateMany({
      where: { id: sellerId, identityVerificationStatus: { in: ['PENDING', 'REJECTED'] } },
      data: {
        identityVerificationStatus: 'APPROVED',
        identityDocumentReviewedAt: new Date(),
        identityDocumentReviewedByAdminId: reviewerAdminId,
        identityDocumentRejectionReason: null,
      },
    })

    if (count === 0) {
      return { ok: false as const, code: 'INVALID_STATE' as const, current: seller.identityVerificationStatus }
    }

    await onCommit?.(tx)
    return { ok: true as const, seller }
  })

  if (!outcome.ok) {
    return {
      ok: false,
      code: outcome.code,
      message:
        outcome.code === 'NOT_FOUND'
          ? 'Seller not found'
          : outcome.current === 'APPROVED'
            ? 'Identity document is already approved'
            : 'No identity document has been submitted for review',
    }
  }

  const seller = outcome.seller
  const delivery = await notifySeller(recipient(seller), {
    type: 'approval',
    title: 'Identity document approved',
    body: `${seller.name}, your identity document has been reviewed and approved by our team.`,
    email: {
      subject: 'Your CivilCheck identity document has been approved',
      text:
        `Hi ${seller.name},\n\n` +
        `Your identity document has been reviewed and approved by our team.\n\n— Team CivilCheck`,
      html:
        `<p>Hi ${seller.name},</p>` +
        `<p>Your identity document has been reviewed and <strong>approved</strong> by our team.</p>` +
        `<p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: seller.name, status: 'identity document approved' } },
  })

  return { ok: true, seller, delivery }
}

export async function rejectIdentityDocument(
  sellerId: string,
  reason: string,
  reviewerAdminId: string,
  onCommit?: CommitHook
): Promise<KycResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const seller = await tx.seller.findUnique({ where: { id: sellerId } })
    if (!seller) return { ok: false as const, code: 'NOT_FOUND' as const }

    // PENDING only — an already-APPROVED document should not be silently
    // flipped to rejected; a fresh re-submission would go through PENDING
    // again anyway (see seller.controller.ts's uploadIdentityDocument).
    const { count } = await tx.seller.updateMany({
      where: { id: sellerId, identityVerificationStatus: 'PENDING' },
      data: {
        identityVerificationStatus: 'REJECTED',
        identityDocumentRejectionReason: reason,
        identityDocumentReviewedAt: new Date(),
        identityDocumentReviewedByAdminId: reviewerAdminId,
      },
    })

    if (count === 0) {
      return { ok: false as const, code: 'INVALID_STATE' as const, current: seller.identityVerificationStatus }
    }

    await onCommit?.(tx)
    return { ok: true as const, seller }
  })

  if (!outcome.ok) {
    return {
      ok: false,
      code: outcome.code,
      message:
        outcome.code === 'NOT_FOUND'
          ? 'Seller not found'
          : outcome.current === 'APPROVED'
            ? 'Identity document is already approved — it cannot be rejected after approval'
            : outcome.current == null
              ? 'No identity document has been submitted for review'
              : `Only a PENDING identity document can be rejected (currently: ${outcome.current})`,
    }
  }

  const seller = outcome.seller
  const delivery = await notifySeller(recipient(seller), {
    type: 'approval',
    title: 'Identity document rejected',
    body: `${seller.name}, your identity document was rejected. Reason: ${reason}. Please upload it again.`,
    email: {
      subject: 'Your CivilCheck identity document could not be approved',
      text:
        `Hi ${seller.name},\n\n` +
        `We could not approve your identity document.\n\nReason: ${reason}\n\n` +
        `Please correct the issue and upload it again — you can resubmit straight away.\n\n` +
        `— Team CivilCheck`,
      html:
        `<p>Hi ${seller.name},</p>` +
        `<p>We could not approve your identity document.</p>` +
        `<p><strong>Reason:</strong> ${reason}</p>` +
        `<p>Please correct the issue and upload it again — you can resubmit straight away.</p>` +
        `<p>— Team CivilCheck</p>`,
    },
    sms: { variables: { name: seller.name, status: 'identity document rejected', reason } },
  })

  return { ok: true, seller, delivery }
}
