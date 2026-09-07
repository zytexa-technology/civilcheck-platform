-- CreateEnum
CREATE TYPE "FeedTargetType" AS ENUM ('LISTING', 'PROPERTY', 'REPORTER_POST');

-- CreateTable
CREATE TABLE "PropertyLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "FeedTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertySave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "FeedTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertySave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "FeedTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyLike_targetType_targetId_idx" ON "PropertyLike"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLike_userId_targetType_targetId_key" ON "PropertyLike"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "PropertySave_targetType_targetId_idx" ON "PropertySave"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertySave_userId_targetType_targetId_key" ON "PropertySave"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "PropertyComment_targetType_targetId_createdAt_idx" ON "PropertyComment"("targetType", "targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "PropertyLike" ADD CONSTRAINT "PropertyLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertySave" ADD CONSTRAINT "PropertySave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyComment" ADD CONSTRAINT "PropertyComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
