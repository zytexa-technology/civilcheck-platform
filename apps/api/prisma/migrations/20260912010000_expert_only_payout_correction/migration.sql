-- Correction: Admin/SuperAdmin must NEVER be an Expert-payout beneficiary.
--
-- An earlier pass on the 7-day claim/payout feature (migration
-- 20260912000000_verification_acceptance_claim_settlement) incorrectly
-- conflated "who performed the verification" (which can be an Expert, an
-- Admin, or a SuperAdmin) with "who is eligible for the 30/70 Expert
-- commission" (Expert ONLY). It added adminId to ProfessionalEarning /
-- ProfessionalPayoutRecord and gave Admin its own payout-account fields.
-- This migration reverts exactly that, restoring ProfessionalEarning /
-- ProfessionalPayoutRecord to Seller-only (their original, correct Phase 4B
-- shape) and removing every Admin payout field.
--
-- Safe to apply: every column/constraint being dropped here was added by
-- that same prior migration earlier in this same feature and — verified
-- directly against this database before writing this file — holds zero
-- rows of real data (0 ProfessionalEarning.adminId, 0
-- ProfessionalPayoutRecord.adminId, 0 Admin rows with any payout field
-- set). No production data of any kind is lost by this migration.

-- Drop the raw-SQL XOR CHECK constraints added by the prior migration
-- before dropping the columns they reference.
ALTER TABLE "ProfessionalEarning" DROP CONSTRAINT IF EXISTS "ProfessionalEarning_seller_xor_admin";
ALTER TABLE "ProfessionalPayoutRecord" DROP CONSTRAINT IF EXISTS "ProfessionalPayoutRecord_seller_xor_admin";

-- DropForeignKey
ALTER TABLE "ProfessionalEarning" DROP CONSTRAINT "ProfessionalEarning_adminId_fkey";
ALTER TABLE "ProfessionalEarning" DROP CONSTRAINT "ProfessionalEarning_sellerId_fkey";
ALTER TABLE "ProfessionalPayoutRecord" DROP CONSTRAINT "ProfessionalPayoutRecord_adminId_fkey";
ALTER TABLE "ProfessionalPayoutRecord" DROP CONSTRAINT "ProfessionalPayoutRecord_sellerId_fkey";

-- DropIndex
DROP INDEX "ProfessionalEarning_adminId_idx";
DROP INDEX "ProfessionalPayoutRecord_adminId_idx";

-- AlterTable — remove every Admin Expert-payout field. Admin has NO Expert
-- payout account, full stop.
ALTER TABLE "Admin"
  DROP COLUMN "payoutAccountHolderName",
  DROP COLUMN "payoutBankAccountEncrypted",
  DROP COLUMN "payoutBankName",
  DROP COLUMN "payoutEligibilityStatus",
  DROP COLUMN "payoutIfscEncrypted",
  DROP COLUMN "payoutUpiIdEncrypted";

-- AlterTable — back to Seller-only, sellerId required again (its original
-- Phase 4B shape).
ALTER TABLE "ProfessionalEarning"
  DROP COLUMN "adminId",
  ALTER COLUMN "sellerId" SET NOT NULL;

ALTER TABLE "ProfessionalPayoutRecord"
  DROP COLUMN "adminId",
  ALTER COLUMN "sellerId" SET NOT NULL;

-- AddForeignKey — RESTRICT (not SET NULL), matching the original Phase 4B
-- behavior for a required relation.
ALTER TABLE "ProfessionalEarning" ADD CONSTRAINT "ProfessionalEarning_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProfessionalPayoutRecord" ADD CONSTRAINT "ProfessionalPayoutRecord_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
