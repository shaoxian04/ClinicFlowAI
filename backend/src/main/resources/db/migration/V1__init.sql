-- CliniFlow AI — Postgres baseline (SAD §2.3.2).
-- PDPA: national_id and any free-text clinical fields must be encrypted at rest
-- (see `docs/details/non-functional.md`). This migration assumes Supabase's
-- managed encryption-at-rest for storage; column-level encryption is applied
-- at the application layer before insert.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------------
-- Helper: auto-update gmt_modified on row change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_gmt_modified() RETURNS trigger AS $$
BEGIN
    NEW.gmt_modified = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users — Spring Security principal. One of four roles.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    email          citext       NOT NULL UNIQUE,
    password_hash  varchar(255) NOT NULL,
    role           varchar(32)  NOT NULL
        CHECK (role IN ('PATIENT', 'DOCTOR', 'STAFF', 'ADMIN')),
    full_name      varchar(255) NOT NULL,
    is_active      boolean      NOT NULL DEFAULT true,
    gmt_create     timestamptz  NOT NULL DEFAULT now(),
    gmt_modified   timestamptz  NOT NULL DEFAULT now()
);

CREATE TRIGGER users_touch_modified
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- ---------------------------------------------------------------------------
-- patients — demographics. `national_id_ciphertext` is app-encrypted (PDPA).
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
    id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  uuid         REFERENCES users(id) ON DELETE SET NULL,
    national_id_ciphertext   bytea,
    national_id_fingerprint  char(64)     UNIQUE, -- HMAC-SHA256 for dedupe/lookup
    full_name                varchar(255) NOT NULL,
    date_of_birth            date,
    gender                   varchar(16)
        CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE', 'OTHER')),
    phone                    varchar(32),
    email                    citext,
    gmt_create               timestamptz  NOT NULL DEFAULT now(),
    gmt_modified             timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX patients_user_id_idx ON patients(user_id);
CREATE INDEX patients_full_name_idx ON patients(full_name);

CREATE TRIGGER patients_touch_modified
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- ---------------------------------------------------------------------------
-- visits — aggregate root (see ddd-conventions.md "Aggregate rule").
-- ---------------------------------------------------------------------------
CREATE TABLE visits (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    uuid         NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id     uuid         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status        varchar(32)  NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'FINALIZED', 'CANCELLED')),
    started_at    timestamptz,
    finalized_at  timestamptz,
    gmt_create    timestamptz  NOT NULL DEFAULT now(),
    gmt_modified  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX visits_patient_id_idx ON visits(patient_id);
CREATE INDEX visits_doctor_id_idx  ON visits(doctor_id);
CREATE INDEX visits_status_idx     ON visits(status);

CREATE TRIGGER visits_touch_modified
    BEFORE UPDATE ON visits
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- ---------------------------------------------------------------------------
-- pre_visit_reports — symptom-intake agent output. One per visit.
-- ---------------------------------------------------------------------------
CREATE TABLE pre_visit_reports (
    id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id       uuid         NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
    structured     jsonb        NOT NULL DEFAULT '{}'::jsonb,
    source         varchar(32)  NOT NULL DEFAULT 'AI'
        CHECK (source IN ('PATIENT', 'AI', 'STAFF')),
    gmt_create     timestamptz  NOT NULL DEFAULT now(),
    gmt_modified   timestamptz  NOT NULL DEFAULT now()
);

CREATE TRIGGER pre_visit_reports_touch_modified
    BEFORE UPDATE ON pre_visit_reports
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- ---------------------------------------------------------------------------
-- medical_reports — SOAP note. `is_finalized` is the doctor-in-the-loop gate.
-- ---------------------------------------------------------------------------
CREATE TABLE medical_reports (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        uuid         NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
    subjective      text         NOT NULL DEFAULT '',
    objective       text         NOT NULL DEFAULT '',
    assessment      text         NOT NULL DEFAULT '',
    plan            text         NOT NULL DEFAULT '',
    ai_draft_hash   char(64),    -- SHA-256 of AI-generated draft, for Hermes edit-diff
    is_finalized    boolean      NOT NULL DEFAULT false,
    finalized_by    uuid         REFERENCES users(id) ON DELETE SET NULL,
    finalized_at    timestamptz,
    gmt_create      timestamptz  NOT NULL DEFAULT now(),
    gmt_modified    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT medical_reports_finalized_stamped CHECK (
        (is_finalized = false) OR
        (is_finalized = true AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL)
    )
);

CREATE INDEX medical_reports_finalized_idx ON medical_reports(is_finalized);

CREATE TRIGGER medical_reports_touch_modified
    BEFORE UPDATE ON medical_reports
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- ---------------------------------------------------------------------------
-- post_visit_summaries — patient-friendly summary.
-- ---------------------------------------------------------------------------
CREATE TABLE post_visit_summaries (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        uuid         NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
    patient_summary text         NOT NULL DEFAULT '',
    gmt_create      timestamptz  NOT NULL DEFAULT now(),
    gmt_modified    timestamptz  NOT NULL DEFAULT now()
);

CREATE TRIGGER post_visit_summaries_touch_modified
    BEFORE UPDATE ON post_visit_summaries
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- ---------------------------------------------------------------------------
-- medications — prescribed per visit.
-- ---------------------------------------------------------------------------
CREATE TABLE medications (
    id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id       uuid         NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    name           varchar(255) NOT NULL,
    dosage         varchar(128) NOT NULL,
    frequency      varchar(128) NOT NULL,
    duration_days  integer,
    instructions   text,
    gmt_create     timestamptz  NOT NULL DEFAULT now(),
    gmt_modified   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX medications_visit_id_idx ON medications(visit_id);

CREATE TRIGGER medications_touch_modified
    BEFORE UPDATE ON medications
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- ---------------------------------------------------------------------------
-- audit_log — PDPA append-only. Block UPDATE/DELETE at DB level.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
    id              bigserial    PRIMARY KEY,
    occurred_at     timestamptz  NOT NULL DEFAULT now(),
    actor_user_id   uuid         REFERENCES users(id),
    actor_role      varchar(32),
    action          varchar(16)  NOT NULL
        CHECK (action IN ('READ', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT')),
    resource_type   varchar(64)  NOT NULL,
    resource_id     varchar(128),
    correlation_id  varchar(64),
    payload_hash    char(64),
    ip_address      inet,
    metadata        jsonb        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_log_resource_idx       ON audit_log(resource_type, resource_id);
CREATE INDEX audit_log_actor_time_idx     ON audit_log(actor_user_id, occurred_at DESC);
CREATE INDEX audit_log_correlation_id_idx ON audit_log(correlation_id);

CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only (PDPA)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();

CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
