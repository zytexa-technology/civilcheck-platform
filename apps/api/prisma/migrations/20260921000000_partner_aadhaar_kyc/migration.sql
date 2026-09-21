-- Mandatory signup Aadhaar KYC — additive only.
CREATE TYPE "AadhaarKycStatus" AS ENUM ('OTP_PENDING', 'OTP_VERIFIED', 'DOCUMENT_PENDING', 'VERIFIED', 'FAILED');

ALTER TABLE "Seller" ADD COLUMN "aadhaarKycStatus" "AadhaarKycStatus";
ALTER TABLE "Seller" ADD COLUMN "aadhaarHash" TEXT;
ALTER TABLE "Seller" ADD COLUMN "aadhaarLast4" TEXT;
ALTER TABLE "Seller" ADD COLUMN "aadhaarVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Seller_aadhaarHash_key" ON "Seller"("aadhaarHash");

CREATE TABLE "PartnerKycSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "AadhaarKycStatus" NOT NULL DEFAULT 'OTP_PENDING',
  "aadhaarHash" TEXT NOT NULL,
  "aadhaarLast4" TEXT NOT NULL,
  "providerRef" TEXT,
  "otpSendCount" INTEGER NOT NULL DEFAULT 0,
  "otpAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastOtpAt" TIMESTAMP(3),
  "documentUrl" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "sellerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerKycSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerKycSession_tokenHash_key" ON "PartnerKycSession"("tokenHash");
CREATE UNIQUE INDEX "PartnerKycSession_sellerId_key" ON "PartnerKycSession"("sellerId");
CREATE INDEX "PartnerKycSession_aadhaarHash_createdAt_idx" ON "PartnerKycSession"("aadhaarHash", "createdAt");
CREATE INDEX "PartnerKycSession_expiresAt_idx" ON "PartnerKycSession"("expiresAt");
ALTER TABLE "PartnerKycSession" ADD CONSTRAINT "PartnerKycSession_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
