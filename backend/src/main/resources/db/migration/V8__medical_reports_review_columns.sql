-- V8__medical_reports_review_columns.sql — three columns for post-visit review refactor.
-- preview_approved_at — set when doctor clicks "Approve & continue"
-- summary_en, summary_ms — bilingual patient-facing summary written on finalize
-- Additive only; all NULL defaults so existing rows are untouched.

ALTER TABLE medical_reports
    ADD COLUMN IF NOT EXISTS preview_approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS summary_en text,
    ADD COLUMN IF NOT EXISTS summary_ms text;
