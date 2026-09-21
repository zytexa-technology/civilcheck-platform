-- Additive only: nullable/defaulted columns + one index. No existing row is
-- modified, so pre-existing Reporter posts are untouched.
ALTER TABLE "ReporterPost" ADD COLUMN     "address" TEXT,
ADD COLUMN     "addressNormalized" TEXT,
ADD COLUMN     "imageHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "ReporterPost_addressNormalized_idx" ON "ReporterPost"("addressNormalized");
