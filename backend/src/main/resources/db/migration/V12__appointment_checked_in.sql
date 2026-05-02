-- =====================================================================
-- V12: Allow CHECKED_IN appointment status + record arrival time
--
-- Apply manually in the Supabase SQL editor before deploying the staff
-- portal backend (Flyway is removed from this project — V*.sql files
-- are reference history, not auto-applied).
--
-- Idempotent: status CHECK is dropped + recreated; column add uses
-- IF NOT EXISTS.
-- =====================================================================

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('BOOKED','CHECKED_IN','CANCELLED','COMPLETED','NO_SHOW'));

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz NULL;
