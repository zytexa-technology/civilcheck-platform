-- Seller.partnerRole: free-text String? -> real PartnerRole enum
-- (OWNER | REPORTER | EXPERT). Part of the Phase 1 role-architecture
-- foundation (brief: "PARTNER has a subtype... use a clean role/sub-role
-- architecture") — previously any string could be written to this column.
--
-- Written by hand rather than using `prisma migrate diff`'s auto-generated
-- DROP COLUMN + ADD COLUMN: an in-place ALTER COLUMN ... TYPE ... USING cast
-- preserves the column instead of dropping it, even though the Seller table
-- had 0 rows in production at the time this migration was written (verified
-- before writing it) — matches this project's policy of never dropping
-- anything from a live table when an equivalent non-destructive path exists.
--
-- NOTE: the generated `ALTER TABLE "Listing" ALTER COLUMN "searchVector" DROP
-- DEFAULT` line was again omitted — the same recurring Prisma/tsvector
-- generated-column false positive documented in docs/roadmap.md.

-- CreateEnum
CREATE TYPE "PartnerRole" AS ENUM ('OWNER', 'REPORTER', 'EXPERT');

-- AlterTable (in-place cast, not drop+add)
ALTER TABLE "Seller"
  ALTER COLUMN "partnerRole" TYPE "PartnerRole"
  USING ("partnerRole"::"PartnerRole");
