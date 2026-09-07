-- Production QA pass: Listing and Property had no index beyond their
-- primary key. Every buyer-facing read filters status:'APPROVED' first
-- (property.controller.ts's feed/trending/search/free-check all start
-- there), and every seller/admin dashboard filters by sellerId — both were
-- full table scans. Purely additive; no data touched.

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Listing_sellerId_idx" ON "Listing"("sellerId");

-- CreateIndex
CREATE INDEX "Property_status_idx" ON "Property"("status");

-- CreateIndex
CREATE INDEX "Property_sellerId_idx" ON "Property"("sellerId");
