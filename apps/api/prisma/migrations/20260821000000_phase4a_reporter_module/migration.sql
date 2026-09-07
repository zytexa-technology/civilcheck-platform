-- Phase 4A: Partner Expansion + Reporter Module
-- Additive only — no table drops, no destructive column changes. Reviewed
-- row counts (Seller/Property/Listing all 0 in the live DB at generation
-- time) before writing this, per this project's migration discipline.

-- CreateEnum
CREATE TYPE "RewardTransactionType" AS ENUM ('EARNED', 'ADMIN_ADJUSTMENT', 'REDEMPTION');

-- CreateEnum
CREATE TYPE "RewardTransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RedeemRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum — Reporter moderation (suspend a previously-approved property)
ALTER TYPE "PropertyStatus" ADD VALUE 'SUSPENDED';

-- AlterTable — Reporter Reward Ledger config (never hardcode this value elsewhere)
ALTER TABLE "PlatformSetting" ADD COLUMN     "reporterRewardPointsPerApprovedProperty" INTEGER NOT NULL DEFAULT 10;

-- AlterTable — Partner account soft-deletion (Seller cannot be hard-deleted; see schema.prisma comment)
ALTER TABLE "Seller" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RewardTransaction" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" "RewardTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "status" "RewardTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "propertyId" TEXT,
    "reason" TEXT,
    "decidedByAdminId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedeemRequest" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT,
    "status" "RedeemRequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "resolvedByAdminId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedeemRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardTransaction_sellerId_idx" ON "RewardTransaction"("sellerId");

-- CreateIndex
CREATE INDEX "RewardTransaction_status_idx" ON "RewardTransaction"("status");

-- CreateIndex
CREATE INDEX "RewardTransaction_type_idx" ON "RewardTransaction"("type");

-- CreateIndex
CREATE INDEX "RedeemRequest_sellerId_idx" ON "RedeemRequest"("sellerId");

-- CreateIndex
CREATE INDEX "RedeemRequest_status_idx" ON "RedeemRequest"("status");

-- AddForeignKey
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeemRequest" ADD CONSTRAINT "RedeemRequest_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
