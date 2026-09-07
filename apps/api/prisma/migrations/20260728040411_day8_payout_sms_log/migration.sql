-- CreateTable
CREATE TABLE "SpecialRequestPayout" (
    "id" TEXT NOT NULL,
    "specialRequestId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "platformCut" DOUBLE PRECISION NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialRequestPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsDeliveryLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecialRequestPayout_specialRequestId_key" ON "SpecialRequestPayout"("specialRequestId");

-- CreateIndex
CREATE INDEX "SpecialRequestPayout_sellerId_idx" ON "SpecialRequestPayout"("sellerId");

-- CreateIndex
CREATE INDEX "SpecialRequestPayout_settled_idx" ON "SpecialRequestPayout"("settled");

-- CreateIndex
CREATE UNIQUE INDEX "SmsDeliveryLog_requestId_key" ON "SmsDeliveryLog"("requestId");

-- AddForeignKey
ALTER TABLE "SpecialRequestPayout" ADD CONSTRAINT "SpecialRequestPayout_specialRequestId_fkey" FOREIGN KEY ("specialRequestId") REFERENCES "SpecialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialRequestPayout" ADD CONSTRAINT "SpecialRequestPayout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
