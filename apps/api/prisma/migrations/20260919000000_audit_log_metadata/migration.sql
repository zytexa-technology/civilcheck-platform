-- Additive, nullable — no existing rows are touched.
ALTER TABLE "AuditLog" ADD COLUMN     "metadata" JSONB;
