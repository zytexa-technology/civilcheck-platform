-- Phase 2: Property System foundation.
--
-- Listing.uploaderRole / Property.uploaderRole are NOT NULL with no default —
-- safe only because both tables were confirmed to have 0 rows in production
-- immediately before this migration was written. Everything else is a
-- nullable or defaulted additive column.
--
-- NOTE: the generated `ALTER TABLE "Listing" ALTER COLUMN "searchVector" DROP
-- DEFAULT` line from `prisma migrate diff` was again omitted — the same
-- recurring Prisma/tsvector generated-column false positive documented in
-- docs/roadmap.md (Day 6 decisions).

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "uploaderRole" "PartnerRole" NOT NULL,
ADD COLUMN     "videos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "address" TEXT,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "tehsil" TEXT,
ADD COLUMN     "uploaderRole" "PartnerRole" NOT NULL,
ADD COLUMN     "videos" TEXT[] DEFAULT ARRAY[]::TEXT[];
