-- Mandatory Terms & Conditions / Privacy Policy acceptance system.
--
-- Additive-only: creates one new table, no existing table/column is
-- altered or dropped. Hand-curated from `prisma migrate diff` output — the
-- raw diff also included an unrelated `ALTER TABLE "Listing" ALTER COLUMN
-- "searchVector" DROP DEFAULT` line (pre-existing drift from a full-text
-- search column, unrelated to this feature) which is deliberately excluded
-- here, per this repo's established "hand-curate the diff, never apply it
-- wholesale" migration workflow.

-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sellerId" TEXT,
    "version" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TermsAcceptance_userId_idx" ON "TermsAcceptance"("userId");

-- CreateIndex
CREATE INDEX "TermsAcceptance_sellerId_idx" ON "TermsAcceptance"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "TermsAcceptance_userId_version_key" ON "TermsAcceptance"("userId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TermsAcceptance_sellerId_version_key" ON "TermsAcceptance"("sellerId", "version");

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- XOR CHECK — exactly one of userId/sellerId must be set (same actor-XOR
-- convention as PasswordResetOtp's three-way XOR, narrowed to two actors
-- here since Admin is out of scope for mandatory ToS acceptance).
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_user_xor_seller" CHECK (
    (("userId" IS NOT NULL)::int + ("sellerId" IS NOT NULL)::int) = 1
);
