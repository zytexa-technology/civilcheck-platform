-- Phase 4B: Financial Ledger + Professional Payout Foundation
-- Additive only — no table drops, no destructive column changes. Row counts
-- (PaymentOrder/VerificationRequest/Refund/Seller/User all 0, 1 real Admin)
-- verified immediately before writing this migration.

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('GROSS_PAYMENT', 'PLATFORM_COMMISSION', 'PROFESSIONAL_EARNING', 'PROCESSING_FEE', 'CANCELLATION_FEE', 'REFUND', 'REVERSAL_COMMISSION', 'REVERSAL_EARNING');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('RECORDED', 'REVERSED', 'REQUIRES_RECONCILIATION');

-- CreateEnum
CREATE TYPE "ProfessionalEarningStatus" AS ENUM ('EARNED', 'PENDING_SETTLEMENT', 'AVAILABLE_FOR_PAYOUT', 'PAYOUT_REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'RETRYABLE', 'MANUAL_REVIEW', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutRecordStatus" AS ENUM ('PAYOUT_REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'RETRYABLE', 'MANUAL_REVIEW', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutMechanism" AS ENUM ('RAZORPAYX_PAYOUT', 'RAZORPAY_ROUTE');

-- CreateEnum
CREATE TYPE "ReconciliationIssueType" AS ENUM ('AMOUNT_MISMATCH', 'COMMISSION_MISMATCH', 'PAYOUT_MISMATCH', 'REFUND_MISMATCH', 'TRANSFER_FAILURE', 'MISSING_INTERNAL_RECORD', 'MISSING_REMOTE_RECORD');

-- CreateEnum
CREATE TYPE "ReconciliationIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PayoutEligibilityStatus" AS ENUM ('PENDING_ONBOARDING', 'ELIGIBLE', 'INELIGIBLE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Seller" ADD COLUMN     "payoutEligibilityStatus" "PayoutEligibilityStatus" NOT NULL DEFAULT 'PENDING_ONBOARDING',
ADD COLUMN     "razorpayLinkedAccountId" TEXT;

-- CreateTable
CREATE TABLE "FinancialLedgerEntry" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT,
    "paymentOrderId" TEXT,
    "refundId" TEXT,
    "userId" TEXT,
    "sellerId" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'RECORDED',
    "commissionRateSnapshot" DOUBLE PRECISION,
    "reversesEntryId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalEarning" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "grossEarningPaise" INTEGER NOT NULL,
    "status" "ProfessionalEarningStatus" NOT NULL DEFAULT 'EARNED',
    "payoutRecordId" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalPayoutRecord" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "totalAmountPaise" INTEGER NOT NULL,
    "status" "PayoutRecordStatus" NOT NULL DEFAULT 'PAYOUT_REQUESTED',
    "mechanism" "PayoutMechanism",
    "razorpayPayoutId" TEXT,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalPayoutRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationIssue" (
    "id" TEXT NOT NULL,
    "type" "ReconciliationIssueType" NOT NULL,
    "reference" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" "ReconciliationIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByAdminId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialLedgerEntry_idempotencyKey_key" ON "FinancialLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_verificationRequestId_idx" ON "FinancialLedgerEntry"("verificationRequestId");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_paymentOrderId_idx" ON "FinancialLedgerEntry"("paymentOrderId");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_sellerId_idx" ON "FinancialLedgerEntry"("sellerId");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_userId_idx" ON "FinancialLedgerEntry"("userId");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_type_idx" ON "FinancialLedgerEntry"("type");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_status_idx" ON "FinancialLedgerEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalEarning_paymentOrderId_key" ON "ProfessionalEarning"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalEarning_ledgerEntryId_key" ON "ProfessionalEarning"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "ProfessionalEarning_sellerId_idx" ON "ProfessionalEarning"("sellerId");

-- CreateIndex
CREATE INDEX "ProfessionalEarning_status_idx" ON "ProfessionalEarning"("status");

-- CreateIndex
CREATE INDEX "ProfessionalEarning_payoutRecordId_idx" ON "ProfessionalEarning"("payoutRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalPayoutRecord_razorpayPayoutId_key" ON "ProfessionalPayoutRecord"("razorpayPayoutId");

-- CreateIndex
CREATE INDEX "ProfessionalPayoutRecord_sellerId_idx" ON "ProfessionalPayoutRecord"("sellerId");

-- CreateIndex
CREATE INDEX "ProfessionalPayoutRecord_status_idx" ON "ProfessionalPayoutRecord"("status");

-- CreateIndex
CREATE INDEX "ReconciliationIssue_status_idx" ON "ReconciliationIssue"("status");

-- CreateIndex
CREATE INDEX "ReconciliationIssue_type_idx" ON "ReconciliationIssue"("type");

-- AddForeignKey
ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalEarning" ADD CONSTRAINT "ProfessionalEarning_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalEarning" ADD CONSTRAINT "ProfessionalEarning_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalEarning" ADD CONSTRAINT "ProfessionalEarning_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalEarning" ADD CONSTRAINT "ProfessionalEarning_payoutRecordId_fkey" FOREIGN KEY ("payoutRecordId") REFERENCES "ProfessionalPayoutRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalPayoutRecord" ADD CONSTRAINT "ProfessionalPayoutRecord_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
