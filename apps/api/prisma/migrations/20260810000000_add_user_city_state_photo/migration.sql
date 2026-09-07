-- AlterTable
-- Partner Module item 1.6 — Basic Profile: City/State (mandatory at first login,
-- enforced client-side) + optional photo for buyers (the User table).
-- Additive and nullable, so existing rows are unaffected.
ALTER TABLE "User" ADD COLUMN     "city" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "photoUrl" TEXT;
