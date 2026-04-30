# Registration & User Onboarding — Design Spec

**Status:** Draft, pending implementation
**Date:** 2026-04-30
**Owner:** shaoxian04
**Related modules (separate specs, not this one):** Appointment booking, Medication & follow-up reminders
**Supersedes / extends:** PRD §5 (acceptance criteria for US-P-series), `docs/details/scope-and-acceptance.md`, `docs/details/data-model.md`, `docs/details/ddd-conventions.md`, `docs/details/agent-design.md`

---

## 1. Goals, Scope, Non-Goals

### 1.1 Goals

1. Allow new patients to register via two paths: **self-service** (public web form) and **staff-led** (clinic desk).
2. Enforce **NRIC uniqueness** — staff must search before create; self-signup blocks if NRIC fingerprint already exists.
3. Allow **admin** users to create STAFF, DOCTOR, and ADMIN user accounts. Bootstrap the first ADMIN via SQL seed.
4. Capture an **optional clinical baseline** at registration (weight, height, drug allergies, chronic conditions, regular medications, pregnancy) into a new `patient_clinical_profiles` table.
5. Expose a **service-token-authenticated internal API** so the pre-visit agent can read and PATCH clinical-profile fields when filling gaps from chat.
6. **Profile-vs-snapshot separation:** durable patient state lives on the profile; visit-specific facts stay in `pre_visit_reports.structured`. The pre-visit agent acts as confirmer/updater of the profile.
7. **Profile-completeness gate:** before generating the structured pre-visit report, the agent must resolve missing safety-critical fields (allergies, conditions, regular meds, pregnancy for women of childbearing age, weight if entirely missing) by asking the patient and PATCHing answers back to Spring Boot.
8. **Dual-store consistency:** Spring Boot is the single writer to both Postgres (full detail) and Neo4j (normalized graph projection of clinical facts). An outbox pattern guarantees eventual consistency without blocking the user-facing TX on Neo4j availability.
9. **Doctor-specific** registration fields: MMC number (Malaysian Medical Council), specialty, signature image — required for prescription legality in Malaysia.
10. **PDPA compliance:** NRIC encrypted + fingerprinted; every write produces an `audit_log` row; audit log remains append-only; free-text clinical narratives encrypted at rest.
11. Strict alignment with existing **DDD conventions** — no new aggregates, one repository per aggregate root, CQRS split, controllers grouped by URL.

### 1.2 In scope

| Surface | Detail |
|---|---|
| Public endpoints | `POST /api/auth/register/patient`, `POST /api/auth/forced-password-change` |
| JWT-protected endpoints | `POST /api/patients`, `GET /api/patients/search`, `GET /api/patients/{id}/clinical-profile`, `PATCH /api/patients/{id}/clinical-profile`, `POST /api/admin/users`, `GET /api/admin/users`, `PATCH /api/admin/users/{id}/active` |
| Service-token endpoints | `GET /internal/patients/{id}/clinical-profile`, `PATCH /internal/patients/{id}/clinical-profile` |
| Schema changes | New tables: `patient_clinical_profiles`, `doctors`, `staff_profiles`, `neo4j_projection_outbox`. New enums: `profile_update_source`, `pregnancy_status`. Extended columns on `users`, `patients`. |
| Frontend pages | `/auth/register`, `/auth/register/success`, `/staff/patients/new`, `/admin/users`, `/admin/users/new`, `/portal/profile` (read-only MVP). Forced-password-change interstitial added to `/login` flow. |
| Infrastructure | `Neo4jProjectionClient`, `Neo4jProjectionOutboxWriter` + `Worker`, `ServiceTokenInterceptor`, `RateLimitConfig`, `ClinicalTextEncryptor`, `SignatureImageStore`, `AuditWriter`. |
| Agent additions | `patient_profile_tool` (LangGraph tool), `gap_filling.j2` prompt, gap-filling sub-graph node in pre-visit graph. |

### 1.3 Out of scope (this spec)

- Admin dashboard analytics / audit log viewer / clinic settings — separate specs.
- Patient portal "complete your profile" interactive page — deferred (read-only `/portal/profile` only in MVP).
- Doctor mid-visit clinical-profile editing UI — API supports it; UI deferred.
- Email verification, SMS OTP, password reset, 2FA — separate auth specs.
- Appointment booking & reminders — separate specs (already decided in earlier brainstorming).
- Medication-dose validation logic itself — separate spec; this spec only ensures the data needed by it is collected.
- Multi-clinic support / `clinic_id` association — implicit single clinic until that spec.
- PDPA right-to-be-forgotten implementation — schema designed for it; logic in a future spec.
- Signature image virus scanning, reputation services — deferred.

### 1.4 Non-goals

- We will **not** add a `PatientClinicalProfileRepository` — would violate the "one repository per aggregate root" rule.
- We will **not** dual-write profiles to Postgres + Neo4j synchronously. Postgres is the source of truth; Neo4j is an outbox-sync'd projection.
- We will **not** put NRIC, addresses, free-text reaction descriptions, or password hashes into Neo4j. Neo4j stores only normalized clinical facts useful for graph traversal.
- The pre-visit agent will **not** write canonical clinical-profile data directly to Neo4j. All such writes flow through Spring Boot's PATCH endpoint. (Agent still writes its own extracted Symptom/Diagnosis nodes directly — different domain.)

---

## 2. Architecture & Data Flow

### 2.1 Component overview

```
Frontend (Next.js)
  /auth/register             → public patient signup
  /staff/patients/new        → staff search-or-create
  /admin/users[/new]         → admin user management
  /portal/profile            → patient read-only profile
        │ HTTPS, JWT (where applicable)
        ▼
Spring Boot (Java 21)
  controller/biz/auth/RegistrationController
  controller/biz/patient/PatientController        (extended)
  controller/biz/admin/AdminUserController        (NEW)
  controller/biz/internal/patient/InternalPatientController (NEW)
  application/biz/{patient,user}/(Read|Write)AppService
  domain/biz/{patient,user}/...
  infrastructure/{repository,client,outbox,crypto,audit,storage}
        │                          │
        ▼                          ▼
  Postgres (Supabase)        Neo4j (graph projection)
                                ▲
                                │ Cypher graph-RAG reads
  FastAPI Agent ──────────────┘
        ↑ ┌─────────────────────────────┘ Spring Boot internal API
        │ │ canonical profile + freshness metadata
        │ │
        └─┴── pre-visit chat (gap-filling sub-graph)
```

### 2.2 Postgres ↔ Neo4j data split

| Data | Postgres | Neo4j |
|---|---|---|
| Identity (NRIC, password hash, free-text reactions, audit log, address) | ✅ | ❌ |
| Patient identity node | ✅ | ✅ as `(:Patient {id, age_bucket?, sex?, pregnancy?})` — id only, no PII |
| Drug allergies | ✅ jsonb (full detail) | ✅ `(:Allergy)` + `[:ALLERGIC_TO {severity, source, confidence}]` edge |
| Chronic conditions | ✅ jsonb | ✅ `(:Condition)` + `[:HAS_HISTORY_OF]` edge |
| Regular medications | ✅ jsonb | ✅ `(:Medication)` + `[:TAKING]` edge |
| Per-visit symptoms (agent-extracted) | ✅ `pre_visit_reports.structured` | ✅ `(:Symptom)` + `[:PRESENTED_WITH]` edge — written by agent (Graphify two-pass extraction) |

### 2.3 Read/write contract for the pre-visit agent

**Reads:**
- **Spring Boot** `GET /internal/patients/{id}/clinical-profile` — once per chat session, for canonical profile + per-field `_updated_at` + `_source` (used for staleness detection).
- **Neo4j** Cypher via LangGraph tools — throughout chat, for multi-hop graph-RAG queries (drug-interaction hero query, condition relationships, past symptom history).

**Writes:**
- **Patient-confirmed clinical-profile facts** (a confirmed allergy, an updated weight, etc.) → `PATCH /internal/patients/{id}/clinical-profile`. Spring Boot persists Postgres + enqueues Neo4j projection.
- **Agent-extracted facts** (Symptom from chat, INFERRED edges with confidence scores) → directly to Neo4j by the agent.

**Profile-completeness gate (invariant):** Before the pre-visit agent finalizes the structured report, every safety-critical field must be either confirmed (with PATCH back to Spring Boot) or explicitly skipped with a recorded reason. Safety-critical = drug allergies, chronic conditions, regular medications, pregnancy (women of childbearing age), weight (if entirely missing). Soft-prompt = height, preferred language, family history, surgical history.

### 2.4 End-to-end flows

#### Flow A — Self-service patient registration

```
Browser
  POST /api/auth/register/patient   {identity + optional clinical baseline}
  ↓
RegistrationController
  → Bean Validation
  → patientWriteAppService.register(info, source=SELF_SERVICE)
  ↓
PatientWriteAppService.register  @Transactional
  1. NRIC fingerprint dedupe check (PatientRepository.existsByNationalIdFingerprint)
  2. userWriteAppService.createPatientUser(...) → userId
  3. patientRegisterDomainService.create(info, userId) → PatientModel (+ optional empty profile)
  4. if baseline provided:
       patientClinicalProfileUpdateDomainService.applyAtRegistration(patient, info)
  5. patientRepository.save(patient)             // JPA cascades child profile
  6. neo4jProjectionOutboxWriter.enqueue(...)    // PATIENT_UPSERT + per-allergy/condition/med
  7. auditWriter.append(CREATE, ...)
  8. eventPublisher.publish(PatientRegisteredDomainEvent)
  → returns patientId
  ↓
RegistrationController
  → Set HttpOnly JWT cookie (auto-login)
  → 201 Created with WebResult{ patientId, userId }
  ↓
[Async] Neo4jProjectionOutboxWorker drains pending rows ≤2s later.
```

NRIC duplicate → 409 with clear "please log in" message. Postgres TX failure → full rollback (no user, no patient, no outbox row, no audit log).

#### Flow B — Staff-led registration with NRIC search

```
Staff: GET /api/patients/search?nric=...     [JWT, role∈{STAFF,DOCTOR,ADMIN}]
  → patientReadAppService.searchByNationalId(nric)
  → returns redacted preview: { found, patient: { id, fullNameInitial: "L***", dobMonth: "1990-05" } }
  → audit_log row written regardless of hit/miss

Staff UI:
  if found    → "Patient already exists. Open record?" → /staff/patients/{id}
  if not      → enable POST /api/patients with the searched NRIC pre-filled
```

`POST /api/patients` follows the same path as Flow A but with `source=STAFF_LED` and `must_change_password=true` on the created user. Temp password is shown to staff (SMS deferred).

#### Flow C — Pre-visit agent fills a missing allergy

```
Patient says "I'm allergic to penicillin — gives me hives" in chat.

Agent
  PATCH http://backend:8080/internal/patients/{id}/clinical-profile
  headers: X-Service-Token, X-Pre-Visit-Session, X-Visit-Id, X-Correlation-Id
  body: { drug_allergies_add: [{ name, severity, reaction, confidence }],
          source: "PRE_VISIT_CHAT" }
  ↓
ServiceTokenInterceptor
  → validate token
  → resolve session → patient_id, compare to {id} in path
  → SecurityContext { actor: PATIENT_VIA_AGENT, visitId }
  ↓
InternalPatientController.patchClinicalProfile
  → patientWriteAppService.updateClinicalProfile(id, info, PRE_VISIT_CHAT)
  ↓
PatientWriteAppService  @Transactional
  → load PatientModel (with child profile)
  → patientClinicalProfileUpdateDomainService.apply(patient, info, source)
       (validates, encrypts free-text reaction, sets _updated_at + _source for changed fields,
        recomputes completeness_state)
  → patientRepository.save(patient)
  → neo4jProjectionOutboxWriter.enqueue(ALLERGY_ADD, ...)
  → auditWriter.append(UPDATE, ..., actor=PATIENT_VIA_AGENT, fieldsChanged=[drug_allergies])
  → eventPublisher.publish(PatientClinicalProfileUpdatedDomainEvent)
  → returns updated snapshot
  ↓
Agent receives 200, continues chat.
Within ~1-2s, Neo4j projection reflects the new edge.
```

#### Flow D — Admin creates a doctor

```
POST /api/admin/users   [JWT, role=ADMIN]
body: { role: "DOCTOR", email, fullName, phone, mmcNumber, specialty, signatureImageBase64 }
  ↓
AdminUserController
  → userWriteAppService.createDoctorUser(info)
  ↓
@Transactional
  → check email + MMC uniqueness
  → generate temp password + bcrypt
  → persist UserModel(role=DOCTOR, must_change_password=true) + DoctorProfileModel
  → upload signature → Supabase Storage → URL on doctors.signature_image_url
  → audit_log row
  → publish UserRegisteredDomainEvent
  → return { userId, tempPassword (one-time, shown to creating admin) }
```

STAFF/DOCTOR/ADMIN registration does **not** touch Neo4j — only patients have a graph projection.

### 2.5 Authentication & authorization

| Endpoint | Auth | Authorization |
|---|---|---|
| `POST /api/auth/register/patient` | None | Rate-limit 5/hour/IP, captcha on retry |
| `POST /api/patients` | JWT | STAFF or ADMIN |
| `GET /api/patients/search?nric=` | JWT | STAFF, DOCTOR, ADMIN. Always returns redacted preview. |
| `GET /api/patients/{id}/...` | JWT | STAFF/DOCTOR/ADMIN, or PATIENT-self |
| `PATCH /api/patients/{id}/clinical-profile` | JWT | STAFF/DOCTOR/ADMIN, or PATIENT-self |
| `POST /api/admin/users` | JWT | ADMIN only |
| `GET /api/admin/users` | JWT | ADMIN only |
| `GET|PATCH /internal/patients/{id}/clinical-profile` | Service token | Token + session-id binding to {id} |

Two interceptors cooperate:
- **`AuthInterceptor`** (existing): JWT validation, populates SecurityContext (userId, role).
- **`ServiceTokenInterceptor`** (new): runs only for `/internal/**`. Validates `X-Service-Token`; resolves `X-Pre-Visit-Session` to a visit; ensures `visit.patient_id == path-{id}`; sets actor to `PATIENT_VIA_AGENT` with the bound visit_id for audit.

Forced-password-change gate: any user with `must_change_password=true` is blocked from non-`/api/auth/forced-password-change` endpoints by `AuthInterceptor` until the password is changed.

### 2.6 Neo4j projection — outbox pattern

`neo4j_projection_outbox` table holds pending projection operations. Every clinical-profile write enqueues operations in the **same Postgres TX** as the canonical write — the outbox row only commits if Postgres commits. A `Neo4jProjectionOutboxWorker` (Spring `@Scheduled`, fixed-delay 1s) drains the table:

- Marks row `IN_FLIGHT`, calls `Neo4jProjectionClient.<operation>(payload)`.
- On success → `COMPLETED`, `completed_at = now()`.
- On failure → exponential backoff via `next_attempt_at`; after 10 attempts → `FAILED` + P3 alert.
- Resilience4j circuit breaker on the client; when open, the worker pauses gracefully.

All Cypher operations are idempotent `MERGE`-shaped: replay is safe.

**Lag expectation:** typical ≤2 seconds. Acceptable because:
- A freshly-registered patient does not have an immediate visit.
- Even mid-visit, the agent's Spring Boot read still returns the correct canonical profile — only graph-RAG traversal misses the edge during the lag window.

---

## 3. Postgres Schema & JPA Entities

### 3.1 V2 migration

File: `backend/src/main/resources/db/migration/V2__registration.sql` (documentation per CLAUDE.md — applied manually via Supabase SQL editor; Flyway not used).

**Note:** The full SQL is in §3.6 of this document, intended to be copy-pasted into the Supabase SQL editor. Includes:
- Section A: extensions (no-op if present).
- Section B: enums `profile_update_source`, `pregnancy_status`.
- Section C: extend `users` (`phone`, `preferred_language`, `must_change_password`, `last_login_at`, `failed_login_attempts`, `locked_until`).
- Section D: extend `patients` (`preferred_language`, `registration_source`, `consent_given_at`, `consent_version`).
- Section E: new `patient_clinical_profiles` (1:1 child of `patients`, per-field `_updated_at` + `_source`, `pregnancy_consistency` CHECK, `completeness_state`).
- Section F: new `doctors` (mmc_number UNIQUE, specialty, signature_image_url, is_accepting_patients).
- Section G: new `staff_profiles` (employee_id, notes).
- Section H: new `neo4j_projection_outbox` (status, attempts, exponential-backoff scheduling).

### 3.2 Bootstrap admin

A separate one-shot SQL block, applied once after V2:

```sql
INSERT INTO users (email, password_hash, role, full_name, is_active, must_change_password)
VALUES (
    'admin@cliniflow.local',
    '<bcrypt(env: CLINIFLOW_INITIAL_ADMIN_PASSWORD, cost=12)>',
    'ADMIN',
    'Initial Administrator',
    true,
    true
)
ON CONFLICT (email) DO NOTHING;
```

The bcrypt hash is generated locally (do not commit). On first login, the admin is forced to change the password. Document the runbook in `docs/details/non-functional.md` (out of scope to update here, but flagged).

### 3.3 JPA entity layout

Per `ddd-conventions.md`, JPA entities live in `infrastructure/repository/<aggregate>/jpa/` and are mapped to/from `XxxModel` by the repository impl. Domain models stay framework-free.

```
infrastructure/repository/user/jpa/
  UserJpaEntity.java                    @Entity @Table("users")    (extended)
  StaffProfileJpaEntity.java            @Entity @Table("staff_profiles")  NEW
  DoctorJpaEntity.java                  @Entity @Table("doctors")  NEW

infrastructure/repository/patient/jpa/
  PatientJpaEntity.java                 (extended)
  PatientClinicalProfileJpaEntity.java  NEW; @OneToOne(cascade=ALL, fetch=LAZY, optional=false)
                                              from PatientJpaEntity
```

Mapping notes:
- `drug_allergies`, `chronic_conditions`, `regular_medications` → `@JdbcTypeCode(SqlTypes.JSON)` mapped to `List<DrugAllergyInfo>` etc.
- `profile_update_source`, `pregnancy_status` Postgres enums → varchar mapping with `@Enumerated(STRING)` for portability.
- `national_id_ciphertext` → `byte[]`.
- `_at` columns → `Instant`.

### 3.4 PDPA right-to-be-forgotten — anonymization, not deletion

Schema is designed so that a future `PatientWriteAppService.anonymize(UUID)` can:
- NULL out `patients.national_id_ciphertext`, `national_id_fingerprint`, `phone`, `email`.
- Replace `patients.full_name` with `'REDACTED'`.
- Reset `patient_clinical_profiles.{drug_allergies,chronic_conditions,regular_medications}` to `[]`.
- Replace `users.email` with `redacted-{userId}@deleted.cliniflow.local`, randomize `password_hash`, set `is_active=false`.
- Drop `[:ALLERGIC_TO]`, `[:HAS_HISTORY_OF]`, `[:TAKING]` edges from `(:Patient {id})` in Neo4j; keep the node id for referential integrity in past visits.
- Append an audit_log row with `metadata.reason = 'PDPA_ERASURE'`.

`patients.national_id_fingerprint` UNIQUE allows multiple NULLs (Postgres semantics) — anonymized patients don't collide. **Implementation deferred to a separate spec.**

### 3.5 Things deliberately not in V2

- `clinics` table for multi-clinic — implicit single clinic for MVP.
- `consent_records` history table — for now, `patients.consent_given_at` + `consent_version` capture single-version consent.
- `doctor_specialties` lookup — specialty stays free-text MVP.
- `password_reset_tokens` — separate auth spec.

### 3.6 V2 SQL (copy-paste into Supabase SQL editor)

```sql
-- =============================================================================
-- CliniFlow AI — V2: Registration & User Onboarding
-- Apply manually in Supabase SQL editor (Flyway is NOT used).
-- Idempotent: safe to re-run. Run sections in order.
-- Prerequisites: V1__init.sql already applied.
-- =============================================================================

-- Section A — Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Section B — Enums
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_update_source') THEN
        CREATE TYPE profile_update_source AS ENUM (
            'REGISTRATION', 'PRE_VISIT_CHAT', 'PORTAL', 'DOCTOR_VISIT', 'MIGRATED'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pregnancy_status') THEN
        CREATE TYPE pregnancy_status AS ENUM (
            'NOT_APPLICABLE', 'NOT_PREGNANT', 'PREGNANT', 'POSTPARTUM_LACTATING', 'UNKNOWN'
        );
    END IF;
END$$;

-- Section C — Extend users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone                   varchar(32),
    ADD COLUMN IF NOT EXISTS preferred_language      varchar(8) DEFAULT 'en'
        CHECK (preferred_language IN ('en','ms','zh')),
    ADD COLUMN IF NOT EXISTS must_change_password    boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS last_login_at           timestamptz,
    ADD COLUMN IF NOT EXISTS failed_login_attempts   int     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until            timestamptz;

-- Section D — Extend patients
ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS preferred_language     varchar(8)
        CHECK (preferred_language IS NULL OR preferred_language IN ('en','ms','zh')),
    ADD COLUMN IF NOT EXISTS registration_source    varchar(16) NOT NULL DEFAULT 'STAFF_LED'
        CHECK (registration_source IN ('SELF_SERVICE','STAFF_LED','MIGRATED')),
    ADD COLUMN IF NOT EXISTS consent_given_at       timestamptz,
    ADD COLUMN IF NOT EXISTS consent_version        varchar(16);

CREATE INDEX IF NOT EXISTS patients_national_id_fingerprint_idx
    ON patients(national_id_fingerprint);

-- Section E — patient_clinical_profiles
CREATE TABLE IF NOT EXISTS patient_clinical_profiles (
    id                              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id                      uuid          NOT NULL UNIQUE
                                                  REFERENCES patients(id) ON DELETE CASCADE,
    weight_kg                       numeric(5,2)
        CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 500)),
    weight_kg_updated_at            timestamptz,
    weight_kg_source                profile_update_source,
    height_cm                       numeric(5,2)
        CHECK (height_cm IS NULL OR (height_cm > 30 AND height_cm < 280)),
    height_cm_updated_at            timestamptz,
    height_cm_source                profile_update_source,
    drug_allergies                  jsonb         NOT NULL DEFAULT '[]'::jsonb,
    drug_allergies_updated_at       timestamptz,
    drug_allergies_source           profile_update_source,
    chronic_conditions              jsonb         NOT NULL DEFAULT '[]'::jsonb,
    chronic_conditions_updated_at   timestamptz,
    chronic_conditions_source       profile_update_source,
    regular_medications             jsonb         NOT NULL DEFAULT '[]'::jsonb,
    regular_medications_updated_at  timestamptz,
    regular_medications_source      profile_update_source,
    pregnancy_status                pregnancy_status,
    pregnancy_edd                   date,
    pregnancy_updated_at            timestamptz,
    pregnancy_source                profile_update_source,
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

-- Section F — doctors
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

-- Section G — staff_profiles
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

-- Section H — neo4j_projection_outbox
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
```

Bootstrap admin (run separately, ONCE, after V2):

```sql
-- Generate bcrypt hash locally first:
--   python3 -c "import bcrypt; print(bcrypt.hashpw(b'CHOOSE-A-STRONG-PASSWORD', bcrypt.gensalt(12)).decode())"
INSERT INTO users (email, password_hash, role, full_name, is_active, must_change_password)
VALUES (
    'admin@cliniflow.local',
    '<PASTE_BCRYPT_HASH_HERE>',
    'ADMIN',
    'Initial Administrator',
    true,
    true
)
ON CONFLICT (email) DO NOTHING;
```

---

## 4. DDD Code Structure (Backend)

Notation: ✨ new, ✏️ extend existing.

### 4.1 Domain layer

```
domain/biz/user/
├── model/
│   ├── UserModel.java                              ✏️ + phone, preferredLanguage,
│   │                                                  mustChangePassword, lastLoginAt,
│   │                                                  failedLoginAttempts, lockedUntil
│   ├── DoctorProfileModel.java                     ✨ child of UserModel for DOCTOR
│   └── StaffProfileModel.java                      ✨ child of UserModel for STAFF
├── repository/UserRepository.java                  ✏️ + findByEmail, existsByMmcNumber
├── service/
│   ├── UserPatientCreateDomainService.java         ✨
│   ├── UserStaffCreateDomainService.java           ✨
│   ├── UserDoctorCreateDomainService.java          ✨
│   ├── UserAdminCreateDomainService.java           ✨
│   └── UserPasswordEncodeDomainService.java        ✨
├── enums/
│   ├── UserRole.java                               (existing)
│   └── UserStatus.java                             ✨ ACTIVE, LOCKED, DEACTIVATED (derived)
├── event/
│   ├── UserRegisteredDomainEvent.java              ✨
│   └── PasswordChangedDomainEvent.java             ✨ (deferred consumer)
└── info/
    ├── PatientUserCreateInfo.java                  ✨
    ├── StaffUserCreateInfo.java                    ✨
    ├── DoctorUserCreateInfo.java                   ✨
    └── AdminUserCreateInfo.java                    ✨

domain/biz/patient/
├── model/
│   ├── PatientModel.java                           ✏️ + preferredLanguage, registrationSource,
│   │                                                  consentGivenAt, consentVersion,
│   │                                                  clinicalProfile child;
│   │                                                  hasGap(field), markConsent(version)
│   ├── PatientClinicalProfileModel.java            ✨ child entity
│   ├── DrugAllergyInfo.java                        ✨ value object
│   ├── ChronicConditionInfo.java                   ✨
│   ├── RegularMedicationInfo.java                  ✨
│   └── PatientIdentityInfo.java                    ✨
├── repository/PatientRepository.java               ✏️ + findByNationalIdFingerprint,
│                                                       existsByNationalIdFingerprint
├── service/
│   ├── PatientRegisterDomainService.java           ✨
│   ├── PatientClinicalProfileUpdateDomainService.java ✨
│   └── PatientNationalIdEncryptDomainService.java  ✨
├── enums/
│   ├── ProfileUpdateSource.java                    ✨
│   ├── PregnancyStatus.java                        ✨
│   ├── AllergySeverity.java                        ✨
│   └── CompletenessState.java                      ✨
├── event/
│   ├── PatientRegisteredDomainEvent.java           ✨
│   └── PatientClinicalProfileUpdatedDomainEvent.java ✨
└── info/
    ├── PatientRegisterInfo.java                    ✨
    ├── ClinicalProfileUpdateInfo.java              ✨
    └── PatientSearchPreviewInfo.java               ✨
```

**Aggregate-rule check:** `PatientClinicalProfileModel` is loaded only through `PatientRepository.findById()`. There is no `PatientClinicalProfileRepository`. All writes flow through `PatientModel` as the aggregate root.

### 4.2 Application layer

```
application/biz/user/
├── UserReadAppService.java                         ✏️ + getById, findByEmail
└── UserWriteAppService.java                        ✏️ + createPatientUser, createStaffUser,
                                                          createDoctorUser, createAdminUser,
                                                          forcePasswordChange

application/biz/patient/
├── PatientReadAppService.java                      ✏️ + searchByNationalId, getClinicalProfile
└── PatientWriteAppService.java                     ✏️ + register, updateClinicalProfile,
                                                          anonymize (stub)
```

`PatientWriteAppService.register()` orchestrates within one `@Transactional` boundary:

```
1. NRIC fingerprint dedupe (PatientRepository)
2. userWriteAppService.createPatientUser(...) → userId
3. patientRegisterDomainService.create(info, userId) → PatientModel (+ optional empty profile)
4. if baseline:
       patientClinicalProfileUpdateDomainService.applyAtRegistration(patient, info)
5. patientRepository.save(patient)               // cascades child profile
6. neo4jProjectionOutboxWriter.enqueue(...)
7. auditWriter.append(CREATE, ...)
8. eventPublisher.publish(PatientRegisteredDomainEvent)
9. return patientId
```

Any throw rolls the entire TX back — no partial state, no orphan outbox row.

### 4.3 Controller layer

```
controller/biz/auth/
├── AuthController.java                             (existing)
├── RegistrationController.java                     ✨ POST /api/auth/register/patient,
│                                                       POST /api/auth/forced-password-change
├── request/
│   ├── PatientSelfRegisterRequest.java             ✨
│   └── ForcedPasswordChangeRequest.java            ✨
├── response/PatientRegisteredDTO.java              ✨
└── converter/PatientSelfRegisterRequest2InfoConverter.java ✨

controller/biz/patient/
├── PatientController.java                          ✏️ + POST /api/patients,
│                                                       GET /api/patients/search,
│                                                       GET|PATCH /api/patients/{id}/clinical-profile
├── request/
│   ├── StaffCreatePatientRequest.java              ✨
│   └── ClinicalProfilePatchRequest.java            ✨
├── response/
│   ├── ClinicalProfileDTO.java                     ✨
│   ├── ClinicalProfileSnapshotDTO.java             ✨
│   └── PatientSearchPreviewDTO.java                ✨
└── converter/
    ├── PatientClinicalProfileModel2DTOConverter.java  ✨
    └── ClinicalProfilePatchRequest2InfoConverter.java ✨

controller/biz/admin/                               ✨ NEW route group
├── AdminUserController.java                        ✨ POST/GET/PATCH /api/admin/users[/{id}/active]
├── request/
│   ├── AdminCreateStaffRequest.java                ✨
│   ├── AdminCreateDoctorRequest.java               ✨
│   ├── AdminCreateAdminRequest.java                ✨
│   └── AdminUserListQuery.java                     ✨
├── response/
│   ├── UserCreatedDTO.java                         ✨ {userId, tempPassword (one-time)}
│   ├── AdminUserListItemDTO.java                   ✨
│   └── AdminUserListPageDTO.java                   ✨
└── converter/(one per request → info)              ✨

controller/biz/internal/patient/                    ✨ NEW route group
├── InternalPatientController.java                  ✨ GET|PATCH /internal/patients/{id}/clinical-profile
├── request/InternalClinicalProfilePatchRequest.java ✨
└── response/(reuses ClinicalProfileDTO from patient/)
```

Controllers stay thin: validate → map → call one app service → wrap in `WebResult<T>`.

### 4.4 Cross-cutting config

```
controller/config/
├── SecurityConfig.java                             ✏️ permitAll on /api/auth/register/**,
│                                                       hasRole(ADMIN) on /api/admin/**,
│                                                       service-token filter on /internal/**,
│                                                       rate limiter on register
├── AuthInterceptor.java                            ✏️ enforce must_change_password gate
├── ServiceTokenInterceptor.java                    ✨
├── RateLimitConfig.java                            ✨ 5/hour/IP on register
├── GlobalExceptionConfiguration.java               ✏️ + DuplicatePatientException → 409,
│                                                       DuplicateMmcException → 409,
│                                                       InvalidServiceTokenException → 401,
│                                                       SessionPatientMismatchException → 403
└── PasswordEncoderConfig.java                      ✨ BCrypt cost=12
```

### 4.5 Infrastructure layer

```
infrastructure/repository/user/
├── UserRepositoryImpl.java                         ✏️
└── jpa/
    ├── UserJpaEntity.java                          ✏️
    ├── DoctorJpaEntity.java                        ✨
    ├── StaffProfileJpaEntity.java                  ✨
    ├── UserSpringDataRepository.java               ✏️
    ├── DoctorSpringDataRepository.java             ✨
    └── StaffProfileSpringDataRepository.java       ✨

infrastructure/repository/patient/
├── PatientRepositoryImpl.java                      ✏️
├── jpa/
│   ├── PatientJpaEntity.java                       ✏️
│   ├── PatientClinicalProfileJpaEntity.java        ✨
│   └── PatientSpringDataRepository.java            ✏️
│   (NO PatientClinicalProfileSpringDataRepository — would violate aggregate rule)
└── converter/
    ├── PatientJpaEntity2ModelConverter.java        ✏️ include profile child
    └── PatientClinicalProfileJpaEntity2ModelConverter.java ✨

infrastructure/client/
├── AgentServiceClient.java                         (existing)
└── Neo4jProjectionClient.java                      ✨ wraps Neo4j Java driver,
                                                       MERGE-shaped idempotent ops,
                                                       Resilience4j circuit breaker

infrastructure/outbox/
├── Neo4jProjectionOutboxWriter.java                ✨
├── Neo4jProjectionOutboxWorker.java                ✨ @Scheduled drainer
├── Neo4jProjectionOperation.java                   ✨ enum
└── jpa/
    ├── Neo4jProjectionOutboxJpaEntity.java         ✨
    └── Neo4jProjectionOutboxSpringDataRepository.java ✨

infrastructure/crypto/
├── NationalIdEncryptor.java                        (existing or new)
├── ClinicalTextEncryptor.java                      ✨ encrypts allergy reactions, condition notes
└── KeyProvider.java                                ✨ env-var key for dev, KMS for prod

infrastructure/audit/AuditWriter.java               ✨ INSERT into audit_log within current TX
infrastructure/storage/SignatureImageStore.java     ✨ uploads to Supabase Storage
```

### 4.6 Frontend additions

```
frontend/app/
├── auth/register/page.tsx                          ✨
├── auth/register/success/page.tsx                  ✨
├── staff/patients/page.tsx                         ✏️ + NRIC search box
├── staff/patients/new/page.tsx                     ✨
├── admin/users/page.tsx                            ✨
├── admin/users/new/page.tsx                        ✨
├── admin/layout.tsx                                ✏️ admin nav
├── portal/profile/page.tsx                         ✨ read-only MVP
└── login/page.tsx                                  ✏️ handle must_change_password redirect

frontend/lib/
├── api/registration.ts                             ✨
├── api/patients.ts                                 ✏️
├── api/adminUsers.ts                               ✨
└── schemas/
    ├── patient-register.ts                         ✨ zod
    ├── clinical-profile.ts                         ✨ zod
    └── admin-user-create.ts                        ✨ zod, role-discriminated

frontend/components/
├── auth/RegisterPatientForm.tsx                    ✨ (use frontend-design skill)
├── staff/NricSearchBox.tsx                         ✨
├── staff/StaffCreatePatientForm.tsx                ✨
└── admin/CreateUserForm.tsx                        ✨ role-discriminated
```

### 4.7 Key invariants — where enforced

| Invariant | Enforced at |
|---|---|
| NRIC fingerprint uniqueness | `patients.national_id_fingerprint UNIQUE` (DB) + `PatientWriteAppService.register` (app) |
| MMC number uniqueness | `doctors.mmc_number UNIQUE` (DB) + `UserDoctorCreateDomainService` (domain) |
| Email uniqueness | `users.email UNIQUE` (DB) + `UserWriteAppService` precheck |
| Weight, height ranges | DB CHECK + domain service |
| Pregnancy ↔ EDD consistency | DB CHECK + domain service |
| Doctor user role-link | App service (DB CHECK with subquery is non-portable) |
| Bcrypt cost = 12 | `PasswordEncoderConfig` |
| NRIC encrypted before persist | `PatientRegisterDomainService` (only writer) |
| Audit log append-only | DB triggers (V1) |
| `must_change_password` enforced | `AuthInterceptor` |
| Service token validation | `ServiceTokenInterceptor` |
| Session-patient binding for /internal | `ServiceTokenInterceptor` |
| Profile-completeness gate | `PatientClinicalProfileUpdateDomainService.recomputeCompleteness` after every update; agent reads `completeness_state` |

### 4.8 Agent additions

```
agent/app/
├── tools/patient_profile_tool.py                   ✨ wraps GET/PATCH /internal/patients/{id}/clinical-profile
├── prompts/pre_visit/gap_filling.j2                ✨ system-prompt fragment listing missing/stale fields
└── (existing graph extended with gap-filling node)
```

The pre-visit graph adds a node that:
1. At session start, calls `patient_profile_tool.get(patient_id)`.
2. Computes `gaps = [field for field, info in profile if info.is_stale_or_missing]` using staleness thresholds (Q1 in §6.2).
3. If any safety-critical gap → routes to gap-filling sub-graph that asks clarifying questions and PATCHes answers back.
4. Once all safety-critical gaps resolved → proceeds to normal symptom intake.

---

## 5. Testing Strategy

Per global rules: 80%+ coverage; three test types (unit, integration, E2E); TDD where reasonable.

### 5.1 Unit tests (JUnit 5 + Mockito + AssertJ)

Domain & application layers, mock infrastructure:

| Class under test | Key cases |
|---|---|
| `PatientRegisterDomainService` | NRIC fingerprint computed; DOB-under-13 rejected; phone format (+60); NRIC encrypted before model returned; consent timestamp captured |
| `PatientClinicalProfileUpdateDomainService` | Weight/height range; pregnancy ↔ EDD; allergy reaction encrypted; per-field `_updated_at`/`_source` set on changed fields ONLY; `recomputeCompleteness` transitions INCOMPLETE→PARTIAL→COMPLETE |
| `UserPatientCreateDomainService` | Email lowercased; bcrypt-hashed; `must_change_password=false` self-signup, `=true` staff-created; duplicate email throws |
| `UserDoctorCreateDomainService` | MMC format; signature image required; `must_change_password=true` always; uniqueness |
| `PatientWriteAppService.register` | Happy path with mocks; NRIC duplicate → DuplicatePatientException; rollback on profile validation failure (no rows persisted); outbox enqueue happens in TX |
| `PatientWriteAppService.updateClinicalProfile` | Adding allergy enqueues `ALLERGY_ADD`; removing enqueues `ALLERGY_REMOVE`; weight update enqueues `PATIENT_UPSERT`; non-changes do NOT enqueue; audit log written with correct `actor_role` per source |
| `Neo4jProjectionOutboxWorker` | Drains in `next_attempt_at` order; idempotent on retry; exponential backoff; circuit-open behavior |
| `ServiceTokenInterceptor` | Missing/wrong token → 401; valid token + path-id ≠ session-resolved patient → 403; valid + matching → continue |
| `RateLimitConfig` | 6th request within hour from same IP → 429 |

### 5.2 Integration tests (Spring `@SpringBootTest` + Testcontainers)

Real Postgres 16 + real Neo4j 5 via Testcontainers. Shared `IntegrationTestBase` applies V1 + V2 SQL.

- `POST /api/auth/register/patient` happy + duplicate NRIC + with clinical baseline.
- `GET /api/patients/search?nric=` redacted preview path; audit-log written either way.
- `POST /api/patients` STAFF JWT works; PATIENT JWT 403; created user has `must_change_password=true`.
- `GET /api/patients/{id}/clinical-profile` patient-self vs other-patient (403); STAFF can read any.
- `PATCH /api/patients/{id}/clinical-profile` updates persist; audit-log records actor.
- `GET /internal/patients/{id}/clinical-profile` token + session OK; missing token 401; mismatched session-patient 403.
- `PATCH /internal/patients/{id}/clinical-profile` end-to-end including outbox drain → Neo4j edge present.
- `POST /api/admin/users` for DOCTOR — MMC uniqueness; signature uploaded; non-ADMIN 403.
- `Neo4jProjectionOutboxWorkerIT` — enqueue 10 ops, drain, all COMPLETED; idempotent on duplicate; Neo4j down → rows stay PENDING; restart → drains.
- `BootstrapAdminIT` — first ADMIN exists with `must_change_password=true`; login forces password change; admin endpoints blocked until password changed; after change, endpoints work.

### 5.3 Agent integration tests (`pytest`)

In `agent/tests/`:
- `test_patient_profile_tool.py` — get returns shape with `_updated_at` + `_source`; patch round-trips; staleness detection (e.g. weight > 90d old flagged stale).
- `test_pre_visit_gap_filling_graph.py` — incomplete profile routes to gap-filling node; PATCH fired when patient answer parsed.

### 5.4 E2E tests (Playwright)

Six flows with screenshots:
1. Patient self-signup happy path → JWT cookie set, lands on `/portal`.
2. Patient self-signup, NRIC duplicate → "already registered, please log in".
3. Staff search-then-create — NRIC not found → form → patient appears in list.
4. Staff search hits existing self-registered patient → redacted preview → open record.
5. Admin creates a doctor — MMC + specialty + signature → temp password → login → forced change → workspace.
6. Pre-visit chat fills allergy gap — patient self-signs without allergy → chat collects "penicillin" → portal shows allergy with `source = PRE_VISIT_CHAT`.

### 5.5 Out of scope for tests

Bcrypt itself, Postgres CHECK in isolation, Neo4j MERGE idempotency at driver level, HTML/CSS visual regression of the registration form.

---

## 6. Risks, Open Questions, Acceptance Criteria

### 6.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Outbox lag visible mid-chat (graph-RAG misses just-added allergy) | Medium | Medium | 1s drain cadence; agent ALSO reads canonical profile from Spring Boot — only graph traversal misses briefly. |
| Service token leak | Low | High | Token rotated quarterly, env-var only, never logged; rate-limited per-token; future mTLS. |
| PDPA: free-text reaction leaks PII | Medium | Medium | Encrypted at rest; UI shows summary not raw; redaction pass deferred. |
| MMC number format varies historically | Medium | Low | Validate alphanumeric, length 4-32; admin can correct. |
| First-admin bootstrap mishandled (weak password / committed hash) | Medium | High | Runbook prohibits commit; force change on first login; alert on seed-admin privileged action with `must_change_password=true`. |
| Profile-completeness gate too strict | Medium | Medium | Per-field, with per-visit "skip with reason" override. Doctor still sees the gap. |
| Neo4j projection drift (rare driver/network failure marked COMPLETED) | Low | Medium | Daily reconciliation job (out of scope here, flagged for ops). |
| Hibernate 6 jsonb sharp edges | Low | Low | `@JdbcTypeCode(SqlTypes.JSON)`; round-trip unit test; pin Hibernate version. |
| Doctor signature upload abuse | Medium | Low | Max 1MB, MIME image/png|jpeg only; virus scan deferred. |
| Concurrent staff registration with same NRIC | Low | Low | DB UNIQUE serializes — second request 409. |

### 6.2 Open questions

| # | Question | Owner | Default if not answered |
|---|---|---|---|
| Q1 | Per-field staleness threshold? | Product | Weight 90d, height/regular meds 365d, allergies/conditions/pregnancy never-stale |
| Q2 | Auto-login on self-signup? | Product | Yes (auto-set JWT cookie) |
| Q3 | Admin temp-password delivery — email or display? | Product | Display to creating ADMIN only (no email infra MVP) |
| Q4 | Single implicit clinic vs explicit `clinic_id` from day 1? | Product / SAD | Single implicit clinic |
| Q5 | Consent text + version? | Legal | Placeholder `v1` referencing `/consent`; legal sign-off later |
| Q6 | Agent profile PATCH semantics — replace or merge? | Tech | Merge with `_add` / `_remove`; never wholesale replace |
| Q7 | Doctor signature required at create or admin-edit later? | Product | Optional at create; edit path deferred |
| Q8 | Min password policy? | Security | 8+ chars, ≥1 letter + ≥1 digit |

### 6.3 Acceptance criteria

- **R-01** New patient with unseen NRIC registers via `/auth/register`, lands on `/portal` logged in; rows exist in `users`, `patients`, and `patient_clinical_profiles` (if baseline provided).
- **R-02** Second registration with same NRIC → 409, no DB rows created.
- **R-03** Staff JWT can search by NRIC, sees redacted preview when found, "not found" otherwise; both write `audit_log`.
- **R-04** Staff `POST /api/patients` creates a user with `must_change_password=true`; first login forces password change.
- **R-05** Admin can create STAFF, DOCTOR, or ADMIN user; doctor creation requires MMC + specialty + signature; signature uploaded and URL persisted.
- **R-06** Bootstrap admin exists with `must_change_password=true`; first login forces change before any privileged endpoint.
- **R-07** Pre-visit agent `GET /internal/patients/{id}/clinical-profile` returns each field with `_updated_at` + `_source`.
- **R-08** Pre-visit agent `PATCH /internal/patients/{id}/clinical-profile` with valid token + matching session persists in Postgres + enqueues outbox; within 5s Neo4j projection reflects update.
- **R-09** Profile update with `pregnancy_status='PREGNANT'` and no `pregnancy_edd` → 400 (DB CHECK + domain service).
- **R-10** Every write produces an `audit_log` row; row is immutable (DB triggers reject UPDATE/DELETE).
- **R-11** Coverage on `domain/biz/{patient,user}` and `application/biz/{patient,user}` ≥ 80%.
- **R-12** All six E2E flows pass green.

### 6.4 Suggested implementation order

1. Apply V2 SQL to Supabase + dev local Postgres; add JPA entities + repository extensions; integration test that entities round-trip.
2. Domain layer — models, value objects, enums, domain services, encryption integration. Unit tests.
3. Application layer — read/write app services with mocks. Unit tests.
4. Outbox + Neo4j client — outbox writer/worker, projection client, Neo4j integration test with Testcontainers.
5. Controllers + interceptors — JWT-protected first, then `/internal` with service token, then `/api/admin/users`. Endpoint integration tests.
6. Frontend — public registration, staff search-then-create, admin user create. Use frontend-design skill before coding UI.
7. Bootstrap + first-login forced password change.
8. E2E — six flows, screenshots.
9. Agent additions — patient_profile_tool, gap-filling sub-graph, pytest tests.

---

## 7. References

- `CLAUDE.md` — repo guide; database setup; PDPA invariants.
- `docs/details/architecture.md` — stack & ports.
- `docs/details/ddd-conventions.md` — naming, layering, aggregate rules followed by this spec.
- `docs/details/data-model.md` — Postgres + Neo4j schema baseline; this spec extends it.
- `docs/details/agent-design.md` — Graphify pattern; `agent/app/graph/schema.py` constraints.
- `docs/details/scope-and-acceptance.md` — original scope; this spec deliberately keeps appointments / reminders out of scope.
- `docs/post-mortem/2026-04-22-backend-boot-and-schema.md` — informs the "manually apply migrations" guidance.
- `backend/src/main/resources/db/migration/V1__init.sql` — baseline schema; this spec adds V2.
