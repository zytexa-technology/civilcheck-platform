-- Advertising refunds for rejected, never-started campaigns. Additive only.
CREATE TYPE "AdRefundStatus" AS ENUM ('NOT_REQUIRED','PENDING','PROCESSING','REFUNDED','FAILED');
ALTER TABLE "AdvertisingPayment" ADD COLUMN "refundStatus" "AdRefundStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "AdvertisingPayment" ADD COLUMN "refundAmountPaise" BIGINT;
ALTER TABLE "AdvertisingPayment" ADD COLUMN "razorpayRefundId" TEXT;
ALTER TABLE "AdvertisingPayment" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "AdvertisingPayment" ADD COLUMN "refundError" TEXT;
CREATE UNIQUE INDEX "AdvertisingPayment_razorpayRefundId_key" ON "AdvertisingPayment"("razorpayRefundId");
