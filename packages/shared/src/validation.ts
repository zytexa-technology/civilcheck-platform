// Shared Zod validation schemas — single source of truth for the API,
// Next.js panels, and the React Native buyer app.
import { z } from 'zod'
import {
  AdminRole,
  BannerAudience,
  BannerSeverity,
  CaseStatus,
  CaseType,
  PartnerRole,
  PayoutEligibilityStatus,
  Profession,
  PropertyType,
  RiskBadge,
  SupportTicketCategory,
  SupportTicketPriority,
  VerificationSource,
} from './enums.js'

// ─── PRIMITIVES ──────────────────────────────────────────────────────────────

// Indian mobile — accepts bare 10-digit or E.164 (+91…), normalizes to 10-digit
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number')
  .transform((v) => (v.startsWith('+91') ? v.slice(3) : v))

export const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code (format: HDFC0001234)')

export const bankAccountSchema = z
  .string()
  .trim()
  .regex(/^\d{9,18}$/, 'Bank account number must be 9–18 digits')

// Shared by every email+password signup (buyer, partner, admin). Not NIST-strict
// (no forced special-character rule — those tend to push users toward
// predictable substitutions) but long enough plus a letter+number mix to rule
// out trivial passwords.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters') // bcrypt silently truncates beyond this
  .regex(/[A-Za-z]/, 'Password must include at least one letter')
  .regex(/[0-9]/, 'Password must include at least one number')

export const emailSchema = z.email('Enter a valid email address').trim().toLowerCase()

// ─── BUYER AUTH (email + password — replaces phone OTP, MSG91 removed) ──────

export const buyerRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
})
export type BuyerRegisterInput = z.infer<typeof buyerRegisterSchema>

export const buyerLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})
export type BuyerLoginInput = z.infer<typeof buyerLoginSchema>

// Firebase phone-OTP login (additive — email+password above stays primary).
// The idToken is verified server-side (lib/firebase.ts) before anything in
// it is trusted; this schema only checks the shape of what the client sent.
export const firebaseIdTokenSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
})
export type FirebaseIdTokenInput = z.infer<typeof firebaseIdTokenSchema>

// ─── SELLER REGISTRATION (PDF 6.1 — banking & compliance) ────────────────────
// Email + password auth (replaces phone OTP, MSG91 removed) — email and
// password are now both mandatory; phone stays mandatory as the stored
// contact number, not the login credential.

export const sellerRegistrationSchema = z
  .object({
    phone: phoneSchema,
    name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    email: emailSchema,
    password: passwordSchema,
    // Removed from the signup flow (audit 2026-09-02) — no longer collected
    // or required at registration. Still accepted if a caller sends one
    // (harmless, and keeps this schema from breaking any other integration
    // that might still pass it), but Zod no longer rejects a request that
    // omits it. The Seller.profession DB column stays NOT NULL — see
    // seller.controller.ts's sellerRegister for how that's satisfied without
    // requiring the client to supply a value.
    profession: z.enum(Profession).optional(),
    // Expert professional evidence (Property Expert KYC hardening) — required
    // only for partnerRole EXPERT, enforced below in superRefine since Zod's
    // per-field .optional() can't see sibling fields. licenseNumber stays
    // optional even for Expert ("where applicable" — not every profession
    // has a formal registration number, e.g. Tehsil Expert).
    licenseNumber: z.string().trim().min(1).max(100).optional(),
    yearsOfExperience: z.number().int('yearsOfExperience must be a whole number').min(0, 'yearsOfExperience cannot be negative').max(80).optional(),
    city: z.string().trim().min(2).optional(),
    state: z.string().trim().min(2).optional(),
    // Phase 4A — Reporter is now a real, selectable partner role (content
    // sourcing + moderation + reward ledger all exist). All three personas
    // share this one registration shape; phone is mandatory for every one of
    // them (phoneSchema above, not optional).
    partnerRole: z.enum([PartnerRole.OWNER, PartnerRole.REPORTER, PartnerRole.EXPERT]).optional(),
    bankAccount: bankAccountSchema.optional(),
    ifsc: ifscSchema.optional(),
    tcAccepted: z.literal(true, {
      message: 'Terms & Conditions must be accepted (tcAccepted: true)',
    }),
    selfieUrl: z.url('selfieUrl must be a valid URL').optional(),
    barCouncilDoc: z.url('barCouncilDoc must be a valid URL').optional(),
    digitalSignature: z.string().trim().min(2).optional(),
  })
  .superRefine((data, ctx) => {
    // Bank details travel as a pair — account number without IFSC is unroutable
    if (data.bankAccount && !data.ifsc) {
      ctx.addIssue({ code: 'custom', path: ['ifsc'], message: 'IFSC is required with bankAccount' })
    }
    if (data.ifsc && !data.bankAccount) {
      ctx.addIssue({
        code: 'custom',
        path: ['bankAccount'],
        message: 'bankAccount is required with IFSC',
      })
    }
    // Property Expert applications require meaningful professional evidence
    // (audit finding — signup previously asked Experts for nothing more than
    // Owner/Reporter). Owner/Reporter are unaffected since this only fires
    // for partnerRole EXPERT.
    if (data.partnerRole === PartnerRole.EXPERT) {
      if (!data.profession) {
        ctx.addIssue({ code: 'custom', path: ['profession'], message: 'Profession is required for Property Expert applications' })
      }
      if (data.yearsOfExperience == null) {
        ctx.addIssue({ code: 'custom', path: ['yearsOfExperience'], message: 'Years of experience is required for Property Expert applications' })
      }
    }
  })
export type SellerRegistrationInput = z.infer<typeof sellerRegistrationSchema>

export const sellerLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})
export type SellerLoginInput = z.infer<typeof sellerLoginSchema>

// ─── ADMIN MANAGEMENT (Super Admin CRUD) ─────────────────────────────────────
// role is restricted to SUB_ADMIN/VIEWER on purpose — this endpoint can never
// create or promote another SUPER_ADMIN; that account stays a protected,
// non-publicly-creatable top-level identity.

const manageableAdminRole = z.enum([AdminRole.SUB_ADMIN, AdminRole.VIEWER])

export const adminCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  role: manageableAdminRole.default(AdminRole.SUB_ADMIN),
})
export type AdminCreateInput = z.infer<typeof adminCreateSchema>

export const adminUpdateSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    phone: phoneSchema.optional(),
    role: manageableAdminRole.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  })
export type AdminUpdateInput = z.infer<typeof adminUpdateSchema>

// ─── SELLER PROFILE UPDATE ────────────────────────────────────────────────────
// PATCH /api/seller/profile had no schema at all (QA audit 2026-08-03, finding
// #4) — an unvalidated bankAccount/ifsc pair here flows straight into the next
// weekly settlement payout.

export const sellerProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
    email: z.email('Enter a valid email address').optional(),
    city: z.string().trim().min(2).optional(),
    state: z.string().trim().min(2).optional(),
    bankAccount: bankAccountSchema.optional(),
    ifsc: ifscSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.bankAccount && !data.ifsc) {
      ctx.addIssue({ code: 'custom', path: ['ifsc'], message: 'IFSC is required with bankAccount' })
    }
    if (data.ifsc && !data.bankAccount) {
      ctx.addIssue({
        code: 'custom',
        path: ['bankAccount'],
        message: 'bankAccount is required with IFSC',
      })
    }
  })
export type SellerProfileUpdateInput = z.infer<typeof sellerProfileUpdateSchema>

// ─── BUYER BASIC PROFILE (Partner Module item 1.6) ───────────────────────────
// First-login Basic Profile step: Full Name, City and State are mandatory;
// Email and Photo are optional. Mobile is not accepted here — it comes from the
// authenticated token and is immutable. The buyer app gates the rest of the
// journey on this call succeeding.

export const buyerProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  city: z.string().trim().min(2, 'City is required'),
  state: z.string().trim().min(2, 'State is required'),
  email: z.email('Enter a valid email address').optional(),
  photoUrl: z.url('photoUrl must be a valid URL').optional(),
})
export type BuyerProfileInput = z.infer<typeof buyerProfileSchema>

// ─── SELLER KYC UPLOAD ───────────────────────────────────────────────────────

export const kycUploadSchema = z.object({
  certificateUrl: z.url('certificateUrl must be a valid URL'),
  selfieUrl: z.url('selfieUrl must be a valid URL').optional(),
})
export type KycUploadInput = z.infer<typeof kycUploadSchema>

// ─── IDENTITY DOCUMENT UPLOAD (manual review — replaces DigiLocker) ─────────
// Deliberately just the document URL — no status field. Accepting a status
// here would let a seller set their own verification result; the server
// always forces PENDING on submission (see seller.controller.ts).

export const identityDocumentUploadSchema = z.object({
  documentUrl: z.url('documentUrl must be a valid URL'),
})
export type IdentityDocumentUploadInput = z.infer<typeof identityDocumentUploadSchema>

// ─── LISTING CREATION (PDF 6.3 — all 17 report fields) ───────────────────────

export const listingCreateSchema = z
  .object({
    address: z.string().trim().min(5, 'Address must be at least 5 characters'),
    surveyNumber: z.string().trim().min(1).optional(),
    khasraNumber: z.string().trim().min(1).optional(),
    propertyType: z.enum(PropertyType),
    city: z.string().trim().min(2),
    tehsil: z.string().trim().min(2),
    caseExists: z.boolean(),
    caseNumber: z.string().trim().min(1).optional(),
    caseType: z.enum(CaseType).optional(),
    caseStatus: z.enum(CaseStatus).optional(),
    courtName: z.string().trim().min(2).optional(),
    partiesInvolved: z.string().trim().min(2).optional(),
    loanDefault: z.boolean().default(false),
    lenderName: z.string().trim().min(2).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    price: z
      .number()
      .min(99, 'Price must be at least Rs. 99')
      .max(4999, 'Price cannot exceed Rs. 4999'),
    sellerNotes: z.string().trim().min(1).optional(),
    documents: z.array(z.url()).default([]),
    images: z.array(z.url()).default([]),
    videos: z.array(z.url()).default([]),
    researchDate: z.coerce.date(),
  })
  .superRefine((data, ctx) => {
    if (data.caseExists) {
      for (const field of ['caseNumber', 'caseType', 'caseStatus', 'courtName'] as const) {
        if (!data[field]) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} is required when caseExists is true`,
          })
        }
      }
    }
    if (data.loanDefault && !data.lenderName) {
      ctx.addIssue({
        code: 'custom',
        path: ['lenderName'],
        message: 'lenderName is required when loanDefault is true',
      })
    }
  })
export type ListingCreateInput = z.infer<typeof listingCreateSchema>

// ─── LISTING UPDATE ───────────────────────────────────────────────────────────
// PUT /api/seller/listings/:id had no schema at all (QA audit 2026-08-03,
// finding #5) — a seller could PUT a listing to any price, including
// negative, bypassing the Rs 99-4999 cap enforced at creation. Only the
// fields updateListing actually reads are covered; all optional so an
// omitted field keeps its existing value (see listing.controller.ts).

export const listingUpdateSchema = z
  .object({
    caseStatus: z.enum(CaseStatus).optional(),
    caseNumber: z.string().trim().min(1).optional(),
    courtName: z.string().trim().min(2).optional(),
    partiesInvolved: z.string().trim().min(2).optional(),
    loanDefault: z.boolean().optional(),
    lenderName: z.string().trim().min(2).optional(),
    sellerNotes: z.string().trim().min(1).optional(),
    documents: z.array(z.url()).optional(),
    images: z.array(z.url()).optional(),
    videos: z.array(z.url()).optional(),
    price: z
      .number()
      .min(99, 'Price must be at least Rs. 99')
      .max(4999, 'Price cannot exceed Rs. 4999')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.loanDefault && !data.lenderName) {
      ctx.addIssue({
        code: 'custom',
        path: ['lenderName'],
        message: 'lenderName is required when loanDefault is true',
      })
    }
  })
export type ListingUpdateInput = z.infer<typeof listingUpdateSchema>

// ─── OWNER PROPERTY (Phase 2 — Property System foundation) ──────────────────
// Property Owner's own self-verification listing (free, no purchase) —
// distinct from Listing (paid expert report). Mandatory-document COMPOSITION
// (all 8 required types present exactly once, duplicates/missing rejected)
// is enforced in property-owner.controller.ts (a business rule with a
// specific user-facing message, not just a shape check) — this file only
// validates the SHAPE of each document entry (a real type key + a real URL).

// Canonical machine keys for the 8 mandatory Owner-property document slots —
// single source of truth for both propertyCreateSchema below and
// property-owner.controller.ts's composition check, so the two can never
// silently drift out of sync the way a "kept in sync, see comment" pattern
// would. An entry whose `type` is anything else (NOC, Builder Documents, …)
// is accepted as an optional/extra document — see propertyDocumentSchema —
// but never counts toward a required slot.
export const REQUIRED_PROPERTY_DOCUMENT_TYPES = [
  'SALE_DEED',
  'REGISTRY',
  'KHATA',
  'MUTATION',
  'PROPERTY_TAX_RECEIPT',
  'ELECTRICITY_BILL',
  'OWNER_AADHAAR',
  'PAN_CARD',
] as const
export type RequiredPropertyDocumentType = (typeof REQUIRED_PROPERTY_DOCUMENT_TYPES)[number]

export const propertyDocumentSchema = z.object({
  type: z.string().trim().min(1, 'Document type is required'),
  url: z.url(),
})
export type PropertyDocumentInput = z.infer<typeof propertyDocumentSchema>

export const propertyCreateSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters'),
  area: z.string().trim().min(1, 'Area is required'),
  age: z.string().trim().min(1).optional(),
  city: z.string().trim().min(2).optional(),
  tehsil: z.string().trim().min(2).optional(),
  address: z.string().trim().min(5).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  propertyType: z.enum(PropertyType).optional(),
  documents: z.array(propertyDocumentSchema).default([]),
  images: z.array(z.url()).default([]),
  videos: z.array(z.url()).default([]),
})
export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>

export const propertyUpdateSchema = z.object({
  title: z.string().trim().min(2).optional(),
  area: z.string().trim().min(1).optional(),
  age: z.string().trim().min(1).optional(),
  city: z.string().trim().min(2).optional(),
  tehsil: z.string().trim().min(2).optional(),
  address: z.string().trim().min(5).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  propertyType: z.enum(PropertyType).optional(),
  // Same shape as propertyCreateSchema (audit 2026-09-01) — an update used to
  // accept plain URL strings here, which would silently drop every
  // document's type the moment a seller edited their listing.
  documents: z.array(propertyDocumentSchema).optional(),
  images: z.array(z.url()).optional(),
  videos: z.array(z.url()).optional(),
})
export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>

// ─── REPORTER POST (property-information/news content, not a listing) ───────

export const reporterPostCreateSchema = z.object({
  title: z.string().trim().min(2).optional(),
  description: z.string().trim().min(2).optional(),
  images: z.array(z.url()).min(1, 'At least one image is required'),
  sourceName: z.string().trim().min(1).optional(),
  sourceDate: z.coerce.date().optional(),
  city: z.string().trim().min(2).optional(),
  tehsil: z.string().trim().min(2).optional(),
})
export type ReporterPostCreateInput = z.infer<typeof reporterPostCreateSchema>

export const reporterPostUpdateSchema = z.object({
  title: z.string().trim().min(2).optional(),
  description: z.string().trim().min(2).optional(),
  images: z.array(z.url()).min(1).optional(),
  sourceName: z.string().trim().min(1).optional(),
  sourceDate: z.coerce.date().optional(),
  city: z.string().trim().min(2).optional(),
  tehsil: z.string().trim().min(2).optional(),
})
export type ReporterPostUpdateInput = z.infer<typeof reporterPostUpdateSchema>

// ─── SPECIAL RESEARCH REQUEST (PDF 7.9) ──────────────────────────────────────

export const specialRequestCreateSchema = z.object({
  address: z.string().trim().min(5, 'Address must be at least 5 characters'),
  city: z.string().trim().min(2),
  tehsil: z.string().trim().min(2),
  propertyType: z.enum(PropertyType),
  questions: z.string().trim().min(10, 'Describe your questions (min 10 characters)'),
  documents: z.array(z.url()).default([]),
  advanceAmount: z
    .number()
    .min(999, 'Advance must be at least Rs. 999')
    .max(4999, 'Advance cannot exceed Rs. 4999'),
})
export type SpecialRequestCreateInput = z.infer<typeof specialRequestCreateSchema>

// ─── PAYMENTS — REPORT UNLOCK (PDF 6.2 / 8.2) ────────────────────────────────

// Body for POST /api/purchases — starts a Razorpay order for a report unlock.
export const purchaseCreateSchema = z.object({
  listingId: z.uuid('listingId must be a valid id'),
})
export type PurchaseCreateInput = z.infer<typeof purchaseCreateSchema>

// Body for POST /api/purchases/verify — the fields Razorpay Checkout hands back
// after a successful payment. Accept the snake_case names verbatim (that is what
// the SDK emits) and normalize to camelCase for the controller.
export const purchaseVerifySchema = z
  .object({
    razorpay_order_id: z.string().trim().min(1, 'razorpay_order_id is required'),
    razorpay_payment_id: z.string().trim().min(1, 'razorpay_payment_id is required'),
    razorpay_signature: z.string().trim().min(1, 'razorpay_signature is required'),
  })
  .transform((v) => ({
    orderId: v.razorpay_order_id,
    paymentId: v.razorpay_payment_id,
    signature: v.razorpay_signature,
  }))
export type PurchaseVerifyInput = z.infer<typeof purchaseVerifySchema>

// ─── BUYER PUSH NOTIFICATIONS (PDF 12/20) ────────────────────────────────────

// Body for PUT /api/alerts/device-token — register/refresh an FCM device token.
export const deviceTokenSchema = z.object({
  fcmToken: z.string().trim().min(10, 'fcmToken is required'),
})
export type DeviceTokenInput = z.infer<typeof deviceTokenSchema>

// Body for PUT /api/alerts/push-preference — toggle push on/off (off → SMS).
export const pushPreferenceSchema = z.object({
  enabled: z.boolean(),
})
export type PushPreferenceInput = z.infer<typeof pushPreferenceSchema>

// ─── SUBSCRIPTIONS (PDF 7.7 / 3.3) ───────────────────────────────────────────

// Body for POST /api/seller/subscriptions/featured — which listing to feature.
export const featuredSubscriptionSchema = z.object({
  listingId: z.uuid('listingId must be a valid id'),
})
export type FeaturedSubscriptionInput = z.infer<typeof featuredSubscriptionSchema>

// ─── ADMIN AUTH + 2FA (PDF 5.1) ──────────────────────────────────────────────

// Google Authenticator emits 6 digits. Users paste them with spaces
// ("123 456") often enough that stripping whitespace is worth the two lines.
export const totpCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'))

export const adminLoginSchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
  // Optional at the edge, mandatory in the controller once the admin has 2FA
  // enabled — that way a missing code returns TOTP_REQUIRED (a state the panel
  // acts on) instead of a generic 400 validation error.
  totp: totpCodeSchema.optional(),
})
export type AdminLoginInput = z.infer<typeof adminLoginSchema>

// Firebase phone-OTP login for Admin — SUB_ADMIN/VIEWER only, never
// SUPER_ADMIN (enforced server-side in the controller, not here). Requires
// the admin to have already linked their firebaseUid via POST
// /api/admin/link-firebase while authenticated with their existing
// email/password login — there is no cold-start admin phone login.
export const adminFirebaseLoginSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
  totp: totpCodeSchema.optional(),
})
export type AdminFirebaseLoginInput = z.infer<typeof adminFirebaseLoginSchema>

export const twoFactorEnableSchema = z.object({
  totp: totpCodeSchema,
})
export type TwoFactorEnableInput = z.infer<typeof twoFactorEnableSchema>

// Disabling 2FA is a privilege de-escalation — re-prove the password as well
// as possession, so a hijacked live session cannot quietly strip the factor.
export const twoFactorDisableSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  totp: totpCodeSchema,
})
export type TwoFactorDisableInput = z.infer<typeof twoFactorDisableSchema>

// ─── PASSWORD RESET (email OTP via Resend) ───────────────────────────────────
// Same three-step shape for all three actors (Admin/Seller/Buyer): request →
// verify → reset. `otp` is always exactly 6 digits, same convention as
// totpCodeSchema below.
const resetOtpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code')

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
})
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>

export const passwordResetVerifySchema = z.object({
  email: emailSchema,
  otp: resetOtpSchema,
})
export type PasswordResetVerifyInput = z.infer<typeof passwordResetVerifySchema>

export const passwordResetSchema = z
  .object({
    email: emailSchema,
    otp: resetOtpSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
export type PasswordResetInput = z.infer<typeof passwordResetSchema>

// ─── ADMIN KYC DECISIONS (PDF 5.2) ───────────────────────────────────────────

// The reason is sent verbatim to the seller over SMS/email, so it has to say
// something actionable — a one-character "x" is not a rejection reason.
export const kycDecisionReasonSchema = z.object({
  reason: z.string().trim().min(10, 'Give the seller a usable reason (min 10 characters)'),
})
export type KycDecisionReasonInput = z.infer<typeof kycDecisionReasonSchema>

// ─── CONTENT CONTROL (PDF 5.4) ───────────────────────────────────────────────

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase words separated by hyphens')

export const propertyCategoryCreateSchema = z.object({
  slug: slugSchema,
  label: z.string().trim().min(2, 'Label must be at least 2 characters'),
  description: z.string().trim().min(1).optional(),
  propertyType: z.enum(PropertyType).optional(),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
})
export type PropertyCategoryCreateInput = z.infer<typeof propertyCategoryCreateSchema>

export const serviceAreaCreateSchema = z.object({
  state: z.string().trim().min(2).default('Rajasthan'),
  city: z.string().trim().min(2, 'City must be at least 2 characters'),
  tehsil: z.string().trim().min(2, 'Tehsil must be at least 2 characters'),
  active: z.boolean().default(true),
})
export type ServiceAreaCreateInput = z.infer<typeof serviceAreaCreateSchema>

export const disclaimerUpsertSchema = z.object({
  key: slugSchema,
  title: z.string().trim().min(2, 'Title must be at least 2 characters'),
  body: z.string().trim().min(20, 'Disclaimer body must be at least 20 characters'),
  active: z.boolean().default(true),
})
export type DisclaimerUpsertInput = z.infer<typeof disclaimerUpsertSchema>

export const bannerCreateSchema = z
  .object({
    title: z.string().trim().min(2, 'Title must be at least 2 characters'),
    body: z.string().trim().min(5, 'Body must be at least 5 characters'),
    audience: z.enum(BannerAudience).default(BannerAudience.ALL),
    severity: z.enum(BannerSeverity).default(BannerSeverity.INFO),
    active: z.boolean().default(true),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endsAt must be after startsAt' })
    }
  })
export type BannerCreateInput = z.infer<typeof bannerCreateSchema>

// ─── CONTENT CONTROL — PATCH bodies ──────────────────────────────────────────
//
// Built as independent partial objects rather than `.partial()` on the create
// schemas: the create schemas carry `.default()` on several fields, and a
// partial of those would silently re-apply the default on every PATCH — so
// omitting `active` from a category update would flip it back to true.

const nonEmptyBody = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  })

export const propertyCategoryUpdateSchema = nonEmptyBody({
  slug: slugSchema.optional(),
  label: z.string().trim().min(2).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  propertyType: z.enum(PropertyType).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
})
export type PropertyCategoryUpdateInput = z.infer<typeof propertyCategoryUpdateSchema>

export const serviceAreaUpdateSchema = nonEmptyBody({
  state: z.string().trim().min(2).optional(),
  city: z.string().trim().min(2).optional(),
  tehsil: z.string().trim().min(2).optional(),
  active: z.boolean().optional(),
})
export type ServiceAreaUpdateInput = z.infer<typeof serviceAreaUpdateSchema>

export const bannerUpdateSchema = nonEmptyBody({
  title: z.string().trim().min(2).optional(),
  body: z.string().trim().min(5).optional(),
  audience: z.enum(BannerAudience).optional(),
  severity: z.enum(BannerSeverity).optional(),
  active: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endsAt must be after startsAt' })
  }
})
export type BannerUpdateInput = z.infer<typeof bannerUpdateSchema>

// ─── BUYER "REPORT OUTDATED" FLAG (PDF 7.8) ──────────────────────────────────

export const reportFlagCreateSchema = z.object({
  reason: z.string().trim().min(10, 'Describe why this report looks outdated (min 10 characters)'),
})
export type ReportFlagCreateInput = z.infer<typeof reportFlagCreateSchema>

// Admin resolve/dismiss — note is optional context for the audit trail, not a
// message sent back to the buyer (there's no notification channel for flags).
export const reportFlagDecisionSchema = z.object({
  adminNote: z.string().trim().min(1).optional(),
})
export type ReportFlagDecisionInput = z.infer<typeof reportFlagDecisionSchema>

// ─── REVIEWS & RATINGS (PDF 7.8 / 16) ────────────────────────────────────────

export const reviewCreateSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5'),
  comment: z.string().trim().min(2).max(1000).optional(),
})
export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>

// ─── VERIFICATION MARKETPLACE (Phase 3) ──────────────────────────────────────
// Property Verification Marketplace — a buyer requests a paid professional
// opinion on a property already listed as a Listing or a Property. See
// schema.prisma's "VERIFICATION MARKETPLACE" section for the full model.

// Exactly one of listingId/propertyId, matching `source` — enforced here
// (edge validation) AND by a DB CHECK constraint (defense in depth, same
// pattern as sellerRegistrationSchema's bank-pair superRefine).
export const verificationRequestCreateSchema = z
  .object({
    source: z.enum(VerificationSource),
    listingId: z.uuid().optional(),
    propertyId: z.uuid().optional(),
    // The buyer's own initial offer/budget — NOT a payment, NOT a fee. A
    // provider (Expert/Admin) may accept it as-is or counter with any other
    // positive amount; the accepted quote (not this) becomes the final
    // verification price. The >= PlatformSetting.minVerificationFee floor is
    // a runtime value, so it's checked in the service, not here.
    initialOfferAmount: z.number().positive('initialOfferAmount must be a positive number'),
  })
  .superRefine((data, ctx) => {
    if (data.source === VerificationSource.LISTING && !data.listingId) {
      ctx.addIssue({ code: 'custom', path: ['listingId'], message: 'listingId is required when source is LISTING' })
    }
    if (data.source === VerificationSource.PROPERTY && !data.propertyId) {
      ctx.addIssue({ code: 'custom', path: ['propertyId'], message: 'propertyId is required when source is PROPERTY' })
    }
    if (data.listingId && data.propertyId) {
      ctx.addIssue({ code: 'custom', path: ['propertyId'], message: 'Only one of listingId/propertyId may be set' })
    }
  })
export type VerificationRequestCreateInput = z.infer<typeof verificationRequestCreateSchema>

// Deliberately no upper (or buyer-offer-tied lower) bound — a provider's
// quote is a free counter-offer, not constrained by the buyer's initial
// offer or the property's value (Buyer Experience redesign correction,
// 2026-09-05). Only a positive-number shape check happens here.
export const verificationQuoteCreateSchema = z.object({
  proposedFee: z.number().positive('proposedFee must be a positive number'),
  message: z.string().trim().min(1).max(1000).optional(),
})
export type VerificationQuoteCreateInput = z.infer<typeof verificationQuoteCreateSchema>

export const verificationReportCreateSchema = z.object({
  findings: z.string().trim().min(20, 'Findings must be at least 20 characters'),
  riskAssessment: z.enum(RiskBadge).optional(),
  documents: z.array(z.url()).default([]),
  images: z.array(z.url()).default([]),
  videos: z.array(z.url()).default([]),
})
export type VerificationReportCreateInput = z.infer<typeof verificationReportCreateSchema>

export const verificationCancelSchema = z.object({
  reason: z.string().trim().min(10, 'Give a reason for cancelling (min 10 characters)'),
})
export type VerificationCancelInput = z.infer<typeof verificationCancelSchema>

// ─── CLAIMS (Phase 3) ─────────────────────────────────────────────────────────

export const claimCreateSchema = z.object({
  reason: z.string().trim().min(3, 'Reason is required').max(120),
  description: z.string().trim().min(20, 'Describe the issue (min 20 characters)'),
  evidence: z.array(z.url()).default([]),
})
export type ClaimCreateInput = z.infer<typeof claimCreateSchema>

export const claimResolutionSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'REFUND_APPROVED', 'REFUND_PROCESSED']),
  resolutionNote: z.string().trim().min(5, 'Give a resolution note (min 5 characters)'),
})
export type ClaimResolutionInput = z.infer<typeof claimResolutionSchema>

// ─── BUYER WEB SOCIAL FEED (Buyer Experience redesign) ────────────────────────
export const feedCommentCreateSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(1000),
})
export type FeedCommentCreateInput = z.infer<typeof feedCommentCreateSchema>

// ─── PLATFORM SETTINGS (Phase 3) ──────────────────────────────────────────────
// Every field optional (partial update) — Super Admin only, never hardcode
// these numbers elsewhere in the codebase.

// ─── FINANCIAL LEDGER + PROFESSIONAL PAYOUTS (Phase 4B) ──────────────────────

export const payoutEligibilityUpdateSchema = z
  .object({
    payoutEligibilityStatus: z.enum(PayoutEligibilityStatus).optional(),
    // Foundation-only today — see lib/razorpayRoute.ts. Accepting it here
    // just lets an admin record a Linked Account id once one is ever
    // actually created; nothing currently reads it back for a live transfer.
    razorpayLinkedAccountId: z.string().trim().max(255).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })
export type PayoutEligibilityUpdateInput = z.infer<typeof payoutEligibilityUpdateSchema>

export const payoutResolveSchema = z.object({
  action: z.enum(['retry', 'write_off']),
  note: z.string().trim().min(1).max(500).optional(),
})
export type PayoutResolveInput = z.infer<typeof payoutResolveSchema>

export const reconciliationIssueResolveSchema = z.object({
  resolutionNote: z.string().trim().min(5, 'Give a resolution note (min 5 characters)'),
})
export type ReconciliationIssueResolveInput = z.infer<typeof reconciliationIssueResolveSchema>

export const platformSettingUpdateSchema = z
  .object({
    minVerificationFee: z.number().positive().optional(),
    verificationPlatformCommissionRate: z.number().min(0).max(1).optional(),
    cancellationFeeRateAfterAcceptance: z.number().min(0).max(1).optional(),
    // Reporter Reward Ledger (Phase 4A) — never hardcode this at the call site.
    reporterRewardPointsPerApprovedProperty: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })
export type PlatformSettingUpdateInput = z.infer<typeof platformSettingUpdateSchema>

// ─── REPORTER REWARD LEDGER (Phase 4A) ───────────────────────────────────────

// Admin manual credit/debit — points may be negative (a debit adjustment).
// Zero is rejected: it would create a no-op ledger row.
export const rewardAdjustmentCreateSchema = z.object({
  points: z.number().int().refine((v) => v !== 0, 'points cannot be zero'),
  reason: z.string().trim().min(5, 'Give a reason for this adjustment (min 5 characters)'),
})
export type RewardAdjustmentCreateInput = z.infer<typeof rewardAdjustmentCreateSchema>

// Admin approve/reject of a PENDING EARNED transaction.
export const rewardTransactionDecisionSchema = z.object({
  reason: z.string().trim().min(1).optional(),
})
export type RewardTransactionDecisionInput = z.infer<typeof rewardTransactionDecisionSchema>

// Reporter's own request to redeem points from their approved balance.
export const redeemRequestCreateSchema = z.object({
  points: z.number().int().positive('points must be a positive whole number'),
  note: z.string().trim().min(1).max(500).optional(),
})
export type RedeemRequestCreateInput = z.infer<typeof redeemRequestCreateSchema>

// Admin approve/reject of a redeem request. A reject reason is required (goes
// back to the Reporter, same pattern as kycDecisionReasonSchema); approval
// notes are optional context for the audit trail.
export const redeemRequestDecisionSchema = z.object({
  adminNote: z.string().trim().min(1).max(500).optional(),
})
export type RedeemRequestDecisionInput = z.infer<typeof redeemRequestDecisionSchema>

export const redeemRequestRejectSchema = z.object({
  adminNote: z.string().trim().min(5, 'Give the Reporter a reason (min 5 characters)'),
})
export type RedeemRequestRejectInput = z.infer<typeof redeemRequestRejectSchema>

// ─── AI / HUMAN CUSTOMER SUPPORT (Phase 4C) ──────────────────────────────────

export const supportTicketCreateSchema = z.object({
  category: z.enum(SupportTicketCategory).default(SupportTicketCategory.OTHER),
  subject: z.string().trim().min(3, 'Give this ticket a short subject (min 3 characters)').max(150),
  message: z.string().trim().min(5, 'Describe what you need help with (min 5 characters)').max(4000),
  attachments: z.array(z.url()).max(10).default([]),
})
export type SupportTicketCreateInput = z.infer<typeof supportTicketCreateSchema>

export const supportMessageCreateSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(4000),
  attachments: z.array(z.url()).max(10).default([]),
})
export type SupportMessageCreateInput = z.infer<typeof supportMessageCreateSchema>

export const supportAdminReplySchema = z.object({
  body: z.string().trim().min(1, 'Reply cannot be empty').max(4000),
})
export type SupportAdminReplyInput = z.infer<typeof supportAdminReplySchema>

export const supportTicketPriorityUpdateSchema = z.object({
  priority: z.enum(SupportTicketPriority),
})
export type SupportTicketPriorityUpdateInput = z.infer<typeof supportTicketPriorityUpdateSchema>

// Admin-managed AI knowledge base — same key/active shape as
// disclaimerUpsertSchema, upserted by key.
export const supportKnowledgeUpsertSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Key must be lowercase words separated by hyphens'),
  topic: z.enum(SupportTicketCategory),
  question: z.string().trim().min(5, 'Question must be at least 5 characters').max(300),
  answer: z.string().trim().min(10, 'Answer must be at least 10 characters').max(2000),
  active: z.boolean().default(true),
})
export type SupportKnowledgeUpsertInput = z.infer<typeof supportKnowledgeUpsertSchema>
