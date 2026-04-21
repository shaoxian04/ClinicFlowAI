-- Add EN + MS summary columns for the post-visit agent output.
-- Keeps legacy `patient_summary` for backwards compat; unused going forward.

ALTER TABLE post_visit_summaries
    ADD COLUMN summary_en text NOT NULL DEFAULT '',
    ADD COLUMN summary_ms text NOT NULL DEFAULT '';
