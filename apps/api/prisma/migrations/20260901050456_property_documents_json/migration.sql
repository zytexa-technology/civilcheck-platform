-- Audit 2026-09-01 (Admin Document Type Visibility) — Property.documents
-- moves from text[] to jsonb so each document can carry its type alongside
-- its URL: [{ "type": "SALE_DEED", "url": "..." }, ...].
--
-- SAFE, non-destructive conversion: existing rows are cast in place with
-- to_jsonb(), preserving every URL that was already stored. A pre-migration
-- row like {"https://.../a.pdf"} becomes the jsonb array
-- ["https://.../a.pdf"] — the URL is preserved byte-for-byte, it just has no
-- `type` (none was ever captured for it). No row is dropped, no URL is lost.
-- The original column was nullable text[] with no NOT NULL constraint (see
-- migrations/20260716043453_init), so a NULL is coalesced to an empty array
-- before conversion — otherwise to_jsonb(NULL) would violate the new NOT
-- NULL constraint below.
--
-- Hand-edited from the Prisma-generated migration, which defaulted to a
-- destructive DROP COLUMN + ADD COLUMN (would have discarded all existing
-- document URLs). The auto-generated
-- `ALTER TABLE "Listing" ALTER COLUMN "searchVector" DROP DEFAULT;` line was
-- also removed — searchVector is an Unsupported("tsvector") generated
-- column Prisma always spuriously re-diffs; it isn't a real schema change
-- and has been stripped from every migration this project generates.

ALTER TABLE "Property"
  ALTER COLUMN "documents" DROP DEFAULT,
  ALTER COLUMN "documents" TYPE JSONB USING to_jsonb(COALESCE("documents", ARRAY[]::TEXT[])),
  ALTER COLUMN "documents" SET DEFAULT '[]',
  ALTER COLUMN "documents" SET NOT NULL;
