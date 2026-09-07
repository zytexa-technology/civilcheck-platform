-- Fix Notification.sellerId/userId FK delete actions.
--
-- The 20260821020000_phase4c_support_and_buyer_notifications migration
-- recreated Notification_sellerId_fkey as ON DELETE SET NULL (Prisma's
-- implicit default once sellerId became optional) but did not account for
-- the Notification_seller_xor_user CHECK constraint added in that same
-- migration. As a result, a hard delete of a Seller or User row that has an
-- in-app Notification would try to null out sellerId/userId, which
-- immediately violates the XOR CHECK constraint.
--
-- In practice this has never fired: the application always soft-deletes
-- Seller/User rows (deletedAt), never a hard prisma.seller.delete()/
-- prisma.user.delete() (see admin.controller.ts's deleteSeller). This
-- migration restores ON DELETE RESTRICT — the same default every other
-- required Seller/User relation in this schema already uses — so a hard
-- delete attempt fails cleanly with a foreign key error instead of crashing
-- on the CHECK constraint or silently corrupting a Notification row.
--
-- Schema-only change. No data is modified, no rows are read or written.
-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
