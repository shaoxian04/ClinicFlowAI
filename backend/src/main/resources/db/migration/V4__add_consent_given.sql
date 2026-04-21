-- PDPA: track when a patient explicitly gave consent for data processing.
-- Nullable — existing users have no consent record yet.
ALTER TABLE users
    ADD COLUMN consent_given_at timestamptz;
