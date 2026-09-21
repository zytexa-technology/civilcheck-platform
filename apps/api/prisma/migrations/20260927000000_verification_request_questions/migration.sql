-- "Request for Legal Reports": what the buyer wants checked. Additive, nullable.
ALTER TABLE "VerificationRequest" ADD COLUMN "questions" TEXT;
