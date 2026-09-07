-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

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
ALTER TABLE "Seller" ADD COLUMN     "identityDocumentRejectionReason" TEXT,
ADD COLUMN     "identityDocumentReviewedAt" TIMESTAMP(3),
ADD COLUMN     "identityDocumentReviewedByAdminId" TEXT,
ADD COLUMN     "identityDocumentUploadedAt" TIMESTAMP(3),
ADD COLUMN     "identityDocumentUrl" TEXT,
ADD COLUMN     "identityVerificationStatus" "IdentityVerificationStatus";
