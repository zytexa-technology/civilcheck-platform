-- Real login OTPs (QA audit 2026-08-03, finding #1) — replaces the hardcoded
-- '123456' with a hashed, expiring, single-use code. See lib/otp.ts.

-- CreateEnum
CREATE TYPE "OtpRole" AS ENUM ('BUYER', 'SELLER');

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "OtpRole" NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_phone_role_consumed_idx" ON "OtpCode"("phone", "role", "consumed");
