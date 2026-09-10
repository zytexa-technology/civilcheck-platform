-- Signup Email Verification — Buyer + Partner
--
-- 1. address + emailVerified on User and Seller. emailVerified defaults to
--    true so every pre-existing row (created before this feature existed) is
--    automatically treated as verified with zero migration-time action;
--    registerBuyer/sellerRegister explicitly write `false` at creation time
--    for every NEW signup going forward.
-- 2. A `purpose` discriminator on the existing PasswordResetOtp table so
--    Signup Email Verification can reuse it instead of a parallel table —
--    same actor-XOR shape, same hash/expiry/attempts/single-use security
--    model. Defaults to PASSWORD_RESET so every pre-existing row is
--    unaffected; passwordReset.service.ts's own queries are updated
--    alongside this migration to filter on it explicitly.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "address" TEXT,
                    ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Seller" ADD COLUMN "address" TEXT,
                      ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION');

-- AlterTable
ALTER TABLE "PasswordResetOtp" ADD COLUMN "purpose" "OtpPurpose" NOT NULL DEFAULT 'PASSWORD_RESET';

-- CreateIndex
CREATE INDEX "PasswordResetOtp_userId_purpose_idx" ON "PasswordResetOtp"("userId", "purpose");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_sellerId_purpose_idx" ON "PasswordResetOtp"("sellerId", "purpose");
