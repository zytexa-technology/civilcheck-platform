-- Listing.riskBadge (old Green/Amber/Red) is DEPRECATED: the visible alert now comes solely from
-- propertyStatus/disputeType. Make it nullable so new rows no longer have to carry it.
-- Additive/relaxing only — existing values are kept as legacy history, nothing is dropped or rewritten.
ALTER TABLE "Listing" ALTER COLUMN "riskBadge" DROP NOT NULL;
