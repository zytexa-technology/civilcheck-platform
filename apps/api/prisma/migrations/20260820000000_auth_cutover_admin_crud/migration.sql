-- Auth cutover (email + password for Buyer/Partner, phone stays mandatory) +
-- Admin management (active/blocked flags for Super Admin CRUD).
--
-- Purely additive: two nullable columns, two unique indexes, two booleans
-- with defaults. Nothing dropped — OtpCode/SmsDeliveryLog/OtpRole stay in the
-- schema, unused, rather than being dropped from production (see
-- schema.prisma comments on those models).
--
-- NOTE: the generated `ALTER TABLE "Listing" ALTER COLUMN "searchVector" DROP
-- DEFAULT` line from `prisma migrate diff` was deliberately omitted here — a
-- known Prisma/tsvector generated-column false-positive documented in
-- docs/roadmap.md (Day 6 decisions), stripped by hand the same way each time
-- it has recurred.

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Seller" ADD COLUMN     "passwordHash" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Seller_email_key" ON "Seller"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
