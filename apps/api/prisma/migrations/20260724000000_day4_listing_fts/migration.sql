-- Full-text search (PDF 13): a STORED generated tsvector over the searchable
-- listing fields, plus a GIN index. Maintained entirely by Postgres, so no
-- application code has to keep it in sync on every insert/update.
--
-- 'simple' config (no stemming) is deliberate: addresses, colony names and
-- khasra/survey numbers are proper nouns and codes, not English prose, so
-- stemming would only distort them.
ALTER TABLE "Listing"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce("address", '') || ' ' ||
      coalesce("city", '') || ' ' ||
      coalesce("tehsil", '') || ' ' ||
      coalesce("khasraNumber", '') || ' ' ||
      coalesce("surveyNumber", '')
    )
  ) STORED;

CREATE INDEX "Listing_searchVector_idx" ON "Listing" USING GIN ("searchVector");
