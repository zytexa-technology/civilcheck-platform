-- Excludes an unrelated pre-existing drift line (Listing.searchVector DROP
-- DEFAULT) that appeared in the raw `prisma migrate diff` output — not part
-- of this change.
ALTER TABLE "Admin" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
