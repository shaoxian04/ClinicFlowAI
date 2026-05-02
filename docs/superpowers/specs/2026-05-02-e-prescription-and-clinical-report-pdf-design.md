# E-Prescription & Clinical Report PDF — Design

**Status**: Draft for review · **Date**: 2026-05-02 · **Author**: shaoxian04 (with Claude assistance)
**Supersedes / depends on**: `docs/details/data-model.md`, `docs/details/identity-and-authz.md`, `docs/details/ddd-conventions.md`, `docs/post-mortem/2026-04-30-cross-patient-phi-leak.md`

---

## 1. Goal & scope

Generate two server-side PDFs at the moment a visit is finalized — one for the patient (e-prescription, bilingual EN+MS) and one for the doctor (full clinical report, English) — using a single source of truth for clinic, patient, and doctor identity. As a precondition, fix the fabricated-data bug in the on-screen Doctor Report Preview so what the doctor sees on screen matches the PDFs byte-for-byte.

Visual format follows the LIM ING HAAN cardiology prescription supplied as the reference (classic medical letterhead, two-column patient block, tabular medication list).

### In scope

1. New `cliniflow.clinic.*` config block in `application.yml`, bound via `@ConfigurationProperties`, exposed via `GET /api/clinic`
2. New `GET /api/visits/{visitId}/identification` returning `{clinic, patient, doctor, visit}` from real Postgres data — replaces the three demo functions in `ReportPreview.tsx`
3. New `prescription_documents` and `clinical_report_documents` Postgres tables to store immutable PDF bytes + sha256 hash, generated once at finalize
4. Shared Java `ClinicLetterheadRenderer` + `PatientDemographicsRenderer` PDF components used by both generators
5. `EPrescriptionPdfBuilder` (bilingual EN+MS instructions) + `ClinicalReportPdfBuilder` (English SOAP narrative)
6. Authenticated download endpoints — `GET /api/patient/visits/{id}/prescription.pdf` (patient self) and `GET /api/visits/{id}/clinical-report.pdf` (doctor)
7. Audit log row written on every generation and every download
8. Frontend wire-up: replace fake data in `ReportPreview.tsx`, wire the doctor's "Download PDF" button into two distinct buttons, add patient-portal download link

### Out of scope (explicit non-goals)

- Multi-clinic / multi-tenant clinic settings — config-only
- Patient address on the prescription
- Doctor's PDF localization (English only)
- "Reissue / amend prescription" workflow — finalized PDFs are immutable; corrections require a future "addendum" feature
- E-signature / digital signing of the PDF (PAdES) — Phase 2 hardening
- QR code on the prescription for verification — Phase 2
- Pharmacy integration / e-prescription transmission to pharmacy systems
- Clinic logo / doctor signature image embedded in the PDF — Phase 2
- PDF/A archival format — current output is plain PDF 1.4

### Why this matters now

The Doctor Report Preview at `frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx:30-63` currently displays a hardcoded fake clinic block plus IC/DOB/MMC fabricated from the visit ID hash. If the Download PDF stub at line 489 were ever wired up against current code, every generated prescription/report would carry a hashed-from-visit-ID national identifier that doesn't belong to the actual patient. This is the same class of bug as the Pat Demo cross-patient PHI leak (`docs/post-mortem/2026-04-30-cross-patient-phi-leak.md`). Fixing it is part of this feature, not a separate cleanup.

---

## 2. Decisions log (resolved during brainstorming)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | PDF visual style | Classic medical letterhead (matches LIM ING HAAN reference) | Familiar to pharmacies; works in B&W print; not branded UI |
| 2 | Patient address field | Skip for MVP | `patients` table has no address column; not needed for safe dispensing |
| 3 | Allergy info on prescription | Include | Already in `patient_clinical_profiles.drug_allergies` (Postgres); read directly, no agent round-trip needed |
| 4 | PDF generation strategy | Server-side in Spring Boot | Deterministic, auditable, can hash for tamper-evidence, simpler frontend |
| 5 | Clinic info source | `application.yml` env vars + `@ConfigurationProperties` | Single-tenant SME deployment; fail-fast at startup; admin portal CRUD is Phase 2 |
| 6 | Scope | Both PDFs (patient + doctor) + Report Preview rewire in one feature | Half-fixing leaves the on-screen preview showing fabricated data |
| 7 | Storage strategy | Snapshot at finalize, immutable artifact in `bytea` | Patient sees the version that was finalized; matches PDPA append-only mindset |
| 8 | Language | Doctor PDF EN only; patient PDF bilingual EN+MS | Reuses existing bilingual generation pipeline (`post_visit_summaries.summary_ms`); pharmacy-safe drug names in EN |
| 9 | PDF library | OpenPDF (LGPL) | Native `PdfPTable` for the medication grid; Apache-Maven friendly; no AGPL issues |

---

## 3. Data model

### 3.1 Clinic config (`application.yml`)

```yaml
cliniflow:
  clinic:
    name: "CliniFlow Medical Clinic"
    address-line1: "No. 12, Jalan Bukit Bintang"
    address-line2: "55100 Kuala Lumpur, Malaysia"
    phone: "+60 3-2145 8800"
    email: "reception@cliniflow.demo"
    registration-number: "KKM-KL-2024-0451"   # MoH facility registration
```

Bound by `@ConfigurationProperties("cliniflow.clinic") record ClinicProperties(...)`. Every field is `@NotBlank @Validated` — Spring Boot **fails to start** if any value is missing. `application-dev.yml` ships sensible defaults so dev env works out of the box; prod requires explicit env vars.

`GET /api/clinic` is the read-only HTTP surface (no auth required — same info ends up on patient-facing PDFs). Returns the same shape minus the `cliniflow.clinic` namespace.

### 3.2 New endpoint — `GET /api/visits/{visitId}/identification`

Single source of truth consumed by:
- The Doctor Report Preview UI
- The Patient Portal visit detail page (clinic name caption)
- Both PDF generators (server-side; reused via the same `VisitIdentificationReadAppService`)

Response shape:

```jsonc
{
  "clinic": {
    "name": "CliniFlow Medical Clinic",
    "addressLine1": "No. 12, Jalan Bukit Bintang",
    "addressLine2": "55100 Kuala Lumpur, Malaysia",
    "phone": "+60 3-2145 8800",
    "email": "reception@cliniflow.demo",
    "registrationNumber": "KKM-KL-2024-0451"
  },
  "patient": {
    "fullName": "Tan Ah Kow",
    "nationalId": "880101-01-1234",       // decrypted from national_id_ciphertext
    "dateOfBirth": "1988-01-01",
    "ageYears": 38,                        // computed server-side, not client-side
    "gender": "MALE",
    "phone": "+60 12-345 6789"
  },
  "doctor": {
    "fullName": "Dr. Lim Wei Jie",
    "mmcNumber": "MMC 54321",
    "specialty": "General Practice"
  },
  "visit": {
    "visitId": "...",
    "referenceNumber": "V-2026-05-02-0042",
    "visitDate": "2026-05-02",
    "finalizedAt": "2026-05-02T11:30:00+08:00"   // null if not yet finalized
  }
}
```

**Authorization:** `STAFF`/`DOCTOR`/`ADMIN` for any visit; `PATIENT` only for their own (ownership check via `PatientReadAppService.findByUserId(claims.userId())` — same pattern enforced after the cross-patient PHI leak post-mortem).

**`referenceNumber` format:** `V-{visitDate}-{dailySeq}` — `dailySeq` is a 4-digit zero-padded counter that resets daily, derived from a small `visit_reference_counter(date date PRIMARY KEY, last_seq int)` table updated atomically inside the existing `VisitWriteAppService.create()`. This is a tiny additive change, not a separate feature.

### 3.3 Two new Postgres tables for PDF artifacts

```sql
CREATE TABLE prescription_documents (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        uuid         NOT NULL UNIQUE REFERENCES visits(id) ON DELETE RESTRICT,
    patient_id      uuid         NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    pdf_bytes       bytea        NOT NULL,
    sha256          char(64)     NOT NULL,
    byte_size       integer      NOT NULL,
    generated_at    timestamptz  NOT NULL DEFAULT now(),
    generated_by    uuid         NOT NULL REFERENCES users(id),  -- doctor who finalized
    schema_version  smallint     NOT NULL DEFAULT 1               -- bump when PDF layout changes
);
CREATE INDEX prescription_documents_patient_idx ON prescription_documents(patient_id);

CREATE TABLE clinical_report_documents (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        uuid         NOT NULL UNIQUE REFERENCES visits(id) ON DELETE RESTRICT,
    patient_id      uuid         NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    pdf_bytes       bytea        NOT NULL,
    sha256          char(64)     NOT NULL,
    byte_size       integer      NOT NULL,
    generated_at    timestamptz  NOT NULL DEFAULT now(),
    generated_by    uuid         NOT NULL REFERENCES users(id),
    schema_version  smallint     NOT NULL DEFAULT 1
);
CREATE INDEX clinical_report_documents_patient_idx ON clinical_report_documents(patient_id);

CREATE TABLE visit_reference_counter (
    counter_date    date         PRIMARY KEY,
    last_seq        integer      NOT NULL DEFAULT 0
);
```

**Design notes:**
- `UNIQUE(visit_id)` enforces one PDF per visit (immutability per Decision 7)
- `bytea` because medical-grade text PDFs are 30-150KB — well within Postgres's comfortable range. No S3/filesystem dep needed for MVP; can migrate later if size grows
- `sha256` enables tamper-evidence without needing a separate signature blob
- `schema_version` lets us know which template version produced any historical row (useful for layout changes; old PDFs keep their old look)
- `ON DELETE RESTRICT` on `visit_id` — never silently lose a prescription if someone tries to delete a visit
- No update / delete trigger needed — application code only inserts; UI never edits
- All migrations applied **manually via Supabase SQL editor** (Flyway not used in this project per project conventions)

### 3.4 What does NOT change in the data model

- `medications`, `visits`, `patients`, `patient_clinical_profiles`, `users`, `doctor_profiles`, `post_visit_summaries` — all unchanged. The PDF generators read from them; they don't write back.
- `audit_log` — no schema change. New event types: `PRESCRIPTION_GENERATE`, `PRESCRIPTION_GENERATE_FAILED`, `PRESCRIPTION_GENERATE_BLOCKED`, `PRESCRIPTION_DOWNLOAD`, `PRESCRIPTION_DOWNLOAD_DENIED`, plus the `CLINICAL_REPORT_*` mirror set.
- Neo4j — completely untouched. PDFs read from Postgres only.

---

## 4. Java component architecture (DDD-aligned)

### 4.1 Package layout

```
backend/src/main/java/my/cliniflow/
├── infrastructure/
│   ├── config/
│   │   └── ClinicProperties.java                     ★ @ConfigurationProperties("cliniflow.clinic")
│   └── pdf/                                          ★ NEW package — PDF library wrapper, no domain imports
│       ├── PdfDocumentBuilder.java                   ★ thin OpenPDF wrapper, base font + page setup
│       ├── render/
│       │   ├── ClinicLetterheadRenderer.java         ★ stamps clinic header (used by both PDFs)
│       │   ├── PatientDemographicsRenderer.java      ★ stamps patient ID block (used by both PDFs)
│       │   ├── PrescriptionTableRenderer.java        ★ stamps bilingual EN+MS medication table
│       │   └── SoapReportRenderer.java               ★ stamps full SOAP narrative
│       ├── EPrescriptionPdfBuilderImpl.java          ★ implements domain interface; orchestrates renderers
│       └── ClinicalReportPdfBuilderImpl.java         ★ implements domain interface; orchestrates renderers
│
├── domain/biz/
│   ├── visit/
│   │   ├── model/
│   │   │   ├── PrescriptionDocumentModel.java        ★ JPA entity, child of Visit aggregate
│   │   │   └── ClinicalReportDocumentModel.java      ★ JPA entity, child of Visit aggregate
│   │   ├── repository/
│   │   │   ├── PrescriptionDocumentRepository.java   ★ JpaRepository<…> (matches existing per-child pattern)
│   │   │   └── ClinicalReportDocumentRepository.java ★
│   │   ├── service/
│   │   │   ├── PrescriptionGenerateDomainService.java ★ generates + persists PDF, publishes event
│   │   │   ├── ClinicalReportGenerateDomainService.java ★ same shape
│   │   │   ├── PrescriptionPdfBuilder.java           ★ domain interface (no framework imports)
│   │   │   └── ClinicalReportPdfBuilder.java         ★ domain interface
│   │   ├── info/
│   │   │   └── VisitIdentificationInfo.java          ★ record carrying {clinic, patient, doctor, visit}
│   │   └── event/
│   │       ├── PrescriptionIssuedDomainEvent.java    ★ already mentioned as example in ddd-conventions.md
│   │       └── ClinicalReportIssuedDomainEvent.java  ★
│   └── clinic/
│       └── info/
│           └── ClinicInfo.java                       ★ domain-layer carrier (record), separate from infra ClinicProperties
│
├── application/biz/
│   ├── visit/
│   │   ├── VisitIdentificationReadAppService.java    ★ assembles VisitIdentificationInfo from existing repos + ClinicProperties
│   │   └── ReportReviewAppService.java               ◇ MODIFY — finalize() now also calls Prescription/ClinicalReport DomainService
│   └── clinic/
│       └── ClinicReadAppService.java                 ★ thin wrapper over ClinicProperties → ClinicInfo
│
└── controller/biz/
    ├── visit/
    │   ├── VisitIdentificationController.java        ★ GET /api/visits/{visitId}/identification
    │   ├── VisitDocumentController.java              ★ GET /api/visits/{id}/clinical-report.pdf (doctor)
    │   └── response/
    │       └── VisitIdentificationDTO.java           ★
    ├── patient/
    │   └── PatientPrescriptionController.java        ★ GET /api/patient/visits/{id}/prescription.pdf (patient self)
    └── clinic/
        └── ClinicController.java                     ★ GET /api/clinic
```

### 4.2 Why this respects the DDD rules

| DDD rule | How this satisfies it |
|---|---|
| `controller → application → domain ← infrastructure` | Controllers call only app services. App services orchestrate domain services + repos. Domain services depend on `PrescriptionPdfBuilder` **interface** (in domain layer); the OpenPDF impl lives in `infrastructure/pdf/`. No domain → infrastructure imports. |
| Visit is the aggregate root; PDF docs are child entities | `PrescriptionDocumentModel` + `ClinicalReportDocumentModel` live under `domain/biz/visit/model/`. Per-child repos match the existing pattern (`MedicationRepository`, `PostVisitSummaryRepository`, `EvaluatorFindingRepository` are already organized this way inside the visit aggregate). |
| No cross-aggregate imports between `biz/` packages | `VisitIdentificationReadAppService` lives in `application/biz/visit/` and calls `PatientRepository`, `UserRepository`, `DoctorProfileRepository` — but it's an **application service**, allowed to compose multiple aggregates. Hands its assembled result back as a `VisitIdentificationInfo` (domain `info` carrier) so domain services work with one composed object instead of pulling across aggregates themselves. |
| One domain service per state transition | `PrescriptionGenerateDomainService` and `ClinicalReportGenerateDomainService` each model one transition: visit → "finalized + prescription issued" / "finalized + clinical report issued". Not a catch-all `PdfDomainService`. |
| Controllers have no business logic | All four new controllers are 5-15 lines: validate, call one app service, wrap in `WebResult` or `ResponseEntity<byte[]>`. PDF download endpoints just call `service.fetchBytes(visitId)` and return. |
| Domain events for state transitions | `PrescriptionIssuedDomainEvent` is named as an example in `ddd-conventions.md:68`. Publishing it positions us for future subscribers (WhatsApp notification, Neo4j projection) without coupling them now. |

### 4.3 Call flow at finalize

```
ReportReviewAppService.finalize(visitId)                                [@Transactional, outer]
  ├─ existing flow: set is_finalized, write summaries, write medications, audit row
  └─ COMMIT outer txn

  Then synchronously, in a new transaction:
  PrescriptionGenerateDomainService.generate(visitId)                   [@Transactional(REQUIRES_NEW)]
    ├─ VisitIdentificationReadAppService.assemble(visitId)
    │     ├─ ClinicReadAppService.get() → ClinicInfo
    │     ├─ PatientRepository.findById + decrypt nationalId
    │     ├─ DoctorProfileRepository.findByUserId
    │     └─ returns VisitIdentificationInfo
    ├─ PrescriptionPdfBuilder.build(VisitIdentificationInfo, medications)  [domain interface]
    │     ↳ EPrescriptionPdfBuilderImpl                                 [infra, OpenPDF]
    │         ↳ ClinicLetterheadRenderer.render(...)
    │         ↳ PatientDemographicsRenderer.render(...)
    │         ↳ PrescriptionTableRenderer.render(...)                   ← bilingual EN+MS
    │     ← byte[] pdfBytes
    ├─ PrescriptionDocumentRepository.save(new Model(visitId, bytes, sha256, ...))
    ├─ publish PrescriptionIssuedDomainEvent
    └─ audit.append("PRESCRIPTION_GENERATE", ...)

  ClinicalReportGenerateDomainService.generate(visitId)                 [same shape, English only]
```

### 4.4 Call flow at download

```
PatientPrescriptionController.download(visitId, auth)                   [thin]
  ├─ derive patientId from JWT (claims.userId() → PatientReadAppService.findByUserId)
  ├─ ownership check: visit.patientId == jwt.patientId  → 403 if mismatch
  ├─ audit.append("PRESCRIPTION_DOWNLOAD", ...)         [BEFORE serving bytes]
  ├─ PrescriptionDocumentRepository.findByVisitId(visitId).pdfBytes
  └─ ResponseEntity.ok().contentType(APPLICATION_PDF).body(bytes)
```

Audit row is written **before** the byte stream begins, in the same transaction as the read. If the audit insert fails, the user sees a 500 and never gets the bytes — no "served but not audited" state is reachable.

---

## 5. Frontend rewire

### 5.1 New shared data hook

```ts
// frontend/lib/visit-identification.ts
export type ClinicInfo  = { name; addressLine1; addressLine2; phone; email; registrationNumber };
export type PatientInfo = { fullName; nationalId; dateOfBirth; ageYears; gender; phone };
export type DoctorInfo  = { fullName; mmcNumber; specialty };
export type VisitInfo   = { visitId; referenceNumber; visitDate; finalizedAt };
export type VisitIdentification = { clinic: ClinicInfo; patient: PatientInfo; doctor: DoctorInfo; visit: VisitInfo };

export async function getVisitIdentification(visitId: string): Promise<VisitIdentification> {
    return apiGet<VisitIdentification>(`/visits/${visitId}/identification`);
}
```

Both the Doctor Report Preview *and* the patient portal visit page consume this hook → guaranteed alignment.

### 5.2 `ReportPreview.tsx` rewire (the safety-critical part)

**Delete:**
- Lines 30-36: hardcoded `CLINIC` constant
- Lines 38-54: `demoPatientProfile()` — fabricates IC from visit ID hash
- Lines 56-63: `demoDoctorProfile()` — fabricates MMC + qualification
- All call sites of both demo functions
- `formatDoctorName()` (backend now returns `fullName` already prefixed `Dr.`)
- `calcAge()` stays — repurposed against real DOB if any client-side recalculation is needed; otherwise the server-computed `ageYears` from the endpoint is used

**Replace with** an `useEffect` that fetches `getVisitIdentification(visitId)`, with skeleton + error states. Header block renders from `ident.clinic.*`; demographics from `ident.patient.*`; signature from `ident.doctor.*`. Two download buttons replace the single ambiguous one:
- "Download my clinical report" → `GET /api/visits/{id}/clinical-report.pdf`
- "Download patient prescription" → `GET /api/visits/{id}/prescription.pdf`

Both hidden when `!finalized`. Filename uses `referenceNumber` so saved files sort by date.

### 5.3 New `lib/download.ts` helper

```ts
export async function downloadAuthedFile(path: string, filename: string) {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
}
```

A plain `<a href>` won't carry the JWT, so the download must go through the same token-attaching fetch wrapper as the rest of the app.

### 5.4 Patient portal visit page — additive only

`frontend/app/portal/visits/[visitId]/page.tsx`:
- **Header**: add `From {ident.clinic.name}` caption above the existing visit title (font-mono uppercase, matches "PROFILE" caption style)
- **After medications section**: add `Download my prescription` primary button → `downloadAuthedFile("/patient/visits/{id}/prescription.pdf", ...)`
- Visible only when `ident.visit.finalizedAt != null` (always true for visits reaching the patient portal, but defense in depth)
- **No layout changes** to existing summary / medication / red flags / follow-up cards

### 5.5 Single-source-of-truth guarantee

After this rewire, every value below comes from exactly one assembly point in the backend (`VisitIdentificationReadAppService.assemble()`):

| Field | Source | Surfaces displaying it |
|---|---|---|
| Clinic name | `ClinicProperties` ← `application.yml` | Doctor Report Preview · Patient e-prescription PDF · Doctor clinical report PDF · Patient portal visit page caption |
| Patient IC | `patients.national_id_ciphertext` decrypted in `PatientReadAppService` | Doctor Report Preview · Both PDFs |
| Patient DOB / age | `patients.date_of_birth` (age computed server-side) | Same |
| Doctor MMC | `doctor_profiles.mmc_number` | Same |
| Doctor specialty | `doctor_profiles.specialty` | Same |
| Visit reference number | derived from `visits.gmt_create` + daily counter | Same |

If a value differs between any two surfaces, it's a bug and only one assembly point needs to be inspected. There is no client-side data fabrication anywhere.

---

## 6. PDF layout specs

### 6.1 Common page geometry

- **Page**: A4 portrait (210 mm × 297 mm)
- **Margins**: top 20mm, bottom 20mm, left 18mm, right 18mm
- **Fonts**: Times Roman 11pt body, Times Bold 14pt clinic name, Times Bold 13pt section titles, Times 9pt footer/disclaimer
- **Color**: black on white (formal medical documents per Decision 1 — works on any printer; no aurora-glass branding)

### 6.2 Common header — clinic letterhead

```
CLINIFLOW MEDICAL CLINIC                                       [Times Bold 14pt]
No. 12, Jalan Bukit Bintang, 55100 Kuala Lumpur, Malaysia       [Times 10pt grey #555]
Tel: +60 3-2145 8800  ·  Email: reception@cliniflow.demo  ·  Reg: KKM-KL-2024-0451
─────────────────────────────────────────────────────────────────
```

### 6.3 Common patient demographics — two-column block (mirrors LIM ING HAAN reference)

```
Name    : Tan Ah Kow                  Ref No  : V-2026-05-02-0042
NRIC    : 880101-01-1234              Date    : 02 May 2026
                                      DOB     : 01 Jan 1988
                                      Age     : 38 yrs
                                      Tel/HP  : +60 12-345 6789
                                      Gender  : Male

Allergy         : Penicillin, Shellfish
G6PD Deficiency : Unknown
```

- Allergy line: comma-joined values from `patient_clinical_profiles.drug_allergies`. Empty → renders `Nil reported`.
- G6PD line: not currently captured in CliniFlow → renders `Unknown` (placeholder; can be added to `patient_clinical_profiles` later as a small follow-up if clinically valuable)

### 6.4 Patient e-prescription body (the PDF-specific part)

```
                          ── PRESCRIPTION ──                  [Times Bold 13pt, centered]

┌────┬──────────────────────────────┬──────────┬────────────┬────────────┐
│ SNO│ MEDICINE / PRECAUTION        │ DOSAGE   │ FREQUENCY  │ TOTAL      │
├────┼──────────────────────────────┼──────────┼────────────┼────────────┤
│  1 │ Metformin 500mg              │ 1 tab/s  │ twice daily│ 30 days    │
│    │   Take with food             │          │            │            │
│    │   Ambil bersama makanan      │          │            │            │  ← MS line, italic, #555
├────┼──────────────────────────────┼──────────┼────────────┼────────────┤
│  2 │ Atorvastatin 20mg            │ 1 tab/s  │ at bedtime │ 30 days    │
│    │   Pada waktu tidur           │          │            │            │
└────┴──────────────────────────────┴──────────┴────────────┴────────────┘

Prescriber: Dr. Lim Wei Jie
MMC: MMC 54321 · General Practice
Date issued: 02 May 2026

─────────────────────────────────────────────────────────────────
This is a digitally generated e-prescription. Verify integrity:    [Times 8pt grey]
SHA-256: a1b2c3d4e5f6...                                            [Times 8pt mono]
```

- **Drug name** stays English (international standard, what pharmacies dispense against)
- **Instructions** column shows English first (regular weight), Malay underneath in italic + grey — sourced from the agent's existing bilingual generation pipeline (the same one that writes `post_visit_summaries.summary_ms`)
- **Total**: derived from `medications.duration_days`, formatted in Java (e.g. `30 days`, `1 month`, `2 weeks`)

### 6.5 Doctor's clinical report body (English only)

After the shared header + patient demographics block:

```
─────────────────────────────────────────────────────────────────
                     CLINICAL REPORT — VISIT V-2026-05-02-0042
─────────────────────────────────────────────────────────────────

SUBJECTIVE
  Chief complaint:    {medical_reports.subjective.chief_complaint}
  HPI:                {medical_reports.subjective.history_of_present_illness}

OBJECTIVE
  Vitals:             BP {bp}, HR {hr}, Temp {temp}, …
  Exam findings:      {medical_reports.objective.exam_findings}

ASSESSMENT
  Primary diagnosis:  {medical_reports.assessment.primary_diagnosis}
  Differentials:      {medical_reports.assessment.differential_diagnoses[]}

PLAN
  Investigations:     {…}
  Medications:        (same table as e-prescription, English only — no MS line)
  Follow-up:          {…}
  Patient education:  {…}

SAFETY ANNOTATIONS (if any acknowledged evaluator findings exist)
  • [CRITICAL · Drug allergy] Aspirin conflicts with patient allergy …
      Acknowledged by Dr. X at 11:25, reason: "Reviewed with patient, accepted risk"

Prescriber: Dr. Lim Wei Jie
MMC: MMC 54321 · General Practice
Finalized: 02 May 2026 11:30 SGT

─────────────────────────────────────────────────────────────────
This is a digitally generated clinical report. SHA-256: …
```

- Multi-page if needed (OpenPDF handles continuation; full clinic letterhead appears on page 1 only — pages 2+ get a slim running header `Visit V-… · Dr. … · Page n of N` to keep continuation context without wasting top-of-page real estate)
- Includes acknowledged evaluator findings with reason text + actor + timestamp — the report is a complete legal record of doctor-in-the-loop decisions

### 6.6 Filename convention (`Content-Disposition: attachment`)

- Patient e-prescription: `prescription-{referenceNumber}-{patientLastName}.pdf`
  → `prescription-V-2026-05-02-0042-Tan.pdf`
- Doctor clinical report: `clinical-report-{referenceNumber}-{patientLastName}.pdf`
  → `clinical-report-V-2026-05-02-0042-Tan.pdf`

Sortable by date for the doctor's local filing; patient name suffix helps disambiguate downloads.

---

## 7. Failure modes & error handling

### 7.1 PDF generation fails *during* finalize

`finalize` is currently `@Transactional`. Bringing PDF generation inside that transaction creates a coupling problem: if OpenPDF throws (OOM, NPE in a renderer), the entire finalize rolls back — the visit stays IN_PROGRESS. That's worse than "visit is finalized but PDF isn't ready yet."

**Decision: fail-soft with auto-retry.** PDF generation runs *after* the existing finalize transaction commits, in its own `REQUIRES_NEW` transaction (see §4.3 call flow).

The HTTP `/finalize` response always succeeds when the SOAP write succeeded. PDF status is communicated via `prescriptionStatus: "READY" | "GENERATING" | "FAILED"` in the response payload.

**Retry mechanism:** Same shape as the existing `notification_outbox` for WhatsApp — a `pdf_generation_outbox` table (or extend `notification_outbox` with `PRESCRIPTION_PDF` and `CLINICAL_REPORT_PDF` event types). A scheduler drains failed rows every 60s with exponential backoff.

**UX while retrying:**
- Download endpoint returns `503 Service Unavailable` with `Retry-After: 30` and `WebResult.error(ResultCode.PRESCRIPTION_NOT_READY, ...)`
- Frontend Report Preview button is disabled with tooltip "Preparing PDF…"

### 7.2 National ID decryption failure

A prescription without a verifiable patient identifier is medically dangerous (pharmacies match by IC). This is **block, not soft-fail**:
- `VisitIdentificationReadAppService.assemble()` propagates the decryption exception
- `PrescriptionGenerateDomainService.generate()` catches it → marks the row as `FAILED` with reason `IDENTITY_UNRESOLVED` → audits `PRESCRIPTION_GENERATE_BLOCKED · reason=IDENTITY_UNRESOLVED`
- Doctor sees a red banner in Report Preview: "PDF cannot be generated — patient identity unresolved. Contact admin." (download buttons disabled)
- Auto-retry does **not** apply (decryption failure is not transient)

### 7.3 Download requested for a not-yet-finalized visit

- `GET /api/visits/{id}/clinical-report.pdf` when `visit.status != FINALIZED` → `409 Conflict` + `WebResult.error(ResultCode.VISIT_NOT_FINALIZED, ...)`
- Same for patient prescription endpoint
- Frontend never shows the download buttons until `finalized` is true (defense in depth)

### 7.4 Cross-patient access attempt (PHI leak prevention)

- Patient endpoint `GET /api/patient/visits/{id}/prescription.pdf` enforces ownership via the same pattern fixed after the cross-patient PHI leak post-mortem: derive `patientId` from JWT, then `visit.patientId == patientId`. Mismatch → `403 Forbidden`, audit `PRESCRIPTION_DOWNLOAD_DENIED · OWNERSHIP_MISMATCH`.
- Doctor endpoint requires the doctor have access to the visit (their own visit, OR ADMIN role). Otherwise `403`.
- Both endpoints write a structured audit row on **every attempt** — even denied ones.

### 7.5 Bilingual instruction generation fails

The MS instructions come from the agent's existing finalize-time bilingual generation. Three sub-cases:
- **Agent timed out / down**: prescription PDF falls back to **English-only** with a footer note: `Translation unavailable for this prescription.`
- **Specific medication's MS translation missing**: render English-only for that row only.
- **Suspect translation** (empty / equals English): treated as missing — fallback to English.

The prescription is **always issued**, never blocked on translation. Translation is enhancement, not gate.

### 7.6 Clinic config missing or malformed at startup

Spring Boot's `@ConfigurationProperties("cliniflow.clinic") @Validated` with `@NotBlank` on every field guarantees the app **fails to start** if any clinic field is missing. Forces deploy-time discovery rather than first-prescription-time discovery.

`application-dev.yml` ships demo defaults (the same values currently hardcoded in `ReportPreview.tsx`, now in the right place).

### 7.7 Re-finalize after the visit is already finalized

`UNIQUE(visit_id)` on both PDF tables enforces single-document-per-visit. If `finalize()` is called twice (race / retry loop), the second `PrescriptionDocumentRepository.save()` throws `DataIntegrityViolationException`. `PrescriptionGenerateDomainService` catches it and treats it as success (idempotent — original document already exists).

Application-level guard: `ReportReviewAppService.finalize()` early-returns if `visit.is_finalized` is already true.

### 7.8 PDF size

Postgres `bytea` is fine to ~10MB; medical text PDFs land at 30-150KB typically.
- **Soft alarm at > 2MB**: `WARN` log with visit ID. Above expected even with future logo + signature additions.
- **Hard error at > 10MB**: fail the generation, mark `FAILED · reason=SIZE_EXCEEDED`, do not store the row.

### 7.9 Audit log write failure after PDF was already served

Race condition: byte stream mid-flight when audit `INSERT` fails. Mitigation: controller writes audit row **before** streaming bytes, in the same transaction:

```java
@Transactional
public ResponseEntity<byte[]> download(UUID visitId, Authentication auth) {
    auditService.append("PRESCRIPTION_DOWNLOAD", "visit", visitId.toString(), ...);
    byte[] bytes = repo.findByVisitId(visitId).orElseThrow(...).getPdfBytes();
    return ResponseEntity.ok().contentType(APPLICATION_PDF).body(bytes);
}
```

If audit write fails, user sees 500 and never gets bytes. No "served but not audited" state is reachable.

### 7.10 Failure summary

| Failure | Where caught | Visible to user as | Auto-retry? | Audit event |
|---|---|---|---|---|
| OpenPDF throws during generate | `PrescriptionGenerateDomainService` | "Preparing PDF…" + 503 on download until retry succeeds | Yes (outbox) | `PRESCRIPTION_GENERATE_FAILED` then `…_RETRIED` |
| National ID decryption fails | `VisitIdentificationReadAppService` | Red banner in Report Preview, download buttons disabled | No (not transient) | `PRESCRIPTION_GENERATE_BLOCKED · IDENTITY_UNRESOLVED` |
| Download before finalize | `*PdfController` | 409 Conflict + message | N/A | `PRESCRIPTION_DOWNLOAD_DENIED · NOT_FINALIZED` |
| Cross-patient access | `*PdfController` ownership check | 403 Forbidden | N/A | `PRESCRIPTION_DOWNLOAD_DENIED · OWNERSHIP_MISMATCH` |
| MS translation missing | `PrescriptionTableRenderer` | English-only with footer note | N/A — soft fallback | None (logged only) |
| Clinic config missing | `@Validated @ConfigurationProperties` | App fails to start | N/A | None (startup error) |
| Re-finalize | `UNIQUE(visit_id)` | Idempotent — original PDF served | Implicit | None on duplicate |
| PDF > 2MB | Domain service | Nothing different | N/A | `WARN` log with visitId |
| PDF > 10MB | Domain service | "Preparing PDF…" + 503 | No | `PRESCRIPTION_GENERATE_FAILED · SIZE_EXCEEDED` |
| Audit write fails | Controller `@Transactional` | 500 — bytes not served | None | None (audit row is what failed) |

---

## 8. Acceptance criteria

All criteria must be observably true before this feature ships.

**Identity alignment**
1. The hardcoded `CLINIC` constant and the `demoPatientProfile()` / `demoDoctorProfile()` functions are removed from `frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx`. `grep` returns zero matches for these symbols in the entire `frontend/app/` tree.
2. The on-screen Doctor Report Preview header for any visit shows the same clinic name, address, phone, registration number, patient IC, DOB, age, gender, doctor name, MMC number, and specialty as the corresponding generated PDFs.
3. `GET /api/visits/{visitId}/identification` returns the same payload regardless of which authenticated role calls it — the data shape is identical for doctor, staff, admin, and the visit-owning patient.

**PDF generation**
4. `POST /api/visits/{visitId}/report/finalize` on a previously-IN_PROGRESS visit creates exactly one row in `prescription_documents` AND one row in `clinical_report_documents`, each with non-null `pdf_bytes`, a 64-char `sha256`, `byte_size > 0`, `generated_at` within 5 seconds of the finalize timestamp, and `generated_by = the doctor's user_id`.
5. The finalize response includes `prescriptionStatus: "READY" | "GENERATING" | "FAILED"`.
6. Re-calling `finalize` on an already-finalized visit does not create a second PDF row (idempotent).
7. PDF bytes are byte-identical on every download (proven via SHA-256 round-trip).

**Authorization & audit**
8. `GET /api/patient/visits/{id}/prescription.pdf` called by a patient who does not own the visit returns `403 Forbidden` and writes an audit row `PRESCRIPTION_DOWNLOAD_DENIED · reason=OWNERSHIP_MISMATCH`.
9. Every successful download writes one audit row with action `PRESCRIPTION_DOWNLOAD` (or `CLINICAL_REPORT_DOWNLOAD`), the actor user_id, visit_id, timestamp, and correlation ID.
10. Either download endpoint on a visit where `status != FINALIZED` returns `409 Conflict` with `WebResult.error(VISIT_NOT_FINALIZED, ...)`.

**Bilingual + format conformance**
11. The patient e-prescription PDF, opened in any PDF viewer, has the clinic letterhead at the top, the patient demographics block in the LIM ING HAAN two-column layout, the centered "PRESCRIPTION" heading, and a 5-column medication table (SNO / MEDICINE / DOSAGE / FREQUENCY / TOTAL) — verified in CI by extracting text via PDFBox and asserting the sequence matches a checked-in golden file (not a pixel diff — those are flaky across renderers).
12. Each medication row in the patient PDF shows the English instruction immediately followed by the Malay translation in italic grey on the next line — when the agent's bilingual generation succeeded for that medication. When it didn't, the row shows English-only and a footer disclaimer "Translation unavailable for this prescription."
13. The doctor's clinical report PDF includes all four SOAP sections plus any acknowledged evaluator findings with the doctor's reason text and timestamp.

**On-screen UX**
14. The Doctor Report Preview shows two distinct buttons after finalization: "Download my clinical report" and "Download patient prescription." Both are hidden when the visit is not finalized.
15. The patient portal visit detail page shows a "Download my prescription" button below the medication cards section, visible only after `finalizedAt != null`.
16. The patient portal visit page header now includes a small caption `From {clinic.name}` above the visit title.

**Failure modes (regression-safety)**
17. Killing the agent service before `finalize` and then calling `finalize` results in: visit becomes FINALIZED, medications get written, the prescription PDF is generated **with English-only instructions and the disclaimer**, and the doctor's clinical report PDF is generated normally.
18. Removing `cliniflow.clinic.name` from `application.yml` and restarting the backend results in **app startup failure** with a clear error message naming the missing property.

---

## 9. Test strategy

| Layer | Tool | Coverage |
|---|---|---|
| **Unit (Java)** | JUnit + Mockito | All four renderers (`ClinicLetterheadRenderer`, `PatientDemographicsRenderer`, `PrescriptionTableRenderer`, `SoapReportRenderer`) — given inputs → assert OpenPDF object structure, language fallback behavior |
| **Unit (Java)** | JUnit + Mockito | `VisitIdentificationReadAppService.assemble()` — happy path, decryption failure, missing clinical_profile, missing doctor profile |
| **Unit (Java)** | JUnit | `PrescriptionGenerateDomainService` — happy path + each failure mode in §7 (PDF library throws, identity unresolved, oversize, duplicate finalize) using a mocked `PrescriptionPdfBuilder` |
| **PDF visual regression** | OpenPDF rendering + `pdfbox` text extraction | Generate fixture PDF for a canonical test visit; assert extracted text matches a checked-in golden file (`src/test/resources/golden/prescription-canonical.txt`). Catches accidental layout changes that JUnit-on-API can't see. |
| **Integration (Spring Boot)** | `@SpringBootTest` + H2 + WireMock for the agent | End-to-end `finalize` → `prescription_documents` row + `clinical_report_documents` row + audit rows — asserts byte_size > 0, sha256 length 64, both PDFs parseable as valid PDFs |
| **Integration** | `@SpringBootTest` + MockMvc | Authorization matrix — patient owns visit ✓, patient doesn't own visit ✗, doctor any visit ✓, anonymous ✗ — all 4 scenarios per endpoint |
| **Integration** | `@SpringBootTest` | Re-finalize idempotency — second `finalize` call returns success and document table still has exactly one row |
| **Contract (frontend)** | TypeScript types + msw in jest | `getVisitIdentification()` typed against actual backend response shape; mocked endpoint returns fixture; ReportPreview renders all expected fields |
| **E2E (Playwright MCP)** | Real browser against Docker stack | (a) Doctor finalize → both PDFs generated → both download buttons appear → click both → file downloads with correct filename · (b) Patient logs in, sees finalized visit, downloads prescription, asserts HTTP 200 + `application/pdf` content-type · (c) Cross-patient access denied — patient B tries to download patient A's prescription URL, gets 403 |
| **PHI safety regression** | Integration | For any visit, the IC/DOB/phone in the PDF text equals the corresponding `patients` row (decrypted). Specifically guards against re-introduction of `demoPatientProfile()`-style fabrication. |

---

## 10. Rollout

**Phase 1 — single PR (this design):**
1. Backend infrastructure + domain (clinic config, repos, models, domain services, identification app service, controllers, OpenPDF dep)
2. Frontend rewire of `ReportPreview.tsx` (delete demo functions, consume `/identification`)
3. Frontend new `getVisitIdentification` + `downloadAuthedFile` helpers
4. Two new download UI surfaces (doctor preview + patient portal)
5. SQL migration for `prescription_documents`, `clinical_report_documents`, `visit_reference_counter` (manually applied to Supabase per project convention; not Flyway)

**No feature flag** — this is a new feature with no existing alternative behavior to A/B against. The closest thing to a flag is the soft-fail on PDF generation: if generation fails, the visit still finalizes correctly, so users see degraded behavior rather than broken behavior.

**Deployment order:**
1. Apply SQL migration to Supabase (the three new tables)
2. Set `cliniflow.clinic.*` env vars in `.env` for prod, staging, dev
3. Deploy backend (will fail to start if env vars are missing — surfacing config gaps immediately)
4. Deploy frontend
5. Smoke test: finalize one visit in each environment, download both PDFs, verify content

**Rollback plan:**
Revert frontend deploy first (download buttons disappear), then revert backend deploy. The SQL migration leaves three unused tables behind on rollback — harmless. The clinic config env vars are also harmless to leave set.

---

## 11. Phase 2 (deferred)

Things explicitly not in this design:
- **G6PD deficiency field** in `patient_clinical_profiles` (currently rendered as "Unknown" placeholder)
- **Clinic logo** embedded in PDF letterhead
- **Doctor e-signature** image in the footer
- **Digital signing** (PAdES / PKCS#7 detached) of the PDF for legal admissibility
- **QR code** containing a verification URL → page proving the PDF hash matches what was issued at finalize
- **Pharmacy integration** / e-prescription transmission (FHIR or proprietary API)
- **Reissue / amend workflow** — finalized prescription is immutable for now; corrections require future "addendum" feature
- **Admin-editable clinic settings** — `clinic_settings` table with admin portal CRUD; falls back to `ClinicProperties` when no row
- **PDF/A archival format** for long-term preservation
- **Source-label fix** in `Neo4jProjectionClient.java:144` (currently hardcodes `'REGISTRATION'`) — tracked separately
- **Stray `(:Allergy)` node cleanup** (case-duplicates, garbage values) — tracked separately
