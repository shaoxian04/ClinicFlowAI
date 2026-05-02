# E-Prescription & Clinical Report — Implementation Plan (Trimmed)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Kill the PHI fabrication bug in Doctor Report Preview by replacing hardcoded demo data with a real `/api/visits/{id}/identification` endpoint. (2) Add a patient-facing e-prescription view modal (display-only, no PDF generation) accessible from previous consultation history.

**Architecture:** One backend assembly point (`VisitIdentificationReadAppService`) feeds both the Doctor Report Preview UI and the patient e-prescription modal, so clinic/patient/doctor identity is identical on both surfaces. No PDF generation — download button shows a "coming soon" toast. Doctor portal is otherwise unchanged after the Phase 1 rewire.

**Tech Stack:** Java 21, Spring Boot 3.3, JPA/Hibernate, Postgres (Supabase), Next.js 14, TypeScript, Playwright MCP for E2E.

**Spec:** `docs/superpowers/specs/2026-05-02-e-prescription-and-clinical-report-pdf-design.md`

**Scope reduction note:** Phases 2-5 (PDF generation, storage, download, hardening) are deferred. Only Phase 1 (identity foundation) and the patient e-prescription modal ship in this plan.

---

## File map

### Backend (already done: 1.1-1.3)

```
backend/src/main/java/my/cliniflow/
├── infrastructure/config/ClinicProperties.java                   ✅ done
├── domain/biz/clinic/info/ClinicInfo.java                        ✅ done
├── application/biz/clinic/ClinicReadAppService.java              ✅ done
├── controller/biz/clinic/ClinicController.java                   ✅ done
├── domain/biz/visit/service/ReferenceNumberDomainService.java    ✅ done
├── domain/biz/visit/service/ReferenceCounterInitializer.java     ✅ done
└── domain/biz/visit/model/VisitModel.java (reference_number)     ✅ done
```

### Backend (Task 1.4)

```
backend/src/main/java/my/cliniflow/
├── domain/biz/visit/info/VisitIdentificationInfo.java
├── application/biz/visit/VisitIdentificationReadAppService.java
├── application/biz/patient/PatientReadAppService.java            ← add decryptNationalId if missing
├── controller/biz/visit/response/VisitIdentificationDTO.java
└── controller/biz/visit/VisitIdentificationController.java
```

### Frontend (Tasks 1.5, 1.6, NEW)

```
frontend/lib/visit-identification.ts                              ← new
frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx ← remove demo data
frontend/app/portal/visits/[visitId]/page.tsx                    ← add modal
frontend/components/EPrescriptionModal.tsx                        ← new modal component
```

---

## Phase 1 — Identity foundation

**Phase exit criteria:**
- `GET /api/clinic` returns the configured clinic block; auth-free. ✅ done
- `GET /api/visits/{visitId}/identification` returns `{clinic, patient, doctor, visit}` from real Postgres data; ownership-checked for PATIENT role.
- Doctor Report Preview shows real patient IC, DOB, doctor MMC, and clinic info — no longer derived from `visitId.charCodeAt()`.
- All three demo functions and the hardcoded `CLINIC` constant are deleted from `ReportPreview.tsx`.
- Spring Boot fails to start if `cliniflow.clinic.name` is empty. ✅ done

---

### Task 1.1 ✅ DONE — ClinicProperties config binding
### Task 1.2 ✅ DONE — ClinicInfo + ClinicReadAppService + GET /api/clinic
### Task 1.3 ✅ DONE — ReferenceNumberDomainService (V-yyyy-MM-dd-NNNN)

---

### Task 1.4: VisitIdentificationInfo + ReadAppService + endpoint

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/info/VisitIdentificationInfo.java`
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/VisitIdentificationReadAppService.java`
- Possibly modify: `backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java` (add `decryptNationalId` if missing)
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
        assertThat(info.patient().ageYears()).isGreaterThanOrEqualTo(38);
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
 * Consumed by GET /api/visits/{id}/identification AND the patient
 * e-prescription modal. Guarantees both surfaces show identical values.
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

Check:
```bash
grep -n "decryptNationalId" backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java
```

If missing, find the cipher:
```bash
grep -rn "NationalIdCipher\|national_id_ciphertext\|decrypt" backend/src/main/java/my/cliniflow/ | head -5
```

Add to `PatientReadAppService` (adjust to actual cipher API):
```java
public String decryptNationalId(PatientModel p) {
    if (p.getNationalIdCiphertext() == null) return null;
    return cipher.decrypt(p.getNationalIdCiphertext());
}
```

- [ ] **Step 1.4.6: Run test — expect PASS**

```bash
cd backend && ./mvnw -q test -Dtest=VisitIdentificationReadAppServiceTest
```

- [ ] **Step 1.4.7: Create VisitIdentificationDTO**

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

- [ ] **Step 1.4.8: Create VisitIdentificationController**

Create `backend/src/main/java/my/cliniflow/controller/biz/visit/VisitIdentificationController.java`.

Before writing, verify the actual project conventions:
```bash
grep -n "JwtService\|Claims\|claims.role\|claims.userId" backend/src/main/java/my/cliniflow/controller/biz/visit/VisitController.java | head -10
grep -n "WebResult.error\|ResultCode.FORBIDDEN\|FORBIDDEN" backend/src/main/java/my/cliniflow/controller/base/ResultCode.java | head -5
grep -n "findByUserId" backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java | head -3
```

Then implement (adapting to actual signatures):

```java
package my.cliniflow.controller.biz.visit;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.VisitIdentificationReadAppService;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.response.VisitIdentificationDTO;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
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
    private final VisitRepository visits;

    public VisitIdentificationController(VisitIdentificationReadAppService reads,
                                          PatientReadAppService patients,
                                          VisitRepository visits) {
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

- [ ] **Step 1.4.9: Write controller test**

Create `backend/src/test/java/my/cliniflow/controller/biz/visit/VisitIdentificationControllerTest.java`:

```java
package my.cliniflow.controller.biz.visit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import jakarta.annotation.PostConstruct;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
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
        mvc.perform(get("/api/visits/00000000-0000-0000-0000-000000000001/identification"))
           .andExpect(result -> {
               int s = result.getResponse().getStatus();
               assert s != 401 && s != 403 : "Expected non-auth-error, got " + s;
           });
    }
}
```

(No `@TestPropertySource` needed — clinic block is already in `src/test/resources/application.yml`.)

- [ ] **Step 1.4.10: Run all tests**

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

---

### Task 1.5: Frontend rewire — kill the demo data fabrication

**Files:**
- Create: `frontend/lib/visit-identification.ts`
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
    const res = await apiGet<{ data: VisitIdentification }>(`/visits/${visitId}/identification`);
    return (res as any).data ?? res;
}
```

(The `data` unwrapping handles the `WebResult<T>` envelope — check what `apiGet` returns. If `apiGet` already unwraps `.data`, just use `return apiGet<VisitIdentification>(...)` directly. Read `frontend/lib/api.ts` first to confirm the shape.)

- [ ] **Step 1.5.2: Locate demo blocks in ReportPreview**

```bash
grep -n "const CLINIC\|demoPatientProfile\|demoDoctorProfile\|formatDoctorName" \
    "frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx"
```

Note the line numbers.

- [ ] **Step 1.5.3: Delete the three demo functions + add data hook**

In `ReportPreview.tsx`:

1. Delete the `const CLINIC = { ... }` block.
2. Delete `function demoPatientProfile(...)`.
3. Delete `function demoDoctorProfile(...)`.
4. Delete `function formatDoctorName(...)` (if present separately).

Add at the top of the component body:

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

Add import at top:
```typescript
import { getVisitIdentification, type VisitIdentification } from "@/lib/visit-identification";
```

If `useEffect` / `useState` are not already imported, add them.

- [ ] **Step 1.5.4: Replace clinic header block**

Find the block that renders `CLINIC.name` (or similar) and replace with:

```tsx
{identErr ? (
  <p className="font-sans text-sm text-red-400">Failed to load clinic info: {identErr}</p>
) : ident ? (
  <>
    <p className="font-display text-lg">{ident.clinic.name}</p>
    <p className="font-sans text-xs mt-0.5">
      {ident.clinic.addressLine1}, {ident.clinic.addressLine2}
    </p>
    <div className="font-sans text-xs mt-1 flex gap-4 flex-wrap">
      <span>Tel: {ident.clinic.phone}</span>
      <span>{ident.clinic.email}</span>
      <span>Reg. {ident.clinic.registrationNumber}</span>
    </div>
  </>
) : (
  <div className="space-y-1.5 animate-pulse">
    <div className="h-5 w-48 bg-gray-700 rounded-sm" />
    <div className="h-3 w-72 bg-gray-700 rounded-sm" />
  </div>
)}
```

Use existing CSS classes from the file for typography/colors — match the aurora-glass theme already in place.

- [ ] **Step 1.5.5: Replace patient demographics block**

Replace every reference to `demoPatientProfile(visitId, patientName).X` with `ident?.patient.X`. The patient block should show:
- `fullName`, `nationalId ?? "—"`, `dateOfBirth` (formatted), `ageYears`, `gender ?? "—"`, `phone ?? "—"`
- `ident.visit.referenceNumber`, `ident.visit.visitDate` (formatted)

Add a formatting helper if not already present:
```typescript
function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}
```

- [ ] **Step 1.5.6: Replace doctor signature block**

Replace `demoDoctorProfile(...)` references with:

```tsx
{ident && (
  <div className="mt-6 pt-4 border-t font-sans text-sm">
    <div>Prescriber: {ident.doctor.fullName}</div>
    <div className="text-xs mt-0.5">
      MMC: {ident.doctor.mmcNumber} · {ident.doctor.specialty}
    </div>
  </div>
)}
```

Use existing border/font classes from the file.

- [ ] **Step 1.5.7: Verify deletion complete**

```bash
grep -n "CLINIC\|demoPatientProfile\|demoDoctorProfile" \
    "frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx"
```

Expect: zero source-code matches.

- [ ] **Step 1.5.8: Lint + typecheck**

```bash
cd frontend && npm run lint && npm run typecheck
```

Expect: clean.

- [ ] **Step 1.5.9: Commit**

```bash
git add "frontend/lib/visit-identification.ts" \
        "frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx"
git commit -m "fix(report-preview): kill PHI fabrication; consume real /identification data"
```

---

### Task 1.6: Phase 1 verification gate (E2E)

- [ ] **Step 1.6.1: Run all backend tests**

```bash
cd backend && ./mvnw -q test 2>&1 | tail -20
```

Expect: 0 failures, 0 errors.

- [ ] **Step 1.6.2: Verify demo functions are gone**

```bash
grep -rn "demoPatientProfile\|demoDoctorProfile\|const CLINIC =" frontend/app/
```

Expect: zero matches.

- [ ] **Step 1.6.3: Docker rebuild + Playwright E2E**

```bash
docker compose build --no-cache && docker compose up -d
```

Wait ~30s then use Playwright MCP:
1. Navigate to `http://localhost/login`
2. Log in as doctor (`doctor@demo.local` / `password`)
3. Navigate to a finalized visit's Report Preview tab
4. Verify clinic header shows the real configured name (not "CliniFlow AI Clinic" or similar hardcoded)
5. Verify patient NRIC is a real decrypted IC, not a hash pattern
6. Verify doctor MMC matches the real doctor profile
7. Screenshot to `e2e-phase1-real-data.png`

- [ ] **Step 1.6.4: Commit migration rename**

```bash
git add backend/src/main/resources/db/migration/V14__visit_reference_counter.sql
git commit -m "chore: rename V14 migration to reflect actual content (reference counter only)"
```

---

## Phase 2 — Patient e-prescription view modal (display-only)

**Phase exit criteria:**
- Patient can navigate to a previous consultation and click "View e-prescription"
- A modal opens showing: clinic letterhead, patient demographics, medication grid (from the finalized SOAP note)
- All clinic/patient/doctor data is sourced from `GET /api/visits/{id}/identification` (same data as Doctor Report Preview)
- Medications are loaded from the existing visit medications endpoint (already present)
- "Download as PDF" button is visually enabled, clickable, shows a toast "PDF download coming soon"
- Aurora-glass theme maintained throughout

### Task NEW: Patient e-prescription view modal

**Files:**
- Create: `frontend/components/EPrescriptionModal.tsx`
- Modify: `frontend/app/portal/visits/[visitId]/page.tsx` (add "View e-prescription" button + modal)

- [ ] **Step NEW.1: Read the existing patient portal visit page**

```bash
cat "frontend/app/portal/visits/[visitId]/page.tsx" | head -80
```

Understand: how visits/medications are loaded, what data is already available, existing layout.

Also read the existing visit data types:
```bash
grep -rn "medications\|MedicationItem\|PostVisitSummary" frontend/lib/ | head -10
```

- [ ] **Step NEW.2: Create EPrescriptionModal component**

Create `frontend/components/EPrescriptionModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getVisitIdentification, type VisitIdentification } from "@/lib/visit-identification";

interface Props {
    visitId: string;
    medications: Array<{ name: string; dose?: string; frequency?: string; duration?: string; instructions?: string }>;
    onClose: () => void;
}

export default function EPrescriptionModal({ visitId, medications, onClose }: Props) {
    const [ident, setIdent] = useState<VisitIdentification | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getVisitIdentification(visitId)
            .then((d) => { setIdent(d); setLoading(false); })
            .catch((e) => { setError(e instanceof Error ? e.message : "Failed to load"); setLoading(false); });
    }, [visitId]);

    function handleDownload() {
        // PDF generation is deferred — show user-friendly notice
        alert("PDF download coming soon.");
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0f1117] border border-white/10 shadow-2xl">
                {/* Header */}
                <div className="sticky top-0 bg-[#0f1117] border-b border-white/10 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-white font-semibold text-lg">E-Prescription</h2>
                    <button onClick={onClose} className="text-white/60 hover:text-white text-xl font-bold leading-none">×</button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {loading && (
                        <div className="space-y-2 animate-pulse">
                            <div className="h-4 bg-white/10 rounded w-48" />
                            <div className="h-3 bg-white/10 rounded w-72" />
                        </div>
                    )}
                    {error && <p className="text-red-400 text-sm">{error}</p>}

                    {ident && (
                        <>
                            {/* Clinic letterhead */}
                            <div className="border-b border-white/10 pb-4">
                                <p className="text-white font-semibold text-base">{ident.clinic.name}</p>
                                <p className="text-white/60 text-xs mt-0.5">{ident.clinic.addressLine1}, {ident.clinic.addressLine2}</p>
                                <div className="text-white/50 text-xs mt-1 flex gap-4 flex-wrap">
                                    <span>Tel: {ident.clinic.phone}</span>
                                    <span>{ident.clinic.email}</span>
                                    <span>Reg. No: {ident.clinic.registrationNumber}</span>
                                </div>
                            </div>

                            {/* Patient demographics */}
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                                <div><span className="text-white/50">Patient:</span> <span className="text-white">{ident.patient.fullName}</span></div>
                                <div><span className="text-white/50">NRIC:</span> <span className="text-white">{ident.patient.nationalId ?? "—"}</span></div>
                                <div><span className="text-white/50">DOB:</span> <span className="text-white">{ident.patient.dateOfBirth ? new Date(ident.patient.dateOfBirth).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span></div>
                                <div><span className="text-white/50">Age:</span> <span className="text-white">{ident.patient.ageYears} yrs</span></div>
                                <div><span className="text-white/50">Ref No:</span> <span className="text-white">{ident.visit.referenceNumber ?? "—"}</span></div>
                                <div><span className="text-white/50">Date:</span> <span className="text-white">{ident.visit.visitDate ? new Date(ident.visit.visitDate).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span></div>
                            </div>

                            {/* Medications */}
                            <div>
                                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">Medications</p>
                                {medications.length === 0 ? (
                                    <p className="text-white/40 text-sm">No medications recorded.</p>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-white/50 text-xs border-b border-white/10">
                                                <th className="text-left pb-1.5 pr-4">Medication</th>
                                                <th className="text-left pb-1.5 pr-4">Dose</th>
                                                <th className="text-left pb-1.5 pr-4">Frequency</th>
                                                <th className="text-left pb-1.5">Duration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {medications.map((m, i) => (
                                                <tr key={i} className="border-b border-white/5">
                                                    <td className="py-1.5 pr-4 text-white">{m.name}</td>
                                                    <td className="py-1.5 pr-4 text-white/80">{m.dose ?? "—"}</td>
                                                    <td className="py-1.5 pr-4 text-white/80">{m.frequency ?? "—"}</td>
                                                    <td className="py-1.5 text-white/80">{m.duration ?? "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Doctor signature */}
                            <div className="border-t border-white/10 pt-4 text-sm">
                                <p className="text-white/50 text-xs">Prescribed by</p>
                                <p className="text-white font-medium">{ident.doctor.fullName}</p>
                                <p className="text-white/50 text-xs mt-0.5">MMC: {ident.doctor.mmcNumber} · {ident.doctor.specialty}</p>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer with download button */}
                <div className="sticky bottom-0 bg-[#0f1117] border-t border-white/10 px-6 py-4 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleDownload}
                        className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
                    >
                        Download as PDF
                    </button>
                </div>
            </div>
        </div>
    );
}
```

Adapt the CSS classes to match the aurora-glass theme already used in the portal. Read `frontend/app/portal/visits/[visitId]/page.tsx` and nearby components to match existing color classes exactly.

- [ ] **Step NEW.3: Add "View e-prescription" button + wire modal in portal visit page**

In `frontend/app/portal/visits/[visitId]/page.tsx`:

1. Add at the top: `import EPrescriptionModal from "@/components/EPrescriptionModal";`
2. Add state: `const [showRx, setShowRx] = useState(false);`
3. Find the section that renders medication or post-visit summary — add a "View e-prescription" button near the medications section (or at the top of the visit detail, whichever fits the layout best):

```tsx
<button
    onClick={() => setShowRx(true)}
    className="px-4 py-2 rounded-lg text-sm bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition"
>
    View e-prescription
</button>
```

4. At the bottom of the JSX (before the closing fragment/div), add:

```tsx
{showRx && (
    <EPrescriptionModal
        visitId={visitId}
        medications={/* pass the medications array from existing page state */}
        onClose={() => setShowRx(false)}
    />
)}
```

The `medications` prop comes from whatever data the portal visit page already loads (check what field names are used). Adapt field names (`name`, `dose`, `frequency`, `duration`) to match what the existing data provides.

- [ ] **Step NEW.4: Typecheck**

```bash
cd frontend && npm run typecheck
```

Fix any type errors.

- [ ] **Step NEW.5: Commit**

```bash
git add "frontend/components/EPrescriptionModal.tsx" \
        "frontend/app/portal/visits/[visitId]/page.tsx"
git commit -m "feat(portal): e-prescription view modal with Download as PDF (display-only)"
```

- [ ] **Step NEW.6: Playwright E2E**

With Docker stack running:
1. Navigate to `http://localhost/login`
2. Log in as patient (`patient@demo.local` / `password`)
3. Navigate to the patient portal previous consultations list
4. Click on a finalized visit
5. Verify "View e-prescription" button is visible
6. Click it — verify modal opens with clinic letterhead, patient demographics, medications
7. Verify clinic name matches what the doctor sees in Report Preview
8. Click "Download as PDF" — verify a toast/alert appears ("coming soon"), no file download
9. Click "Close" — modal closes
10. Screenshot to `e2e-eprescription-modal.png`

---
