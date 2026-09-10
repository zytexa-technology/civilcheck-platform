-- Property Discovery flow (Step 4A) — VerificationRequest gains a third
-- source, DISCOVERY: a buyer's request to find + verify a property that
-- does not exist on CivilCheck yet. See schema.prisma's VerificationRequest
-- comment for the full design. This migration only adds columns and widens
-- two DB-level invariants — no application logic, no data changes, and
-- every statement here is safe against existing LISTING/PROPERTY rows (see
-- this migration's own note on each constraint below).

-- AlterTable
ALTER TABLE "VerificationRequest" ADD COLUMN     "desiredAddress" TEXT,
ADD COLUMN     "desiredCity" TEXT,
ADD COLUMN     "desiredKhasraOrSurvey" TEXT,
ADD COLUMN     "desiredPropertyType" "PropertyType",
ADD COLUMN     "desiredTehsil" TEXT,
ALTER COLUMN "uploaderRole" DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- Widen VerificationRequest's listing/property XOR (added in
-- 20260820030000_verification_marketplace_foundation as
-- VerificationRequest_listing_xor_property, CHECK (...) = 1) into two
-- separate, permanent invariants now that a third source (DISCOVERY)
-- exists:
--
--   1. At most one of listingId/propertyId (was: exactly one). A DISCOVERY
--      request starts with neither; LISTING/PROPERTY requests still need
--      exactly one, but enforcing "exactly one for LISTING/PROPERTY" is now
--      an application-level rule (Phase 4B) — the DB can no longer tell
--      "DISCOVERY with zero targets" apart from "LISTING/PROPERTY missing
--      its target" using a column-count check alone.
--   2. A DISCOVERY request may never carry a propertyId. This IS a stable,
--      non-temporal invariant — the approved discovery flow only ever
--      produces a Listing, never links an existing Owner Property — so it
--      is safe to enforce permanently at the DB level.
--
-- Deliberately NOT constrained here: "a DISCOVERY request has no listingId
-- YET". That rule is temporal (an Expert links one once they find the
-- property), and a CHECK constraint is evaluated on every row at all times
-- — it cannot distinguish "not yet" from "never" the way a static boolean
-- expression can distinguish "always true" from "always false" for a given
-- row. Enforcing it here would permanently block the very update Phase 4B
-- needs to make later (DISCOVERY request + listingId, once the property is
-- found). Left to application logic — documented, not implemented, here.
--
-- Safety against existing data: every existing row already satisfies
-- `= 1`, which trivially satisfies the new, looser `<= 1`; and no existing
-- row can have source = 'DISCOVERY' (the value didn't exist before the
-- prior migration), so every existing row trivially satisfies the new
-- discovery-no-property check too. Both ADD CONSTRAINT statements below
-- are validated against the full existing table by Postgres itself at
-- apply time — if either assumption were wrong, this migration would fail
-- to apply rather than silently accepting bad data.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "VerificationRequest" DROP CONSTRAINT "VerificationRequest_listing_xor_property";

ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_listing_and_property_not_both"
  CHECK (
    (("listingId" IS NOT NULL)::int + ("propertyId" IS NOT NULL)::int) <= 1
  );

ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_discovery_no_property"
  CHECK (
    "source" != 'DISCOVERY' OR "propertyId" IS NULL
  );
