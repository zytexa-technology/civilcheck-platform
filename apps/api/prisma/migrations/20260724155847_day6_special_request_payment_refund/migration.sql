-- DropForeignKey
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_purchaseId_fkey";

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN     "specialRequestId" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "specialRequestId" TEXT,
ALTER COLUMN "purchaseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SpecialRequest" ADD COLUMN     "advancePaid" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_specialRequestId_fkey" FOREIGN KEY ("specialRequestId") REFERENCES "SpecialRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_specialRequestId_fkey" FOREIGN KEY ("specialRequestId") REFERENCES "SpecialRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: a refund reverses either a purchase or a special-request
-- advance, never both and never neither. Prisma's schema language has no
-- declarative XOR-across-columns, so this is hand-added raw SQL.
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_purchase_xor_specialRequest"
  CHECK (
    (("purchaseId" IS NOT NULL)::int + ("specialRequestId" IS NOT NULL)::int) = 1
  );
