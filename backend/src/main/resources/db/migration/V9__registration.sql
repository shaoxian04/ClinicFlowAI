-- =============================================================================
-- CliniFlow AI — V9: Registration & User Onboarding
-- Apply manually in Supabase SQL editor (Flyway is NOT used).
-- Idempotent: safe to re-run. Run sections in order.
-- Prerequisites: V1__init.sql ... V8__medical_reports_review_columns.sql applied.
-- =============================================================================

-- Section A — Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Section B — Extend users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone                   varchar(32),
    ADD COLUMN IF NOT EXISTS preferred_language      varchar(8) DEFAULT 'en'
        CHECK (preferred_language IS NULL OR preferred_language IN ('en','ms','zh')),
    ADD COLUMN IF NOT EXISTS must_change_password    boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS last_login_at           timestamptz,
    ADD COLUMN IF NOT EXISTS failed_login_attempts   int     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until            timestamptz,
    ADD COLUMN IF NOT EXISTS consent_given_at        timestamptz;  -- backfill of V4 if missed

-- Section C — Extend patients
ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS preferred_language     varchar(8)
        CHECK (preferred_language IS NULL OR preferred_language IN ('en','ms','zh')),
    ADD COLUMN IF NOT EXISTS registration_source    varchar(16) NOT NULL DEFAULT 'STAFF_LED'
        CHECK (registration_source IN ('SELF_SERVICE','STAFF_LED','MIGRATED')),
    ADD COLUMN IF NOT EXISTS consent_given_at       timestamptz,
    ADD COLUMN IF NOT EXISTS consent_version        varchar(16);

CREATE INDEX IF NOT EXISTS patients_national_id_fingerprint_idx
    ON patients(national_id_fingerprint);

-- Section D — patient_clinical_profiles
-- Source columns use varchar(32) with CHECK constraints (matches V1 pattern for role).
CREATE TABLE IF NOT EXISTS patient_clinical_profiles (
    id                              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id                      uuid          NOT NULL UNIQUE
                                                  REFERENCES patients(id) ON DELETE CASCADE,
    weight_kg                       numeric(5,2)
        CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 500)),
    weight_kg_updated_at            timestamptz,
    weight_kg_source                varchar(32)
        CHECK (weight_kg_source IS NULL OR weight_kg_source IN
            ('REGISTRATION','PRE_VISIT_CHAT','PORTAL','DOCTOR_VISIT','MIGRATED')),
    height_cm                       numeric(5,2)
        CHECK (height_cm IS NULL OR (height_cm > 30 AND height_cm < 280)),
    height_cm_updated_at            timestamptz,
    height_cm_source                varchar(32)
        CHECK (height_cm_source IS NULL OR height_cm_source IN
            ('REGISTRATION','PRE_VISIT_CHAT','PORTAL','DOCTOR_VISIT','MIGRATED')),
    drug_allergies                  jsonb         NOT NULL DEFAULT '[]'::jsonb,
    drug_allergies_updated_at       timestamptz,
    drug_allergies_source           varchar(32)
        CHECK (drug_allergies_source IS NULL OR drug_allergies_source IN
            ('REGISTRATION','PRE_VISIT_CHAT','PORTAL','DOCTOR_VISIT','MIGRATED')),
    chronic_conditions              jsonb         NOT NULL DEFAULT '[]'::jsonb,
    chronic_conditions_updated_at   timestamptz,
    chronic_conditions_source       varchar(32)
        CHECK (chronic_conditions_source IS NULL OR chronic_conditions_source IN
            ('REGISTRATION','PRE_VISIT_CHAT','PORTAL','DOCTOR_VISIT','MIGRATED')),
    regular_medications             jsonb         NOT NULL DEFAULT '[]'::jsonb,
    regular_medications_updated_at  timestamptz,
    regular_medications_source      varchar(32)
        CHECK (regular_medications_source IS NULL OR regular_medications_source IN
            ('REGISTRATION','PRE_VISIT_CHAT','PORTAL','DOCTOR_VISIT','MIGRATED')),
    pregnancy_status                varchar(32)
        CHECK (pregnancy_status IS NULL OR pregnancy_status IN
            ('NOT_APPLICABLE','NOT_PREGNANT','PREGNANT','POSTPARTUM_LACTATING','UNKNOWN')),
    pregnancy_edd                   date,
    pregnancy_updated_at            timestamptz,
    pregnancy_source                varchar(32)
        CHECK (pregnancy_source IS NULL OR pregnancy_source IN
            ('REGISTRATION','PRE_VISIT_CHAT','PORTAL','DOCTOR_VISIT','MIGRATED')),
    completeness_state              varchar(16)   NOT NULL DEFAULT 'INCOMPLETE'
        CHECK (completeness_state IN ('INCOMPLETE','PARTIAL','COMPLETE')),
    gmt_create                      timestamptz   NOT NULL DEFAULT now(),
    gmt_modified                    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT pregnancy_consistency CHECK (
        (pregnancy_status = 'PREGNANT' AND pregnancy_edd IS NOT NULL)
        OR
        (pregnancy_status IS DISTINCT FROM 'PREGNANT' AND pregnancy_edd IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS patient_clinical_profiles_patient_id_idx
    ON patient_clinical_profiles(patient_id);
DROP TRIGGER IF EXISTS patient_clinical_profiles_touch_modified ON patient_clinical_profiles;
CREATE TRIGGER patient_clinical_profiles_touch_modified
    BEFORE UPDATE ON patient_clinical_profiles
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- Section E — doctors
CREATE TABLE IF NOT EXISTS doctors (
    id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  uuid         NOT NULL UNIQUE
                                          REFERENCES users(id) ON DELETE CASCADE,
    mmc_number               varchar(32)  NOT NULL UNIQUE,
    specialty                varchar(64)  NOT NULL,
    signature_image_url      varchar(512),
    is_accepting_patients    boolean      NOT NULL DEFAULT true,
    gmt_create               timestamptz  NOT NULL DEFAULT now(),
    gmt_modified             timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doctors_mmc_idx ON doctors(mmc_number);
DROP TRIGGER IF EXISTS doctors_touch_modified ON doctors;
CREATE TRIGGER doctors_touch_modified
    BEFORE UPDATE ON doctors
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- Section F — staff_profiles
CREATE TABLE IF NOT EXISTS staff_profiles (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid         NOT NULL UNIQUE
                              REFERENCES users(id) ON DELETE CASCADE,
    employee_id  varchar(32)  UNIQUE,
    notes        varchar(255),
    gmt_create   timestamptz  NOT NULL DEFAULT now(),
    gmt_modified timestamptz  NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS staff_profiles_touch_modified ON staff_profiles;
CREATE TRIGGER staff_profiles_touch_modified
    BEFORE UPDATE ON staff_profiles
    FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();

-- Section G — neo4j_projection_outbox
CREATE TABLE IF NOT EXISTS neo4j_projection_outbox (
    id              bigserial      PRIMARY KEY,
    aggregate_id    uuid           NOT NULL,
    operation       varchar(64)    NOT NULL,
    payload         jsonb          NOT NULL,
    status          varchar(16)    NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','IN_FLIGHT','COMPLETED','FAILED')),
    attempts        int            NOT NULL DEFAULT 0,
    next_attempt_at timestamptz    NOT NULL DEFAULT now(),
    last_error      text,
    enqueued_at     timestamptz    NOT NULL DEFAULT now(),
    completed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_drainable_idx
    ON neo4j_projection_outbox(status, next_attempt_at)
    WHERE status IN ('PENDING','FAILED');
CREATE INDEX IF NOT EXISTS outbox_aggregate_idx
    ON neo4j_projection_outbox(aggregate_id);

-- Verification
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('patient_clinical_profiles','doctors','staff_profiles','neo4j_projection_outbox')
--  ORDER BY table_name;
