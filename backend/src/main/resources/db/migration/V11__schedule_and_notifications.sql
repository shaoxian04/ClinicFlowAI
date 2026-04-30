-- =====================================================================
-- V11: Appointment scheduling + WhatsApp notification outbox
--
-- Apply manually in the Supabase SQL editor (Flyway is removed from this
-- project — V*.sql files are reference history, not auto-applied).
--
-- Idempotent: every CREATE / ADD uses IF NOT EXISTS, wrapped in a single
-- transaction. Safe to re-run.
--
-- Modules served:
--   * Appointment booking (patient self-service, fixed-slot grid)
--   * WhatsApp reminders via Twilio (event-driven outbox, no scheduler)
--
-- Design ref: docs/superpowers/specs/2026-04-30-appointment-booking-
--             and-whatsapp-reminders-design.md
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. patients: WhatsApp consent (PDPA-distinct from umbrella consent)
-- ---------------------------------------------------------------------
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at      timestamptz NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_version varchar(16) NULL;

CREATE INDEX IF NOT EXISTS idx_patients_wa_consent
  ON patients (id) WHERE whatsapp_consent_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. schedule_template — weekly hours, owned by Clinic Admin
--    Multi-doctor forward-compatible: PK is (doctor_id, effective_from).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_template (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id                uuid NOT NULL REFERENCES doctors(id),
  effective_from           date NOT NULL,
  slot_minutes             smallint NOT NULL CHECK (slot_minutes IN (10,15,20,30)),
  weekly_hours             jsonb NOT NULL,         -- {"MON":[["09:00","12:00"],["14:00","17:00"]],...}
  cancel_lead_hours        smallint NOT NULL DEFAULT 2,
  generation_horizon_days  smallint NOT NULL DEFAULT 28,
  gmt_create               timestamptz NOT NULL DEFAULT now(),
  gmt_modified             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_schedule_template_doctor_eff UNIQUE (doctor_id, effective_from)
);

-- ---------------------------------------------------------------------
-- 3. appointment_slots — eagerly materialized concrete slots (Axis C1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointment_slots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    uuid NOT NULL REFERENCES doctors(id),
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  status       varchar(16) NOT NULL
                CHECK (status IN ('AVAILABLE','BOOKED','BLOCKED','CLOSED')),
  gmt_create   timestamptz NOT NULL DEFAULT now(),
  gmt_modified timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slot_window_valid CHECK (end_at > start_at),
  CONSTRAINT uq_slots_doctor_start UNIQUE (doctor_id, start_at)
);

CREATE INDEX IF NOT EXISTS idx_slots_doctor_time
  ON appointment_slots (doctor_id, start_at)
  WHERE status = 'AVAILABLE';

-- ---------------------------------------------------------------------
-- 4. appointments — bookings; 1:1 to slot when active, 1:1 to visit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id          uuid NOT NULL REFERENCES appointment_slots(id),
  patient_id       uuid NOT NULL REFERENCES patients(id),
  visit_id         uuid NOT NULL REFERENCES visits(id),
  appointment_type varchar(16) NOT NULL
                    CHECK (appointment_type IN ('NEW_SYMPTOM','FOLLOW_UP')),
  parent_visit_id  uuid NULL REFERENCES visits(id),
  status           varchar(16) NOT NULL
                    CHECK (status IN ('BOOKED','CANCELLED','COMPLETED','NO_SHOW')),
  cancel_reason    varchar(64) NULL,
  cancelled_at     timestamptz NULL,
  cancelled_by     uuid NULL REFERENCES users(id),
  gmt_create       timestamptz NOT NULL DEFAULT now(),
  gmt_modified     timestamptz NOT NULL DEFAULT now()
);

-- one ACTIVE booking per slot — cancellation frees the slot for rebooking
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_slot
  ON appointments (slot_id) WHERE status = 'BOOKED';

-- visit ↔ active appointment is 1:1
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_visit
  ON appointments (visit_id) WHERE status = 'BOOKED';

CREATE INDEX IF NOT EXISTS idx_appointments_patient
  ON appointments (patient_id, status);

-- ---------------------------------------------------------------------
-- 5. schedule_day_overrides — staff-managed exceptions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_day_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     uuid NOT NULL REFERENCES doctors(id),
  override_date date NOT NULL,
  override_type varchar(16) NOT NULL
                 CHECK (override_type IN ('DAY_CLOSED','WINDOW_BLOCKED')),
  window_start  time NULL,
  window_end    time NULL,
  reason        varchar(255) NULL,
  created_by    uuid NOT NULL REFERENCES users(id),
  gmt_create    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT window_required_when_blocked
    CHECK (override_type <> 'WINDOW_BLOCKED'
           OR (window_start IS NOT NULL AND window_end IS NOT NULL
               AND window_end > window_start))
);

CREATE INDEX IF NOT EXISTS idx_overrides_date
  ON schedule_day_overrides (doctor_id, override_date);

-- ---------------------------------------------------------------------
-- 6. notification_outbox — domain events queued for delivery
--    Drained by TwilioWhatsAppSender every 30s.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_outbox (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type           varchar(48) NOT NULL,    -- APPOINTMENT_BOOKED | APPOINTMENT_CANCELLED |
                                                --  SOAP_FINALIZED_MEDS | SOAP_FINALIZED_FOLLOWUP
  channel              varchar(16) NOT NULL CHECK (channel IN ('WHATSAPP')),
  template_id          varchar(64) NOT NULL,
  recipient_patient_id uuid NOT NULL REFERENCES patients(id),
  payload              jsonb NOT NULL,
  idempotency_key      varchar(128) NOT NULL,
  status               varchar(24) NOT NULL
                        CHECK (status IN
                          ('PENDING','SENDING','SENT','FAILED','SKIPPED_NO_CONSENT')),
  attempts             smallint NOT NULL DEFAULT 0,
  next_attempt_at      timestamptz NOT NULL DEFAULT now(),
  last_error           text NULL,
  sent_at              timestamptz NULL,
  gmt_create           timestamptz NOT NULL DEFAULT now(),
  gmt_modified         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_outbox_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_outbox_drainer
  ON notification_outbox (next_attempt_at)
  WHERE status IN ('PENDING','FAILED');

-- ---------------------------------------------------------------------
-- 7. whatsapp_message_log — per-attempt delivery log (no PHI free-text)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id         uuid NOT NULL REFERENCES notification_outbox(id),
  twilio_sid        varchar(64) NULL,
  to_phone_hash     varchar(64) NOT NULL,        -- SHA-256 of phone, NOT the phone itself
  template_id       varchar(64) NOT NULL,
  rendered_locale   varchar(8)  NOT NULL,
  delivery_status   varchar(24) NOT NULL
                     CHECK (delivery_status IN
                       ('QUEUED','SENT','DELIVERED','READ','FAILED','UNDELIVERED')),
  twilio_error_code varchar(16) NULL,
  gmt_create        timestamptz NOT NULL DEFAULT now(),
  gmt_modified      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_log_outbox
  ON whatsapp_message_log (outbox_id);

-- ---------------------------------------------------------------------
-- 8. Touch triggers — keep gmt_modified fresh on UPDATE
--    Function touch_gmt_modified() is defined in V1__init.sql.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'touch_gmt_modified') THEN
    CREATE OR REPLACE TRIGGER trg_schedule_template_touch
      BEFORE UPDATE ON schedule_template
      FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

    CREATE OR REPLACE TRIGGER trg_slots_touch
      BEFORE UPDATE ON appointment_slots
      FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

    CREATE OR REPLACE TRIGGER trg_appointments_touch
      BEFORE UPDATE ON appointments
      FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

    CREATE OR REPLACE TRIGGER trg_outbox_touch
      BEFORE UPDATE ON notification_outbox
      FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

    CREATE OR REPLACE TRIGGER trg_wa_log_touch
      BEFORE UPDATE ON whatsapp_message_log
      FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- Verification (run separately after the transaction commits)
-- =====================================================================
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('schedule_template','appointment_slots','appointments',
--                       'schedule_day_overrides','notification_outbox',
--                       'whatsapp_message_log')
--  ORDER BY table_name;
-- -- Expect 6 rows.
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='patients' AND column_name LIKE 'whatsapp_%';
-- -- Expect: whatsapp_consent_at, whatsapp_consent_version.
