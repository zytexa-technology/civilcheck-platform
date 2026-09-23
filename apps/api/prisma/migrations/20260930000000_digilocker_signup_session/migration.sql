-- Pre-account DigiLocker verification for Partner signup.
--
-- ADDITIVE ONLY: creates one new table. No column is dropped, altered or
-- renamed, no existing row is touched, and no data is deleted. The legacy
-- Aadhaar signup tables/columns (PartnerKycSession, Seller.aadhaar*) are left
-- exactly as they are for historical records.

-- CreateTable
CREATE TABLE "DigilockerSignupSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "stateHash" TEXT,
    "status" "DigilockerStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedName" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigilockerSignupSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigilockerSignupSession_tokenHash_key" ON "DigilockerSignupSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DigilockerSignupSession_stateHash_key" ON "DigilockerSignupSession"("stateHash");

-- CreateIndex
CREATE INDEX "DigilockerSignupSession_expiresAt_idx" ON "DigilockerSignupSession"("expiresAt");

-- CreateIndex
CREATE INDEX "DigilockerSignupSession_status_idx" ON "DigilockerSignupSession"("status");
