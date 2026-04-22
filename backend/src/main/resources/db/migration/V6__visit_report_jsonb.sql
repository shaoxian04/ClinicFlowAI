-- V6__visit_report_jsonb.sql — Report Agent draft storage + confidence flags.
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS report_draft JSONB,
  ADD COLUMN IF NOT EXISTS report_confidence_flags JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_visits_report_confidence_gin
  ON visits USING GIN (report_confidence_flags);
