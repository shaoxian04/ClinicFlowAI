-- V2 — evaluator findings + patient pregnancy/weight/height columns
-- Already applied to Supabase 2026-05-01. This file is reference documentation
-- (Flyway is NOT used per CLAUDE.md).

-- §2.1: patients additions for pregnancy + dose validation
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS pregnancy_status varchar(16),
  ADD COLUMN IF NOT EXISTS pregnancy_trimester smallint,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,2),
  ADD COLUMN IF NOT EXISTS height_cm numeric(5,2);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_pregnancy_status_chk') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_pregnancy_status_chk
          CHECK (pregnancy_status IS NULL OR pregnancy_status IN
                 ('NOT_PREGNANT','PREGNANT','LACTATING','UNKNOWN'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_pregnancy_trimester_chk') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_pregnancy_trimester_chk
          CHECK (pregnancy_trimester IS NULL OR pregnancy_trimester BETWEEN 1 AND 3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_weight_kg_chk') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_weight_kg_chk
          CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 600));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_height_cm_chk') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_height_cm_chk
          CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm < 300));
    END IF;
END$$;

-- §2.1: evaluator findings storage
CREATE TABLE IF NOT EXISTS evaluator_findings (
    id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id                uuid         NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    category                varchar(32)  NOT NULL
        CHECK (category IN ('DRUG_ALLERGY','DDI','PREGNANCY','DOSE',
                            'HALLUCINATION','COMPLETENESS')),
    severity                varchar(16)  NOT NULL
        CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    field_path              varchar(255),
    message                 text         NOT NULL,
    details                 jsonb        NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_at         timestamptz,
    acknowledged_by         uuid         REFERENCES users(id) ON DELETE SET NULL,
    acknowledgement_reason  varchar(255),
    superseded_at           timestamptz,
    gmt_create              timestamptz  NOT NULL DEFAULT now(),
    gmt_modified            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT findings_ack_consistent CHECK (
        (acknowledged_at IS NULL AND acknowledged_by IS NULL) OR
        (acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS evaluator_findings_visit_idx
    ON evaluator_findings(visit_id) WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS evaluator_findings_unack_critical_idx
    ON evaluator_findings(visit_id)
    WHERE severity = 'CRITICAL' AND acknowledged_at IS NULL AND superseded_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'evaluator_findings_touch_modified') THEN
        CREATE TRIGGER evaluator_findings_touch_modified
            BEFORE UPDATE ON evaluator_findings
            FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();
    END IF;
END$$;
