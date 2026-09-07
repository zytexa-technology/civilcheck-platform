-- Password-reset OTP (email-delivered via Resend) for Admin (SUPER_ADMIN
-- only, enforced in the service layer)/Seller/User. Exactly one of
-- adminId/sellerId/userId is set — same XOR-by-CHECK pattern already used by
-- Notification. All three FKs are ON DELETE RESTRICT from the start (see
-- the 20260905090000_fix_notification_delete_actions migration for why
-- SetNull would be wrong here too).
-- CreateTable
CREATE TABLE "PasswordResetOtp" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "sellerId" TEXT,
    "userId" TEXT,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasswordResetOtp_adminId_idx" ON "PasswordResetOtp"("adminId");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_sellerId_idx" ON "PasswordResetOtp"("sellerId");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_userId_idx" ON "PasswordResetOtp"("userId");

-- AddForeignKey
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one of adminId/sellerId/userId — same XOR-by-CHECK pattern as
-- Notification_seller_xor_user.
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_actor_xor"
  CHECK (
    (("adminId" IS NOT NULL)::int + ("sellerId" IS NOT NULL)::int + ("userId" IS NOT NULL)::int) = 1
  );
