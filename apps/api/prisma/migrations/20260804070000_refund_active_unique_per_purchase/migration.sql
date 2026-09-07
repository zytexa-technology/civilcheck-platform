-- QA audit 2026-08-03, finding #10: createRefund's duplicate-refund check
-- was a findFirst() followed by a create(), with no transaction or unique
-- constraint between them — two admins racing to submit a refund for the
-- same purchase within milliseconds could both pass the check and create
-- two PENDING rows. Money-safe already (each refund is independently
-- claimed by executeRefund's own atomic updateMany guard), but this leaves
-- a stray duplicate ledger row for someone to clean up manually.
--
-- Postgres treats every NULL as distinct in a unique index, so this only
-- constrains rows that actually target a purchase (purchaseId IS NOT NULL);
-- specialRequest-only refunds are unaffected. Not modeled in schema.prisma —
-- Prisma's schema DSL has no partial/filtered unique index syntax.
CREATE UNIQUE INDEX "Refund_purchaseId_active_unique"
  ON "Refund" ("purchaseId")
  WHERE "status" IN ('PENDING', 'PROCESSED');
