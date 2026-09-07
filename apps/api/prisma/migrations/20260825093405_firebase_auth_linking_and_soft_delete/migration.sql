-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'DELETED';

-- AlterTable
--
-- Prisma's shadow-DB diff generates a spurious
-- `ALTER TABLE "Listing" ALTER COLUMN "searchVector" DROP DEFAULT;` here on
-- every migration touching unrelated tables, because "searchVector" is a raw
-- SQL `GENERATED ALWAYS AS (...) STORED` column (declared `Unsupported` in
-- schema.prisma) that Prisma's diffing doesn't model correctly. Postgres
-- rejects ALTER COLUMN ... DROP DEFAULT on a generated column outright, so
-- this line is removed by hand — same as every prior migration that hit it.
ALTER TABLE "Admin" ADD COLUMN     "firebaseUid" TEXT;

-- AlterTable
ALTER TABLE "Seller" ADD COLUMN     "firebaseUid" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "firebaseUid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Admin_firebaseUid_key" ON "Admin"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_firebaseUid_key" ON "Seller"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
