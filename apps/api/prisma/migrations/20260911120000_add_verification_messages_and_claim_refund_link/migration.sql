-- CreateEnum
CREATE TYPE "VerificationMessageSender" AS ENUM ('BUYER', 'PROFESSIONAL');

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "claimId" TEXT;

-- CreateTable
CREATE TABLE "VerificationMessage" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "senderRole" "VerificationMessageSender" NOT NULL,
    "senderUserId" TEXT,
    "senderSellerId" TEXT,
    "senderAdminId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationMessage_verificationRequestId_idx" ON "VerificationMessage"("verificationRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_claimId_key" ON "Refund"("claimId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationMessage" ADD CONSTRAINT "VerificationMessage_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
