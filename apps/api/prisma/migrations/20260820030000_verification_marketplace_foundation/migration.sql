-- Phase 3: Property Verification Marketplace foundation.
--
-- Purely additive: 2 new enum values on the existing PaymentKind enum, 4 new
-- enums, 5 new tables, 2 nullable columns added to existing tables
-- (PaymentOrder.verificationRequestId, Refund.verificationRequestId — both
-- optional, no NOT NULL-without-default anywhere in this migration), plus
-- indexes and foreign keys. Nothing dropped, nothing renamed, no existing
-- column's type or nullability changed.
--
-- NOTE: the generated `ALTER TABLE "Listing" ALTER COLUMN "searchVector"
-- DROP DEFAULT` line from `prisma migrate diff` was again omitted — the same
-- recurring Prisma/tsvector generated-column false positive documented in
-- docs/roadmap.md (Day 6 decisions).

-- AlterEnum
ALTER TYPE "PaymentKind" ADD VALUE 'VERIFICATION_ADVANCE';
ALTER TYPE "PaymentKind" ADD VALUE 'VERIFICATION_FINAL';

-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('LISTING', 'PROPERTY');

-- CreateEnum
CREATE TYPE "VerificationRequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'ADVANCE_PAYMENT_PENDING', 'ADVANCE_PAID', 'IN_PROGRESS', 'COMPLETED', 'FINAL_PAYMENT_PENDING', 'FULLY_PAID', 'REPORT_UNLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationQuoteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'REFUND_APPROVED', 'REFUND_PROCESSED');

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN     "verificationRequestId" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "verificationRequestId" TEXT;

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "minVerificationFee" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "verificationPlatformCommissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "cancellationFeeRateAfterAcceptance" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "VerificationSource" NOT NULL,
    "listingId" TEXT,
    "propertyId" TEXT,
    "uploaderRole" "PartnerRole" NOT NULL,
    "minFee" DOUBLE PRECISION NOT NULL,
    "status" "VerificationRequestStatus" NOT NULL DEFAULT 'OPEN',
    "acceptedQuoteId" TEXT,
    "assignedAdminId" TEXT,
    "assignedSellerId" TEXT,
    "agreedFee" DOUBLE PRECISION,
    "platformCommissionRate" DOUBLE PRECISION,
    "advanceAmount" DOUBLE PRECISION,
    "finalAmount" DOUBLE PRECISION,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancellationFee" DOUBLE PRECISION,
    "cancellationRefund" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationQuote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "quotedByAdminId" TEXT,
    "quotedBySellerId" TEXT,
    "proposedFee" DOUBLE PRECISION NOT NULL,
    "message" TEXT,
    "status" "VerificationQuoteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationReport" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "propertyCity" TEXT,
    "propertyTehsil" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "findings" TEXT NOT NULL,
    "riskAssessment" "RiskBadge",
    "documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "assignedAdminId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationRequest_acceptedQuoteId_key" ON "VerificationRequest"("acceptedQuoteId");

-- CreateIndex
CREATE INDEX "VerificationRequest_userId_idx" ON "VerificationRequest"("userId");

-- CreateIndex
CREATE INDEX "VerificationRequest_status_idx" ON "VerificationRequest"("status");

-- CreateIndex
CREATE INDEX "VerificationRequest_assignedSellerId_idx" ON "VerificationRequest"("assignedSellerId");

-- CreateIndex
CREATE INDEX "VerificationRequest_listingId_idx" ON "VerificationRequest"("listingId");

-- CreateIndex
CREATE INDEX "VerificationRequest_propertyId_idx" ON "VerificationRequest"("propertyId");

-- CreateIndex
CREATE INDEX "VerificationQuote_requestId_idx" ON "VerificationQuote"("requestId");

-- CreateIndex
CREATE INDEX "VerificationQuote_quotedBySellerId_idx" ON "VerificationQuote"("quotedBySellerId");

-- CreateIndex
CREATE INDEX "VerificationQuote_status_idx" ON "VerificationQuote"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationReport_requestId_key" ON "VerificationReport"("requestId");

-- CreateIndex
CREATE INDEX "Claim_verificationRequestId_idx" ON "Claim"("verificationRequestId");

-- CreateIndex
CREATE INDEX "Claim_userId_idx" ON "Claim"("userId");

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_acceptedQuoteId_fkey" FOREIGN KEY ("acceptedQuoteId") REFERENCES "VerificationQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_assignedSellerId_fkey" FOREIGN KEY ("assignedSellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationQuote" ADD CONSTRAINT "VerificationQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationQuote" ADD CONSTRAINT "VerificationQuote_quotedBySellerId_fkey" FOREIGN KEY ("quotedBySellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Hand-added CHECK constraints and partial unique index — Prisma has no
-- declarative XOR-across-columns or partial-unique-index syntax, same
-- reasoning as Refund's existing purchase/specialRequest XOR (see
-- 20260724155847_day6_special_request_payment_refund) and its active-refund
-- partial unique index (20260804070000_refund_active_unique_per_purchase).
-- ─────────────────────────────────────────────────────────────────────────

-- VerificationRequest: exactly one of listingId/propertyId — a verification
-- request targets either a Listing or a Property, never both, never neither.
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_listing_xor_property"
  CHECK (
    (("listingId" IS NOT NULL)::int + ("propertyId" IS NOT NULL)::int) = 1
  );

-- VerificationQuote: exactly one of quotedByAdminId/quotedBySellerId — a
-- quote comes from either an Admin or a Seller(Expert), never both.
ALTER TABLE "VerificationQuote" ADD CONSTRAINT "VerificationQuote_admin_xor_seller"
  CHECK (
    (("quotedByAdminId" IS NOT NULL)::int + ("quotedBySellerId" IS NOT NULL)::int) = 1
  );

-- Refund: widen the existing purchase/specialRequest XOR to a 3-way XOR that
-- also allows verificationRequestId. Drop and recreate rather than ALTER —
-- Postgres has no ALTER CONSTRAINT for a CHECK's expression.
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_purchase_xor_specialRequest";

ALTER TABLE "Refund" ADD CONSTRAINT "Refund_purchase_xor_specialRequest_xor_verificationRequest"
  CHECK (
    (("purchaseId" IS NOT NULL)::int + ("specialRequestId" IS NOT NULL)::int + ("verificationRequestId" IS NOT NULL)::int) = 1
  );

-- Claim: at most one OPEN/UNDER_REVIEW claim per verification request at a
-- time — a buyer shouldn't be able to open a second dispute on the same
-- request while one is still being worked.
CREATE UNIQUE INDEX "Claim_active_unique_per_request"
  ON "Claim" ("verificationRequestId")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');
