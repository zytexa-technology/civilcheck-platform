-- Phase 4C: Buyer Marketplace + AI/Human Support + Notifications
-- Additive only — no table drops, no destructive column changes. Row counts
-- verified empty (business tables) immediately before writing this migration.

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'AI_ASSISTED', 'ESCALATED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('ACCOUNT', 'PROPERTY', 'VERIFICATION', 'PAYMENT', 'CANCELLATION', 'CLAIM', 'PLATFORM', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportMessageSender" AS ENUM ('USER', 'AI', 'ADMIN', 'SYSTEM');

-- DropForeignKey (recreated below with ON DELETE SET NULL, now that sellerId is optional)
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_sellerId_fkey";

-- AlterTable — Notification gains a buyer in-app inbox alongside the existing seller one
ALTER TABLE "Notification" ADD COLUMN     "userId" TEXT,
ALTER COLUMN "sellerId" DROP NOT NULL;

-- Exactly one of sellerId/userId — same XOR-by-CHECK pattern as Refund/VerificationRequest
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_seller_xor_user"
  CHECK (("sellerId" IS NOT NULL AND "userId" IS NULL) OR ("sellerId" IS NULL AND "userId" IS NOT NULL));

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sellerId" TEXT,
    "category" "SupportTicketCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "aiSummary" TEXT,
    "aiReplyCount" INTEGER NOT NULL DEFAULT 0,
    "assignedAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- Exactly one of userId/sellerId — same XOR-by-CHECK pattern as above
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_user_xor_seller"
  CHECK (("userId" IS NOT NULL AND "sellerId" IS NULL) OR ("userId" IS NULL AND "sellerId" IS NOT NULL));

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sender" "SupportMessageSender" NOT NULL,
    "senderAdminId" TEXT,
    "body" TEXT NOT NULL,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_sellerId_idx" ON "SupportTicket"("sellerId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedAdminId_idx" ON "SupportTicket"("assignedAdminId");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_idx" ON "SupportMessage"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportKnowledgeEntry_key_key" ON "SupportKnowledgeEntry"("key");

-- CreateIndex
CREATE INDEX "SupportKnowledgeEntry_active_topic_idx" ON "SupportKnowledgeEntry"("active", "topic");

-- CreateIndex
CREATE INDEX "Notification_sellerId_idx" ON "Notification"("sellerId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
