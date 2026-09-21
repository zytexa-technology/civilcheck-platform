-- Clear / Disputed classification for Expert listings and Owner properties.
-- Additive only: nullable columns, no back-fill (legacy rows stay NULL = unclassified).
CREATE TYPE "PropertyClassification" AS ENUM ('CLEAR', 'DISPUTED');
CREATE TYPE "DisputeType" AS ENUM ('CIVIL', 'CRIMINAL', 'OTHER');

ALTER TABLE "Listing" ADD COLUMN "propertyStatus" "PropertyClassification";
ALTER TABLE "Listing" ADD COLUMN "disputeType" "DisputeType";
ALTER TABLE "Property" ADD COLUMN "propertyStatus" "PropertyClassification";
ALTER TABLE "Property" ADD COLUMN "disputeType" "DisputeType";

-- Defence in depth: invalid combinations can never be stored, whatever the caller.
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_classification_chk" CHECK (
  ("propertyStatus" IS NULL AND "disputeType" IS NULL)
  OR ("propertyStatus" = 'CLEAR' AND "disputeType" IS NULL)
  OR ("propertyStatus" = 'DISPUTED' AND "disputeType" IS NOT NULL));
ALTER TABLE "Property" ADD CONSTRAINT "Property_classification_chk" CHECK (
  ("propertyStatus" IS NULL AND "disputeType" IS NULL)
  OR ("propertyStatus" = 'CLEAR' AND "disputeType" IS NULL)
  OR ("propertyStatus" = 'DISPUTED' AND "disputeType" IS NOT NULL));
