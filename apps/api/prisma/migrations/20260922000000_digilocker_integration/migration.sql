-- DigiLocker integration groundwork — additive only.
CREATE TYPE "DigilockerStatus" AS ENUM ('VERIFIED', 'FAILED');

ALTER TABLE "Seller" ADD COLUMN "digilockerStatus" "DigilockerStatus";
ALTER TABLE "Seller" ADD COLUMN "digilockerProvider" TEXT;
ALTER TABLE "Seller" ADD COLUMN "digilockerVerifiedAt" TIMESTAMP(3);

CREATE TABLE "DigilockerAuthState" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "mock" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DigilockerAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DigilockerAuthState_stateHash_key" ON "DigilockerAuthState"("stateHash");
CREATE INDEX "DigilockerAuthState_sellerId_idx" ON "DigilockerAuthState"("sellerId");
CREATE INDEX "DigilockerAuthState_expiresAt_idx" ON "DigilockerAuthState"("expiresAt");
ALTER TABLE "DigilockerAuthState" ADD CONSTRAINT "DigilockerAuthState_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
