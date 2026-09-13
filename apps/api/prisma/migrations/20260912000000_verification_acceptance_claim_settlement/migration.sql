-- 7-Day Verification Acceptance, Claim & Professional Settlement System.
--
-- Purely additive: new nullable columns, new enum values, two new
-- nullable-FK columns replacing two required ones (loosened, not
-- tightened), two new indexes. No column is dropped, no existing row is
-- rewritten, no data is deleted. Every new VerificationRequest/
-- ProfessionalEarning/ProfessionalPayoutRecord/Admin column defaults to
-- NULL (or, where an enum needs a default for NOT NULL columns, to the
-- existing "not yet decided" value already used elsewhere in this schema
-- for the same kind of field) — so every pre-existing row is completely
-- unaffected and requires no backfill. See VerificationRequest's own model
-- comment in schema.prisma for why reportCompletedAt/claimDeadline are
-- deliberately left NULL for legacy REPORT_UNLOCKED rows rather than
-- backfilled with an invented deadline.

-- CreateEnum
CREATE TYPE "BuyerAcceptanceStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "PayoutReleaseReason" AS ENUM ('BUYER_ACCEPTED', 'CLAIM_WINDOW_EXPIRED', 'CLAIM_REJECTED');

-- AlterEnum
ALTER TYPE "ProfessionalEarningStatus" ADD VALUE 'FROZEN';

-- AlterTable — VerificationRequest gains the 7-day window fields.
ALTER TABLE "VerificationRequest"
  ADD COLUMN "reportCompletedAt" TIMESTAMP(3),
  ADD COLUMN "claimDeadline" TIMESTAMP(3),
  ADD COLUMN "buyerAcceptanceStatus" "BuyerAcceptanceStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "buyerAcceptedAt" TIMESTAMP(3);

-- CreateIndex — the hourly expiry sweep's own WHERE clause.
CREATE INDEX "VerificationRequest_buyerAcceptanceStatus_claimDeadline_idx"
  ON "VerificationRequest"("buyerAcceptanceStatus", "claimDeadline");

-- AlterTable — Admin gains a professional payout account. Bank/UPI values
-- are stored encrypted (lib/encryption.ts) from the very first row written —
-- unlike Seller.bankAccount/ifsc (Phase 4B, predates this feature and stays
-- plaintext here; retrofitting encryption onto that existing, live column
-- is a separate, deliberately out-of-scope migration on real financial data
-- — see this feature's final report).
ALTER TABLE "Admin"
  ADD COLUMN "payoutBankAccountEncrypted" TEXT,
  ADD COLUMN "payoutIfscEncrypted" TEXT,
  ADD COLUMN "payoutUpiIdEncrypted" TEXT,
  ADD COLUMN "payoutBankName" TEXT,
  ADD COLUMN "payoutAccountHolderName" TEXT,
  ADD COLUMN "payoutEligibilityStatus" "PayoutEligibilityStatus" NOT NULL DEFAULT 'PENDING_ONBOARDING';

-- ─────────────────────────────────────────────────────────────────────────
-- ProfessionalEarning / ProfessionalPayoutRecord: an Admin can be the
-- professional who performed a verification (VerificationRequest.
-- assignedAdminId is a real, used field, exactly like assignedSellerId) —
-- before this migration, ledger.service.ts's recordCaptureLedgerEntries
-- silently created NO ProfessionalEarning row at all whenever the
-- professional was an Admin (its own `if (paymentOrder.sellerId)` guard),
-- so an Admin-performed verification had no payout tracking whatsoever.
-- Loosening sellerId to optional and adding adminId (admin snapshot, no FK
-- — same reasoning as AuditLog.adminId/VerificationRequest.assignedAdminId,
-- consistent with keeping a payout row resolvable even if the Admin account
-- is later modified) closes that gap. The CHECK constraints below make
-- "exactly one of sellerId/adminId" a permanent DB-level invariant, same
-- XOR-by-raw-SQL-CHECK pattern this schema already uses for Refund's
-- purchase/specialRequest/verificationRequest columns and
-- VerificationRequest's own listing/property columns.
--
-- Safety against existing data: every existing ProfessionalEarning/
-- ProfessionalPayoutRecord row already has sellerId set (it was NOT NULL
-- until this migration) and adminId did not exist before this migration, so
-- every existing row already satisfies "exactly one of the two" trivially.
-- Postgres validates both ADD CONSTRAINT statements against the full
-- existing table at apply time.
-- ─────────────────────────────────────────────────────────────────────────

-- DropForeignKey
ALTER TABLE "ProfessionalEarning" DROP CONSTRAINT "ProfessionalEarning_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "ProfessionalPayoutRecord" DROP CONSTRAINT "ProfessionalPayoutRecord_sellerId_fkey";

-- AlterTable
ALTER TABLE "ProfessionalEarning"
  ALTER COLUMN "sellerId" DROP NOT NULL,
  ADD COLUMN "adminId" TEXT,
  ADD COLUMN "releaseReason" "PayoutReleaseReason",
  ADD COLUMN "payoutEligibleAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProfessionalPayoutRecord"
  ALTER COLUMN "sellerId" DROP NOT NULL,
  ADD COLUMN "adminId" TEXT;

-- AddForeignKey
ALTER TABLE "ProfessionalEarning" ADD CONSTRAINT "ProfessionalEarning_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalEarning" ADD CONSTRAINT "ProfessionalEarning_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalPayoutRecord" ADD CONSTRAINT "ProfessionalPayoutRecord_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalPayoutRecord" ADD CONSTRAINT "ProfessionalPayoutRecord_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ProfessionalEarning_adminId_idx" ON "ProfessionalEarning"("adminId");

-- CreateIndex
CREATE INDEX "ProfessionalPayoutRecord_adminId_idx" ON "ProfessionalPayoutRecord"("adminId");

-- CreateConstraint (raw SQL — Prisma has no declarative XOR-across-columns)
ALTER TABLE "ProfessionalEarning" ADD CONSTRAINT "ProfessionalEarning_seller_xor_admin"
  CHECK ((("sellerId" IS NOT NULL)::int + ("adminId" IS NOT NULL)::int) = 1);

ALTER TABLE "ProfessionalPayoutRecord" ADD CONSTRAINT "ProfessionalPayoutRecord_seller_xor_admin"
  CHECK ((("sellerId" IS NOT NULL)::int + ("adminId" IS NOT NULL)::int) = 1);
