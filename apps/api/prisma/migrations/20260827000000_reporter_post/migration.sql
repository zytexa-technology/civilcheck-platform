-- CreateEnum
CREATE TYPE "ReporterPostStatus" AS ENUM ('PUBLISHED', 'REMOVED');

-- CreateTable
CREATE TABLE "ReporterPost" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceName" TEXT,
    "sourceDate" TIMESTAMP(3),
    "city" TEXT,
    "tehsil" TEXT,
    "status" "ReporterPostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReporterPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReporterPost_status_idx" ON "ReporterPost"("status");

-- CreateIndex
CREATE INDEX "ReporterPost_sellerId_idx" ON "ReporterPost"("sellerId");

-- AddForeignKey
ALTER TABLE "ReporterPost" ADD CONSTRAINT "ReporterPost_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
