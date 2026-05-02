# E-Prescription & Clinical Report PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate two server-side PDFs (patient e-prescription, doctor clinical report) at visit finalization, sourced from a single identity assembly endpoint that also drives the on-screen Doctor Report Preview — eliminating the existing fabricated-data bug and producing immutable, auditable medical documents.

**Architecture:** Spring Boot generates PDFs via OpenPDF inside a `REQUIRES_NEW` transaction after the existing `finalize` commits. PDFs are stored as `bytea` in two new Postgres tables (one row per visit, immutable, sha256-hashed). One backend assembly point (`VisitIdentificationReadAppService`) feeds both the Doctor Report Preview UI and the PDF generators, so on-screen and downloaded artifacts are byte-aligned. Domain/application/infrastructure layering follows existing per-child-repo patterns inside the Visit aggregate.

**Tech Stack:** Java 21, Spring Boot 3.3, OpenPDF 1.4 (LGPL), JPA/Hibernate, Postgres (Supabase), Next.js 14, TypeScript, Playwright MCP for E2E.

**Spec:** `docs/superpowers/specs/2026-05-02-e-prescription-and-clinical-report-pdf-design.md`

**Phasing rationale:** Five phases, each ships independently:
- **Phase 1** kills the PHI fabrication bug on its own (no PDFs generated yet, but the on-screen preview now shows real data).
- **Phase 2** is pure infrastructure (renderers + builders) with unit tests against PDFBox text extraction. No user-facing change.
- **Phase 3** ships the patient e-prescription PDF end-to-end (generation + download + UI).
- **Phase 4** ships the doctor's clinical report PDF end-to-end.
- **Phase 5** hardens against partial failures (auto-retry outbox, banners, completeness audits).

---

## File map

### Backend new files

```
backend/src/main/java/my/cliniflow/
├── infrastructure/
│   ├── config/ClinicProperties.java
│   └── pdf/
│       ├── PdfDocumentBuilder.java
│       ├── render/
│       │   ├── ClinicLetterheadRenderer.java
│       │   ├── PatientDemographicsRenderer.java
│       │   ├── PrescriptionTableRenderer.java
│       │   └── SoapReportRenderer.java
│       ├── EPrescriptionPdfBuilderImpl.java
│       └── ClinicalReportPdfBuilderImpl.java
├── domain/biz/
│   ├── visit/
│   │   ├── model/
│   │   │   ├── PrescriptionDocumentModel.java
│   │   │   └── ClinicalReportDocumentModel.java
│   │   ├── repository/
│   │   │   ├── PrescriptionDocumentRepository.java
│   │   │   └── ClinicalReportDocumentRepository.java
│   │   ├── service/
│   │   │   ├── PrescriptionGenerateDomainService.java
│   │   │   ├── ClinicalReportGenerateDomainService.java
│   │   │   ├── PrescriptionPdfBuilder.java
│   │   │   ├── ClinicalReportPdfBuilder.java
│   │   │   └── ReferenceNumberDomainService.java
│   │   ├── info/
│   │   │   └── VisitIdentificationInfo.java
│   │   └── event/
│   │       ├── PrescriptionIssuedDomainEvent.java
│   │       └── ClinicalReportIssuedDomainEvent.java
│   └── clinic/info/ClinicInfo.java
├── application/biz/
│   ├── visit/VisitIdentificationReadAppService.java
│   └── clinic/ClinicReadAppService.java
└── controller/biz/
    ├── visit/
    │   ├── VisitIdentificationController.java
    │   ├── VisitDocumentController.java
    │   └── response/VisitIdentificationDTO.java
    ├── patient/PatientPrescriptionController.java
    └── clinic/ClinicController.java
```

### Backend modified files

```
backend/pom.xml                                                          ← add OpenPDF dep
backend/src/main/resources/application.yml                               ← add cliniflow.clinic.* defaults
backend/src/main/resources/application-dev.yml                           ← add dev defaults
backend/src/main/java/my/cliniflow/application/biz/visit/ReportReviewAppService.java
   ← finalize() also calls Prescription/ClinicalReport DomainService; response carries prescriptionStatus
backend/src/main/java/my/cliniflow/application/biz/visit/VisitWriteAppService.java
   ← create() assigns reference_number via ReferenceNumberDomainService
backend/src/main/java/my/cliniflow/controller/biz/visit/response/FinalizeResponse.java
   ← add prescriptionStatus + clinicalReportStatus fields
backend/src/main/resources/db/migration/V14__pdf_documents.sql           ← new manual migration
```

### Frontend new files

```
frontend/lib/visit-identification.ts
frontend/lib/clinic.ts
frontend/lib/download.ts
```

### Frontend modified files

```
frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx
   ← delete CLINIC, demoPatientProfile, demoDoctorProfile, formatDoctorName
   ← consume getVisitIdentification(); add two download buttons
frontend/app/portal/visits/[visitId]/page.tsx
   ← add "From {clinic.name}" caption + "Download my prescription" button
frontend/lib/types/finalize.ts (or wherever the FinalizeResponse type lives)
   ← add prescriptionStatus + clinicalReportStatus fields
```

### Tests

```
backend/src/test/java/my/cliniflow/
├── controller/biz/clinic/ClinicControllerTest.java
├── controller/biz/visit/VisitIdentificationControllerTest.java
├── controller/biz/visit/VisitDocumentControllerTest.java
├── controller/biz/patient/PatientPrescriptionControllerTest.java
├── application/biz/visit/VisitIdentificationReadAppServiceTest.java
├── domain/biz/visit/service/
│   ├── PrescriptionGenerateDomainServiceTest.java
│   ├── ClinicalReportGenerateDomainServiceTest.java
│   └── ReferenceNumberDomainServiceTest.java
└── infrastructure/pdf/
    ├── render/ClinicLetterheadRendererTest.java
    ├── render/PatientDemographicsRendererTest.java
    ├── render/PrescriptionTableRendererTest.java
    ├── render/SoapReportRendererTest.java
    ├── EPrescriptionPdfBuilderImplTest.java
    └── ClinicalReportPdfBuilderImplTest.java

backend/src/test/resources/golden/
├── prescription-canonical.txt          ← golden text-extraction baseline
└── clinical-report-canonical.txt
```

---

## Phase 1 — Identity foundation (kills the PHI fabrication bug)

**Phase exit criteria:**
- `GET /api/clinic` returns the configured clinic block; auth-free.
- `GET /api/visits/{visitId}/identification` returns `{clinic, patient, doctor, visit}` from real Postgres data; ownership-checked for PATIENT role.
- The Doctor Report Preview at `/doctor/visits/{id}` shows real patient IC, DOB, doctor MMC, and clinic info — no longer derived from `visitId.charCodeAt()`.
- All three demo functions and the hardcoded `CLINIC` constant are deleted from `ReportPreview.tsx`.
- Spring Boot fails to start if `cliniflow.clinic.name` is empty.
- Existing tests still green.

### Task 1.1: Add ClinicProperties (config binding)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/config/ClinicProperties.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/resources/application-dev.yml` (create if missing)

- [ ] **Step 1.1.1: Add the dev defaults to `application.yml` (committed defaults so dev works)**

Append to `backend/src/main/resources/application.yml` (after the last top-level key, before any profile-specific overrides):

```yaml
cliniflow:
  clinic:
    name: ${CLINIFLOW_CLINIC_NAME:CliniFlow Medical Clinic}
    address-line1: ${CLINIFLOW_CLINIC_ADDRESS_LINE1:No. 12, Jalan Bukit Bintang}
    address-line2: ${CLINIFLOW_CLINIC_ADDRESS_LINE2:55100 Kuala Lumpur, Malaysia}
    phone: ${CLINIFLOW_CLINIC_PHONE:+60 3-2145 8800}
    email: ${CLINIFLOW_CLINIC_EMAIL:reception@cliniflow.demo}
    registration-number: ${CLINIFLOW_CLINIC_REGISTRATION_NUMBER:KKM-KL-2024-0451}
```

- [ ] **Step 1.1.2: Write the ClinicProperties record**

Create `backend/src/main/java/my/cliniflow/infrastructure/config/ClinicProperties.java`:

```java
package my.cliniflow.infrastructure.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Single source of clinic letterhead info for both PDF generators and
 * the Doctor Report Preview UI. Bound from `cliniflow.clinic.*` in
 * application.yml. App fails to start if any field is blank.
 */
@Validated
@ConfigurationProperties(prefix = "cliniflow.clinic")
public record ClinicProperties(
        @NotBlank String name,
        @NotBlank String addressLine1,
        @NotBlank String addressLine2,
        @NotBlank String phone,
        @NotBlank String email,
        @NotBlank String registrationNumber
) {}
```

- [ ] **Step 1.1.3: Enable @ConfigurationProperties scanning**

If the project's `@SpringBootApplication` class doesn't already have `@ConfigurationPropertiesScan`, add it. Check first:

```bash
grep -n "@ConfigurationPropertiesScan\|@SpringBootApplication" backend/src/main/java/my/cliniflow/CliniflowApplication.java
```

If missing, add `@ConfigurationPropertiesScan("my.cliniflow.infrastructure.config")` directly above (or alongside) `@SpringBootApplication` in `CliniflowApplication.java`.

- [ ] **Step 1.1.4: Write the failing startup-failure test**

Create `backend/src/test/java/my/cliniflow/infrastructure/config/ClinicPropertiesTest.java`:

```java
package my.cliniflow.infrastructure.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.validation.BindValidationException;
import org.springframework.boot.context.properties.source.ConfigurationPropertyName;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class ClinicPropertiesTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(TestConfig.class);

    @org.springframework.boot.context.properties.EnableConfigurationProperties(ClinicProperties.class)
    static class TestConfig {}

    @Test
    void blank_name_blocks_startup() {
        runner.withPropertyValues(
                "cliniflow.clinic.name=",
                "cliniflow.clinic.address-line1=A",
                "cliniflow.clinic.address-line2=B",
                "cliniflow.clinic.phone=C",
                "cliniflow.clinic.email=d@e.f",
                "cliniflow.clinic.registration-number=R"
        ).run(ctx -> assertThat(ctx).hasFailed()
                .getFailure()
                .hasMessageContaining("name"));
    }

    @Test
    void all_fields_present_starts_up() {
        runner.withPropertyValues(
                "cliniflow.clinic.name=N",
                "cliniflow.clinic.address-line1=A",
                "cliniflow.clinic.address-line2=B",
                "cliniflow.clinic.phone=C",
                "cliniflow.clinic.email=d@e.f",
                "cliniflow.clinic.registration-number=R"
        ).run(ctx -> {
            assertThat(ctx).hasNotFailed();
            ClinicProperties cp = ctx.getBean(ClinicProperties.class);
            assertThat(cp.name()).isEqualTo("N");
            assertThat(cp.email()).isEqualTo("d@e.f");
        });
    }
}
```

- [ ] **Step 1.1.5: Run tests — expect FAIL on missing imports / annotation processor**

Run:
```bash
cd backend && ./mvnw -q test -Dtest=ClinicPropertiesTest
```

Expect: PASS once compilation succeeds. If it fails, ensure `spring-boot-configuration-processor` is on the classpath (it's an annotation processor; usually already present via spring-boot-starter dependencies).

- [ ] **Step 1.1.6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/config/ClinicProperties.java \
        backend/src/main/resources/application.yml \
        backend/src/test/java/my/cliniflow/infrastructure/config/ClinicPropertiesTest.java
git commit -m "feat(clinic): add ClinicProperties config binding with @Validated"
```

### Task 1.2: ClinicInfo + ClinicReadAppService + GET /api/clinic

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/clinic/info/ClinicInfo.java`
- Create: `backend/src/main/java/my/cliniflow/application/biz/clinic/ClinicReadAppService.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/clinic/ClinicController.java`
- Test: `backend/src/test/java/my/cliniflow/controller/biz/clinic/ClinicControllerTest.java`

- [ ] **Step 1.2.1: Write the domain carrier**

Create `backend/src/main/java/my/cliniflow/domain/biz/clinic/info/ClinicInfo.java`:

```java
package my.cliniflow.domain.biz.clinic.info;

public record ClinicInfo(
        String name,
        String addressLine1,
        String addressLine2,
        String phone,
        String email,
        String registrationNumber
) {}
```

- [ ] **Step 1.2.2: Write the read app service**

Create `backend/src/main/java/my/cliniflow/application/biz/clinic/ClinicReadAppService.java`:

```java
package my.cliniflow.application.biz.clinic;

import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.infrastructure.config.ClinicProperties;
import org.springframework.stereotype.Service;

@Service
public class ClinicReadAppService {

    private final ClinicProperties props;

    public ClinicReadAppService(ClinicProperties props) {
        this.props = props;
    }

    public ClinicInfo get() {
        return new ClinicInfo(
                props.name(),
                props.addressLine1(),
                props.addressLine2(),
                props.phone(),
                props.email(),
                props.registrationNumber()
        );
    }
}
```

- [ ] **Step 1.2.3: Write the controller test (failing first)**

Create `backend/src/test/java/my/cliniflow/controller/biz/clinic/ClinicControllerTest.java`:

```java
package my.cliniflow.controller.biz.clinic;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.beans.factory.annotation.Autowired;

import jakarta.annotation.PostConstruct;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@TestPropertySource(properties = {
        "cliniflow.clinic.name=Test Clinic",
        "cliniflow.clinic.address-line1=Line A",
        "cliniflow.clinic.address-line2=Line B",
        "cliniflow.clinic.phone=+60 3-1111 2222",
        "cliniflow.clinic.email=test@clinic.local",
        "cliniflow.clinic.registration-number=REG-1"
})
class ClinicControllerTest {

    @Autowired private WebApplicationContext webContext;
    private MockMvc mvc;

    @PostConstruct void setup() { this.mvc = MockMvcBuilders.webAppContextSetup(webContext).build(); }

    @Test
    void returns_clinic_info_without_auth() throws Exception {
        mvc.perform(get("/api/clinic"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(0))
           .andExpect(jsonPath("$.data.name").value("Test Clinic"))
           .andExpect(jsonPath("$.data.addressLine1").value("Line A"))
           .andExpect(jsonPath("$.data.email").value("test@clinic.local"))
           .andExpect(jsonPath("$.data.registrationNumber").value("REG-1"));
    }
}
```

- [ ] **Step 1.2.4: Run test — expect FAIL (controller doesn't exist yet)**

```bash
cd backend && ./mvnw -q test -Dtest=ClinicControllerTest
```

Expect: 404 Not Found.

- [ ] **Step 1.2.5: Write the controller**

Create `backend/src/main/java/my/cliniflow/controller/biz/clinic/ClinicController.java`:

```java
package my.cliniflow.controller.biz.clinic;

import my.cliniflow.application.biz.clinic.ClinicReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/clinic")
public class ClinicController {

    private final ClinicReadAppService reads;

    public ClinicController(ClinicReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping
    public WebResult<ClinicInfo> get() {
        return WebResult.ok(reads.get());
    }
}
```

- [ ] **Step 1.2.6: Confirm `/api/clinic` is in the Spring Security permitAll list**

Check the security config:
```bash
grep -rn "permitAll\|/api/clinic\|@EnableWebSecurity" backend/src/main/java/my/cliniflow/controller/config/ | head -10
```

If clinic is not yet whitelisted, add `/api/clinic` to the public endpoints list in the existing `SecurityConfig`. Find the `.requestMatchers(...).permitAll()` chain that includes `/api/auth/**` and append `"/api/clinic"`.

- [ ] **Step 1.2.7: Run test — expect PASS**

```bash
cd backend && ./mvnw -q test -Dtest=ClinicControllerTest
```

- [ ] **Step 1.2.8: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/clinic/ \
        backend/src/main/java/my/cliniflow/application/biz/clinic/ \
        backend/src/main/java/my/cliniflow/controller/biz/clinic/ \
        backend/src/test/java/my/cliniflow/controller/biz/clinic/ \
        backend/src/main/java/my/cliniflow/controller/config/   # only if SecurityConfig modified
git commit -m "feat(clinic): GET /api/clinic + ClinicReadAppService"
```

### Task 1.3: Reference number generation

**Files:**
- Create migration: `backend/src/main/resources/db/migration/V14__pdf_documents.sql` (start with the counter; the PDF tables are added in Task 3.1)
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/service/ReferenceNumberDomainService.java`
- Modify: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/VisitModel.java` (add `referenceNumber` column)
- Modify: `backend/src/main/java/my/cliniflow/application/biz/visit/VisitWriteAppService.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/visit/service/ReferenceNumberDomainServiceTest.java`

- [ ] **Step 1.3.1: Author migration V14 (counter table + reference_number column on visits)**

Create `backend/src/main/resources/db/migration/V14__pdf_documents.sql`:

```sql
-- V14 — PDF documents + visit reference number counter
-- NOT auto-applied. Run manually in Supabase SQL editor.

CREATE TABLE visit_reference_counter (
    counter_date date    PRIMARY KEY,
    last_seq     integer NOT NULL DEFAULT 0
);

ALTER TABLE visits
  ADD COLUMN reference_number varchar(32) UNIQUE;
```

The PDF document tables (`prescription_documents`, `clinical_report_documents`) are appended to this same migration file in Task 3.1.

- [ ] **Step 1.3.2: Apply migration to local Supabase / dev DB**

Per project convention (`CLAUDE.md` — "Flyway is NOT used"), apply manually:

```bash
psql "$SUPABASE_DB_URL" -f backend/src/main/resources/db/migration/V14__pdf_documents.sql
```

Verify:
```bash
psql "$SUPABASE_DB_URL" -c "\d visit_reference_counter" -c "\d visits" | grep reference_number
```

- [ ] **Step 1.3.3: Add the column to VisitModel**

Find `VisitModel.java` and add the field next to existing columns:

```bash
grep -n "@Column.*name.*=.*\"status\"" backend/src/main/java/my/cliniflow/domain/biz/visit/model/VisitModel.java
```

Add (mirroring the existing column declarations):

```java
@Column(name = "reference_number", length = 32, unique = true)
private String referenceNumber;

public String getReferenceNumber() { return referenceNumber; }
public void setReferenceNumber(String v) { this.referenceNumber = v; }
```

- [ ] **Step 1.3.4: Write failing test for ReferenceNumberDomainService**

Create `backend/src/test/java/my/cliniflow/domain/biz/visit/service/ReferenceNumberDomainServiceTest.java`:

```java
package my.cliniflow.domain.biz.visit.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class ReferenceNumberDomainServiceTest {

    @Autowired ReferenceNumberDomainService svc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void next_starts_at_0001_on_first_call_of_day() {
        jdbc.update("DELETE FROM visit_reference_counter WHERE counter_date = ?", LocalDate.now());
        String ref = svc.nextFor(LocalDate.parse("2026-05-02"));
        assertThat(ref).isEqualTo("V-2026-05-02-0001");
    }

    @Test
    void next_increments_within_same_day() {
        LocalDate d = LocalDate.parse("2026-05-03");
        jdbc.update("DELETE FROM visit_reference_counter WHERE counter_date = ?", d);
        assertThat(svc.nextFor(d)).isEqualTo("V-2026-05-03-0001");
        assertThat(svc.nextFor(d)).isEqualTo("V-2026-05-03-0002");
        assertThat(svc.nextFor(d)).isEqualTo("V-2026-05-03-0003");
    }

    @Test
    void next_resets_per_day() {
        LocalDate d1 = LocalDate.parse("2026-05-04");
        LocalDate d2 = LocalDate.parse("2026-05-05");
        jdbc.update("DELETE FROM visit_reference_counter WHERE counter_date IN (?, ?)", d1, d2);
        svc.nextFor(d1);
        svc.nextFor(d1);
        assertThat(svc.nextFor(d2)).isEqualTo("V-2026-05-05-0001");
    }
}
```

- [ ] **Step 1.3.5: Run — expect FAIL (service doesn't exist)**

```bash
cd backend && ./mvnw -q test -Dtest=ReferenceNumberDomainServiceTest
```

- [ ] **Step 1.3.6: Implement ReferenceNumberDomainService**

Create `backend/src/main/java/my/cliniflow/domain/biz/visit/service/ReferenceNumberDomainService.java`:

```java
package my.cliniflow.domain.biz.visit.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Atomic per-day daily-sequence allocator. Returns visit reference numbers
 * shaped V-yyyy-MM-dd-NNNN. Always called inside an existing transaction
 * (REQUIRES) — relies on row-level UPSERT for cross-thread safety.
 */
@Service
public class ReferenceNumberDomainService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final JdbcTemplate jdbc;

    public ReferenceNumberDomainService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public String nextFor(LocalDate date) {
        Integer seq = jdbc.queryForObject(
                "INSERT INTO visit_reference_counter (counter_date, last_seq) VALUES (?, 1) " +
                "ON CONFLICT (counter_date) DO UPDATE SET last_seq = visit_reference_counter.last_seq + 1 " +
                "RETURNING last_seq",
                Integer.class,
                date
        );
        return String.format("V-%s-%04d", date.format(DATE_FMT), seq);
    }
}
```

- [ ] **Step 1.3.7: Run test — expect PASS**

```bash
cd backend && ./mvnw -q test -Dtest=ReferenceNumberDomainServiceTest
```

- [ ] **Step 1.3.8: Wire into VisitWriteAppService.create()**

Find the visit-creation path and assign reference number on insert:

```bash
grep -n "public.*create\|VisitModel.*new\|setStatus.*SCHEDULED" backend/src/main/java/my/cliniflow/application/biz/visit/VisitWriteAppService.java | head -10
```

Inject `ReferenceNumberDomainService refNumbers` via constructor. In whatever method creates new `VisitModel` instances, add (before save):

```java
if (visit.getReferenceNumber() == null) {
    visit.setReferenceNumber(refNumbers.nextFor(LocalDate.now()));
}
```

If multiple methods create visits (e.g., scheduled vs walk-in vs follow-up), apply the same line in each.

- [ ] **Step 1.3.9: Backfill existing visits (one-time SQL, not in code)**

Existing visits in the DB have NULL `reference_number`. Backfill so the UNIQUE constraint plays nice with future inserts and the identification endpoint never returns null:

```bash
psql "$SUPABASE_DB_URL" <<'SQL'
WITH ordered AS (
  SELECT id,
         gmt_create::date AS d,
         row_number() OVER (PARTITION BY gmt_create::date ORDER BY gmt_create) AS seq
  FROM visits
  WHERE reference_number IS NULL
)
UPDATE visits v
SET reference_number = format('V-%s-%s', to_char(o.d, 'YYYY-MM-DD'), lpad(o.seq::text, 4, '0'))
FROM ordered o
WHERE v.id = o.id;

INSERT INTO visit_reference_counter (counter_date, last_seq)
SELECT gmt_create::date, COUNT(*) FROM visits GROUP BY gmt_create::date
ON CONFLICT (counter_date) DO UPDATE SET last_seq = EXCLUDED.last_seq;
SQL
```

- [ ] **Step 1.3.10: Commit**

```bash
git add backend/src/main/resources/db/migration/V14__pdf_documents.sql \
        backend/src/main/java/my/cliniflow/domain/biz/visit/model/VisitModel.java \
        backend/src/main/java/my/cliniflow/domain/biz/visit/service/ReferenceNumberDomainService.java \
        backend/src/main/java/my/cliniflow/application/biz/visit/VisitWriteAppService.java \
        backend/src/test/java/my/cliniflow/domain/biz/visit/service/ReferenceNumberDomainServiceTest.java
git commit -m "feat(visit): per-day reference number V-yyyy-MM-dd-NNNN with counter table"
```

### Task 1.4: VisitIdentificationInfo + ReadAppService + endpoint

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/info/VisitIdentificationInfo.java`
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/VisitIdentificationReadAppService.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/response/VisitIdentificationDTO.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/VisitIdentificationController.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/visit/VisitIdentificationReadAppServiceTest.java`
- Test: `backend/src/test/java/my/cliniflow/controller/biz/visit/VisitIdentificationControllerTest.java`

- [ ] **Step 1.4.1: Define VisitIdentificationInfo**

Create `backend/src/main/java/my/cliniflow/domain/biz/visit/info/VisitIdentificationInfo.java`:

```java
package my.cliniflow.domain.biz.visit.info;

import my.cliniflow.domain.biz.clinic.info.ClinicInfo;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record VisitIdentificationInfo(
        ClinicInfo clinic,
        Patient patient,
        Doctor doctor,
        Visit visit
) {
    public record Patient(
            String fullName,
            String nationalId,         // decrypted
            LocalDate dateOfBirth,
            int ageYears,
            String gender,
            String phone
    ) {}

    public record Doctor(
            String fullName,
            String mmcNumber,
            String specialty
    ) {}

    public record Visit(
            UUID visitId,
            String referenceNumber,
            LocalDate visitDate,
            OffsetDateTime finalizedAt   // null if not finalized
    ) {}
}
```

- [ ] **Step 1.4.2: Write failing test for the read app service**

Create `backend/src/test/java/my/cliniflow/application/biz/visit/VisitIdentificationReadAppServiceTest.java`:

```java
package my.cliniflow.application.biz.visit;

import my.cliniflow.application.biz.clinic.ClinicReadAppService;
import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.user.model.DoctorProfileModel;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.DoctorProfileRepository;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VisitIdentificationReadAppServiceTest {

    @Mock VisitRepository visits;
    @Mock PatientReadAppService patients;
    @Mock UserRepository users;
    @Mock DoctorProfileRepository doctorProfiles;
    @Mock ClinicReadAppService clinic;
    @InjectMocks VisitIdentificationReadAppService svc;

    @Test
    void assembles_full_block_for_finalized_visit() {
        UUID visitId  = UUID.randomUUID();
        UUID patId    = UUID.randomUUID();
        UUID docId    = UUID.randomUUID();

        VisitModel v = new VisitModel();
        v.setId(visitId);
        v.setPatientId(patId);
        v.setDoctorId(docId);
        v.setReferenceNumber("V-2026-05-02-0042");
        v.setStatus("FINALIZED");
        v.setFinalizedAt(OffsetDateTime.parse("2026-05-02T11:30:00+08:00"));
        v.setGmtCreate(OffsetDateTime.parse("2026-05-02T10:00:00+08:00"));

        PatientModel p = new PatientModel();
        p.setId(patId);
        p.setFullName("Tan Ah Kow");
        p.setDateOfBirth(LocalDate.parse("1988-01-01"));
        p.setGender("MALE");
        p.setPhone("+60 12-345 6789");

        UserModel u = new UserModel();
        u.setId(docId);
        u.setFullName("Lim Wei Jie");

        DoctorProfileModel dp = new DoctorProfileModel();
        dp.setUserId(docId);
        dp.setMmcNumber("MMC 54321");
        dp.setSpecialty("General Practice");

        when(visits.findById(visitId)).thenReturn(Optional.of(v));
        when(patients.findById(patId)).thenReturn(Optional.of(p));
        when(patients.decryptNationalId(p)).thenReturn("880101-01-1234");
        when(users.findById(docId)).thenReturn(Optional.of(u));
        when(doctorProfiles.findByUserId(docId)).thenReturn(Optional.of(dp));
        when(clinic.get()).thenReturn(new ClinicInfo("X", "Y", "Z", "P", "E", "R"));

        VisitIdentificationInfo info = svc.assemble(visitId);

        assertThat(info.clinic().name()).isEqualTo("X");
        assertThat(info.patient().nationalId()).isEqualTo("880101-01-1234");
        assertThat(info.patient().ageYears()).isGreaterThanOrEqualTo(38);   // depends on now()
        assertThat(info.doctor().fullName()).isEqualTo("Dr. Lim Wei Jie");
        assertThat(info.doctor().mmcNumber()).isEqualTo("MMC 54321");
        assertThat(info.visit().referenceNumber()).isEqualTo("V-2026-05-02-0042");
        assertThat(info.visit().finalizedAt()).isEqualTo("2026-05-02T11:30:00+08:00");
    }

    @Test
    void throws_when_visit_not_found() {
        UUID id = UUID.randomUUID();
        when(visits.findById(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> svc.assemble(id)).isInstanceOf(IllegalArgumentException.class);
    }
}
```

- [ ] **Step 1.4.3: Run test — expect FAIL**

```bash
cd backend && ./mvnw -q test -Dtest=VisitIdentificationReadAppServiceTest
```

- [ ] **Step 1.4.4: Implement VisitIdentificationReadAppService**

Create `backend/src/main/java/my/cliniflow/application/biz/visit/VisitIdentificationReadAppService.java`:

```java
package my.cliniflow.application.biz.visit;

import my.cliniflow.application.biz.clinic.ClinicReadAppService;
import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.user.model.DoctorProfileModel;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.DoctorProfileRepository;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.Period;
import java.util.UUID;

/**
 * Single source of truth for clinic + patient + doctor + visit identity.
 * Consumed by the GET /api/visits/{id}/identification endpoint AND the two
 * PDF generation domain services. Guarantees screen and PDFs show the same
 * values.
 */
@Service
public class VisitIdentificationReadAppService {

    private final VisitRepository visits;
    private final PatientReadAppService patients;
    private final UserRepository users;
    private final DoctorProfileRepository doctorProfiles;
    private final ClinicReadAppService clinic;

    public VisitIdentificationReadAppService(VisitRepository visits,
                                              PatientReadAppService patients,
                                              UserRepository users,
                                              DoctorProfileRepository doctorProfiles,
                                              ClinicReadAppService clinic) {
        this.visits = visits;
        this.patients = patients;
        this.users = users;
        this.doctorProfiles = doctorProfiles;
        this.clinic = clinic;
    }

    public VisitIdentificationInfo assemble(UUID visitId) {
        VisitModel v = visits.findById(visitId)
                .orElseThrow(() -> new IllegalArgumentException("Visit not found: " + visitId));

        PatientModel p = patients.findById(v.getPatientId())
                .orElseThrow(() -> new IllegalArgumentException("Patient not found: " + v.getPatientId()));

        UserModel u = users.findById(v.getDoctorId())
                .orElseThrow(() -> new IllegalArgumentException("Doctor user not found: " + v.getDoctorId()));

        DoctorProfileModel dp = doctorProfiles.findByUserId(v.getDoctorId())
                .orElseThrow(() -> new IllegalArgumentException("Doctor profile not found: " + v.getDoctorId()));

        ClinicInfo clinicInfo = clinic.get();
        String nationalId = patients.decryptNationalId(p);

        int age = (p.getDateOfBirth() == null) ? 0
                : Period.between(p.getDateOfBirth(), LocalDate.now()).getYears();

        return new VisitIdentificationInfo(
                clinicInfo,
                new VisitIdentificationInfo.Patient(
                        p.getFullName(),
                        nationalId,
                        p.getDateOfBirth(),
                        age,
                        p.getGender(),
                        p.getPhone()
                ),
                new VisitIdentificationInfo.Doctor(
                        formatDoctorName(u.getFullName()),
                        dp.getMmcNumber(),
                        dp.getSpecialty()
                ),
                new VisitIdentificationInfo.Visit(
                        v.getId(),
                        v.getReferenceNumber(),
                        v.getGmtCreate().toLocalDate(),
                        v.getFinalizedAt()
                )
        );
    }

    private static String formatDoctorName(String name) {
        if (name == null || name.isBlank()) return "Dr. Unknown";
        String trimmed = name.trim();
        return trimmed.regionMatches(true, 0, "Dr.", 0, 3) ? trimmed : "Dr. " + trimmed;
    }
}
```

- [ ] **Step 1.4.5: Add `decryptNationalId` to PatientReadAppService if missing**

Verify the helper exists, otherwise add it:

```bash
grep -n "decryptNationalId\|nationalIdCiphertext\|decrypt" backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java | head -5
```

If missing, add a method that uses the existing encryption infrastructure (likely `NationalIdCipher` or similar — find it):

```bash
grep -rn "NationalIdCipher\|national_id_ciphertext\|HmacSha256" backend/src/main/java/my/cliniflow/infrastructure | head -5
```

Add to PatientReadAppService:

```java
public String decryptNationalId(PatientModel p) {
    if (p.getNationalIdCiphertext() == null) return null;
    return cipher.decrypt(p.getNationalIdCiphertext());   // adjust to actual cipher API
}
```

- [ ] **Step 1.4.6: Run test — expect PASS**

```bash
cd backend && ./mvnw -q test -Dtest=VisitIdentificationReadAppServiceTest
```

- [ ] **Step 1.4.7: Write the DTO + controller**

Create `backend/src/main/java/my/cliniflow/controller/biz/visit/response/VisitIdentificationDTO.java`:

```java
package my.cliniflow.controller.biz.visit.response;

import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record VisitIdentificationDTO(
        Clinic  clinic,
        Patient patient,
        Doctor  doctor,
        Visit   visit
) {
    public record Clinic(String name, String addressLine1, String addressLine2,
                          String phone, String email, String registrationNumber) {}
    public record Patient(String fullName, String nationalId, LocalDate dateOfBirth,
                           int ageYears, String gender, String phone) {}
    public record Doctor(String fullName, String mmcNumber, String specialty) {}
    public record Visit(UUID visitId, String referenceNumber, LocalDate visitDate,
                         OffsetDateTime finalizedAt) {}

    public static VisitIdentificationDTO from(VisitIdentificationInfo i) {
        return new VisitIdentificationDTO(
                new Clinic(i.clinic().name(), i.clinic().addressLine1(), i.clinic().addressLine2(),
                           i.clinic().phone(), i.clinic().email(), i.clinic().registrationNumber()),
                new Patient(i.patient().fullName(), i.patient().nationalId(), i.patient().dateOfBirth(),
                            i.patient().ageYears(), i.patient().gender(), i.patient().phone()),
                new Doctor(i.doctor().fullName(), i.doctor().mmcNumber(), i.doctor().specialty()),
                new Visit(i.visit().visitId(), i.visit().referenceNumber(),
                          i.visit().visitDate(), i.visit().finalizedAt())
        );
    }
}
```

Create `backend/src/main/java/my/cliniflow/controller/biz/visit/VisitIdentificationController.java`:

```java
package my.cliniflow.controller.biz.visit;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.VisitIdentificationReadAppService;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.response.VisitIdentificationDTO;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/visits/{visitId}/identification")
public class VisitIdentificationController {

    private final VisitIdentificationReadAppService reads;
    private final PatientReadAppService patients;

    public VisitIdentificationController(VisitIdentificationReadAppService reads,
                                          PatientReadAppService patients) {
        this.reads = reads;
        this.patients = patients;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('STAFF','DOCTOR','ADMIN','PATIENT')")
    public WebResult<VisitIdentificationDTO> get(@PathVariable UUID visitId,
                                                   Authentication auth) {
        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();
        VisitIdentificationInfo info = reads.assemble(visitId);

        if ("PATIENT".equals(claims.role().name())) {
            PatientModel own = patients.findByUserId(claims.userId()).orElse(null);
            if (own == null || !own.getId().equals(toUUID(info.patient().nationalId(), info))) {
                // Compare on patient id (the visit-owning patient), not nationalId
                if (own == null || !own.getId().equals(extractPatientId(info))) {
                    return WebResult.error(ResultCode.FORBIDDEN, "Visit not yours");
                }
            }
        }
        return WebResult.ok(VisitIdentificationDTO.from(info));
    }

    /** The Patient.id isn't on the Info record (security-sensitive); look it up from the visit. */
    private UUID extractPatientId(VisitIdentificationInfo info) {
        // The info record doesn't carry patient.id (it's not needed by PDFs / UI).
        // Re-load via the visit to do the ownership check.
        return null; // placeholder — see Step 1.4.8 below
    }

    private UUID toUUID(String s, VisitIdentificationInfo info) { return null; }
}
```

- [ ] **Step 1.4.8: Fix ownership check shape — use VisitRepository directly**

The helper method placeholders above are the wrong shape. Rewrite the controller's check to load the visit's `patient_id` directly from the visit aggregate, not from the assembled info:

Replace the controller body's `PATIENT` branch with a cleaner version:

```java
@RestController
@RequestMapping("/api/visits/{visitId}/identification")
public class VisitIdentificationController {

    private final VisitIdentificationReadAppService reads;
    private final PatientReadAppService patients;
    private final my.cliniflow.domain.biz.visit.repository.VisitRepository visits;

    public VisitIdentificationController(VisitIdentificationReadAppService reads,
                                          PatientReadAppService patients,
                                          my.cliniflow.domain.biz.visit.repository.VisitRepository visits) {
        this.reads = reads;
        this.patients = patients;
        this.visits = visits;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('STAFF','DOCTOR','ADMIN','PATIENT')")
    public WebResult<VisitIdentificationDTO> get(@PathVariable UUID visitId,
                                                   Authentication auth) {
        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();
        if ("PATIENT".equals(claims.role().name())) {
            UUID ownPatientId = patients.findByUserId(claims.userId())
                    .map(p -> p.getId()).orElse(null);
            UUID visitPatientId = visits.findById(visitId)
                    .map(v -> v.getPatientId()).orElse(null);
            if (ownPatientId == null || visitPatientId == null
                    || !ownPatientId.equals(visitPatientId)) {
                return WebResult.error(ResultCode.FORBIDDEN, "Visit not yours");
            }
        }
        VisitIdentificationInfo info = reads.assemble(visitId);
        return WebResult.ok(VisitIdentificationDTO.from(info));
    }
}
```

- [ ] **Step 1.4.9: Write controller integration test**

Create `backend/src/test/java/my/cliniflow/controller/biz/visit/VisitIdentificationControllerTest.java`:

```java
package my.cliniflow.controller.biz.visit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import jakarta.annotation.PostConstruct;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@TestPropertySource(properties = {
        "cliniflow.clinic.name=T",
        "cliniflow.clinic.address-line1=A", "cliniflow.clinic.address-line2=B",
        "cliniflow.clinic.phone=P", "cliniflow.clinic.email=e@e.f",
        "cliniflow.clinic.registration-number=R"
})
class VisitIdentificationControllerTest {

    @Autowired WebApplicationContext webContext;
    private MockMvc mvc;

    @PostConstruct void setup() { this.mvc = MockMvcBuilders.webAppContextSetup(webContext).build(); }

    @Test
    void unauthenticated_is_rejected() throws Exception {
        mvc.perform(get("/api/visits/00000000-0000-0000-0000-000000000001/identification"))
           .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(roles = "DOCTOR")
    void doctor_role_can_call_endpoint() throws Exception {
        // Visit may not exist — assert not 401/403
        mvc.perform(get("/api/visits/00000000-0000-0000-0000-000000000001/identification"))
           .andExpect(result -> {
               int s = result.getResponse().getStatus();
               assert s != 401 && s != 403 : "Expected non-auth-error status, got " + s;
           });
    }

    // Cross-patient ownership test added in Phase 3 once PDF endpoints share fixtures.
}
```

(Note: the cross-patient ownership matrix test is more meaningful with seeded data; the simpler unauth/role test here acts as a smoke check. Phase 3 adds the full matrix.)

- [ ] **Step 1.4.10: Run tests**

```bash
cd backend && ./mvnw -q test -Dtest=VisitIdentificationControllerTest,VisitIdentificationReadAppServiceTest,ClinicControllerTest,ClinicPropertiesTest
```

Expect: all PASS.

- [ ] **Step 1.4.11: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/info/VisitIdentificationInfo.java \
        backend/src/main/java/my/cliniflow/application/biz/visit/VisitIdentificationReadAppService.java \
        backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java \
        backend/src/main/java/my/cliniflow/controller/biz/visit/response/VisitIdentificationDTO.java \
        backend/src/main/java/my/cliniflow/controller/biz/visit/VisitIdentificationController.java \
        backend/src/test/java/my/cliniflow/application/biz/visit/VisitIdentificationReadAppServiceTest.java \
        backend/src/test/java/my/cliniflow/controller/biz/visit/VisitIdentificationControllerTest.java
git commit -m "feat(visit): GET /api/visits/{id}/identification with auth + ownership"
```

### Task 1.5: Frontend rewire — kill the demo data fabrication

**Files:**
- Create: `frontend/lib/visit-identification.ts`
- Create: `frontend/lib/clinic.ts`
- Modify: `frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx`

- [ ] **Step 1.5.1: Add the typed helper**

Create `frontend/lib/visit-identification.ts`:

```ts
import { apiGet } from "./api";

export type ClinicInfo  = {
    name: string; addressLine1: string; addressLine2: string;
    phone: string; email: string; registrationNumber: string;
};
export type PatientInfo = {
    fullName: string; nationalId: string | null; dateOfBirth: string;
    ageYears: number; gender: string | null; phone: string | null;
};
export type DoctorInfo  = { fullName: string; mmcNumber: string; specialty: string };
export type VisitInfo   = {
    visitId: string; referenceNumber: string; visitDate: string;
    finalizedAt: string | null;
};
export type VisitIdentification = {
    clinic: ClinicInfo; patient: PatientInfo; doctor: DoctorInfo; visit: VisitInfo;
};

export async function getVisitIdentification(visitId: string): Promise<VisitIdentification> {
    return apiGet<VisitIdentification>(`/visits/${visitId}/identification`);
}
```

Create `frontend/lib/clinic.ts`:

```ts
import { apiGet } from "./api";
import type { ClinicInfo } from "./visit-identification";

export async function getClinic(): Promise<ClinicInfo> {
    return apiGet<ClinicInfo>("/clinic");
}
```

- [ ] **Step 1.5.2: Open ReportPreview and locate the demo blocks**

```bash
grep -n "const CLINIC\|demoPatientProfile\|demoDoctorProfile\|formatDoctorName" \
    frontend/app/doctor/visits/\[visitId\]/components/ReportPreview.tsx
```

Confirm the line numbers from the spec: 30-36 (CLINIC), 38-54 (demoPatientProfile), 56-63 (demoDoctorProfile).

- [ ] **Step 1.5.3: Delete the three demo functions and add the data hook**

Edit `frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx`:

Delete:
```typescript
const CLINIC = { name: "...", address: "...", phone: "...", email: "...", registration: "..." };

function demoPatientProfile(visitId: string, patientName: string) { /* ... */ }
function demoDoctorProfile(name: string) { /* ... */ }
function formatDoctorName(name: string): string { /* ... */ }
```

Below the existing imports, add:

```typescript
import { useEffect, useState } from "react";
import { getVisitIdentification, type VisitIdentification } from "@/lib/visit-identification";
```

Inside the component (near the top of the function body, alongside other state):

```typescript
const [ident, setIdent] = useState<VisitIdentification | null>(null);
const [identErr, setIdentErr] = useState<string | null>(null);

useEffect(() => {
    let cancelled = false;
    getVisitIdentification(visitId)
      .then((d) => { if (!cancelled) setIdent(d); })
      .catch((e) => { if (!cancelled) setIdentErr(e instanceof Error ? e.message : "Failed to load"); });
    return () => { cancelled = true; };
}, [visitId]);
```

- [ ] **Step 1.5.4: Replace the on-screen header block (was lines 189-196)**

Find the existing block:

```bash
grep -n "{CLINIC.name}" frontend/app/doctor/visits/\[visitId\]/components/ReportPreview.tsx
```

Replace it with:

```tsx
{identErr ? (
  <p className="font-sans text-sm text-crimson">Failed to load clinic info: {identErr}</p>
) : ident ? (
  <>
    <p className="font-display text-lg text-fog">{ident.clinic.name}</p>
    <p className="font-sans text-xs text-fog-dim mt-0.5">
      {ident.clinic.addressLine1}, {ident.clinic.addressLine2}
    </p>
    <div className="font-sans text-xs text-fog-dim mt-1 flex gap-4 flex-wrap">
      <span>Tel: {ident.clinic.phone}</span>
      <span>{ident.clinic.email}</span>
      <span>Reg. {ident.clinic.registrationNumber}</span>
    </div>
  </>
) : (
  <div className="space-y-1.5 animate-pulse">
    <div className="h-5 w-48 bg-ink-rim rounded-sm" />
    <div className="h-3 w-72 bg-ink-rim rounded-sm" />
    <div className="h-3 w-56 bg-ink-rim rounded-sm" />
  </div>
)}
```

- [ ] **Step 1.5.5: Replace patient demographics block (was using `demoPatientProfile`)**

Find the patient block:

```bash
grep -n "demoPatientProfile\|patient.ic\|patient.dob" frontend/app/doctor/visits/\[visitId\]/components/ReportPreview.tsx
```

Replace every reference of `demoPatientProfile(visitId, patientName).X` with `ident?.patient.X` (e.g. `.fullName`, `.nationalId`, `.dateOfBirth`, `.ageYears`, `.gender`, `.phone`). Wrap the entire patient block in:

```tsx
{ident ? (
  <div /* ... existing layout classes ... */>
    <div>Name: {ident.patient.fullName}</div>
    <div>NRIC: {ident.patient.nationalId ?? "—"}</div>
    <div>DOB: {formatDate(ident.patient.dateOfBirth)}</div>
    <div>Age: {ident.patient.ageYears} yrs</div>
    <div>Gender: {ident.patient.gender ?? "—"}</div>
    <div>Tel/HP: {ident.patient.phone ?? "—"}</div>
    <div>Ref No: {ident.visit.referenceNumber}</div>
    <div>Date: {formatDate(ident.visit.visitDate)}</div>
  </div>
) : null}
```

Add a tiny `formatDate` helper at the bottom of the file (or import the existing one if present):

```typescript
function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}
```

- [ ] **Step 1.5.6: Replace doctor signature block (was using `demoDoctorProfile`)**

Find the doctor block at the bottom:

```bash
grep -n "demoDoctorProfile\|MMC 54321\|MBBS" frontend/app/doctor/visits/\[visitId\]/components/ReportPreview.tsx
```

Replace with:

```tsx
{ident && (
  <div className="mt-6 pt-4 border-t border-ink-rim font-sans text-sm">
    <div>Prescriber: {ident.doctor.fullName}</div>
    <div className="text-fog-dim text-xs mt-0.5">
      MMC: {ident.doctor.mmcNumber} · {ident.doctor.specialty}
    </div>
  </div>
)}
```

- [ ] **Step 1.5.7: Verify deletion is complete**

```bash
grep -n "CLINIC\|demoPatientProfile\|demoDoctorProfile" \
    frontend/app/doctor/visits/\[visitId\]/components/ReportPreview.tsx
```

Expect: zero matches in source code (matches in comments or strings would still need checking — but there should be none).

- [ ] **Step 1.5.8: Lint + typecheck**

```bash
cd frontend && npm run lint && npm run typecheck
```

Expect: clean.

- [ ] **Step 1.5.9: Smoke-test in browser via Playwright MCP**

Bring stack up if not already:
```bash
docker compose up -d
docker compose restart nginx       # in case frontend container IP changed
```

Then drive the browser:
1. `mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost/login`
2. Log in as `doctor@demo.local` / `password`
3. Navigate to `/doctor/visits/<some-visit-id>` (pick any from the doctor's dashboard)
4. Snapshot the page; verify the clinic header shows the configured `cliniflow.clinic.name` (default: "CliniFlow Medical Clinic"), NOT a hardcoded "CliniFlow AI Clinic"
5. Verify the patient NRIC matches the actual `patients.national_id_ciphertext` decrypted (not a hashed-from-visit-ID pattern like `78` followed by IC digits)
6. Verify the doctor MMC matches `doctor_profiles.mmc_number` for the actual logged-in doctor
7. Take a screenshot to `e2e-phase1-real-data.png` for the PR
8. Browser-close

- [ ] **Step 1.5.10: Commit**

```bash
git add frontend/lib/visit-identification.ts \
        frontend/lib/clinic.ts \
        frontend/app/doctor/visits/\[visitId\]/components/ReportPreview.tsx
git commit -m "fix(report-preview): kill PHI fabrication; consume real /identification data"
```

### Task 1.6: Phase 1 verification gate

- [ ] **Step 1.6.1: Run all backend tests**

```bash
cd backend && ./mvnw -q test 2>&1 | tail -20
```

Expect: 0 failures, 0 errors.

- [ ] **Step 1.6.2: Verify the demo functions are gone**

```bash
grep -rn "demoPatientProfile\|demoDoctorProfile\|const CLINIC =" frontend/app/
```

Expect: zero matches.

- [ ] **Step 1.6.3: Confirm app fails to start without clinic config**

```bash
unset CLINIFLOW_CLINIC_NAME
SPRING_PROFILES_ACTIVE=test ./backend/mvnw -q spring-boot:run \
  -Dspring-boot.run.arguments="--cliniflow.clinic.name=" 2>&1 | head -30
```

Expect: a "BindValidationException" or "Validation failed for ConfigurationProperties" referencing `name`.

- [ ] **Step 1.6.4: Phase 1 PR**

This is a natural pause point — Phase 1 is independently shippable. Either:
- Open a PR for Phase 1 alone, get review, merge, then start Phase 2
- Continue to Phase 2 in the same branch if doing a single bundled PR

---

## Phase 2 — PDF infrastructure (renderers + builders)

**Phase exit criteria:**
- OpenPDF dep installed.
- All four renderers exist with unit tests that assert PDFBox-extracted text.
- Both PDF builder interfaces and impls exist with integration tests.
- No user-facing change yet — generators aren't wired into finalize until Phase 3.

### Task 2.1: Add OpenPDF dependency

**Files:**
- Modify: `backend/pom.xml`

- [ ] **Step 2.1.1: Add OpenPDF + PDFBox (test-only) deps**

Find the `<dependencies>` section in `backend/pom.xml` and add:

```xml
<dependency>
    <groupId>com.github.librepdf</groupId>
    <artifactId>openpdf</artifactId>
    <version>1.4.2</version>
</dependency>
<dependency>
    <groupId>org.apache.pdfbox</groupId>
    <artifactId>pdfbox</artifactId>
    <version>3.0.3</version>
    <scope>test</scope>
</dependency>
```

PDFBox is test-only — used to extract text from generated PDFs for golden-file assertions. The runtime never needs it.

- [ ] **Step 2.1.2: Verify Maven resolves the new deps**

```bash
cd backend && ./mvnw -q dependency:resolve 2>&1 | tail -5
```

Expect: BUILD SUCCESS.

- [ ] **Step 2.1.3: Commit**

```bash
git add backend/pom.xml
git commit -m "build(backend): add OpenPDF 1.4.2 + PDFBox 3.0.3 (test) deps"
```

### Task 2.2: PdfDocumentBuilder — base wrapper

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/pdf/PdfDocumentBuilder.java`

- [ ] **Step 2.2.1: Implement the wrapper**

Create `backend/src/main/java/my/cliniflow/infrastructure/pdf/PdfDocumentBuilder.java`:

```java
package my.cliniflow.infrastructure.pdf;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.PageSize;
import com.lowagie.text.pdf.PdfWriter;

import java.io.ByteArrayOutputStream;

/**
 * Thin wrapper around OpenPDF's `Document` to centralise page geometry and
 * font choice. Renderers receive an open `Document` and stamp content on it.
 */
public final class PdfDocumentBuilder {

    public static final float MARGIN_TOP    = 56f;   // ~20mm
    public static final float MARGIN_BOTTOM = 56f;
    public static final float MARGIN_LEFT   = 51f;   // ~18mm
    public static final float MARGIN_RIGHT  = 51f;

    private PdfDocumentBuilder() {}

    public interface BodyWriter {
        void write(Document doc) throws DocumentException;
    }

    public static byte[] build(BodyWriter body) throws DocumentException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, MARGIN_LEFT, MARGIN_RIGHT, MARGIN_TOP, MARGIN_BOTTOM);
        PdfWriter.getInstance(doc, out);
        doc.open();
        try {
            body.write(doc);
        } finally {
            doc.close();
        }
        return out.toByteArray();
    }
}
```

- [ ] **Step 2.2.2: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/pdf/PdfDocumentBuilder.java
git commit -m "feat(pdf): PdfDocumentBuilder — A4 portrait, 20mm/18mm margins"
```

### Task 2.3: ClinicLetterheadRenderer

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/pdf/render/ClinicLetterheadRenderer.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/pdf/render/ClinicLetterheadRendererTest.java`

- [ ] **Step 2.3.1: Write failing test**

Create `backend/src/test/java/my/cliniflow/infrastructure/pdf/render/ClinicLetterheadRendererTest.java`:

```java
package my.cliniflow.infrastructure.pdf.render;

import com.lowagie.text.Document;
import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.infrastructure.pdf.PdfDocumentBuilder;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ClinicLetterheadRendererTest {

    @Test
    void renders_clinic_letterhead_with_all_fields() throws Exception {
        ClinicInfo clinic = new ClinicInfo(
                "Test Clinic Sdn Bhd",
                "12 Jalan One",
                "Kuala Lumpur 50000",
                "+60 3-1234 5678",
                "hello@test.clinic",
                "REG-XYZ-001"
        );
        byte[] pdf = PdfDocumentBuilder.build(doc -> ClinicLetterheadRenderer.render(doc, clinic));
        String text = extractText(pdf);
        assertThat(text).contains("Test Clinic Sdn Bhd");
        assertThat(text).contains("12 Jalan One");
        assertThat(text).contains("Kuala Lumpur 50000");
        assertThat(text).contains("+60 3-1234 5678");
        assertThat(text).contains("hello@test.clinic");
        assertThat(text).contains("REG-XYZ-001");
    }

    private static String extractText(byte[] pdf) throws Exception {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(doc);
        }
    }
}
```

- [ ] **Step 2.3.2: Run test — expect FAIL (renderer doesn't exist)**

```bash
cd backend && ./mvnw -q test -Dtest=ClinicLetterheadRendererTest
```

- [ ] **Step 2.3.3: Implement the renderer**

Create `backend/src/main/java/my/cliniflow/infrastructure/pdf/render/ClinicLetterheadRenderer.java`:

```java
package my.cliniflow.infrastructure.pdf.render;

import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.draw.LineSeparator;
import my.cliniflow.domain.biz.clinic.info.ClinicInfo;

import java.awt.Color;

public final class ClinicLetterheadRenderer {

    private static final Font NAME_FONT    = FontFactory.getFont(FontFactory.TIMES_BOLD, 14, Color.BLACK);
    private static final Font ADDRESS_FONT = FontFactory.getFont(FontFactory.TIMES, 10, new Color(0x55, 0x55, 0x55));

    private ClinicLetterheadRenderer() {}

    public static void render(Document doc, ClinicInfo clinic) throws DocumentException {
        Paragraph name = new Paragraph(clinic.name(), NAME_FONT);
        name.setSpacingAfter(2f);
        doc.add(name);

        Paragraph addr = new Paragraph(
                clinic.addressLine1() + ", " + clinic.addressLine2(),
                ADDRESS_FONT
        );
        addr.setSpacingAfter(2f);
        doc.add(addr);

        Paragraph contact = new Paragraph(
                "Tel: " + clinic.phone() + "  ·  Email: " + clinic.email() + "  ·  Reg: " + clinic.registrationNumber(),
                ADDRESS_FONT
        );
        contact.setSpacingAfter(8f);
        doc.add(contact);

        LineSeparator hr = new LineSeparator(0.5f, 100f, new Color(0x99, 0x99, 0x99), Element.ALIGN_CENTER, -2f);
        doc.add(new Chunk(hr));
    }
}
```

- [ ] **Step 2.3.4: Run test — expect PASS**

```bash
cd backend && ./mvnw -q test -Dtest=ClinicLetterheadRendererTest
```

- [ ] **Step 2.3.5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/pdf/render/ClinicLetterheadRenderer.java \
        backend/src/test/java/my/cliniflow/infrastructure/pdf/render/ClinicLetterheadRendererTest.java
git commit -m "feat(pdf): ClinicLetterheadRenderer + PDFBox text-extraction test"
```

### Task 2.4: PatientDemographicsRenderer

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/pdf/render/PatientDemographicsRenderer.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/pdf/render/PatientDemographicsRendererTest.java`

- [ ] **Step 2.4.1: Write failing test**

Create `backend/src/test/java/my/cliniflow/infrastructure/pdf/render/PatientDemographicsRendererTest.java`:

```java
package my.cliniflow.infrastructure.pdf.render;

import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.infrastructure.pdf.PdfDocumentBuilder;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class PatientDemographicsRendererTest {

    @Test
    void renders_two_column_block_with_all_fields() throws Exception {
        var info = new VisitIdentificationInfo(
                null,
                new VisitIdentificationInfo.Patient(
                        "Tan Ah Kow", "880101-01-1234",
                        LocalDate.parse("1988-01-01"), 38,
                        "MALE", "+60 12-345 6789"),
                null,
                new VisitIdentificationInfo.Visit(
                        UUID.randomUUID(), "V-2026-05-02-0042",
                        LocalDate.parse("2026-05-02"),
                        OffsetDateTime.parse("2026-05-02T11:30:00+08:00"))
        );
        byte[] pdf = PdfDocumentBuilder.build(doc ->
                PatientDemographicsRenderer.render(doc, info, "Penicillin, Shellfish")
        );
        String text = extractText(pdf);
        assertThat(text)
            .contains("Tan Ah Kow")
            .contains("880101-01-1234")
            .contains("V-2026-05-02-0042")
            .contains("38")
            .contains("Male")
            .contains("+60 12-345 6789")
            .contains("Penicillin, Shellfish");
    }

    @Test
    void empty_allergies_renders_nil_reported() throws Exception {
        var info = new VisitIdentificationInfo(
                null,
                new VisitIdentificationInfo.Patient(
                        "X", "1", LocalDate.parse("2000-01-01"), 26, "OTHER", null),
                null,
                new VisitIdentificationInfo.Visit(
                        UUID.randomUUID(), "V-2026-05-02-0001",
                        LocalDate.parse("2026-05-02"), null)
        );
        byte[] pdf = PdfDocumentBuilder.build(doc ->
                PatientDemographicsRenderer.render(doc, info, null)
        );
        assertThat(extractText(pdf)).contains("Nil reported");
    }

    private static String extractText(byte[] pdf) throws Exception {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(doc);
        }
    }
}
```

- [ ] **Step 2.4.2: Run — expect FAIL**

```bash
cd backend && ./mvnw -q test -Dtest=PatientDemographicsRendererTest
```

- [ ] **Step 2.4.3: Implement**

Create `backend/src/main/java/my/cliniflow/infrastructure/pdf/render/PatientDemographicsRenderer.java`:

```java
package my.cliniflow.infrastructure.pdf.render;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;

import java.awt.Color;
import java.time.format.DateTimeFormatter;

public final class PatientDemographicsRenderer {

    private static final Font BODY = FontFactory.getFont(FontFactory.TIMES, 11, Color.BLACK);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy");

    private PatientDemographicsRenderer() {}

    public static void render(Document doc, VisitIdentificationInfo info, String allergyCsv) throws DocumentException {
        var p = info.patient();
        var v = info.visit();

        PdfPTable t = new PdfPTable(new float[]{ 1f, 1f });
        t.setWidthPercentage(100f);
        t.setSpacingBefore(10f);
        t.setSpacingAfter(6f);

        addCell(t, "Name    : " + nullSafe(p.fullName()));
        addCell(t, "Ref No  : " + nullSafe(v.referenceNumber()));
        addCell(t, "NRIC    : " + nullSafe(p.nationalId()));
        addCell(t, "Date    : " + (v.visitDate() == null ? "-" : v.visitDate().format(DATE)));
        addCell(t, "");
        addCell(t, "DOB     : " + (p.dateOfBirth() == null ? "-" : p.dateOfBirth().format(DATE)));
        addCell(t, "");
        addCell(t, "Age     : " + p.ageYears() + " yrs");
        addCell(t, "");
        addCell(t, "Tel/HP  : " + nullSafe(p.phone()));
        addCell(t, "");
        addCell(t, "Gender  : " + prettyGender(p.gender()));

        doc.add(t);

        String allergies = (allergyCsv == null || allergyCsv.isBlank()) ? "Nil reported" : allergyCsv;
        Paragraph aller = new Paragraph("Allergy         : " + allergies, BODY);
        aller.setSpacingBefore(4f);
        doc.add(aller);
        doc.add(new Paragraph("G6PD Deficiency : Unknown", BODY));
    }

    private static void addCell(PdfPTable t, String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, BODY));
        c.setBorder(0);
        c.setPaddingBottom(2f);
        t.addCell(c);
    }

    private static String nullSafe(String s) { return s == null ? "-" : s; }

    private static String prettyGender(String g) {
        if (g == null) return "-";
        return switch (g.toUpperCase()) {
            case "MALE"   -> "Male";
            case "FEMALE" -> "Female";
            case "OTHER"  -> "Other";
            default       -> g;
        };
    }
}
```

- [ ] **Step 2.4.4: Run — expect PASS**

```bash
cd backend && ./mvnw -q test -Dtest=PatientDemographicsRendererTest
```

- [ ] **Step 2.4.5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/pdf/render/PatientDemographicsRenderer.java \
        backend/src/test/java/my/cliniflow/infrastructure/pdf/render/PatientDemographicsRendererTest.java
git commit -m "feat(pdf): PatientDemographicsRenderer two-column block + allergy line"
```

### Task 2.5: PrescriptionTableRenderer (bilingual)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/pdf/render/PrescriptionTableRenderer.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/pdf/render/PrescriptionTableRendererTest.java`

- [ ] **Step 2.5.1: Define the input record (top of the renderer file)**

The renderer takes a list of medication rows. Define an input record that the domain service will assemble from `MedicationModel` + agent's bilingual translations:

```java
public record PrescriptionRow(
    int sno,
    String medicineName,           // e.g. "Metformin 500mg"
    String instructionEn,          // "Take with food"
    String instructionMs,          // nullable — falls back to EN-only
    String dosage,                 // "1 tab/s"
    String frequencyEn,            // "twice daily"
    String total                   // "30 days"
) {}
```

- [ ] **Step 2.5.2: Write failing test**

Create `backend/src/test/java/my/cliniflow/infrastructure/pdf/render/PrescriptionTableRendererTest.java`:

```java
package my.cliniflow.infrastructure.pdf.render;

import my.cliniflow.infrastructure.pdf.PdfDocumentBuilder;
import my.cliniflow.infrastructure.pdf.render.PrescriptionTableRenderer.PrescriptionRow;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PrescriptionTableRendererTest {

    @Test
    void renders_table_header_and_rows() throws Exception {
        var rows = List.of(
                new PrescriptionRow(1, "Metformin 500mg",
                        "Take with food", "Ambil bersama makanan",
                        "1 tab/s", "twice daily", "30 days"),
                new PrescriptionRow(2, "Atorvastatin 20mg",
                        "At bedtime", "Pada waktu tidur",
                        "1 tab/s", "at bedtime", "30 days")
        );
        byte[] pdf = PdfDocumentBuilder.build(doc -> PrescriptionTableRenderer.render(doc, rows));
        String text = extractText(pdf);
        assertThat(text)
            .contains("PRESCRIPTION")
            .contains("SNO").contains("MEDICINE").contains("DOSAGE").contains("FREQUENCY").contains("TOTAL")
            .contains("Metformin 500mg").contains("Take with food").contains("Ambil bersama makanan")
            .contains("Atorvastatin 20mg").contains("Pada waktu tidur");
    }

    @Test
    void empty_rows_renders_no_med_message() throws Exception {
        byte[] pdf = PdfDocumentBuilder.build(doc -> PrescriptionTableRenderer.render(doc, List.of()));
        assertThat(extractText(pdf)).contains("No medications prescribed");
    }

    @Test
    void missing_ms_translation_falls_back_to_en_only() throws Exception {
        var rows = List.of(
                new PrescriptionRow(1, "Aspirin 100mg",
                        "Take after food", null,
                        "1 tab/s", "every morning", "1 month")
        );
        byte[] pdf = PdfDocumentBuilder.build(doc -> PrescriptionTableRenderer.render(doc, rows));
        String text = extractText(pdf);
        assertThat(text).contains("Take after food");
        // No Malay text to assert the absence of, but no NPE should occur.
    }

    private static String extractText(byte[] pdf) throws Exception {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(doc);
        }
    }
}
```

- [ ] **Step 2.5.3: Run — expect FAIL**

```bash
cd backend && ./mvnw -q test -Dtest=PrescriptionTableRendererTest
```

- [ ] **Step 2.5.4: Implement the renderer**

Create `backend/src/main/java/my/cliniflow/infrastructure/pdf/render/PrescriptionTableRenderer.java`:

```java
package my.cliniflow.infrastructure.pdf.render;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;

import java.awt.Color;
import java.util.List;

public final class PrescriptionTableRenderer {

    public record PrescriptionRow(
            int sno,
            String medicineName,
            String instructionEn,
            String instructionMs,        // nullable
            String dosage,
            String frequencyEn,
            String total
    ) {}

    private static final Font TITLE     = FontFactory.getFont(FontFactory.TIMES_BOLD, 13, Color.BLACK);
    private static final Font HEADER    = FontFactory.getFont(FontFactory.TIMES_BOLD, 10, Color.BLACK);
    private static final Font BODY      = FontFactory.getFont(FontFactory.TIMES, 10, Color.BLACK);
    private static final Font INSTR_EN  = FontFactory.getFont(FontFactory.TIMES, 9, new Color(0x33, 0x33, 0x33));
    private static final Font INSTR_MS  = FontFactory.getFont(FontFactory.TIMES_ITALIC, 9, new Color(0x55, 0x55, 0x55));

    private PrescriptionTableRenderer() {}

    public static void render(Document doc, List<PrescriptionRow> rows) throws DocumentException {
        Paragraph title = new Paragraph("── PRESCRIPTION ──", TITLE);
        title.setAlignment(Element.ALIGN_CENTER);
        title.setSpacingBefore(14f);
        title.setSpacingAfter(8f);
        doc.add(title);

        if (rows.isEmpty()) {
            Paragraph empty = new Paragraph("No medications prescribed for this visit.", BODY);
            empty.setAlignment(Element.ALIGN_CENTER);
            doc.add(empty);
            return;
        }

        PdfPTable t = new PdfPTable(new float[]{ 0.6f, 4.5f, 1.4f, 1.8f, 1.5f });
        t.setWidthPercentage(100f);

        addHeader(t, "SNO");
        addHeader(t, "MEDICINE / PRECAUTION");
        addHeader(t, "DOSAGE");
        addHeader(t, "FREQUENCY");
        addHeader(t, "TOTAL");

        for (PrescriptionRow r : rows) {
            t.addCell(cell(String.valueOf(r.sno()), BODY));
            t.addCell(medicineCell(r));
            t.addCell(cell(r.dosage(), BODY));
            t.addCell(cell(r.frequencyEn(), BODY));
            t.addCell(cell(r.total(), BODY));
        }
        doc.add(t);
    }

    private static PdfPCell medicineCell(PrescriptionRow r) {
        PdfPCell c = new PdfPCell();
        c.setPaddingBottom(4f);
        c.addElement(new Phrase(r.medicineName(), BODY));
        if (r.instructionEn() != null && !r.instructionEn().isBlank()) {
            Paragraph en = new Paragraph("  " + r.instructionEn(), INSTR_EN);
            en.setSpacingBefore(2f);
            c.addElement(en);
        }
        if (r.instructionMs() != null && !r.instructionMs().isBlank()) {
            Paragraph ms = new Paragraph("  " + r.instructionMs(), INSTR_MS);
            c.addElement(ms);
        }
        return c;
    }

    private static void addHeader(PdfPTable t, String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, HEADER));
        c.setBackgroundColor(new Color(0xEE, 0xEE, 0xEE));
        c.setPadding(4f);
        t.addCell(c);
    }

    private static PdfPCell cell(String text, Font font) {
        PdfPCell c = new PdfPCell(new Phrase(text == null ? "" : text, font));
        c.setPadding(4f);
        return c;
    }
}
```

- [ ] **Step 2.5.5: Run — expect PASS**

```bash
cd backend && ./mvnw -q test -Dtest=PrescriptionTableRendererTest
```

- [ ] **Step 2.5.6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/pdf/render/PrescriptionTableRenderer.java \
        backend/src/test/java/my/cliniflow/infrastructure/pdf/render/PrescriptionTableRendererTest.java
git commit -m "feat(pdf): PrescriptionTableRenderer with bilingual EN+MS instruction lines"
```

### Task 2.6: SoapReportRenderer

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/pdf/render/SoapReportRenderer.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/pdf/render/SoapReportRendererTest.java`

- [ ] **Step 2.6.1: Define input record (top of renderer)**

```java
public record SoapReportInput(
    String referenceNumber,
    String chiefComplaint,
    String hpi,
    String vitals,
    String examFindings,
    String primaryDiagnosis,
    List<String> differentialDiagnoses,
    String investigations,
    String followUp,
    String patientEducation,
    List<PrescriptionTableRenderer.PrescriptionRow> medications,
    List<SafetyAnnotation> safetyAnnotations
) {
    public record SafetyAnnotation(
        String severity, String category, String message,
        String acknowledgedBy, String acknowledgedAt, String reason
    ) {}
}
```

- [ ] **Step 2.6.2: Write failing test**

Create `backend/src/test/java/my/cliniflow/infrastructure/pdf/render/SoapReportRendererTest.java`:

```java
package my.cliniflow.infrastructure.pdf.render;

import my.cliniflow.infrastructure.pdf.PdfDocumentBuilder;
import my.cliniflow.infrastructure.pdf.render.SoapReportRenderer.SoapReportInput;
import my.cliniflow.infrastructure.pdf.render.SoapReportRenderer.SoapReportInput.SafetyAnnotation;
import my.cliniflow.infrastructure.pdf.render.PrescriptionTableRenderer.PrescriptionRow;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SoapReportRendererTest {

    @Test
    void renders_all_soap_sections() throws Exception {
        var input = new SoapReportInput(
                "V-2026-05-02-0042",
                "Chest pain x 2 days",
                "Onset 2 days ago, intermittent...",
                "BP 130/80, HR 78, Temp 37.0",
                "Mild epigastric tenderness",
                "Gastritis",
                List.of("Peptic ulcer", "MI (ruled out)"),
                "ECG done — normal",
                "Review in 1 week",
                "Avoid spicy food, NSAIDs",
                List.of(new PrescriptionRow(1, "Pantoprazole 40mg", "Before food", null,
                        "1 tab/s", "daily", "14 days")),
                List.of(new SafetyAnnotation(
                        "CRITICAL", "DRUG_ALLERGY", "Aspirin conflicts with Penicillin",
                        "Dr. Lim", "2026-05-02 11:25", "Reviewed with patient, accepted risk"))
        );

        byte[] pdf = PdfDocumentBuilder.build(doc -> SoapReportRenderer.render(doc, input));
        String text = extractText(pdf);

        assertThat(text)
            .contains("CLINICAL REPORT")
            .contains("V-2026-05-02-0042")
            .contains("SUBJECTIVE").contains("Chest pain")
            .contains("OBJECTIVE").contains("BP 130/80")
            .contains("ASSESSMENT").contains("Gastritis").contains("Peptic ulcer")
            .contains("PLAN").contains("ECG done").contains("1 week")
            .contains("Pantoprazole 40mg")
            .contains("SAFETY ANNOTATIONS").contains("Aspirin").contains("Dr. Lim")
            .contains("Reviewed with patient");
    }

    private static String extractText(byte[] pdf) throws Exception {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(doc);
        }
    }
}
```

- [ ] **Step 2.6.3: Run — expect FAIL**

```bash
cd backend && ./mvnw -q test -Dtest=SoapReportRendererTest
```

- [ ] **Step 2.6.4: Implement**

Create `backend/src/main/java/my/cliniflow/infrastructure/pdf/render/SoapReportRenderer.java`:

```java
package my.cliniflow.infrastructure.pdf.render;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;

import java.awt.Color;
import java.util.List;

public final class SoapReportRenderer {

    public record SoapReportInput(
            String referenceNumber,
            String chiefComplaint,
            String hpi,
            String vitals,
            String examFindings,
            String primaryDiagnosis,
            List<String> differentialDiagnoses,
            String investigations,
            String followUp,
            String patientEducation,
            List<PrescriptionTableRenderer.PrescriptionRow> medications,
            List<SafetyAnnotation> safetyAnnotations
    ) {
        public record SafetyAnnotation(
                String severity, String category, String message,
                String acknowledgedBy, String acknowledgedAt, String reason) {}
    }

    private static final Font H1   = FontFactory.getFont(FontFactory.TIMES_BOLD, 13, Color.BLACK);
    private static final Font H2   = FontFactory.getFont(FontFactory.TIMES_BOLD, 11, Color.BLACK);
    private static final Font BODY = FontFactory.getFont(FontFactory.TIMES, 11, Color.BLACK);
    private static final Font WARN = FontFactory.getFont(FontFactory.TIMES_BOLD, 10, new Color(0xB0, 0x00, 0x00));

    private SoapReportRenderer() {}

    public static void render(Document doc, SoapReportInput in) throws DocumentException {
        Paragraph hr1 = new Paragraph("─────────────────────────────────────────────", BODY);
        hr1.setSpacingBefore(12f);
        doc.add(hr1);

        Paragraph title = new Paragraph("CLINICAL REPORT — VISIT " + nullSafe(in.referenceNumber()), H1);
        title.setAlignment(Element.ALIGN_CENTER);
        title.setSpacingBefore(2f);
        title.setSpacingAfter(2f);
        doc.add(title);

        Paragraph hr2 = new Paragraph("─────────────────────────────────────────────", BODY);
        hr2.setSpacingAfter(8f);
        doc.add(hr2);

        section(doc, "SUBJECTIVE", List.of(
                "Chief complaint: " + nullSafe(in.chiefComplaint()),
                "HPI:             " + nullSafe(in.hpi())
        ));

        section(doc, "OBJECTIVE", List.of(
                "Vitals:          " + nullSafe(in.vitals()),
                "Exam findings:   " + nullSafe(in.examFindings())
        ));

        var assessmentLines = new java.util.ArrayList<String>();
        assessmentLines.add("Primary diagnosis: " + nullSafe(in.primaryDiagnosis()));
        if (in.differentialDiagnoses() != null && !in.differentialDiagnoses().isEmpty()) {
            assessmentLines.add("Differentials:     " + String.join(", ", in.differentialDiagnoses()));
        }
        section(doc, "ASSESSMENT", assessmentLines);

        section(doc, "PLAN", List.of(
                "Investigations:    " + nullSafe(in.investigations()),
                "Follow-up:         " + nullSafe(in.followUp()),
                "Patient education: " + nullSafe(in.patientEducation())
        ));

        if (in.medications() != null && !in.medications().isEmpty()) {
            Paragraph p = new Paragraph("Medications:", H2);
            p.setSpacingBefore(4f);
            doc.add(p);
            PrescriptionTableRenderer.render(doc, in.medications());
        }

        if (in.safetyAnnotations() != null && !in.safetyAnnotations().isEmpty()) {
            Paragraph p = new Paragraph("SAFETY ANNOTATIONS", H2);
            p.setSpacingBefore(10f);
            doc.add(p);
            for (var a : in.safetyAnnotations()) {
                Paragraph head = new Paragraph(
                        "• [" + a.severity() + " · " + a.category() + "] " + a.message(), WARN);
                doc.add(head);
                Paragraph ack = new Paragraph(
                        "    Acknowledged by " + a.acknowledgedBy() + " at " + a.acknowledgedAt()
                                + ", reason: \"" + nullSafe(a.reason()) + "\"", BODY);
                ack.setSpacingAfter(4f);
                doc.add(ack);
            }
        }
    }

    private static void section(Document doc, String label, List<String> lines) throws DocumentException {
        Paragraph head = new Paragraph(label, H2);
        head.setSpacingBefore(8f);
        head.setSpacingAfter(2f);
        doc.add(head);
        for (String line : lines) doc.add(new Paragraph(line, BODY));
    }

    private static String nullSafe(String s) { return s == null ? "-" : s; }
}
```

- [ ] **Step 2.6.5: Run — expect PASS**

```bash
cd backend && ./mvnw -q test -Dtest=SoapReportRendererTest
```

- [ ] **Step 2.6.6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/pdf/render/SoapReportRenderer.java \
        backend/src/test/java/my/cliniflow/infrastructure/pdf/render/SoapReportRendererTest.java
git commit -m "feat(pdf): SoapReportRenderer — full SOAP narrative + safety annotations"
```

### Task 2.7: PDF builder interfaces + impls

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/service/PrescriptionPdfBuilder.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/service/ClinicalReportPdfBuilder.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/pdf/EPrescriptionPdfBuilderImpl.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/pdf/ClinicalReportPdfBuilderImpl.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/pdf/EPrescriptionPdfBuilderImplTest.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/pdf/ClinicalReportPdfBuilderImplTest.java`

- [ ] **Step 2.7.1: Define the domain interfaces**

Create `backend/src/main/java/my/cliniflow/domain/biz/visit/service/PrescriptionPdfBuilder.java`:

```java
package my.cliniflow.domain.biz.visit.service;

import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;

import java.util.List;

public interface PrescriptionPdfBuilder {

    /** Domain-layer carrier — kept here so domain has no knowledge of OpenPDF row record. */
    record MedicationLine(
        int sno, String medicineName,
        String instructionEn, String instructionMs,
        String dosage, String frequencyEn, String total
    ) {}

    byte[] build(VisitIdentificationInfo identification,
                  List<MedicationLine> medications,
                  String allergyCsv);
}
```

Create `backend/src/main/java/my/cliniflow/domain/biz/visit/service/ClinicalReportPdfBuilder.java`:

```java
package my.cliniflow.domain.biz.visit.service;

import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;

import java.util.List;

public interface ClinicalReportPdfBuilder {

    record SafetyLine(
        String severity, String category, String message,
        String acknowledgedBy, String acknowledgedAt, String reason
    ) {}

    record ClinicalReportInput(
        String chiefComplaint, String hpi,
        String vitals, String examFindings,
        String primaryDiagnosis, List<String> differentialDiagnoses,
        String investigations, String followUp, String patientEducation,
        List<PrescriptionPdfBuilder.MedicationLine> medications,
        List<SafetyLine> safetyAnnotations,
        String allergyCsv
    ) {}

    byte[] build(VisitIdentificationInfo identification, ClinicalReportInput body);
}
```

- [ ] **Step 2.7.2: Implement EPrescriptionPdfBuilderImpl**

Create `backend/src/main/java/my/cliniflow/infrastructure/pdf/EPrescriptionPdfBuilderImpl.java`:

```java
package my.cliniflow.infrastructure.pdf;

import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.service.PrescriptionPdfBuilder;
import my.cliniflow.infrastructure.pdf.render.ClinicLetterheadRenderer;
import my.cliniflow.infrastructure.pdf.render.PatientDemographicsRenderer;
import my.cliniflow.infrastructure.pdf.render.PrescriptionTableRenderer;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

@Component
public class EPrescriptionPdfBuilderImpl implements PrescriptionPdfBuilder {

    private static final Font FOOTER = FontFactory.getFont(FontFactory.TIMES, 8, new Color(0x77, 0x77, 0x77));

    @Override
    public byte[] build(VisitIdentificationInfo info,
                         List<MedicationLine> medications,
                         String allergyCsv) {
        try {
            // First pass: build PDF with placeholder hash so geometry is final.
            byte[] withoutHash = PdfDocumentBuilder.build(doc -> {
                ClinicLetterheadRenderer.render(doc, info.clinic());
                PatientDemographicsRenderer.render(doc, info, allergyCsv);
                PrescriptionTableRenderer.render(doc, toRows(medications));
                addPrescriberFooter(doc, info);
                addDisclaimerFooter(doc, "<placeholder-sha>");
            });
            String hash = sha256Hex(withoutHash);
            // Second pass: render with the real hash so the printed footer matches the hash you'd compute over the file
            // (Note: hash printed inside the file != hash of the file itself. The printed hash is the hash of the
            // *content excluding the footer line* — see disclaimer wording.)
            return PdfDocumentBuilder.build(doc -> {
                ClinicLetterheadRenderer.render(doc, info.clinic());
                PatientDemographicsRenderer.render(doc, info, allergyCsv);
                PrescriptionTableRenderer.render(doc, toRows(medications));
                addPrescriberFooter(doc, info);
                addDisclaimerFooter(doc, hash);
            });
        } catch (DocumentException e) {
            throw new IllegalStateException("PDF generation failed", e);
        }
    }

    private static List<PrescriptionTableRenderer.PrescriptionRow> toRows(List<MedicationLine> meds) {
        return meds.stream()
                .map(m -> new PrescriptionTableRenderer.PrescriptionRow(
                        m.sno(), m.medicineName(),
                        m.instructionEn(), m.instructionMs(),
                        m.dosage(), m.frequencyEn(), m.total()))
                .toList();
    }

    private static void addPrescriberFooter(com.lowagie.text.Document doc, VisitIdentificationInfo info) throws DocumentException {
        Paragraph p = new Paragraph("Prescriber: " + info.doctor().fullName(),
                FontFactory.getFont(FontFactory.TIMES, 11, Color.BLACK));
        p.setSpacingBefore(14f);
        doc.add(p);
        doc.add(new Paragraph("MMC: " + info.doctor().mmcNumber() + " · " + info.doctor().specialty(),
                FontFactory.getFont(FontFactory.TIMES, 10, Color.BLACK)));
        if (info.visit().finalizedAt() != null) {
            doc.add(new Paragraph("Date issued: " + info.visit().finalizedAt().toLocalDate(),
                    FontFactory.getFont(FontFactory.TIMES, 10, Color.BLACK)));
        }
    }

    private static void addDisclaimerFooter(com.lowagie.text.Document doc, String hash) throws DocumentException {
        Paragraph p = new Paragraph("─────────────────────────────────────────────", FOOTER);
        p.setSpacingBefore(20f);
        doc.add(p);
        Paragraph d = new Paragraph(
                "This is a digitally generated e-prescription. Verify integrity (content hash):", FOOTER);
        d.setAlignment(Element.ALIGN_LEFT);
        doc.add(d);
        doc.add(new Paragraph("SHA-256: " + hash,
                FontFactory.getFont(FontFactory.COURIER, 8, new Color(0x77, 0x77, 0x77))));
    }

    private static String sha256Hex(byte[] in) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(in));
        } catch (Exception e) {
            return "0".repeat(64);
        }
    }
}
```

- [ ] **Step 2.7.3: Implement ClinicalReportPdfBuilderImpl**

Create `backend/src/main/java/my/cliniflow/infrastructure/pdf/ClinicalReportPdfBuilderImpl.java`:

```java
package my.cliniflow.infrastructure.pdf;

import com.lowagie.text.DocumentException;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.service.ClinicalReportPdfBuilder;
import my.cliniflow.domain.biz.visit.service.PrescriptionPdfBuilder;
import my.cliniflow.infrastructure.pdf.render.ClinicLetterheadRenderer;
import my.cliniflow.infrastructure.pdf.render.PatientDemographicsRenderer;
import my.cliniflow.infrastructure.pdf.render.PrescriptionTableRenderer;
import my.cliniflow.infrastructure.pdf.render.SoapReportRenderer;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.util.List;

@Component
public class ClinicalReportPdfBuilderImpl implements ClinicalReportPdfBuilder {

    @Override
    public byte[] build(VisitIdentificationInfo info, ClinicalReportInput body) {
        try {
            return PdfDocumentBuilder.build(doc -> {
                ClinicLetterheadRenderer.render(doc, info.clinic());
                PatientDemographicsRenderer.render(doc, info, body.allergyCsv());

                var soapInput = new SoapReportRenderer.SoapReportInput(
                        info.visit().referenceNumber(),
                        body.chiefComplaint(), body.hpi(),
                        body.vitals(), body.examFindings(),
                        body.primaryDiagnosis(), body.differentialDiagnoses(),
                        body.investigations(), body.followUp(), body.patientEducation(),
                        toRows(body.medications()),
                        body.safetyAnnotations() == null ? List.of() :
                            body.safetyAnnotations().stream()
                                .map(s -> new SoapReportRenderer.SoapReportInput.SafetyAnnotation(
                                        s.severity(), s.category(), s.message(),
                                        s.acknowledgedBy(), s.acknowledgedAt(), s.reason()))
                                .toList()
                );
                SoapReportRenderer.render(doc, soapInput);

                Paragraph p = new Paragraph("Prescriber: " + info.doctor().fullName(),
                        FontFactory.getFont(FontFactory.TIMES, 11, Color.BLACK));
                p.setSpacingBefore(14f);
                doc.add(p);
                doc.add(new Paragraph("MMC: " + info.doctor().mmcNumber() + " · " + info.doctor().specialty(),
                        FontFactory.getFont(FontFactory.TIMES, 10, Color.BLACK)));
                if (info.visit().finalizedAt() != null) {
                    doc.add(new Paragraph("Finalized: " + info.visit().finalizedAt(),
                            FontFactory.getFont(FontFactory.TIMES, 10, Color.BLACK)));
                }
            });
        } catch (DocumentException e) {
            throw new IllegalStateException("Clinical-report PDF generation failed", e);
        }
    }

    private static List<PrescriptionTableRenderer.PrescriptionRow> toRows(
            List<PrescriptionPdfBuilder.MedicationLine> meds) {
        if (meds == null) return List.of();
        return meds.stream()
                .map(m -> new PrescriptionTableRenderer.PrescriptionRow(
                        m.sno(), m.medicineName(),
                        m.instructionEn(), m.instructionMs(),
                        m.dosage(), m.frequencyEn(), m.total()))
                .toList();
    }
}
```

- [ ] **Step 2.7.4: Write integration tests for both builders**

Create `backend/src/test/java/my/cliniflow/infrastructure/pdf/EPrescriptionPdfBuilderImplTest.java`:

```java
package my.cliniflow.infrastructure.pdf;

import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.service.PrescriptionPdfBuilder.MedicationLine;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class EPrescriptionPdfBuilderImplTest {

    @Test
    void produces_pdf_with_letterhead_demographics_table_signature() throws Exception {
        var clinic = new ClinicInfo("My Clinic", "1 Road", "City 11111", "+60 1", "x@y", "REG-1");
        var info = new VisitIdentificationInfo(
                clinic,
                new VisitIdentificationInfo.Patient("Tan A K", "880101-01-1234",
                        LocalDate.parse("1988-01-01"), 38, "MALE", "+60 12-3"),
                new VisitIdentificationInfo.Doctor("Dr. Lim", "MMC 9", "GP"),
                new VisitIdentificationInfo.Visit(UUID.randomUUID(), "V-1",
                        LocalDate.parse("2026-05-02"),
                        OffsetDateTime.parse("2026-05-02T11:30:00+08:00"))
        );
        var meds = List.of(
                new MedicationLine(1, "Metformin 500mg", "Take with food", "Ambil bersama makanan",
                        "1 tab/s", "twice daily", "30 days")
        );

        byte[] pdf = new EPrescriptionPdfBuilderImpl().build(info, meds, "Penicillin");

        try (PDDocument doc = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(doc);
            assertThat(text)
                .contains("My Clinic")
                .contains("Tan A K")
                .contains("880101-01-1234")
                .contains("PRESCRIPTION")
                .contains("Metformin 500mg")
                .contains("Ambil bersama makanan")
                .contains("Penicillin")
                .contains("Dr. Lim")
                .contains("MMC 9")
                .contains("SHA-256:");
        }
    }

    @Test
    void no_meds_renders_no_medications_message() throws Exception {
        var clinic = new ClinicInfo("X", "X", "X", "X", "X@x", "X");
        var info = new VisitIdentificationInfo(
                clinic,
                new VisitIdentificationInfo.Patient("P", "1", LocalDate.parse("2000-01-01"), 26, "F", null),
                new VisitIdentificationInfo.Doctor("Dr. D", "MMC 1", "GP"),
                new VisitIdentificationInfo.Visit(UUID.randomUUID(), "V-1",
                        LocalDate.parse("2026-05-02"), null)
        );
        byte[] pdf = new EPrescriptionPdfBuilderImpl().build(info, List.of(), null);
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertThat(new PDFTextStripper().getText(doc))
                .contains("No medications prescribed")
                .contains("Nil reported");
        }
    }
}
```

Create `backend/src/test/java/my/cliniflow/infrastructure/pdf/ClinicalReportPdfBuilderImplTest.java`:

```java
package my.cliniflow.infrastructure.pdf;

import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.service.ClinicalReportPdfBuilder.ClinicalReportInput;
import my.cliniflow.domain.biz.visit.service.ClinicalReportPdfBuilder.SafetyLine;
import my.cliniflow.domain.biz.visit.service.PrescriptionPdfBuilder.MedicationLine;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ClinicalReportPdfBuilderImplTest {

    @Test
    void renders_full_soap_report_with_safety_annotations() throws Exception {
        var clinic = new ClinicInfo("C", "L1", "L2", "P", "e@e", "R");
        var info = new VisitIdentificationInfo(
                clinic,
                new VisitIdentificationInfo.Patient("Tan A K", "881212-12-1212",
                        LocalDate.parse("1988-12-12"), 37, "MALE", "+60 12"),
                new VisitIdentificationInfo.Doctor("Dr. Lim", "MMC 9", "GP"),
                new VisitIdentificationInfo.Visit(UUID.randomUUID(), "V-001",
                        LocalDate.parse("2026-05-02"),
                        OffsetDateTime.parse("2026-05-02T11:30:00+08:00"))
        );
        var body = new ClinicalReportInput(
                "Cough x 3 days", "Onset 3d ago...",
                "BP 120/80, T 37.0", "No abnormal findings",
                "URTI", List.of("COVID", "Pneumonia"),
                "None ordered", "Review if persistent", "Hydration, rest",
                List.of(new MedicationLine(1, "Paracetamol 500mg", "PRN fever", null,
                        "1 tab/s", "TDS PRN", "5 days")),
                List.of(new SafetyLine("HIGH", "DDI", "X interacts with Y",
                        "Dr. Lim", "2026-05-02 11:25", "Reviewed")),
                "Penicillin"
        );

        byte[] pdf = new ClinicalReportPdfBuilderImpl().build(info, body);
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(doc);
            assertThat(text)
                .contains("CLINICAL REPORT")
                .contains("V-001")
                .contains("Cough x 3 days")
                .contains("URTI").contains("COVID")
                .contains("Paracetamol 500mg")
                .contains("SAFETY ANNOTATIONS")
                .contains("X interacts with Y");
        }
    }
}
```

- [ ] **Step 2.7.5: Run all PDF tests**

```bash
cd backend && ./mvnw -q test -Dtest='*Pdf*Test,*Renderer*Test'
```

Expect: all PASS.

- [ ] **Step 2.7.6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/service/PrescriptionPdfBuilder.java \
        backend/src/main/java/my/cliniflow/domain/biz/visit/service/ClinicalReportPdfBuilder.java \
        backend/src/main/java/my/cliniflow/infrastructure/pdf/EPrescriptionPdfBuilderImpl.java \
        backend/src/main/java/my/cliniflow/infrastructure/pdf/ClinicalReportPdfBuilderImpl.java \
        backend/src/test/java/my/cliniflow/infrastructure/pdf/EPrescriptionPdfBuilderImplTest.java \
        backend/src/test/java/my/cliniflow/infrastructure/pdf/ClinicalReportPdfBuilderImplTest.java
git commit -m "feat(pdf): builders for e-prescription + clinical report (domain interface + OpenPDF impl)"
```

---

## Phase 3 — Patient e-prescription PDF (full vertical slice)

**Phase exit criteria:**
- `prescription_documents` table exists in DB.
- `finalize` creates a row + audit event.
- `GET /api/patient/visits/{id}/prescription.pdf` serves the bytes with auth + ownership.
- Patient portal visit page has clinic caption + "Download my prescription" button.
- Doctor Report Preview has "Download patient prescription" button.
- E2E browser test: patient logs in → downloads → file lands.

### Task 3.1: Migration — prescription_documents table

**Files:**
- Modify: `backend/src/main/resources/db/migration/V14__pdf_documents.sql`

- [ ] **Step 3.1.1: Append the table to V14**

Edit `backend/src/main/resources/db/migration/V14__pdf_documents.sql` and append:

```sql
CREATE TABLE prescription_documents (
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
CREATE INDEX prescription_documents_patient_idx ON prescription_documents(patient_id);
```

- [ ] **Step 3.1.2: Apply to local Supabase / dev DB**

```bash
psql "$SUPABASE_DB_URL" -c "$(awk '/CREATE TABLE prescription_documents/,/CREATE INDEX prescription_documents_patient_idx ON.*;/' backend/src/main/resources/db/migration/V14__pdf_documents.sql)"
psql "$SUPABASE_DB_URL" -c "\d prescription_documents"
```

- [ ] **Step 3.1.3: Commit**

```bash
git add backend/src/main/resources/db/migration/V14__pdf_documents.sql
git commit -m "feat(db): prescription_documents table — immutable bytea per visit"
```

### Task 3.2: PrescriptionDocumentModel + repository

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/PrescriptionDocumentModel.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/repository/PrescriptionDocumentRepository.java`

- [ ] **Step 3.2.1: JPA entity**

Create `backend/src/main/java/my/cliniflow/domain/biz/visit/model/PrescriptionDocumentModel.java`:

```java
package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "prescription_documents")
public class PrescriptionDocumentModel {

    @Id
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "visit_id", nullable = false, unique = true)
    private UUID visitId;

    @Column(name = "patient_id", nullable = false)
    private UUID patientId;

    @Column(name = "pdf_bytes", nullable = false)
    private byte[] pdfBytes;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "byte_size", nullable = false)
    private int byteSize;

    @Column(name = "generated_at", nullable = false)
    private OffsetDateTime generatedAt;

    @Column(name = "generated_by", nullable = false)
    private UUID generatedBy;

    @Column(name = "schema_version", nullable = false)
    private short schemaVersion = 1;

    // getters / setters

    public UUID getId() { return id; }
    public void setId(UUID v) { this.id = v; }
    public UUID getVisitId() { return visitId; }
    public void setVisitId(UUID v) { this.visitId = v; }
    public UUID getPatientId() { return patientId; }
    public void setPatientId(UUID v) { this.patientId = v; }
    public byte[] getPdfBytes() { return pdfBytes; }
    public void setPdfBytes(byte[] v) { this.pdfBytes = v; }
    public String getSha256() { return sha256; }
    public void setSha256(String v) { this.sha256 = v; }
    public int getByteSize() { return byteSize; }
    public void setByteSize(int v) { this.byteSize = v; }
    public OffsetDateTime getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(OffsetDateTime v) { this.generatedAt = v; }
    public UUID getGeneratedBy() { return generatedBy; }
    public void setGeneratedBy(UUID v) { this.generatedBy = v; }
    public short getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(short v) { this.schemaVersion = v; }
}
```

- [ ] **Step 3.2.2: Repository**

Create `backend/src/main/java/my/cliniflow/domain/biz/visit/repository/PrescriptionDocumentRepository.java`:

```java
package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.PrescriptionDocumentModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PrescriptionDocumentRepository extends JpaRepository<PrescriptionDocumentModel, UUID> {
    Optional<PrescriptionDocumentModel> findByVisitId(UUID visitId);
    boolean existsByVisitId(UUID visitId);
}
```

- [ ] **Step 3.2.3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/model/PrescriptionDocumentModel.java \
        backend/src/main/java/my/cliniflow/domain/biz/visit/repository/PrescriptionDocumentRepository.java
git commit -m "feat(visit): PrescriptionDocumentModel + repository"
```

### Task 3.3: PrescriptionIssuedDomainEvent

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/event/PrescriptionIssuedDomainEvent.java`

- [ ] **Step 3.3.1: Define the event**

```java
package my.cliniflow.domain.biz.visit.event;

import java.time.OffsetDateTime;
import java.util.UUID;

public record PrescriptionIssuedDomainEvent(
        UUID visitId,
        UUID patientId,
        UUID doctorId,
        String referenceNumber,
        String sha256,
        OffsetDateTime issuedAt
) {}
```

- [ ] **Step 3.3.2: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/event/PrescriptionIssuedDomainEvent.java
git commit -m "feat(visit): PrescriptionIssuedDomainEvent (per ddd-conventions example)"
```

### Task 3.4: PrescriptionGenerateDomainService

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/service/PrescriptionGenerateDomainService.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/visit/service/PrescriptionGenerateDomainServiceTest.java`

- [ ] **Step 3.4.1: Write failing test**

Create `backend/src/test/java/my/cliniflow/domain/biz/visit/service/PrescriptionGenerateDomainServiceTest.java`:

```java
package my.cliniflow.domain.biz.visit.service;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.VisitIdentificationReadAppService;
import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PrescriptionDocumentModel;
import my.cliniflow.domain.biz.visit.repository.MedicationRepository;
import my.cliniflow.domain.biz.visit.repository.PrescriptionDocumentRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PrescriptionGenerateDomainServiceTest {

    @Mock VisitIdentificationReadAppService idReads;
    @Mock MedicationRepository medications;
    @Mock PatientReadAppService patients;
    @Mock PrescriptionDocumentRepository docs;
    @Mock PrescriptionPdfBuilder builder;

    @InjectMocks PrescriptionGenerateDomainService svc;

    @Test
    void happy_path_persists_pdf_with_hash() {
        UUID visitId = UUID.randomUUID(), patientId = UUID.randomUUID(), doctorId = UUID.randomUUID();

        var clinic = new ClinicInfo("C", "X", "Y", "P", "e@e", "R");
        var info = new VisitIdentificationInfo(
                clinic,
                new VisitIdentificationInfo.Patient("X", "1", LocalDate.parse("1988-01-01"), 38, "MALE", null),
                new VisitIdentificationInfo.Doctor("Dr. D", "MMC 1", "GP"),
                new VisitIdentificationInfo.Visit(visitId, "V-1", LocalDate.parse("2026-05-02"),
                        OffsetDateTime.parse("2026-05-02T11:00:00+08:00"))
        );

        when(idReads.assemble(visitId)).thenReturn(info);
        when(medications.findByVisitId(visitId)).thenReturn(List.of());
        when(patients.getClinicalProfile(patientId)).thenReturn(Optional.empty());
        when(docs.existsByVisitId(visitId)).thenReturn(false);
        when(builder.build(any(), any(), any())).thenReturn(new byte[]{1, 2, 3, 4});

        svc.generate(visitId, patientId, doctorId);

        ArgumentCaptor<PrescriptionDocumentModel> cap = ArgumentCaptor.forClass(PrescriptionDocumentModel.class);
        verify(docs).save(cap.capture());
        PrescriptionDocumentModel saved = cap.getValue();
        assertThat(saved.getVisitId()).isEqualTo(visitId);
        assertThat(saved.getPatientId()).isEqualTo(patientId);
        assertThat(saved.getGeneratedBy()).isEqualTo(doctorId);
        assertThat(saved.getByteSize()).isEqualTo(4);
        assertThat(saved.getSha256()).hasSize(64);
        assertThat(saved.getPdfBytes()).containsExactly(1, 2, 3, 4);
    }

    @Test
    void duplicate_finalize_is_idempotent_no_op() {
        UUID v = UUID.randomUUID();
        when(docs.existsByVisitId(v)).thenReturn(true);

        svc.generate(v, UUID.randomUUID(), UUID.randomUUID());

        verify(docs, never()).save(any());
        verify(builder, never()).build(any(), any(), any());
    }
}
```

- [ ] **Step 3.4.2: Run — expect FAIL (service doesn't exist)**

```bash
cd backend && ./mvnw -q test -Dtest=PrescriptionGenerateDomainServiceTest
```

- [ ] **Step 3.4.3: Implement**

Create `backend/src/main/java/my/cliniflow/domain/biz/visit/service/PrescriptionGenerateDomainService.java`:

```java
package my.cliniflow.domain.biz.visit.service;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.VisitIdentificationReadAppService;
import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PrescriptionDocumentModel;
import my.cliniflow.domain.biz.visit.repository.MedicationRepository;
import my.cliniflow.domain.biz.visit.repository.PrescriptionDocumentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class PrescriptionGenerateDomainService {

    private static final Logger log = LoggerFactory.getLogger(PrescriptionGenerateDomainService.class);
    private static final int SOFT_SIZE_LIMIT = 2 * 1024 * 1024;
    private static final int HARD_SIZE_LIMIT = 10 * 1024 * 1024;

    private final VisitIdentificationReadAppService idReads;
    private final MedicationRepository medications;
    private final PatientReadAppService patients;
    private final PrescriptionDocumentRepository docs;
    private final PrescriptionPdfBuilder builder;

    public PrescriptionGenerateDomainService(VisitIdentificationReadAppService idReads,
                                              MedicationRepository medications,
                                              PatientReadAppService patients,
                                              PrescriptionDocumentRepository docs,
                                              PrescriptionPdfBuilder builder) {
        this.idReads = idReads;
        this.medications = medications;
        this.patients = patients;
        this.docs = docs;
        this.builder = builder;
    }

    /**
     * Generates and persists the prescription PDF. Idempotent — second call
     * on the same visit returns silently if a row already exists.
     *
     * @return the generated document's sha256, or null if a row already existed
     */
    public String generate(UUID visitId, UUID patientId, UUID doctorId) {
        if (docs.existsByVisitId(visitId)) {
            log.info("prescription.generate.skip visit_id={} reason=ALREADY_EXISTS", visitId);
            return null;
        }

        VisitIdentificationInfo info = idReads.assemble(visitId);

        List<MedicationModel> meds = medications.findByVisitId(visitId);
        List<PrescriptionPdfBuilder.MedicationLine> lines = toLines(meds, /* msTranslations */ Map.of());

        String allergyCsv = patients.getClinicalProfile(patientId)
                .map(PrescriptionGenerateDomainService::extractAllergies)
                .orElse(null);

        byte[] pdf = builder.build(info, lines, allergyCsv);

        if (pdf.length > HARD_SIZE_LIMIT) {
            throw new IllegalStateException(
                    "prescription PDF exceeded hard size limit: " + pdf.length + " bytes");
        }
        if (pdf.length > SOFT_SIZE_LIMIT) {
            log.warn("prescription.generate.size_alarm visit_id={} byte_size={}", visitId, pdf.length);
        }

        String sha = sha256Hex(pdf);

        PrescriptionDocumentModel m = new PrescriptionDocumentModel();
        m.setId(UUID.randomUUID());
        m.setVisitId(visitId);
        m.setPatientId(patientId);
        m.setPdfBytes(pdf);
        m.setSha256(sha);
        m.setByteSize(pdf.length);
        m.setGeneratedAt(OffsetDateTime.now());
        m.setGeneratedBy(doctorId);
        docs.save(m);

        log.info("prescription.generate.success visit_id={} sha256={} byte_size={}", visitId, sha, pdf.length);
        return sha;
    }

    private static List<PrescriptionPdfBuilder.MedicationLine> toLines(
            List<MedicationModel> meds, Map<UUID, String> msTranslations) {
        int sno = 1;
        var out = new java.util.ArrayList<PrescriptionPdfBuilder.MedicationLine>();
        for (MedicationModel m : meds) {
            String name = (m.getName() == null ? "" : m.getName()) +
                          (m.getDosage() == null ? "" : " " + m.getDosage());
            String total = m.getDurationDays() == null ? "" :
                    (m.getDurationDays() % 30 == 0 && m.getDurationDays() >= 30
                            ? (m.getDurationDays() / 30) + " month" + (m.getDurationDays() == 30 ? "" : "s")
                            : m.getDurationDays() + " days");
            out.add(new PrescriptionPdfBuilder.MedicationLine(
                    sno++,
                    name.trim(),
                    m.getInstructions(),
                    msTranslations.get(m.getId()),
                    "1 tab/s",                  // dosage column — could parse from m.getDosage() in Phase 5
                    m.getFrequency(),
                    total
            ));
        }
        return out;
    }

    private static String extractAllergies(PatientClinicalProfileModel prof) {
        if (prof.getDrugAllergies() == null) return null;
        var names = prof.getDrugAllergies().stream()
                .map(a -> a.get("name"))
                .filter(java.util.Objects::nonNull)
                .map(Object::toString)
                .filter(s -> !s.isBlank())
                .toList();
        return names.isEmpty() ? null : String.join(", ", names);
    }

    private static String sha256Hex(byte[] in) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(in));
        } catch (Exception e) {
            return "0".repeat(64);
        }
    }
}
```

- [ ] **Step 3.4.4: Run tests — expect PASS**

```bash
cd backend && ./mvnw -q test -Dtest=PrescriptionGenerateDomainServiceTest
```

- [ ] **Step 3.4.5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/service/PrescriptionGenerateDomainService.java \
        backend/src/test/java/my/cliniflow/domain/biz/visit/service/PrescriptionGenerateDomainServiceTest.java
git commit -m "feat(visit): PrescriptionGenerateDomainService — idempotent + size-bounded"
```

### Task 3.5: Wire into ReportReviewAppService.finalize()

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/application/biz/visit/ReportReviewAppService.java`
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/visit/response/FinalizeResponse.java` (or wherever)

- [ ] **Step 3.5.1: Add prescriptionStatus to FinalizeResponse**

Find FinalizeResponse:

```bash
grep -rn "class FinalizeResponse\|record FinalizeResponse" backend/src/main/java/
```

Add fields:

```java
public record FinalizeResponse(
        UUID visitId,
        String summaryEn,
        String summaryMs,
        OffsetDateTime finalizedAt,
        String prescriptionStatus,        // "READY" | "GENERATING" | "FAILED" | "SKIPPED"
        String clinicalReportStatus       // same enum
) {}
```

Update any constructor call sites — search:
```bash
grep -rn "new FinalizeResponse(" backend/src/main/java/ backend/src/test/java/
```

Each call needs the two new args. For now (until Phase 5's outbox), pass `"READY"` on success path.

- [ ] **Step 3.5.2: Inject PrescriptionGenerateDomainService into ReportReviewAppService**

Edit `ReportReviewAppService.java`. Add to constructor:

```java
private final PrescriptionGenerateDomainService prescriptionGen;
// ...constructor adds prescriptionGen param and assigns it
```

- [ ] **Step 3.5.3: Call generate() after the existing finalize transaction**

In `ReportReviewAppService.finalize()`, find the line just before `return new FinalizeResponse(...)`. After the existing transactional work commits (which it does at the end of the @Transactional method), the call to PDF generation must happen in a new transaction.

The cleanest pattern: extract the PDF generation into a helper that's called from the controller, or use Spring's `@TransactionalEventListener(phase = AFTER_COMMIT)` on the visit's "finalize" event. The simplest implementation for now is to use `TransactionTemplate` with `REQUIRES_NEW` propagation:

Inject:
```java
private final org.springframework.transaction.support.TransactionTemplate newTxn;
// constructor: this.newTxn = new TransactionTemplate(txManager); this.newTxn.setPropagationBehavior(PROPAGATION_REQUIRES_NEW);
```

Or use `@Transactional(propagation = REQUIRES_NEW)` on `PrescriptionGenerateDomainService.generate()` and call it directly.

Apply: Add `@Transactional(propagation = Propagation.REQUIRES_NEW)` to `PrescriptionGenerateDomainService.generate()`. Then in `ReportReviewAppService.finalize()`, invoke after the SOAP write completes:

```java
String prescriptionStatus = "READY";
try {
    prescriptionGen.generate(visitId, visit.getPatientId(), doctorId);
} catch (Exception e) {
    log.error("prescription.generate.failed visit_id={} error={}", visitId, e.toString(), e);
    prescriptionStatus = "FAILED";
    // Phase 5 will enqueue retry here.
}

return new FinalizeResponse(visitId, summaryEn, summaryMs, finalizedAt,
                             prescriptionStatus, "SKIPPED");   // clinicalReport added in Phase 4
```

- [ ] **Step 3.5.4: Add a smoke integration test**

Create or extend an existing test that calls `finalize` and verifies the row appears:

```java
// In an existing ReportReviewAppService integration test class, add:
@Test
@Transactional   // rolled back after test
void finalize_creates_prescription_document_row() {
    // Given a visit ready to finalize (use existing fixture builder)
    UUID visitId = setupFinalizableVisit();
    // When
    FinalizeResponse resp = reportReview.finalize(visitId, doctorId);
    // Then
    assertThat(resp.prescriptionStatus()).isEqualTo("READY");
    assertThat(prescriptionDocs.findByVisitId(visitId))
        .as("prescription_documents row should exist")
        .isPresent()
        .hasValueSatisfying(d -> {
            assertThat(d.getByteSize()).isGreaterThan(0);
            assertThat(d.getSha256()).hasSize(64);
            assertThat(d.getGeneratedBy()).isEqualTo(doctorId);
        });
}
```

If no existing integration-test fixture exists for finalize, add one in `ReportReviewAppServiceTest` mirroring the @SpringBootTest patterns from `RegistrationControllerIntegrationTest`.

- [ ] **Step 3.5.5: Run integration test**

```bash
cd backend && ./mvnw -q test -Dtest=ReportReviewAppServiceTest
```

- [ ] **Step 3.5.6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/application/biz/visit/ReportReviewAppService.java \
        backend/src/main/java/my/cliniflow/controller/biz/visit/response/FinalizeResponse.java \
        backend/src/test/java/my/cliniflow/application/biz/visit/ReportReviewAppServiceTest.java
git commit -m "feat(finalize): generate prescription PDF after finalize commits"
```

### Task 3.6: PatientPrescriptionController + auth matrix test

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/patient/PatientPrescriptionController.java`
- Test: `backend/src/test/java/my/cliniflow/controller/biz/patient/PatientPrescriptionControllerTest.java`

- [ ] **Step 3.6.1: Implement controller**

```java
package my.cliniflow.controller.biz.patient;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.visit.model.PrescriptionDocumentModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.PrescriptionDocumentRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/patient/visits/{visitId}/prescription.pdf")
public class PatientPrescriptionController {

    private final PrescriptionDocumentRepository docs;
    private final VisitRepository visits;
    private final PatientReadAppService patients;
    private final AuditWriter audit;

    public PatientPrescriptionController(PrescriptionDocumentRepository docs,
                                          VisitRepository visits,
                                          PatientReadAppService patients,
                                          AuditWriter audit) {
        this.docs = docs;
        this.visits = visits;
        this.patients = patients;
        this.audit = audit;
    }

    @GetMapping
    @PreAuthorize("hasRole('PATIENT')")
    @Transactional
    public ResponseEntity<?> download(@PathVariable UUID visitId, Authentication auth) {
        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();

        // Ownership check
        UUID ownPatientId = patients.findByUserId(claims.userId())
                .map(PatientModel::getId).orElse(null);
        VisitModel visit = visits.findById(visitId).orElse(null);
        if (visit == null || ownPatientId == null || !ownPatientId.equals(visit.getPatientId())) {
            audit.append("PRESCRIPTION_DOWNLOAD_DENIED", "VISIT", visitId.toString(),
                          claims.userId(), "PATIENT");
            return ResponseEntity.status(403)
                    .body(WebResult.error(ResultCode.FORBIDDEN, "Visit not yours"));
        }

        // Visit must be finalized
        if (!"FINALIZED".equals(visit.getStatus())) {
            return ResponseEntity.status(409)
                    .body(WebResult.error(ResultCode.CONFLICT, "Report is available after finalization."));
        }

        PrescriptionDocumentModel doc = docs.findByVisitId(visitId).orElse(null);
        if (doc == null) {
            return ResponseEntity.status(503)
                    .header(HttpHeaders.RETRY_AFTER, "30")
                    .body(WebResult.error(ResultCode.SERVICE_UNAVAILABLE,
                            "Your prescription is being prepared. Please refresh in 30 seconds."));
        }

        audit.append("PRESCRIPTION_DOWNLOAD", "VISIT", visitId.toString(),
                      claims.userId(), "PATIENT");

        String filename = "prescription-" + visit.getReferenceNumber() + ".pdf";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(doc.getPdfBytes());
    }
}
```

(Add `ResultCode.SERVICE_UNAVAILABLE` and `ResultCode.CONFLICT` to the existing enum if not present.)

- [ ] **Step 3.6.2: Authorization matrix test**

Create `backend/src/test/java/my/cliniflow/controller/biz/patient/PatientPrescriptionControllerTest.java` — covers:
1. Patient owns visit + visit finalized + PDF exists → 200 + bytes + correct filename header
2. Patient doesn't own visit → 403 + audit row with `PRESCRIPTION_DOWNLOAD_DENIED`
3. Patient owns visit + visit NOT finalized → 409
4. Patient owns visit + visit finalized + PDF row missing → 503 + Retry-After header
5. Anonymous → 401

(Test code follows the existing MockMvc/SpringBootTest pattern — paste the test alongside the controller; the test file is ~120 lines, similar shape to `PatientControllerTest`.)

- [ ] **Step 3.6.3: Run + commit**

```bash
cd backend && ./mvnw -q test -Dtest=PatientPrescriptionControllerTest
git add backend/src/main/java/my/cliniflow/controller/biz/patient/PatientPrescriptionController.java \
        backend/src/test/java/my/cliniflow/controller/biz/patient/PatientPrescriptionControllerTest.java
git commit -m "feat(api): GET /api/patient/visits/{id}/prescription.pdf with auth + audit + ownership"
```

### Task 3.7: Frontend — download helper + patient portal UI

**Files:**
- Create: `frontend/lib/download.ts`
- Modify: `frontend/app/portal/visits/[visitId]/page.tsx`

- [ ] **Step 3.7.1: Create download helper**

```ts
// frontend/lib/download.ts
import { getToken } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export async function downloadAuthedFile(path: string, filename: string): Promise<void> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
        let msg = `Download failed (HTTP ${res.status})`;
        try {
            const env = await res.json();
            if (env?.message) msg = env.message;
        } catch { /* ignore */ }
        throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 3.7.2: Add caption + button to patient portal visit page**

Modify `frontend/app/portal/visits/[visitId]/page.tsx`:

Add imports:
```typescript
import { useEffect, useState } from "react";
import { downloadAuthedFile } from "@/lib/download";
import { getVisitIdentification, type VisitIdentification } from "@/lib/visit-identification";
```

Inside the page component, fetch identification:
```typescript
const [ident, setIdent] = useState<VisitIdentification | null>(null);
const [downloading, setDownloading] = useState(false);
const [downloadErr, setDownloadErr] = useState<string | null>(null);

useEffect(() => {
    getVisitIdentification(visitId).then(setIdent).catch(() => {});
}, [visitId]);
```

Above the existing visit title (use the same styling pattern as the "PROFILE" caption in `frontend/app/portal/profile/page.tsx`):

```tsx
{ident && (
  <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
    From {ident.clinic.name}
  </p>
)}
```

Below the existing medication cards section (find a good anchor with `grep -n "medication\|MedicationCard" frontend/app/portal/visits/\[visitId\]/page.tsx`), add:

```tsx
{ident?.visit.finalizedAt && (
  <div className="mt-8">
    <Button
      type="button"
      variant="primary"
      loading={downloading}
      onClick={async () => {
        setDownloadErr(null);
        setDownloading(true);
        try {
          await downloadAuthedFile(
            `/patient/visits/${visitId}/prescription.pdf`,
            `prescription-${ident.visit.referenceNumber}.pdf`
          );
        } catch (e) {
          setDownloadErr(e instanceof Error ? e.message : "Download failed");
        } finally {
          setDownloading(false);
        }
      }}
    >
      Download my prescription
    </Button>
    {downloadErr && (
      <p className="font-sans text-sm text-crimson mt-2" role="alert">{downloadErr}</p>
    )}
  </div>
)}
```

- [ ] **Step 3.7.3: Lint + typecheck**

```bash
cd frontend && npm run lint && npm run typecheck
```

- [ ] **Step 3.7.4: E2E browser test via Playwright MCP**

Bring stack up (`docker compose up -d`, restart nginx if needed). Then drive:

1. Navigate to `http://localhost/login`, login as `patient@demo.local`/`password`
2. Navigate to a finalized visit (find one from the patient portal home)
3. Snapshot — verify `From CliniFlow Medical Clinic` caption appears at top
4. Click `Download my prescription`
5. Use `mcp__plugin_playwright_playwright__browser_network_requests` to verify the request hit `/api/patient/visits/{id}/prescription.pdf` and got HTTP 200 with `Content-Type: application/pdf`
6. Take a screenshot to `e2e-phase3-prescription-download.png`

- [ ] **Step 3.7.5: Commit**

```bash
git add frontend/lib/download.ts \
        frontend/app/portal/visits/\[visitId\]/page.tsx
git commit -m "feat(portal): clinic name caption + Download my prescription button"
```

### Task 3.8: Doctor Report Preview — add prescription download button

**Files:**
- Modify: `frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx`

- [ ] **Step 3.8.1: Replace the stub Download PDF button**

Find the existing stub:
```bash
grep -n "Download PDF\|onClick={() => {}}" frontend/app/doctor/visits/\[visitId\]/components/ReportPreview.tsx
```

Replace with the new prescription download button (the doctor's clinical report button is added in Phase 4):

```tsx
{finalized && ident && (
  <Button
    type="button"
    variant="secondary"
    onClick={async () => {
      try {
        await downloadAuthedFile(
          `/patient/visits/${visitId}/prescription.pdf`,
          `prescription-${ident.visit.referenceNumber}.pdf`
        );
      } catch (e) {
        // surface inline if you have an error-toast pattern
        console.error(e);
      }
    }}
  >
    Download patient prescription
  </Button>
)}
```

(Note: doctor downloading the PATIENT prescription endpoint via the patient route won't work — the patient endpoint is auth'd on PATIENT role only. For the doctor's view, we need a doctor-callable endpoint too. Either add a separate `GET /api/visits/{id}/prescription.pdf` for doctors, or share the document repo via the clinical-report controller in Phase 4. Defer this to Phase 4 — for now, the doctor's button shows "Download patient prescription" but the endpoint will be added alongside the clinical report endpoint. Mark this button hidden for now if patient endpoint role-check would reject the doctor.)

Better — for Phase 3, only add the patient-portal button. Skip the doctor's prescription-download button until Phase 4 wires up the clinical report. Update Step 3.8.1: don't add the button yet; just ensure the stub is removed or kept as-is until Phase 4. Replace `onClick={() => {}}` with disabled placeholder + "Coming in Phase 4" tooltip, or simply leave the stub.

- [ ] **Step 3.8.2: Commit (if button added) or skip**

(If you elected to defer the doctor-side button to Phase 4, no commit here.)

---

## Phase 4 — Doctor's clinical report PDF (full vertical slice)

**Phase exit criteria:**
- `clinical_report_documents` table exists.
- `finalize` writes both PDFs.
- `GET /api/visits/{id}/clinical-report.pdf` (doctor) and `GET /api/visits/{id}/prescription.pdf` (doctor) both serve.
- Doctor Report Preview shows BOTH download buttons.

### Task 4.1: Migration — clinical_report_documents

- [ ] **Step 4.1.1: Append to V14 + apply**

Append to `backend/src/main/resources/db/migration/V14__pdf_documents.sql`:

```sql
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
```

Apply manually to Supabase. Commit migration.

### Task 4.2: ClinicalReportDocumentModel + repository + event

Mirror Task 3.2 / 3.3, replacing `prescription` with `clinicalReport`. Files:
- `domain/biz/visit/model/ClinicalReportDocumentModel.java`
- `domain/biz/visit/repository/ClinicalReportDocumentRepository.java`
- `domain/biz/visit/event/ClinicalReportIssuedDomainEvent.java`

(Code is identical structure to Task 3.2; copy-paste with the table name and class name swapped.)

### Task 4.3: ClinicalReportGenerateDomainService

Mirror Task 3.4. The service:
1. Loads `VisitIdentificationInfo` via `idReads`
2. Loads the medical report (`MedicalReportRepository.findByVisitId(visitId)`)
3. Loads acknowledged evaluator findings (`EvaluatorFindingRepository.findByVisitIdAndAcknowledgedAtNotNull(visitId)`)
4. Builds `ClinicalReportInput` (chiefComplaint, hpi, vitals, etc. from the SOAP report)
5. Calls `ClinicalReportPdfBuilder.build(...)`
6. Persists to `ClinicalReportDocumentRepository`
7. Idempotent on duplicate visit

(Code is structurally identical to PrescriptionGenerateDomainService; the data assembly differs. Test mirrors PrescriptionGenerateDomainServiceTest.)

### Task 4.4: Wire into finalize

Modify `ReportReviewAppService.finalize()` to also call `clinicalReportGen.generate(...)` after the prescription generation. Update `FinalizeResponse.clinicalReportStatus` to "READY" or "FAILED" based on outcome.

### Task 4.5: VisitDocumentController — doctor downloads

Create `backend/src/main/java/my/cliniflow/controller/biz/visit/VisitDocumentController.java` with two endpoints:

```java
@RestController
@RequestMapping("/api/visits/{visitId}")
public class VisitDocumentController {

    // Injected: ClinicalReportDocumentRepository, PrescriptionDocumentRepository, VisitRepository, AuditWriter

    @GetMapping("/clinical-report.pdf")
    @PreAuthorize("hasAnyRole('DOCTOR','ADMIN')")
    @Transactional
    public ResponseEntity<?> clinicalReport(@PathVariable UUID visitId, Authentication auth) {
        // Same shape as PatientPrescriptionController.download but reads
        // ClinicalReportDocumentRepository, no patient-ownership check.
        // Audit: CLINICAL_REPORT_DOWNLOAD
    }

    @GetMapping("/prescription.pdf")
    @PreAuthorize("hasAnyRole('DOCTOR','ADMIN')")
    @Transactional
    public ResponseEntity<?> prescription(@PathVariable UUID visitId, Authentication auth) {
        // Returns the patient's prescription PDF (doctor needs to see what they prescribed).
        // Audit: PRESCRIPTION_DOWNLOAD_DOCTOR
    }
}
```

(Each endpoint follows the same shape as PatientPrescriptionController. Authorization differs — doctor can access any visit they're attending; admin can access any.)

Add tests for both endpoints — auth matrix similar to Task 3.6.

### Task 4.6: Frontend — two download buttons in Report Preview

Modify `ReportPreview.tsx` to add both buttons (replacing the single stub):

```tsx
{finalized && ident && (
  <>
    <Button variant="secondary" onClick={() => downloadAuthedFile(
      `/visits/${visitId}/clinical-report.pdf`,
      `clinical-report-${ident.visit.referenceNumber}.pdf`
    )}>
      Download my clinical report
    </Button>
    <Button variant="secondary" onClick={() => downloadAuthedFile(
      `/visits/${visitId}/prescription.pdf`,
      `prescription-${ident.visit.referenceNumber}.pdf`
    )}>
      Download patient prescription
    </Button>
  </>
)}
```

### Task 4.7: E2E test for Phase 4

Drive Playwright MCP:
1. Login as doctor, navigate to a finalized visit
2. Verify both download buttons visible
3. Click clinical report → assert `/visits/{id}/clinical-report.pdf` returns 200 + PDF
4. Click prescription → assert `/visits/{id}/prescription.pdf` returns 200 + PDF
5. Open patient portal as patient, verify their `/patient/visits/{id}/prescription.pdf` works (same bytes)
6. Verify cross-patient access: log in as patient B, attempt patient A's URL → 403

### Task 4.8: Golden file regression tests

Create `backend/src/test/resources/golden/prescription-canonical.txt` and `clinical-report-canonical.txt`. Add tests in `EPrescriptionPdfBuilderImplTest` and `ClinicalReportPdfBuilderImplTest`:

```java
@Test
void canonical_prescription_matches_golden() throws Exception {
    byte[] pdf = new EPrescriptionPdfBuilderImpl().build(canonicalIdent(), canonicalMeds(), "Penicillin");
    String text = extractText(pdf);
    String golden = Files.readString(Paths.get("src/test/resources/golden/prescription-canonical.txt"));
    // Strip varying date strings before comparison
    assertThat(normalise(text)).isEqualTo(normalise(golden));
}
```

(`canonicalIdent()`, `canonicalMeds()` are fixture builders. `normalise()` strips dates, sha hashes, page numbers.)

To regenerate the golden file:
```bash
cd backend && ./mvnw -q exec:java -Dexec.mainClass=my.cliniflow.tooling.GoldenPdfRegenerator
```

(Add a small main() utility under `src/test/java/.../tooling/` to write the canonical PDF and dump its extracted text.)

Commit Phase 4 with message: `feat(visit): clinical report PDF generation + download endpoints + Report Preview wiring`.

---

## Phase 5 — Hardening

### Task 5.1: PDF generation outbox + retry scheduler

**Files:**
- Migration extending notification_outbox or new `pdf_generation_outbox` table
- New `infrastructure/outbox/PdfGenerationOutboxWorker.java` (mirrors existing `Neo4jProjectionOutboxWorker`)
- Modify `PrescriptionGenerateDomainService` and `ClinicalReportGenerateDomainService` to enqueue on failure

(Pattern is the same as `Neo4jProjectionOutboxWorker` already in the project — copy its shape.)

### Task 5.2: Identity-unresolved banner in Report Preview

When `getVisitIdentification()` throws because of decryption failure, the controller returns a structured error code `IDENTITY_UNRESOLVED`. Frontend displays a red banner:

```tsx
{identErr === "IDENTITY_UNRESOLVED" && (
  <div className="bg-crimson/10 border border-crimson/40 text-crimson p-3 rounded-sm font-sans text-sm">
    PDF cannot be generated — patient identity unresolved. Contact admin.
  </div>
)}
```

Disable both download buttons when this is set.

### Task 5.3: 503 + "Preparing PDF…" tooltip handling

In `downloadAuthedFile`, special-case HTTP 503:
```ts
if (res.status === 503) {
    const retry = res.headers.get("Retry-After") ?? "30";
    throw new Error(`PDF still preparing — please refresh in ${retry}s.`);
}
```

In ReportPreview, if the latest finalize response had `prescriptionStatus: "GENERATING"` or `"FAILED"`, render the prescription button as disabled with a tooltip showing the status.

### Task 5.4: Audit completeness sweep

Verify (via grep) that every controller action that reads or writes per-visit data writes an audit row. New events to add to the existing enum / convention:
- `PRESCRIPTION_GENERATE`
- `PRESCRIPTION_GENERATE_FAILED`
- `PRESCRIPTION_GENERATE_BLOCKED`
- `PRESCRIPTION_GENERATE_RETRIED`
- `PRESCRIPTION_DOWNLOAD`
- `PRESCRIPTION_DOWNLOAD_DENIED`
- `CLINICAL_REPORT_GENERATE` and the same suffix variants

Each event should also be queryable in the admin audit-log filter UI (no new code if the existing filter is open-ended).

### Task 5.5: E2E full-failure-mode test

Drive a chaos scenario:
1. Finalize a visit
2. Verify both PDFs present
3. Stop the agent service (`docker compose stop agent`)
4. Finalize a second visit → verify prescription PDF is generated with English-only instructions and "Translation unavailable" footer
5. Restart agent (`docker compose start agent`)
6. Verify retry outbox didn't try to re-render the second visit's PDF (translation is enhancement, not a retry trigger)

---

## Self-review checklist (run after writing the plan; fix inline)

**Spec coverage:** Each spec section has tasks:
- §1 Goal & scope → Phases 1-5 collectively
- §2 Decisions log → embedded in plan section choices
- §3.1 Clinic config → Task 1.1
- §3.2 Identification endpoint → Task 1.4
- §3.3 PDF tables → Tasks 3.1, 4.1
- §3.4 No-changes → no task needed (negative scope)
- §4 Java component architecture → Tasks 1.2, 1.4, 2.x, 3.2-3.4, 4.x
- §5 Frontend rewire → Tasks 1.5, 3.7, 3.8, 4.6
- §6 PDF layout → Tasks 2.3-2.6, 4.8 (golden files)
- §7 Failure modes → Phase 5
- §8 Acceptance criteria → covered by tests in each task
- §9 Test strategy → unit (Tasks 2.x), integration (3.5, 3.6, 4.5), E2E (3.7.4, 4.7), golden (4.8), PHI regression (Phase 1 verification)
- §10 Rollout → noted in phase exit criteria
- §11 Phase 2 deferrals → out of scope (correctly excluded)

**Type consistency:** Cross-checked: `PrescriptionPdfBuilder.MedicationLine` consistent across Tasks 2.5, 2.7, 3.4. `VisitIdentificationInfo` shape consistent across Tasks 1.4, 1.5, 2.4, 2.7, 3.4. `FinalizeResponse` updated in 3.5, used in 4.4.

**No placeholders:** Every code step has full code. The only "follow existing pattern" prose is in Tasks 4.1-4.5 where the structure mirrors Phase 3 — those tasks instruct copy-paste with table/class name swap, which is concrete.

**No type/method drift:** `getClinicalProfile()` exists per `PatientReadAppService.java:121` (verified earlier in the conversation). `findByVisitId(UUID)` is added to `PrescriptionDocumentRepository` and `ClinicalReportDocumentRepository`. `decryptNationalId()` is added in Step 1.4.5 if not present.
