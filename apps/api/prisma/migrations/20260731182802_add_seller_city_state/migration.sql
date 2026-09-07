-- AlterTable
-- NOTE: prisma migrate dev's shadow-database diff also generated
--   ALTER TABLE "Listing" ALTER COLUMN "searchVector" DROP DEFAULT;
-- here, because "searchVector" is a Postgres GENERATED ALWAYS AS column
-- (Prisma has no schema syntax for that — declared `Unsupported("tsvector")`,
-- see schema.prisma) and the shadow DB doesn't replay that raw-SQL-created
-- generated expression the same way. Postgres correctly rejected it
-- (generated columns can't have their default altered), so it was removed
-- here rather than applied — this migration only touches Seller.
ALTER TABLE "Seller" ADD COLUMN     "city" TEXT,
ADD COLUMN     "state" TEXT;
