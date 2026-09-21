-- Advertising platform (additive: new tables/enums only).
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT','PAYMENT_PENDING','PENDING_APPROVAL','ACTIVE','PAUSED','REJECTED','EXHAUSTED','EXPIRED','COMPLETED');
CREATE TYPE "AdCreativeType" AS ENUM ('IMAGE','VIDEO');
CREATE TYPE "AdPlatform" AS ENUM ('WEB','MOBILE','BOTH');
CREATE TYPE "AdPlacement" AS ENUM ('BUYER_FEED');
CREATE TYPE "AdPaymentStatus" AS ENUM ('CREATED','PAID','FAILED');
CREATE TYPE "AdEventType" AS ENUM ('IMPRESSION','CLICK');

CREATE TABLE "Advertiser" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "companyName" TEXT NOT NULL, "email" TEXT NOT NULL, "phone" TEXT,
  "passwordHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Advertiser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Advertiser_email_key" ON "Advertiser"("email");

CREATE TABLE "AdCampaign" (
  "id" TEXT NOT NULL, "advertiserId" TEXT NOT NULL, "businessName" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
  "creativeType" "AdCreativeType" NOT NULL, "creativeUrl" TEXT NOT NULL, "ctaText" TEXT NOT NULL, "destinationUrl" TEXT NOT NULL,
  "platform" "AdPlatform" NOT NULL DEFAULT 'BOTH', "placement" "AdPlacement" NOT NULL DEFAULT 'BUYER_FEED',
  "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "budgetPaise" BIGINT NOT NULL, "spentPaise" BIGINT NOT NULL DEFAULT 0, "cpmPaise" INTEGER NOT NULL,
  "impressions" INTEGER NOT NULL DEFAULT 0, "clicks" INTEGER NOT NULL DEFAULT 0,
  "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3), "rejectionReason" TEXT, "approvedAt" TIMESTAMP(3), "approvedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdCampaign_min_budget_chk" CHECK ("budgetPaise" >= 10000),
  CONSTRAINT "AdCampaign_spend_within_budget_chk" CHECK ("spentPaise" >= 0 AND "spentPaise" <= "budgetPaise")
);
CREATE INDEX "AdCampaign_advertiserId_idx" ON "AdCampaign"("advertiserId");
CREATE INDEX "AdCampaign_status_idx" ON "AdCampaign"("status");
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AdvertisingPayment" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "razorpayOrderId" TEXT NOT NULL, "razorpayPaymentId" TEXT,
  "amountPaise" BIGINT NOT NULL, "status" "AdPaymentStatus" NOT NULL DEFAULT 'CREATED', "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvertisingPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdvertisingPayment_razorpayOrderId_key" ON "AdvertisingPayment"("razorpayOrderId");
CREATE INDEX "AdvertisingPayment_campaignId_idx" ON "AdvertisingPayment"("campaignId");
ALTER TABLE "AdvertisingPayment" ADD CONSTRAINT "AdvertisingPayment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AdEvent" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "type" "AdEventType" NOT NULL, "nonce" TEXT NOT NULL,
  "platform" "AdPlatform" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdEvent_type_nonce_key" ON "AdEvent"("type","nonce");
CREATE INDEX "AdEvent_campaignId_type_idx" ON "AdEvent"("campaignId","type");
ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
