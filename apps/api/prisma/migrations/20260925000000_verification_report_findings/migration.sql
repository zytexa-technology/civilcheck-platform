-- Paid verification report: structured dispute findings replace the Green/Amber/Red assessment.
-- Additive only. VerificationReport.riskAssessment is DEPRECATED but NOT dropped (no data loss).
CREATE TYPE "VerificationDisputeStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'UNKNOWN');

ALTER TABLE "VerificationReport" ADD COLUMN "disputeFound" BOOLEAN;
ALTER TABLE "VerificationReport" ADD COLUMN "disputeType" "DisputeType";
ALTER TABLE "VerificationReport" ADD COLUMN "disputeNature" TEXT;
ALTER TABLE "VerificationReport" ADD COLUMN "caseCategory" TEXT;
ALTER TABLE "VerificationReport" ADD COLUMN "caseNumber" TEXT;
ALTER TABLE "VerificationReport" ADD COLUMN "courtName" TEXT;
ALTER TABLE "VerificationReport" ADD COLUMN "disputeStartYear" INTEGER;
ALTER TABLE "VerificationReport" ADD COLUMN "disputeStatus" "VerificationDisputeStatus";
ALTER TABLE "VerificationReport" ADD COLUMN "currentStatusNotes" TEXT;
ALTER TABLE "VerificationReport" ADD COLUMN "partiesInvolved" TEXT;
ALTER TABLE "VerificationReport" ADD COLUMN "titleFindings" TEXT;
ALTER TABLE "VerificationReport" ADD COLUMN "resolutionOutlook" TEXT;
ALTER TABLE "VerificationReport" ADD COLUMN "expertRemarks" TEXT;
