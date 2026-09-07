-- AlterTable
--
-- Prisma's shadow-DB diff generates a spurious
-- `ALTER TABLE "Listing" ALTER COLUMN "searchVector" DROP DEFAULT;` here on
-- every migration touching unrelated tables, because "searchVector" is a raw
-- SQL `GENERATED ALWAYS AS (...) STORED` column (declared `Unsupported` in
-- schema.prisma) that Prisma's diffing doesn't model correctly. Postgres
-- rejects ALTER COLUMN ... DROP DEFAULT on a generated column outright, so
-- this line is removed by hand — same as every prior migration that hit it
-- (see 20260731182802_add_seller_city_state and others).
ALTER TABLE "User" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Alert_userId_listingId_idx" ON "Alert"("userId", "listingId");

-- CreateIndex
CREATE INDEX "Alert_listingId_active_idx" ON "Alert"("listingId", "active");

-- CreateIndex
CREATE INDEX "Alert_active_idx" ON "Alert"("active");

-- CreateIndex
CREATE INDEX "Purchase_userId_listingId_idx" ON "Purchase"("userId", "listingId");

-- CreateIndex
CREATE INDEX "Purchase_settled_idx" ON "Purchase"("settled");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "Refund_purchaseId_idx" ON "Refund"("purchaseId");

-- CreateIndex
CREATE INDEX "Refund_specialRequestId_idx" ON "Refund"("specialRequestId");

-- CreateIndex
CREATE INDEX "SpecialRequest_userId_idx" ON "SpecialRequest"("userId");

-- CreateIndex
CREATE INDEX "SpecialRequest_sellerId_idx" ON "SpecialRequest"("sellerId");

-- CreateIndex
CREATE INDEX "SpecialRequest_status_idx" ON "SpecialRequest"("status");
