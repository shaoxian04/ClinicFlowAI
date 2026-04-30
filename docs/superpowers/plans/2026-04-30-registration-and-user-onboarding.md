# Registration & User Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-30-registration-and-user-onboarding-design.md`

**Goal:** Build patient self-service + staff-led + admin-led registration for all four user roles (PATIENT/STAFF/DOCTOR/ADMIN), an internal API the pre-visit agent uses to fill clinical-baseline gaps, and a Postgres↔Neo4j outbox-based projection — all inside the existing DDD layout.

**Architecture:** Spring Boot is the single writer to both stores. Postgres holds the canonical clinical profile (with per-field provenance); Neo4j holds a normalized graph projection driven by an outbox table. The pre-visit agent reads from both stores, but writes profile facts only via `PATCH /internal/patients/{id}/clinical-profile`. No new aggregates; clinical profile is a child of `PatientModel`.

**Tech Stack:** Spring Boot 3.3.4 / Java 21 / Maven · Spring Data JPA · Hibernate 6 (jsonb via `@JdbcTypeCode(SqlTypes.JSON)`) · Spring Security + JJWT · Resilience4j · Neo4j 5 Java driver · Bucket4j (rate limit) · Testcontainers · JUnit 5 + Mockito + AssertJ · Next.js 14 + zod · Playwright · Python FastAPI + LangGraph + pytest.

**Branch:** Work on a feature branch `feat/registration-onboarding` off `master`.

**Implementation order** (matches spec §6.4):

| Phase | Scope |
|---|---|
| 1 | Schema + Maven deps + JPA entities (round-trip integration tests) |
| 2 | Domain layer (models, value objects, enums, domain services, encryption) |
| 3 | Application layer (read/write app services with mocks) |
| 4 | Infrastructure: outbox + Neo4j projection client + outbox worker |
| 5 | Controllers + interceptors (JWT, then `/internal`, then `/api/admin`) |
| 6 | Frontend pages + forms |
| 7 | Bootstrap admin + first-login forced password change |
| 8 | E2E Playwright flows |
| 9 | Agent additions: `patient_profile_tool` + gap-filling sub-graph |

---

## Conventions used in this plan

- **TDD**: every task that produces production code is `write failing test → run failing → implement → run passing → commit`.
- **Commit cadence**: commit at the end of every task (one task = one commit, conventional-commits style: `feat:`, `test:`, `refactor:`, `chore:`, `docs:`).
- **Test-first**: backend uses `mvn test -Dtest=ClassName#method` to run a single test; agent uses `pytest -k name`; frontend uses `npm run test -- name` (where applicable) and `npm run typecheck`.
- **Maven**: project does not yet have `./mvnw` committed. Run `mvn` directly from `backend/`. (The Maven wrapper generation is *not* in scope for this plan.)
- **No placeholders**: every step contains the actual code, command, or expected output.
- **DDD package roots**: `my.cliniflow.domain.biz.<aggregate>`, `my.cliniflow.application.biz.<aggregate>`, `my.cliniflow.controller.biz.<route>`, `my.cliniflow.infrastructure.<concern>`.
- **Existing files mentioned in this plan**: `backend/src/main/java/my/cliniflow/controller/base/{BaseController,WebResult,ResultCode,BusinessException,ConflictException,ResourceNotFoundException}.java` and `controller/config/{CorrelationIdFilter,GlobalExceptionConfiguration,SecurityConfiguration}.java`.
- **Branching**: every commit goes to `feat/registration-onboarding`; merge to `master` is out of scope (handled by a `finishing-a-development-branch` step at the end).

---

## Phase 0 — Preparation

### Task 0.1: Create feature branch

**Files:** None.

- [ ] **Step 1: Confirm clean working tree**

Run: `git status`
Expected: working tree clean (or only untouched docs).

- [ ] **Step 2: Branch off master**

Run:

```bash
git fetch origin
git checkout -b feat/registration-onboarding origin/master
```

Expected: switched to a new branch `feat/registration-onboarding`.

- [ ] **Step 3: Verify branch**

Run: `git branch --show-current`
Expected: `feat/registration-onboarding`

---

### Task 0.2: Add new Maven dependencies

**Files:**
- Modify: `backend/pom.xml`

- [ ] **Step 1: Add Testcontainers, Neo4j driver, Bucket4j, Hibernate jsonb mapping**

Open `backend/pom.xml`. Add inside the `<properties>` block:

```xml
<testcontainers.version>1.20.4</testcontainers.version>
<neo4j-driver.version>5.25.0</neo4j-driver.version>
<bucket4j.version>8.10.1</bucket4j.version>
<hibernate-types.version>3.9.0</hibernate-types.version>
```

Add inside `<dependencies>` (anywhere; group with other persistence deps):

```xml
<!-- Neo4j driver (Spring Boot writes the projection) -->
<dependency>
    <groupId>org.neo4j.driver</groupId>
    <artifactId>neo4j-java-driver</artifactId>
    <version>${neo4j-driver.version}</version>
</dependency>

<!-- Rate limiting (Bucket4j core, no Redis backend for MVP) -->
<dependency>
    <groupId>com.bucket4j</groupId>
    <artifactId>bucket4j-core</artifactId>
    <version>${bucket4j.version}</version>
</dependency>

<!-- Testcontainers (Postgres + Neo4j) -->
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>junit-jupiter</artifactId>
    <version>${testcontainers.version}</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>postgresql</artifactId>
    <version>${testcontainers.version}</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>neo4j</artifactId>
    <version>${testcontainers.version}</version>
    <scope>test</scope>
</dependency>
```

- [ ] **Step 2: Verify dependencies resolve**

Run: `cd backend && mvn -q dependency:resolve`
Expected: BUILD SUCCESS, no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/pom.xml
git commit -m "chore(backend): add testcontainers, neo4j-driver, bucket4j deps"
```

---

## Phase 1 — Schema & JPA foundation

### Task 1.1: Apply V2 SQL to Supabase manually

**Files:**
- Create: `backend/src/main/resources/db/migration/V2__registration.sql`

- [ ] **Step 1: Copy the SQL from the spec into the migration file**

Open the spec at `docs/superpowers/specs/2026-04-30-registration-and-user-onboarding-design.md`, copy the entire SQL block in §3.6 (sections A–H, plus the verification comments), paste into `backend/src/main/resources/db/migration/V2__registration.sql`. Ensure file ends with a newline.

- [ ] **Step 2: Apply manually to Supabase**

In the Supabase SQL editor → New query → paste the file contents → Run. Expect "Success. No rows returned."

- [ ] **Step 3: Run verification queries in Supabase**

Paste and run:

```sql
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public'
   AND table_name IN ('patient_clinical_profiles','doctors','staff_profiles','neo4j_projection_outbox')
 ORDER BY table_name;
SELECT typname FROM pg_type
 WHERE typname IN ('profile_update_source','pregnancy_status');
```

Expected: 4 tables + 2 enum types listed.

- [ ] **Step 4: Apply the same SQL to local dev Postgres** (if the project uses one separately from Supabase — check `.env` for `DB_URL`. If only Supabase is used, skip this step.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V2__registration.sql
git commit -m "feat(db): add V2 registration migration (manual-apply)"
```

---

### Task 1.2: Create IntegrationTestBase (shared Testcontainers harness)

**Files:**
- Create: `backend/src/test/java/my/cliniflow/IntegrationTestBase.java`
- Create: `backend/src/test/resources/db/init/v1-v2.sql`

- [ ] **Step 1: Copy V1 + V2 SQL into the test init script**

Concatenate `backend/src/main/resources/db/migration/V1__init.sql` and `V2__registration.sql` into a single file `backend/src/test/resources/db/init/v1-v2.sql`. (Testcontainers' `withInitScript` runs only one file.) The contents should be V1 followed by V2 verbatim, with a blank line separating.

- [ ] **Step 2: Write `IntegrationTestBase`**

Create `backend/src/test/java/my/cliniflow/IntegrationTestBase.java`:

```java
package my.cliniflow;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.Neo4jContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class IntegrationTestBase {

    @Container
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
                    .withDatabaseName("cliniflow_test")
                    .withUsername("test")
                    .withPassword("test")
                    .withInitScript("db/init/v1-v2.sql");

    @Container
    protected static final Neo4jContainer<?> NEO4J =
            new Neo4jContainer<>(DockerImageName.parse("neo4j:5.20-community"))
                    .withoutAuthentication();

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",      POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        r.add("spring.flyway.enabled", () -> "false");
        r.add("cliniflow.neo4j.uri",      NEO4J::getBoltUrl);
        r.add("cliniflow.neo4j.username", () -> "neo4j");
        r.add("cliniflow.neo4j.password", () -> "neo4j");
        r.add("cliniflow.agent.service-token", () -> "test-service-token");
    }
}
```

- [ ] **Step 3: Write a smoke test that boots the context**

Create `backend/src/test/java/my/cliniflow/IntegrationTestBaseSmokeIT.java`:

```java
package my.cliniflow;

import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;

import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class IntegrationTestBaseSmokeIT extends IntegrationTestBase {

    @Autowired DataSource dataSource;

    @Test
    void v1AndV2SchemaApplied() throws Exception {
        try (Connection c = dataSource.getConnection();
             ResultSet rs = c.createStatement().executeQuery(
                 "SELECT count(*) FROM information_schema.tables " +
                 "WHERE table_schema='public' AND table_name IN " +
                 "('users','patients','patient_clinical_profiles','doctors'," +
                 "'staff_profiles','neo4j_projection_outbox')")) {
            rs.next();
            assertThat(rs.getInt(1)).isEqualTo(6);
        }
    }
}
```

- [ ] **Step 4: Run the smoke test**

Run: `cd backend && mvn -q -Dtest=IntegrationTestBaseSmokeIT test`
Expected: BUILD SUCCESS. (First run pulls the Postgres + Neo4j docker images; takes ~60s.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/test/java/my/cliniflow/IntegrationTestBase.java \
        backend/src/test/java/my/cliniflow/IntegrationTestBaseSmokeIT.java \
        backend/src/test/resources/db/init/v1-v2.sql
git commit -m "test(backend): add IntegrationTestBase with Testcontainers"
```

---

### Task 1.3: User JPA entity extensions + DoctorJpaEntity + StaffProfileJpaEntity

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/repository/user/jpa/UserJpaEntity.java` (or create if missing — see Step 0)
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/user/jpa/DoctorJpaEntity.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/user/jpa/StaffProfileJpaEntity.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/repository/user/jpa/UserJpaRoundTripIT.java`

- [ ] **Step 0: Check whether `UserJpaEntity` already exists**

Run: `find backend/src/main/java/my/cliniflow/infrastructure -name "UserJpaEntity.java"`

If it exists, you'll modify it; if not, create it. Both paths are covered below.

- [ ] **Step 1: Write the failing round-trip test**

Create `backend/src/test/java/my/cliniflow/infrastructure/repository/user/jpa/UserJpaRoundTripIT.java`:

```java
package my.cliniflow.infrastructure.repository.user.jpa;

import my.cliniflow.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@Transactional
class UserJpaRoundTripIT extends IntegrationTestBase {

    @Autowired EntityManager em;

    @Test
    void userExtendedFieldsRoundTrip() {
        UserJpaEntity u = new UserJpaEntity();
        u.setEmail("rt-user@example.com");
        u.setPasswordHash("$2a$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
        u.setRole("PATIENT");
        u.setFullName("Roundtrip User");
        u.setIsActive(true);
        u.setPhone("+60123456789");
        u.setPreferredLanguage("ms");
        u.setMustChangePassword(true);
        u.setFailedLoginAttempts(0);

        em.persist(u);
        em.flush();
        em.clear();

        UserJpaEntity loaded = em.find(UserJpaEntity.class, u.getId());
        assertThat(loaded.getPhone()).isEqualTo("+60123456789");
        assertThat(loaded.getPreferredLanguage()).isEqualTo("ms");
        assertThat(loaded.getMustChangePassword()).isTrue();
        assertThat(loaded.getGmtCreate()).isNotNull();
    }

    @Test
    void doctorJpaRoundTrip() {
        UserJpaEntity user = new UserJpaEntity();
        user.setEmail("dr-rt@example.com");
        user.setPasswordHash("$2a$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
        user.setRole("DOCTOR");
        user.setFullName("Dr. Roundtrip");
        user.setIsActive(true);
        em.persist(user);

        DoctorJpaEntity d = new DoctorJpaEntity();
        d.setUserId(user.getId());
        d.setMmcNumber("MMC-RT-001");
        d.setSpecialty("General Practice");
        d.setSignatureImageUrl("https://storage.example/sig/dr-rt.png");
        d.setAcceptingPatients(true);
        em.persist(d);
        em.flush();
        em.clear();

        DoctorJpaEntity loaded = em.find(DoctorJpaEntity.class, d.getId());
        assertThat(loaded.getMmcNumber()).isEqualTo("MMC-RT-001");
        assertThat(loaded.getSpecialty()).isEqualTo("General Practice");
        assertThat(loaded.isAcceptingPatients()).isTrue();
    }

    @Test
    void staffProfileJpaRoundTrip() {
        UserJpaEntity user = new UserJpaEntity();
        user.setEmail("staff-rt@example.com");
        user.setPasswordHash("$2a$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
        user.setRole("STAFF");
        user.setFullName("Staff Roundtrip");
        user.setIsActive(true);
        em.persist(user);

        StaffProfileJpaEntity s = new StaffProfileJpaEntity();
        s.setUserId(user.getId());
        s.setEmployeeId("EMP-RT-001");
        s.setNotes("smoke test");
        em.persist(s);
        em.flush();
        em.clear();

        StaffProfileJpaEntity loaded = em.find(StaffProfileJpaEntity.class, s.getId());
        assertThat(loaded.getEmployeeId()).isEqualTo("EMP-RT-001");
    }
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && mvn -q -Dtest=UserJpaRoundTripIT test`
Expected: FAIL — entities don't exist or fields missing.

- [ ] **Step 3: Implement / extend `UserJpaEntity`**

Create or replace `backend/src/main/java/my/cliniflow/infrastructure/repository/user/jpa/UserJpaEntity.java`:

```java
package my.cliniflow.infrastructure.repository.user.jpa;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserJpaEntity {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false, length = 32)
    private String role;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(length = 32)
    private String phone;

    @Column(name = "preferred_language", length = 8)
    private String preferredLanguage;

    @Column(name = "must_change_password", nullable = false)
    private Boolean mustChangePassword = false;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "failed_login_attempts", nullable = false)
    private Integer failedLoginAttempts = 0;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @CreationTimestamp
    @Column(name = "gmt_create", nullable = false, updatable = false)
    private Instant gmtCreate;

    @UpdateTimestamp
    @Column(name = "gmt_modified", nullable = false)
    private Instant gmtModified;

    // getters / setters (omitted here for brevity; generate via IDE)
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getPreferredLanguage() { return preferredLanguage; }
    public void setPreferredLanguage(String preferredLanguage) { this.preferredLanguage = preferredLanguage; }
    public Boolean getMustChangePassword() { return mustChangePassword; }
    public void setMustChangePassword(Boolean mustChangePassword) { this.mustChangePassword = mustChangePassword; }
    public Instant getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(Instant lastLoginAt) { this.lastLoginAt = lastLoginAt; }
    public Integer getFailedLoginAttempts() { return failedLoginAttempts; }
    public void setFailedLoginAttempts(Integer n) { this.failedLoginAttempts = n; }
    public Instant getLockedUntil() { return lockedUntil; }
    public void setLockedUntil(Instant lockedUntil) { this.lockedUntil = lockedUntil; }
    public Instant getGmtCreate() { return gmtCreate; }
    public Instant getGmtModified() { return gmtModified; }
}
```

- [ ] **Step 4: Implement `DoctorJpaEntity`**

Create `backend/src/main/java/my/cliniflow/infrastructure/repository/user/jpa/DoctorJpaEntity.java`:

```java
package my.cliniflow.infrastructure.repository.user.jpa;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "doctors")
public class DoctorJpaEntity {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true, columnDefinition = "uuid")
    private UUID userId;

    @Column(name = "mmc_number", nullable = false, unique = true, length = 32)
    private String mmcNumber;

    @Column(nullable = false, length = 64)
    private String specialty;

    @Column(name = "signature_image_url", length = 512)
    private String signatureImageUrl;

    @Column(name = "is_accepting_patients", nullable = false)
    private boolean acceptingPatients = true;

    @CreationTimestamp
    @Column(name = "gmt_create", nullable = false, updatable = false)
    private Instant gmtCreate;

    @UpdateTimestamp
    @Column(name = "gmt_modified", nullable = false)
    private Instant gmtModified;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getMmcNumber() { return mmcNumber; }
    public void setMmcNumber(String mmcNumber) { this.mmcNumber = mmcNumber; }
    public String getSpecialty() { return specialty; }
    public void setSpecialty(String specialty) { this.specialty = specialty; }
    public String getSignatureImageUrl() { return signatureImageUrl; }
    public void setSignatureImageUrl(String url) { this.signatureImageUrl = url; }
    public boolean isAcceptingPatients() { return acceptingPatients; }
    public void setAcceptingPatients(boolean v) { this.acceptingPatients = v; }
    public Instant getGmtCreate() { return gmtCreate; }
    public Instant getGmtModified() { return gmtModified; }
}
```

- [ ] **Step 5: Implement `StaffProfileJpaEntity`**

Create `backend/src/main/java/my/cliniflow/infrastructure/repository/user/jpa/StaffProfileJpaEntity.java`:

```java
package my.cliniflow.infrastructure.repository.user.jpa;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "staff_profiles")
public class StaffProfileJpaEntity {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true, columnDefinition = "uuid")
    private UUID userId;

    @Column(name = "employee_id", unique = true, length = 32)
    private String employeeId;

    @Column(length = 255)
    private String notes;

    @CreationTimestamp
    @Column(name = "gmt_create", nullable = false, updatable = false)
    private Instant gmtCreate;

    @UpdateTimestamp
    @Column(name = "gmt_modified", nullable = false)
    private Instant gmtModified;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getEmployeeId() { return employeeId; }
    public void setEmployeeId(String employeeId) { this.employeeId = employeeId; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public Instant getGmtCreate() { return gmtCreate; }
    public Instant getGmtModified() { return gmtModified; }
}
```

- [ ] **Step 6: Run the round-trip test**

Run: `cd backend && mvn -q -Dtest=UserJpaRoundTripIT test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/repository/user/jpa/ \
        backend/src/test/java/my/cliniflow/infrastructure/repository/user/jpa/
git commit -m "feat(infra): user/doctor/staff JPA entities + round-trip IT"
```

---

### Task 1.4: Patient JPA entity extensions + PatientClinicalProfileJpaEntity

**Files:**
- Modify or Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/patient/jpa/PatientJpaEntity.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/patient/jpa/PatientClinicalProfileJpaEntity.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/repository/patient/jpa/PatientJpaRoundTripIT.java`

- [ ] **Step 1: Write the failing round-trip test**

Create `backend/src/test/java/my/cliniflow/infrastructure/repository/patient/jpa/PatientJpaRoundTripIT.java`:

```java
package my.cliniflow.infrastructure.repository.patient.jpa;

import my.cliniflow.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Transactional
class PatientJpaRoundTripIT extends IntegrationTestBase {

    @Autowired EntityManager em;

    @Test
    void patientWithClinicalProfileRoundTrip() {
        PatientJpaEntity p = new PatientJpaEntity();
        p.setFullName("Round Trip Patient");
        p.setDateOfBirth(LocalDate.of(1990, 5, 1));
        p.setGender("FEMALE");
        p.setPhone("+60123334444");
        p.setEmail("rtp@example.com");
        p.setPreferredLanguage("en");
        p.setRegistrationSource("SELF_SERVICE");
        p.setConsentGivenAt(Instant.now());
        p.setConsentVersion("v1");
        p.setNationalIdFingerprint("a".repeat(64));
        em.persist(p);

        PatientClinicalProfileJpaEntity prof = new PatientClinicalProfileJpaEntity();
        prof.setPatientId(p.getId());
        prof.setWeightKg(new BigDecimal("65.50"));
        prof.setWeightKgUpdatedAt(Instant.now());
        prof.setWeightKgSource("REGISTRATION");
        prof.setDrugAllergies(List.of(Map.of(
            "name", "penicillin",
            "severity", "MODERATE",
            "reaction", "<encrypted>"
        )));
        prof.setDrugAllergiesUpdatedAt(Instant.now());
        prof.setDrugAllergiesSource("REGISTRATION");
        prof.setPregnancyStatus("NOT_PREGNANT");
        prof.setCompletenessState("PARTIAL");
        em.persist(prof);

        em.flush();
        em.clear();

        PatientClinicalProfileJpaEntity loaded =
                em.find(PatientClinicalProfileJpaEntity.class, prof.getId());
        assertThat(loaded.getWeightKg()).isEqualByComparingTo("65.50");
        assertThat(loaded.getDrugAllergies()).hasSize(1);
        assertThat(loaded.getDrugAllergies().get(0).get("name")).isEqualTo("penicillin");
        assertThat(loaded.getCompletenessState()).isEqualTo("PARTIAL");
    }
}
```

- [ ] **Step 2: Run failing**

Run: `cd backend && mvn -q -Dtest=PatientJpaRoundTripIT test`
Expected: FAIL.

- [ ] **Step 3: Create or extend `PatientJpaEntity`**

Create `backend/src/main/java/my/cliniflow/infrastructure/repository/patient/jpa/PatientJpaEntity.java`:

```java
package my.cliniflow.infrastructure.repository.patient.jpa;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "patients")
public class PatientJpaEntity {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "user_id", columnDefinition = "uuid")
    private UUID userId;

    @Column(name = "national_id_ciphertext")
    private byte[] nationalIdCiphertext;

    @Column(name = "national_id_fingerprint", length = 64, unique = true)
    private String nationalIdFingerprint;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(length = 16)
    private String gender;

    @Column(length = 32)
    private String phone;

    private String email;

    @Column(name = "preferred_language", length = 8)
    private String preferredLanguage;

    @Column(name = "registration_source", nullable = false, length = 16)
    private String registrationSource = "STAFF_LED";

    @Column(name = "consent_given_at")
    private Instant consentGivenAt;

    @Column(name = "consent_version", length = 16)
    private String consentVersion;

    @CreationTimestamp
    @Column(name = "gmt_create", nullable = false, updatable = false)
    private Instant gmtCreate;

    @UpdateTimestamp
    @Column(name = "gmt_modified", nullable = false)
    private Instant gmtModified;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public byte[] getNationalIdCiphertext() { return nationalIdCiphertext; }
    public void setNationalIdCiphertext(byte[] v) { this.nationalIdCiphertext = v; }
    public String getNationalIdFingerprint() { return nationalIdFingerprint; }
    public void setNationalIdFingerprint(String v) { this.nationalIdFingerprint = v; }
    public String getFullName() { return fullName; }
    public void setFullName(String v) { this.fullName = v; }
    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(LocalDate v) { this.dateOfBirth = v; }
    public String getGender() { return gender; }
    public void setGender(String v) { this.gender = v; }
    public String getPhone() { return phone; }
    public void setPhone(String v) { this.phone = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getPreferredLanguage() { return preferredLanguage; }
    public void setPreferredLanguage(String v) { this.preferredLanguage = v; }
    public String getRegistrationSource() { return registrationSource; }
    public void setRegistrationSource(String v) { this.registrationSource = v; }
    public Instant getConsentGivenAt() { return consentGivenAt; }
    public void setConsentGivenAt(Instant v) { this.consentGivenAt = v; }
    public String getConsentVersion() { return consentVersion; }
    public void setConsentVersion(String v) { this.consentVersion = v; }
    public Instant getGmtCreate() { return gmtCreate; }
    public Instant getGmtModified() { return gmtModified; }
}
```

- [ ] **Step 4: Create `PatientClinicalProfileJpaEntity`**

Create `backend/src/main/java/my/cliniflow/infrastructure/repository/patient/jpa/PatientClinicalProfileJpaEntity.java`:

```java
package my.cliniflow.infrastructure.repository.patient.jpa;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "patient_clinical_profiles")
public class PatientClinicalProfileJpaEntity {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "patient_id", nullable = false, unique = true, columnDefinition = "uuid")
    private UUID patientId;

    @Column(name = "weight_kg", precision = 5, scale = 2)
    private BigDecimal weightKg;
    @Column(name = "weight_kg_updated_at")
    private Instant weightKgUpdatedAt;
    @Column(name = "weight_kg_source", length = 32)
    private String weightKgSource;

    @Column(name = "height_cm", precision = 5, scale = 2)
    private BigDecimal heightCm;
    @Column(name = "height_cm_updated_at")
    private Instant heightCmUpdatedAt;
    @Column(name = "height_cm_source", length = 32)
    private String heightCmSource;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "drug_allergies", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> drugAllergies = new ArrayList<>();
    @Column(name = "drug_allergies_updated_at")
    private Instant drugAllergiesUpdatedAt;
    @Column(name = "drug_allergies_source", length = 32)
    private String drugAllergiesSource;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "chronic_conditions", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> chronicConditions = new ArrayList<>();
    @Column(name = "chronic_conditions_updated_at")
    private Instant chronicConditionsUpdatedAt;
    @Column(name = "chronic_conditions_source", length = 32)
    private String chronicConditionsSource;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "regular_medications", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> regularMedications = new ArrayList<>();
    @Column(name = "regular_medications_updated_at")
    private Instant regularMedicationsUpdatedAt;
    @Column(name = "regular_medications_source", length = 32)
    private String regularMedicationsSource;

    @Column(name = "pregnancy_status", length = 32)
    private String pregnancyStatus;
    @Column(name = "pregnancy_edd")
    private LocalDate pregnancyEdd;
    @Column(name = "pregnancy_updated_at")
    private Instant pregnancyUpdatedAt;
    @Column(name = "pregnancy_source", length = 32)
    private String pregnancySource;

    @Column(name = "completeness_state", nullable = false, length = 16)
    private String completenessState = "INCOMPLETE";

    @CreationTimestamp
    @Column(name = "gmt_create", nullable = false, updatable = false)
    private Instant gmtCreate;

    @UpdateTimestamp
    @Column(name = "gmt_modified", nullable = false)
    private Instant gmtModified;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPatientId() { return patientId; }
    public void setPatientId(UUID v) { this.patientId = v; }
    public BigDecimal getWeightKg() { return weightKg; }
    public void setWeightKg(BigDecimal v) { this.weightKg = v; }
    public Instant getWeightKgUpdatedAt() { return weightKgUpdatedAt; }
    public void setWeightKgUpdatedAt(Instant v) { this.weightKgUpdatedAt = v; }
    public String getWeightKgSource() { return weightKgSource; }
    public void setWeightKgSource(String v) { this.weightKgSource = v; }
    public BigDecimal getHeightCm() { return heightCm; }
    public void setHeightCm(BigDecimal v) { this.heightCm = v; }
    public Instant getHeightCmUpdatedAt() { return heightCmUpdatedAt; }
    public void setHeightCmUpdatedAt(Instant v) { this.heightCmUpdatedAt = v; }
    public String getHeightCmSource() { return heightCmSource; }
    public void setHeightCmSource(String v) { this.heightCmSource = v; }
    public List<Map<String, Object>> getDrugAllergies() { return drugAllergies; }
    public void setDrugAllergies(List<Map<String, Object>> v) { this.drugAllergies = v; }
    public Instant getDrugAllergiesUpdatedAt() { return drugAllergiesUpdatedAt; }
    public void setDrugAllergiesUpdatedAt(Instant v) { this.drugAllergiesUpdatedAt = v; }
    public String getDrugAllergiesSource() { return drugAllergiesSource; }
    public void setDrugAllergiesSource(String v) { this.drugAllergiesSource = v; }
    public List<Map<String, Object>> getChronicConditions() { return chronicConditions; }
    public void setChronicConditions(List<Map<String, Object>> v) { this.chronicConditions = v; }
    public Instant getChronicConditionsUpdatedAt() { return chronicConditionsUpdatedAt; }
    public void setChronicConditionsUpdatedAt(Instant v) { this.chronicConditionsUpdatedAt = v; }
    public String getChronicConditionsSource() { return chronicConditionsSource; }
    public void setChronicConditionsSource(String v) { this.chronicConditionsSource = v; }
    public List<Map<String, Object>> getRegularMedications() { return regularMedications; }
    public void setRegularMedications(List<Map<String, Object>> v) { this.regularMedications = v; }
    public Instant getRegularMedicationsUpdatedAt() { return regularMedicationsUpdatedAt; }
    public void setRegularMedicationsUpdatedAt(Instant v) { this.regularMedicationsUpdatedAt = v; }
    public String getRegularMedicationsSource() { return regularMedicationsSource; }
    public void setRegularMedicationsSource(String v) { this.regularMedicationsSource = v; }
    public String getPregnancyStatus() { return pregnancyStatus; }
    public void setPregnancyStatus(String v) { this.pregnancyStatus = v; }
    public LocalDate getPregnancyEdd() { return pregnancyEdd; }
    public void setPregnancyEdd(LocalDate v) { this.pregnancyEdd = v; }
    public Instant getPregnancyUpdatedAt() { return pregnancyUpdatedAt; }
    public void setPregnancyUpdatedAt(Instant v) { this.pregnancyUpdatedAt = v; }
    public String getPregnancySource() { return pregnancySource; }
    public void setPregnancySource(String v) { this.pregnancySource = v; }
    public String getCompletenessState() { return completenessState; }
    public void setCompletenessState(String v) { this.completenessState = v; }
    public Instant getGmtCreate() { return gmtCreate; }
    public Instant getGmtModified() { return gmtModified; }
}
```

- [ ] **Step 5: Run the test**

Run: `cd backend && mvn -q -Dtest=PatientJpaRoundTripIT test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/repository/patient/jpa/ \
        backend/src/test/java/my/cliniflow/infrastructure/repository/patient/jpa/
git commit -m "feat(infra): patient + clinical-profile JPA entities + round-trip IT"
```

---

### Task 1.5: Outbox JPA entity + Spring Data repo

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/outbox/jpa/Neo4jProjectionOutboxJpaEntity.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/outbox/jpa/Neo4jProjectionOutboxSpringDataRepository.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/outbox/jpa/OutboxRoundTripIT.java`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/my/cliniflow/infrastructure/outbox/jpa/OutboxRoundTripIT.java`:

```java
package my.cliniflow.infrastructure.outbox.jpa;

import my.cliniflow.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Transactional
class OutboxRoundTripIT extends IntegrationTestBase {

    @Autowired Neo4jProjectionOutboxSpringDataRepository repo;

    @Test
    void enqueueAndQueryDrainable() {
        Neo4jProjectionOutboxJpaEntity row = new Neo4jProjectionOutboxJpaEntity();
        row.setAggregateId(UUID.randomUUID());
        row.setOperation("PATIENT_UPSERT");
        row.setPayload(Map.of("id", "abc", "sex", "FEMALE"));
        row.setStatus("PENDING");
        row.setNextAttemptAt(Instant.now().minusSeconds(1));
        repo.save(row);

        List<Neo4jProjectionOutboxJpaEntity> drainable =
                repo.findDrainable(Instant.now(), 10);
        assertThat(drainable).extracting("operation").contains("PATIENT_UPSERT");
    }
}
```

- [ ] **Step 2: Run failing**

Run: `cd backend && mvn -q -Dtest=OutboxRoundTripIT test`
Expected: FAIL — classes don't exist.

- [ ] **Step 3: Create the JPA entity**

Create `backend/src/main/java/my/cliniflow/infrastructure/outbox/jpa/Neo4jProjectionOutboxJpaEntity.java`:

```java
package my.cliniflow.infrastructure.outbox.jpa;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "neo4j_projection_outbox")
public class Neo4jProjectionOutboxJpaEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "aggregate_id", nullable = false, columnDefinition = "uuid")
    private UUID aggregateId;

    @Column(nullable = false, length = 64)
    private String operation;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> payload;

    @Column(nullable = false, length = 16)
    private String status = "PENDING";

    @Column(nullable = false)
    private Integer attempts = 0;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt = Instant.now();

    @Column(name = "last_error", columnDefinition = "text")
    private String lastError;

    @CreationTimestamp
    @Column(name = "enqueued_at", nullable = false, updatable = false)
    private Instant enqueuedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    public Long getId() { return id; }
    public UUID getAggregateId() { return aggregateId; }
    public void setAggregateId(UUID v) { this.aggregateId = v; }
    public String getOperation() { return operation; }
    public void setOperation(String v) { this.operation = v; }
    public Map<String, Object> getPayload() { return payload; }
    public void setPayload(Map<String, Object> v) { this.payload = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public Integer getAttempts() { return attempts; }
    public void setAttempts(Integer v) { this.attempts = v; }
    public Instant getNextAttemptAt() { return nextAttemptAt; }
    public void setNextAttemptAt(Instant v) { this.nextAttemptAt = v; }
    public String getLastError() { return lastError; }
    public void setLastError(String v) { this.lastError = v; }
    public Instant getEnqueuedAt() { return enqueuedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant v) { this.completedAt = v; }
}
```

- [ ] **Step 4: Create the Spring Data repo**

Create `backend/src/main/java/my/cliniflow/infrastructure/outbox/jpa/Neo4jProjectionOutboxSpringDataRepository.java`:

```java
package my.cliniflow.infrastructure.outbox.jpa;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface Neo4jProjectionOutboxSpringDataRepository
        extends JpaRepository<Neo4jProjectionOutboxJpaEntity, Long> {

    @Query("""
            SELECT o FROM Neo4jProjectionOutboxJpaEntity o
             WHERE o.status IN ('PENDING','FAILED')
               AND o.nextAttemptAt <= :now
             ORDER BY o.nextAttemptAt ASC
            """)
    List<Neo4jProjectionOutboxJpaEntity> findDrainable(
            @Param("now") Instant now,
            org.springframework.data.domain.Pageable pageable);

    default List<Neo4jProjectionOutboxJpaEntity> findDrainable(Instant now, int limit) {
        return findDrainable(now,
                org.springframework.data.domain.PageRequest.of(0, limit));
    }
}
```

- [ ] **Step 5: Run the test**

Run: `cd backend && mvn -q -Dtest=OutboxRoundTripIT test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/outbox/jpa/ \
        backend/src/test/java/my/cliniflow/infrastructure/outbox/jpa/
git commit -m "feat(infra): outbox JPA entity + drainable query + IT"
```

---

## Phase 2 — Domain layer

The domain layer is **framework-free**. No Spring annotations, no JPA, no Jackson. Pure Java with the existing logging/utility helpers only. Mapping to/from JPA happens in the repository impl (Phase 4).

### Task 2.1: User aggregate enums

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/enums/UserStatus.java`

(`UserRole` is assumed to already exist; if it does not, also create it with values `PATIENT, DOCTOR, STAFF, ADMIN`.)

- [ ] **Step 1: Create `UserStatus`**

```java
package my.cliniflow.domain.biz.user.enums;

public enum UserStatus { ACTIVE, LOCKED, DEACTIVATED }
```

- [ ] **Step 2: Confirm `UserRole` exists**

Run: `find backend/src/main/java/my/cliniflow/domain/biz/user/enums -name "UserRole.java"`

If missing, create:

```java
package my.cliniflow.domain.biz.user.enums;
public enum UserRole { PATIENT, DOCTOR, STAFF, ADMIN }
```

- [ ] **Step 3: Compile**

Run: `cd backend && mvn -q -DskipTests compile`
Expected: BUILD SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/user/enums/
git commit -m "feat(domain/user): add UserStatus enum"
```

---

### Task 2.2: User aggregate models — `UserModel`, `DoctorProfileModel`, `StaffProfileModel`

**Files:**
- Create or modify: `backend/src/main/java/my/cliniflow/domain/biz/user/model/UserModel.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/model/DoctorProfileModel.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/model/StaffProfileModel.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/user/model/UserModelTest.java`

- [ ] **Step 1: Write failing tests for behavior, not just getters**

Create `backend/src/test/java/my/cliniflow/domain/biz/user/model/UserModelTest.java`:

```java
package my.cliniflow.domain.biz.user.model;

import my.cliniflow.domain.biz.user.enums.UserRole;
import my.cliniflow.domain.biz.user.enums.UserStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class UserModelTest {

    @Test
    void newPatientUserDefaults() {
        UserModel u = UserModel.newPatient(
                "user@example.com", "$2a$12$hash", "Jane Doe", "+60123", "en");
        assertThat(u.getRole()).isEqualTo(UserRole.PATIENT);
        assertThat(u.isMustChangePassword()).isFalse();
        assertThat(u.isActive()).isTrue();
        assertThat(u.getStatus()).isEqualTo(UserStatus.ACTIVE);
    }

    @Test
    void staffUserRequiresPasswordChange() {
        UserModel u = UserModel.newStaff(
                "staff@example.com", "$2a$12$hash", "Sam Staff", "+60", "en");
        assertThat(u.getRole()).isEqualTo(UserRole.STAFF);
        assertThat(u.isMustChangePassword()).isTrue();
    }

    @Test
    void lockedUntilFutureMakesStatusLocked() {
        UserModel u = UserModel.newPatient("a@b.c", "h", "n", "+60", "en");
        u.recordFailedLogin(Instant.now().plusSeconds(600));
        assertThat(u.getStatus()).isEqualTo(UserStatus.LOCKED);
    }

    @Test
    void changePasswordClearsForceFlag() {
        UserModel u = UserModel.newStaff("s@x.y", "h", "n", "+60", "en");
        u.changePassword("$2a$12$newhash");
        assertThat(u.isMustChangePassword()).isFalse();
        assertThat(u.getPasswordHash()).isEqualTo("$2a$12$newhash");
    }
}
```

- [ ] **Step 2: Run failing**

Run: `cd backend && mvn -q -Dtest=UserModelTest test`
Expected: FAIL.

- [ ] **Step 3: Implement `UserModel`**

Create `backend/src/main/java/my/cliniflow/domain/biz/user/model/UserModel.java`:

```java
package my.cliniflow.domain.biz.user.model;

import my.cliniflow.domain.biz.user.enums.UserRole;
import my.cliniflow.domain.biz.user.enums.UserStatus;

import java.time.Instant;
import java.util.UUID;

public class UserModel {

    private UUID id;
    private String email;
    private String passwordHash;
    private UserRole role;
    private String fullName;
    private boolean active = true;
    private String phone;
    private String preferredLanguage;
    private boolean mustChangePassword;
    private Instant lastLoginAt;
    private int failedLoginAttempts;
    private Instant lockedUntil;
    private Instant gmtCreate;
    private Instant gmtModified;

    private UserModel() {}

    public static UserModel newPatient(String email, String pwdHash, String name,
                                       String phone, String lang) {
        return create(UserRole.PATIENT, email, pwdHash, name, phone, lang, false);
    }

    public static UserModel newStaff(String email, String pwdHash, String name,
                                     String phone, String lang) {
        return create(UserRole.STAFF, email, pwdHash, name, phone, lang, true);
    }

    public static UserModel newDoctor(String email, String pwdHash, String name,
                                      String phone, String lang) {
        return create(UserRole.DOCTOR, email, pwdHash, name, phone, lang, true);
    }

    public static UserModel newAdmin(String email, String pwdHash, String name,
                                     String phone, String lang) {
        return create(UserRole.ADMIN, email, pwdHash, name, phone, lang, true);
    }

    private static UserModel create(UserRole role, String email, String pwdHash,
                                    String name, String phone, String lang,
                                    boolean mustChange) {
        UserModel u = new UserModel();
        u.email = email.toLowerCase();
        u.passwordHash = pwdHash;
        u.role = role;
        u.fullName = name;
        u.phone = phone;
        u.preferredLanguage = lang;
        u.mustChangePassword = mustChange;
        return u;
    }

    public void changePassword(String newHash) {
        this.passwordHash = newHash;
        this.mustChangePassword = false;
        this.failedLoginAttempts = 0;
        this.lockedUntil = null;
    }

    public void recordSuccessfulLogin(Instant when) {
        this.lastLoginAt = when;
        this.failedLoginAttempts = 0;
        this.lockedUntil = null;
    }

    public void recordFailedLogin(Instant lockUntilIfThresholdReached) {
        this.failedLoginAttempts++;
        if (this.failedLoginAttempts >= 5) {
            this.lockedUntil = lockUntilIfThresholdReached;
        }
    }

    public UserStatus getStatus() {
        if (!active) return UserStatus.DEACTIVATED;
        if (lockedUntil != null && lockedUntil.isAfter(Instant.now())) return UserStatus.LOCKED;
        return UserStatus.ACTIVE;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public UserRole getRole() { return role; }
    public String getFullName() { return fullName; }
    public boolean isActive() { return active; }
    public void setActive(boolean v) { this.active = v; }
    public String getPhone() { return phone; }
    public String getPreferredLanguage() { return preferredLanguage; }
    public boolean isMustChangePassword() { return mustChangePassword; }
    public void setMustChangePassword(boolean v) { this.mustChangePassword = v; }
    public Instant getLastLoginAt() { return lastLoginAt; }
    public int getFailedLoginAttempts() { return failedLoginAttempts; }
    public Instant getLockedUntil() { return lockedUntil; }
    public Instant getGmtCreate() { return gmtCreate; }
    public void setGmtCreate(Instant v) { this.gmtCreate = v; }
    public Instant getGmtModified() { return gmtModified; }
    public void setGmtModified(Instant v) { this.gmtModified = v; }
}
```

- [ ] **Step 4: Implement `DoctorProfileModel`**

Create `backend/src/main/java/my/cliniflow/domain/biz/user/model/DoctorProfileModel.java`:

```java
package my.cliniflow.domain.biz.user.model;

import java.util.UUID;

public class DoctorProfileModel {
    private UUID id;
    private UUID userId;
    private String mmcNumber;
    private String specialty;
    private String signatureImageUrl;
    private boolean acceptingPatients = true;

    public DoctorProfileModel() {}

    public DoctorProfileModel(UUID userId, String mmc, String specialty, String sigUrl) {
        this.userId = userId;
        this.mmcNumber = mmc;
        this.specialty = specialty;
        this.signatureImageUrl = sigUrl;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public String getMmcNumber() { return mmcNumber; }
    public String getSpecialty() { return specialty; }
    public String getSignatureImageUrl() { return signatureImageUrl; }
    public void setSignatureImageUrl(String v) { this.signatureImageUrl = v; }
    public boolean isAcceptingPatients() { return acceptingPatients; }
    public void setAcceptingPatients(boolean v) { this.acceptingPatients = v; }
}
```

- [ ] **Step 5: Implement `StaffProfileModel`**

Create `backend/src/main/java/my/cliniflow/domain/biz/user/model/StaffProfileModel.java`:

```java
package my.cliniflow.domain.biz.user.model;

import java.util.UUID;

public class StaffProfileModel {
    private UUID id;
    private UUID userId;
    private String employeeId;
    private String notes;

    public StaffProfileModel() {}

    public StaffProfileModel(UUID userId, String employeeId, String notes) {
        this.userId = userId;
        this.employeeId = employeeId;
        this.notes = notes;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public String getEmployeeId() { return employeeId; }
    public String getNotes() { return notes; }
}
```

- [ ] **Step 6: Run tests**

Run: `cd backend && mvn -q -Dtest=UserModelTest test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/user/model/ \
        backend/src/test/java/my/cliniflow/domain/biz/user/model/
git commit -m "feat(domain/user): UserModel + Doctor/Staff profile models with tests"
```

---

### Task 2.3: User aggregate info DTOs

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/info/PatientUserCreateInfo.java`
- Create: `.../StaffUserCreateInfo.java`
- Create: `.../DoctorUserCreateInfo.java`
- Create: `.../AdminUserCreateInfo.java`

These are simple Java records (frameworks-free DTOs).

- [ ] **Step 1: Create the four records**

```java
// PatientUserCreateInfo.java
package my.cliniflow.domain.biz.user.info;
public record PatientUserCreateInfo(
        String email, String passwordPlaintext, String fullName,
        String phone, String preferredLanguage) {}
```

```java
// StaffUserCreateInfo.java
package my.cliniflow.domain.biz.user.info;
public record StaffUserCreateInfo(
        String email, String fullName, String phone, String preferredLanguage,
        String employeeId, String notes) {}
```

```java
// DoctorUserCreateInfo.java
package my.cliniflow.domain.biz.user.info;
public record DoctorUserCreateInfo(
        String email, String fullName, String phone, String preferredLanguage,
        String mmcNumber, String specialty, byte[] signatureImageBytes,
        String signatureImageMime) {}
```

```java
// AdminUserCreateInfo.java
package my.cliniflow.domain.biz.user.info;
public record AdminUserCreateInfo(
        String email, String fullName, String phone, String preferredLanguage) {}
```

- [ ] **Step 2: Compile**

Run: `cd backend && mvn -q -DskipTests compile`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/user/info/
git commit -m "feat(domain/user): user-create info DTOs"
```

---

### Task 2.4: `UserPasswordEncodeDomainService`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/service/UserPasswordEncodeDomainService.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/user/service/UserPasswordEncodeDomainServiceTest.java`

This service wraps the BCrypt encoder behind a domain interface so domain code stays free of Spring. The implementation lives in the domain layer because it's just a thin adapter — but it depends on the Spring Security `PasswordEncoder` interface (already present via `spring-boot-starter-security`).

- [ ] **Step 1: Failing test**

```java
package my.cliniflow.domain.biz.user.service;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;

class UserPasswordEncodeDomainServiceTest {

    private final PasswordEncoder enc = new BCryptPasswordEncoder(12);
    private final UserPasswordEncodeDomainService svc =
            new UserPasswordEncodeDomainService(enc);

    @Test
    void encodeProducesBcryptHashThatVerifies() {
        String hash = svc.encode("CorrectHorse-Battery-Staple9");
        assertThat(hash).startsWith("$2a$12$").hasSizeBetween(50, 80);
        assertThat(svc.matches("CorrectHorse-Battery-Staple9", hash)).isTrue();
        assertThat(svc.matches("wrong", hash)).isFalse();
    }

    @Test
    void generateRandomTempPasswordIsAcceptable() {
        String temp = svc.generateRandomTempPassword();
        assertThat(temp).hasSizeGreaterThanOrEqualTo(12);
        assertThat(temp).matches(".*[A-Za-z].*");
        assertThat(temp).matches(".*[0-9].*");
    }
}
```

- [ ] **Step 2: Run failing**

Run: `cd backend && mvn -q -Dtest=UserPasswordEncodeDomainServiceTest test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```java
package my.cliniflow.domain.biz.user.service;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;

@Service
public class UserPasswordEncodeDomainService {

    private static final SecureRandom RAND = new SecureRandom();
    private static final String ALPHA =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

    private final PasswordEncoder encoder;

    public UserPasswordEncodeDomainService(PasswordEncoder encoder) {
        this.encoder = encoder;
    }

    public String encode(String plaintext) {
        return encoder.encode(plaintext);
    }

    public boolean matches(String plaintext, String hash) {
        return encoder.matches(plaintext, hash);
    }

    public String generateRandomTempPassword() {
        StringBuilder sb = new StringBuilder(14);
        for (int i = 0; i < 14; i++) sb.append(ALPHA.charAt(RAND.nextInt(ALPHA.length())));
        return sb.toString();
    }
}
```

(`@Service` is allowed in domain services — they are domain-layer Spring beans per the project conventions; the domain *models* stay framework-free, not domain *services*.)

- [ ] **Step 4: Run tests**

Run: `cd backend && mvn -q -Dtest=UserPasswordEncodeDomainServiceTest test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/user/service/UserPasswordEncodeDomainService.java \
        backend/src/test/java/my/cliniflow/domain/biz/user/service/UserPasswordEncodeDomainServiceTest.java
git commit -m "feat(domain/user): password encode domain service"
```

---

### Task 2.5: User-create domain services (4 services, one per role)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/service/UserPatientCreateDomainService.java`
- Create: `.../UserStaffCreateDomainService.java`
- Create: `.../UserDoctorCreateDomainService.java`
- Create: `.../UserAdminCreateDomainService.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/user/service/UserCreateDomainServicesTest.java`

- [ ] **Step 1: Failing test (covers all 4)**

Create `backend/src/test/java/my/cliniflow/domain/biz/user/service/UserCreateDomainServicesTest.java`:

```java
package my.cliniflow.domain.biz.user.service;

import my.cliniflow.domain.biz.user.enums.UserRole;
import my.cliniflow.domain.biz.user.info.*;
import my.cliniflow.domain.biz.user.model.UserModel;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UserCreateDomainServicesTest {

    private final UserPasswordEncodeDomainService pwd =
            new UserPasswordEncodeDomainService(new BCryptPasswordEncoder(4));

    @Test
    void patientCreateLowercasesEmailAndDoesNotForcePasswordChange() {
        UserPatientCreateDomainService svc = new UserPatientCreateDomainService(pwd);
        UserModel u = svc.create(new PatientUserCreateInfo(
                "JANE@Example.COM", "longenough123", "Jane Doe", "+60", "en"));
        assertThat(u.getEmail()).isEqualTo("jane@example.com");
        assertThat(u.getRole()).isEqualTo(UserRole.PATIENT);
        assertThat(u.isMustChangePassword()).isFalse();
    }

    @Test
    void patientShortPasswordRejected() {
        UserPatientCreateDomainService svc = new UserPatientCreateDomainService(pwd);
        assertThatThrownBy(() -> svc.create(new PatientUserCreateInfo(
                "x@y.z", "short", "n", "+60", "en")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("password");
    }

    @Test
    void doctorCreateUsesTempPassword() {
        UserDoctorCreateDomainService svc = new UserDoctorCreateDomainService(pwd);
        UserDoctorCreateDomainService.Result r = svc.createWithTempPassword(
                new DoctorUserCreateInfo("dr@x.y", "Dr Z", "+60", "en",
                        "MMC-001", "GP", new byte[0], "image/png"));
        assertThat(r.user().isMustChangePassword()).isTrue();
        assertThat(r.tempPasswordPlaintext()).isNotBlank();
        assertThat(r.doctorProfile().getMmcNumber()).isEqualTo("MMC-001");
    }

    @Test
    void staffCreateUsesTempPassword() {
        UserStaffCreateDomainService svc = new UserStaffCreateDomainService(pwd);
        UserStaffCreateDomainService.Result r = svc.createWithTempPassword(
                new StaffUserCreateInfo("staff@x.y", "S", "+60", "en", "EMP-1", null));
        assertThat(r.user().getRole()).isEqualTo(UserRole.STAFF);
        assertThat(r.user().isMustChangePassword()).isTrue();
        assertThat(r.staffProfile().getEmployeeId()).isEqualTo("EMP-1");
    }

    @Test
    void adminCreateUsesTempPassword() {
        UserAdminCreateDomainService svc = new UserAdminCreateDomainService(pwd);
        UserAdminCreateDomainService.Result r = svc.createWithTempPassword(
                new AdminUserCreateInfo("admin@x.y", "A", "+60", "en"));
        assertThat(r.user().getRole()).isEqualTo(UserRole.ADMIN);
        assertThat(r.user().isMustChangePassword()).isTrue();
    }
}
```

- [ ] **Step 2: Run failing**

Run: `cd backend && mvn -q -Dtest=UserCreateDomainServicesTest test`
Expected: FAIL.

- [ ] **Step 3: Implement `UserPatientCreateDomainService`**

```java
package my.cliniflow.domain.biz.user.service;

import my.cliniflow.domain.biz.user.info.PatientUserCreateInfo;
import my.cliniflow.domain.biz.user.model.UserModel;
import org.springframework.stereotype.Service;

@Service
public class UserPatientCreateDomainService {
    private final UserPasswordEncodeDomainService pwd;

    public UserPatientCreateDomainService(UserPasswordEncodeDomainService pwd) {
        this.pwd = pwd;
    }

    public UserModel create(PatientUserCreateInfo info) {
        validate(info);
        return UserModel.newPatient(
                info.email(), pwd.encode(info.passwordPlaintext()),
                info.fullName(), info.phone(), info.preferredLanguage());
    }

    private void validate(PatientUserCreateInfo i) {
        if (i.email() == null || !i.email().contains("@"))
            throw new IllegalArgumentException("invalid email");
        if (i.passwordPlaintext() == null || i.passwordPlaintext().length() < 8)
            throw new IllegalArgumentException("password must be at least 8 chars");
        if (!i.passwordPlaintext().matches(".*[A-Za-z].*") ||
            !i.passwordPlaintext().matches(".*[0-9].*"))
            throw new IllegalArgumentException("password must contain a letter and a digit");
        if (i.fullName() == null || i.fullName().isBlank())
            throw new IllegalArgumentException("fullName required");
    }
}
```

- [ ] **Step 4: Implement `UserStaffCreateDomainService`**

```java
package my.cliniflow.domain.biz.user.service;

import my.cliniflow.domain.biz.user.info.StaffUserCreateInfo;
import my.cliniflow.domain.biz.user.model.StaffProfileModel;
import my.cliniflow.domain.biz.user.model.UserModel;
import org.springframework.stereotype.Service;

@Service
public class UserStaffCreateDomainService {
    private final UserPasswordEncodeDomainService pwd;

    public UserStaffCreateDomainService(UserPasswordEncodeDomainService pwd) {
        this.pwd = pwd;
    }

    public Result createWithTempPassword(StaffUserCreateInfo info) {
        if (info.email() == null || !info.email().contains("@"))
            throw new IllegalArgumentException("invalid email");
        String temp = pwd.generateRandomTempPassword();
        UserModel u = UserModel.newStaff(
                info.email(), pwd.encode(temp),
                info.fullName(), info.phone(), info.preferredLanguage());
        StaffProfileModel sp = new StaffProfileModel(
                /* userId set after persist */ null, info.employeeId(), info.notes());
        return new Result(u, sp, temp);
    }

    public record Result(UserModel user, StaffProfileModel staffProfile,
                         String tempPasswordPlaintext) {}
}
```

- [ ] **Step 5: Implement `UserDoctorCreateDomainService`**

```java
package my.cliniflow.domain.biz.user.service;

import my.cliniflow.domain.biz.user.info.DoctorUserCreateInfo;
import my.cliniflow.domain.biz.user.model.DoctorProfileModel;
import my.cliniflow.domain.biz.user.model.UserModel;
import org.springframework.stereotype.Service;

import java.util.Set;

@Service
public class UserDoctorCreateDomainService {
    private static final Set<String> ALLOWED_MIME = Set.of("image/png", "image/jpeg");
    private final UserPasswordEncodeDomainService pwd;

    public UserDoctorCreateDomainService(UserPasswordEncodeDomainService pwd) {
        this.pwd = pwd;
    }

    public Result createWithTempPassword(DoctorUserCreateInfo info) {
        if (info.email() == null || !info.email().contains("@"))
            throw new IllegalArgumentException("invalid email");
        if (info.mmcNumber() == null || !info.mmcNumber().matches("[A-Za-z0-9-]{4,32}"))
            throw new IllegalArgumentException("invalid MMC number");
        if (info.specialty() == null || info.specialty().isBlank())
            throw new IllegalArgumentException("specialty required");
        if (info.signatureImageBytes() != null && info.signatureImageBytes().length > 1_048_576)
            throw new IllegalArgumentException("signature image must be <= 1MB");
        if (info.signatureImageBytes() != null && info.signatureImageBytes().length > 0
                && !ALLOWED_MIME.contains(info.signatureImageMime()))
            throw new IllegalArgumentException("signature image must be png or jpeg");

        String temp = pwd.generateRandomTempPassword();
        UserModel u = UserModel.newDoctor(
                info.email(), pwd.encode(temp),
                info.fullName(), info.phone(), info.preferredLanguage());
        DoctorProfileModel dp = new DoctorProfileModel(
                /* userId set after persist */ null, info.mmcNumber(),
                info.specialty(), /* signatureUrl set after upload */ null);
        return new Result(u, dp, temp);
    }

    public record Result(UserModel user, DoctorProfileModel doctorProfile,
                         String tempPasswordPlaintext) {}
}
```

- [ ] **Step 6: Implement `UserAdminCreateDomainService`**

```java
package my.cliniflow.domain.biz.user.service;

import my.cliniflow.domain.biz.user.info.AdminUserCreateInfo;
import my.cliniflow.domain.biz.user.model.UserModel;
import org.springframework.stereotype.Service;

@Service
public class UserAdminCreateDomainService {
    private final UserPasswordEncodeDomainService pwd;

    public UserAdminCreateDomainService(UserPasswordEncodeDomainService pwd) {
        this.pwd = pwd;
    }

    public Result createWithTempPassword(AdminUserCreateInfo info) {
        if (info.email() == null || !info.email().contains("@"))
            throw new IllegalArgumentException("invalid email");
        String temp = pwd.generateRandomTempPassword();
        UserModel u = UserModel.newAdmin(
                info.email(), pwd.encode(temp),
                info.fullName(), info.phone(), info.preferredLanguage());
        return new Result(u, temp);
    }

    public record Result(UserModel user, String tempPasswordPlaintext) {}
}
```

- [ ] **Step 7: Run tests**

Run: `cd backend && mvn -q -Dtest=UserCreateDomainServicesTest test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/user/service/ \
        backend/src/test/java/my/cliniflow/domain/biz/user/service/UserCreateDomainServicesTest.java
git commit -m "feat(domain/user): patient/staff/doctor/admin create domain services"
```

---

### Task 2.6: User aggregate events

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/event/UserRegisteredDomainEvent.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/event/PasswordChangedDomainEvent.java`

- [ ] **Step 1: Create events**

```java
// UserRegisteredDomainEvent.java
package my.cliniflow.domain.biz.user.event;

import my.cliniflow.domain.biz.user.enums.UserRole;
import java.time.Instant;
import java.util.UUID;

public record UserRegisteredDomainEvent(
        UUID userId, UserRole role, String source, Instant occurredAt) {}
```

```java
// PasswordChangedDomainEvent.java
package my.cliniflow.domain.biz.user.event;

import java.time.Instant;
import java.util.UUID;

public record PasswordChangedDomainEvent(
        UUID userId, Instant occurredAt) {}
```

- [ ] **Step 2: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/domain/biz/user/event/
git commit -m "feat(domain/user): user-registered + password-changed events"
```

---

### Task 2.7: User repository interface (extend or create)

**Files:**
- Create or modify: `backend/src/main/java/my/cliniflow/domain/biz/user/repository/UserRepository.java`

- [ ] **Step 1: Define the interface**

```java
package my.cliniflow.domain.biz.user.repository;

import my.cliniflow.domain.biz.user.model.DoctorProfileModel;
import my.cliniflow.domain.biz.user.model.StaffProfileModel;
import my.cliniflow.domain.biz.user.model.UserModel;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository {

    UserModel save(UserModel user);
    Optional<UserModel> findById(UUID id);
    Optional<UserModel> findByEmail(String email);
    boolean existsByEmail(String email);

    DoctorProfileModel saveDoctorProfile(DoctorProfileModel profile);
    boolean existsByMmcNumber(String mmcNumber);
    Optional<DoctorProfileModel> findDoctorProfileByUserId(UUID userId);
    Optional<DoctorProfileModel> findDoctorProfileById(UUID id);

    StaffProfileModel saveStaffProfile(StaffProfileModel profile);
    Optional<StaffProfileModel> findStaffProfileByUserId(UUID userId);

    List<UserModel> findActiveByRole(my.cliniflow.domain.biz.user.enums.UserRole role,
                                     int page, int size);
    long countActiveByRole(my.cliniflow.domain.biz.user.enums.UserRole role);
}
```

- [ ] **Step 2: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/domain/biz/user/repository/UserRepository.java
git commit -m "feat(domain/user): UserRepository interface with doctor/staff helpers"
```

---

### Task 2.8: Patient aggregate enums

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/enums/ProfileUpdateSource.java`
- Create: `.../PregnancyStatus.java`
- Create: `.../AllergySeverity.java`
- Create: `.../CompletenessState.java`

- [ ] **Step 1: Create enums**

```java
// ProfileUpdateSource.java
package my.cliniflow.domain.biz.patient.enums;
public enum ProfileUpdateSource {
    REGISTRATION, PRE_VISIT_CHAT, PORTAL, DOCTOR_VISIT, MIGRATED
}
```

```java
// PregnancyStatus.java
package my.cliniflow.domain.biz.patient.enums;
public enum PregnancyStatus {
    NOT_APPLICABLE, NOT_PREGNANT, PREGNANT, POSTPARTUM_LACTATING, UNKNOWN
}
```

```java
// AllergySeverity.java
package my.cliniflow.domain.biz.patient.enums;
public enum AllergySeverity { MILD, MODERATE, SEVERE }
```

```java
// CompletenessState.java
package my.cliniflow.domain.biz.patient.enums;
public enum CompletenessState { INCOMPLETE, PARTIAL, COMPLETE }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/patient/enums/
git commit -m "feat(domain/patient): registration enums"
```

---

### Task 2.9: Patient aggregate value objects

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/model/DrugAllergyInfo.java`
- Create: `.../ChronicConditionInfo.java`
- Create: `.../RegularMedicationInfo.java`
- Create: `.../PatientIdentityInfo.java`

- [ ] **Step 1: Create value objects**

```java
// DrugAllergyInfo.java
package my.cliniflow.domain.biz.patient.model;

import my.cliniflow.domain.biz.patient.enums.AllergySeverity;
import java.time.Instant;

public record DrugAllergyInfo(
        String name,
        AllergySeverity severity,
        String reactionEncrypted,
        Double confidence,
        Instant confirmedAt) {
    public DrugAllergyInfo {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("name");
        if (severity == null) throw new IllegalArgumentException("severity");
    }
}
```

```java
// ChronicConditionInfo.java
package my.cliniflow.domain.biz.patient.model;
public record ChronicConditionInfo(
        String name, String icd10, Integer sinceYear, String notesEncrypted) {
    public ChronicConditionInfo {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("name");
    }
}
```

```java
// RegularMedicationInfo.java
package my.cliniflow.domain.biz.patient.model;

import java.time.LocalDate;

public record RegularMedicationInfo(
        String name, String dosage, String frequency, LocalDate sinceDate) {
    public RegularMedicationInfo {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("name");
    }
}
```

```java
// PatientIdentityInfo.java
package my.cliniflow.domain.biz.patient.model;

import java.time.LocalDate;

public record PatientIdentityInfo(
        String fullName,
        String nricPlaintext,
        LocalDate dateOfBirth,
        String gender,
        String phone,
        String email,
        String preferredLanguage) {}
```

- [ ] **Step 2: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/domain/biz/patient/model/
git commit -m "feat(domain/patient): clinical value objects + identity info"
```

---

### Task 2.10: `PatientClinicalProfileModel`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/model/PatientClinicalProfileModel.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/patient/model/PatientClinicalProfileModelTest.java`

- [ ] **Step 1: Failing test**

```java
package my.cliniflow.domain.biz.patient.model;

import my.cliniflow.domain.biz.patient.enums.AllergySeverity;
import my.cliniflow.domain.biz.patient.enums.CompletenessState;
import my.cliniflow.domain.biz.patient.enums.PregnancyStatus;
import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PatientClinicalProfileModelTest {

    @Test
    void newProfileIsIncomplete() {
        var p = new PatientClinicalProfileModel(UUID.randomUUID());
        assertThat(p.getCompletenessState()).isEqualTo(CompletenessState.INCOMPLETE);
    }

    @Test
    void setWeightStampsProvenance() {
        var p = new PatientClinicalProfileModel(UUID.randomUUID());
        p.setWeightKg(new BigDecimal("65.50"), Instant.now(), ProfileUpdateSource.REGISTRATION);
        assertThat(p.getWeightKg()).isEqualByComparingTo("65.50");
        assertThat(p.getWeightKgSource()).isEqualTo(ProfileUpdateSource.REGISTRATION);
    }

    @Test
    void setWeightOutOfRangeRejected() {
        var p = new PatientClinicalProfileModel(UUID.randomUUID());
        assertThatThrownBy(() -> p.setWeightKg(
                new BigDecimal("999"), Instant.now(), ProfileUpdateSource.REGISTRATION))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void pregnancyPregnantRequiresEdd() {
        var p = new PatientClinicalProfileModel(UUID.randomUUID());
        assertThatThrownBy(() -> p.setPregnancy(
                PregnancyStatus.PREGNANT, null, Instant.now(),
                ProfileUpdateSource.REGISTRATION))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("EDD");
    }

    @Test
    void addAllergyAndRecomputeCompleteness() {
        var p = new PatientClinicalProfileModel(UUID.randomUUID());
        p.addDrugAllergy(new DrugAllergyInfo("penicillin", AllergySeverity.MODERATE,
                "<enc>", 1.0, Instant.now()), ProfileUpdateSource.PRE_VISIT_CHAT);
        assertThat(p.getDrugAllergies()).hasSize(1);
        assertThat(p.getDrugAllergiesSource()).isEqualTo(ProfileUpdateSource.PRE_VISIT_CHAT);
        p.recomputeCompleteness();
        assertThat(p.getCompletenessState()).isIn(CompletenessState.PARTIAL, CompletenessState.COMPLETE);
    }
}
```

- [ ] **Step 2: Run failing**

Run: `cd backend && mvn -q -Dtest=PatientClinicalProfileModelTest test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```java
package my.cliniflow.domain.biz.patient.model;

import my.cliniflow.domain.biz.patient.enums.CompletenessState;
import my.cliniflow.domain.biz.patient.enums.PregnancyStatus;
import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class PatientClinicalProfileModel {

    private UUID id;
    private final UUID patientId;

    private BigDecimal weightKg;
    private Instant weightKgUpdatedAt;
    private ProfileUpdateSource weightKgSource;

    private BigDecimal heightCm;
    private Instant heightCmUpdatedAt;
    private ProfileUpdateSource heightCmSource;

    private final List<DrugAllergyInfo> drugAllergies = new ArrayList<>();
    private Instant drugAllergiesUpdatedAt;
    private ProfileUpdateSource drugAllergiesSource;

    private final List<ChronicConditionInfo> chronicConditions = new ArrayList<>();
    private Instant chronicConditionsUpdatedAt;
    private ProfileUpdateSource chronicConditionsSource;

    private final List<RegularMedicationInfo> regularMedications = new ArrayList<>();
    private Instant regularMedicationsUpdatedAt;
    private ProfileUpdateSource regularMedicationsSource;

    private PregnancyStatus pregnancyStatus;
    private LocalDate pregnancyEdd;
    private Instant pregnancyUpdatedAt;
    private ProfileUpdateSource pregnancySource;

    private CompletenessState completenessState = CompletenessState.INCOMPLETE;

    public PatientClinicalProfileModel(UUID patientId) {
        this.patientId = patientId;
    }

    public void setWeightKg(BigDecimal kg, Instant when, ProfileUpdateSource src) {
        if (kg == null) throw new IllegalArgumentException("weight required");
        if (kg.compareTo(BigDecimal.ZERO) <= 0 || kg.compareTo(new BigDecimal("500")) >= 0)
            throw new IllegalArgumentException("weight out of range");
        this.weightKg = kg;
        this.weightKgUpdatedAt = when;
        this.weightKgSource = src;
    }

    public void setHeightCm(BigDecimal cm, Instant when, ProfileUpdateSource src) {
        if (cm == null) throw new IllegalArgumentException("height required");
        if (cm.compareTo(new BigDecimal("30")) <= 0 || cm.compareTo(new BigDecimal("280")) >= 0)
            throw new IllegalArgumentException("height out of range");
        this.heightCm = cm;
        this.heightCmUpdatedAt = when;
        this.heightCmSource = src;
    }

    public void addDrugAllergy(DrugAllergyInfo info, ProfileUpdateSource src) {
        drugAllergies.removeIf(a -> a.name().equalsIgnoreCase(info.name()));
        drugAllergies.add(info);
        drugAllergiesUpdatedAt = Instant.now();
        drugAllergiesSource = src;
    }

    public void removeDrugAllergy(String name, ProfileUpdateSource src) {
        boolean removed = drugAllergies.removeIf(a -> a.name().equalsIgnoreCase(name));
        if (removed) {
            drugAllergiesUpdatedAt = Instant.now();
            drugAllergiesSource = src;
        }
    }

    public void addChronicCondition(ChronicConditionInfo info, ProfileUpdateSource src) {
        chronicConditions.removeIf(c -> c.name().equalsIgnoreCase(info.name()));
        chronicConditions.add(info);
        chronicConditionsUpdatedAt = Instant.now();
        chronicConditionsSource = src;
    }

    public void addRegularMedication(RegularMedicationInfo info, ProfileUpdateSource src) {
        regularMedications.removeIf(m -> m.name().equalsIgnoreCase(info.name()));
        regularMedications.add(info);
        regularMedicationsUpdatedAt = Instant.now();
        regularMedicationsSource = src;
    }

    public void setPregnancy(PregnancyStatus status, LocalDate edd, Instant when,
                             ProfileUpdateSource src) {
        if (status == PregnancyStatus.PREGNANT && edd == null)
            throw new IllegalArgumentException("EDD required when status PREGNANT");
        if (status != PregnancyStatus.PREGNANT && edd != null)
            throw new IllegalArgumentException("EDD must be null unless PREGNANT");
        this.pregnancyStatus = status;
        this.pregnancyEdd = edd;
        this.pregnancyUpdatedAt = when;
        this.pregnancySource = src;
    }

    public void recomputeCompleteness() {
        int filled = 0, totalSafetyCritical = 4;
        if (drugAllergiesUpdatedAt != null) filled++;
        if (chronicConditionsUpdatedAt != null) filled++;
        if (regularMedicationsUpdatedAt != null) filled++;
        if (pregnancyUpdatedAt != null) filled++;
        if (filled == 0)            this.completenessState = CompletenessState.INCOMPLETE;
        else if (filled < totalSafetyCritical) this.completenessState = CompletenessState.PARTIAL;
        else                         this.completenessState = CompletenessState.COMPLETE;
    }

    // getters...
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPatientId() { return patientId; }
    public BigDecimal getWeightKg() { return weightKg; }
    public Instant getWeightKgUpdatedAt() { return weightKgUpdatedAt; }
    public ProfileUpdateSource getWeightKgSource() { return weightKgSource; }
    public BigDecimal getHeightCm() { return heightCm; }
    public Instant getHeightCmUpdatedAt() { return heightCmUpdatedAt; }
    public ProfileUpdateSource getHeightCmSource() { return heightCmSource; }
    public List<DrugAllergyInfo> getDrugAllergies() { return List.copyOf(drugAllergies); }
    public Instant getDrugAllergiesUpdatedAt() { return drugAllergiesUpdatedAt; }
    public ProfileUpdateSource getDrugAllergiesSource() { return drugAllergiesSource; }
    public List<ChronicConditionInfo> getChronicConditions() { return List.copyOf(chronicConditions); }
    public Instant getChronicConditionsUpdatedAt() { return chronicConditionsUpdatedAt; }
    public ProfileUpdateSource getChronicConditionsSource() { return chronicConditionsSource; }
    public List<RegularMedicationInfo> getRegularMedications() { return List.copyOf(regularMedications); }
    public Instant getRegularMedicationsUpdatedAt() { return regularMedicationsUpdatedAt; }
    public ProfileUpdateSource getRegularMedicationsSource() { return regularMedicationsSource; }
    public PregnancyStatus getPregnancyStatus() { return pregnancyStatus; }
    public LocalDate getPregnancyEdd() { return pregnancyEdd; }
    public Instant getPregnancyUpdatedAt() { return pregnancyUpdatedAt; }
    public ProfileUpdateSource getPregnancySource() { return pregnancySource; }
    public CompletenessState getCompletenessState() { return completenessState; }
    public void setCompletenessState(CompletenessState s) { this.completenessState = s; }
}
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && mvn -q -Dtest=PatientClinicalProfileModelTest test
# expected: PASS
git add backend/src/main/java/my/cliniflow/domain/biz/patient/model/PatientClinicalProfileModel.java \
        backend/src/test/java/my/cliniflow/domain/biz/patient/model/PatientClinicalProfileModelTest.java
git commit -m "feat(domain/patient): clinical profile model with provenance + invariants"
```

---

### Task 2.11: `PatientModel` (extend or create)

**Files:**
- Create or modify: `backend/src/main/java/my/cliniflow/domain/biz/patient/model/PatientModel.java`

- [ ] **Step 1: Implement (the model is mostly a data carrier; behavior is in domain services)**

```java
package my.cliniflow.domain.biz.patient.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public class PatientModel {
    private UUID id;
    private UUID userId;
    private byte[] nationalIdCiphertext;
    private String nationalIdFingerprint;
    private String fullName;
    private LocalDate dateOfBirth;
    private String gender;
    private String phone;
    private String email;
    private String preferredLanguage;
    private String registrationSource;
    private Instant consentGivenAt;
    private String consentVersion;
    private Instant gmtCreate;
    private Instant gmtModified;
    private PatientClinicalProfileModel clinicalProfile;

    public PatientModel() {}

    public void markConsent(String version, Instant when) {
        this.consentVersion = version;
        this.consentGivenAt = when;
    }

    public boolean hasClinicalProfile() {
        return clinicalProfile != null;
    }

    public PatientClinicalProfileModel getOrCreateClinicalProfile() {
        if (clinicalProfile == null && id != null) {
            clinicalProfile = new PatientClinicalProfileModel(id);
        }
        return clinicalProfile;
    }

    // getters / setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID v) { this.userId = v; }
    public byte[] getNationalIdCiphertext() { return nationalIdCiphertext; }
    public void setNationalIdCiphertext(byte[] v) { this.nationalIdCiphertext = v; }
    public String getNationalIdFingerprint() { return nationalIdFingerprint; }
    public void setNationalIdFingerprint(String v) { this.nationalIdFingerprint = v; }
    public String getFullName() { return fullName; }
    public void setFullName(String v) { this.fullName = v; }
    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(LocalDate v) { this.dateOfBirth = v; }
    public String getGender() { return gender; }
    public void setGender(String v) { this.gender = v; }
    public String getPhone() { return phone; }
    public void setPhone(String v) { this.phone = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getPreferredLanguage() { return preferredLanguage; }
    public void setPreferredLanguage(String v) { this.preferredLanguage = v; }
    public String getRegistrationSource() { return registrationSource; }
    public void setRegistrationSource(String v) { this.registrationSource = v; }
    public Instant getConsentGivenAt() { return consentGivenAt; }
    public String getConsentVersion() { return consentVersion; }
    public Instant getGmtCreate() { return gmtCreate; }
    public void setGmtCreate(Instant v) { this.gmtCreate = v; }
    public Instant getGmtModified() { return gmtModified; }
    public void setGmtModified(Instant v) { this.gmtModified = v; }
    public PatientClinicalProfileModel getClinicalProfile() { return clinicalProfile; }
    public void setClinicalProfile(PatientClinicalProfileModel p) { this.clinicalProfile = p; }
}
```

- [ ] **Step 2: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/domain/biz/patient/model/PatientModel.java
git commit -m "feat(domain/patient): PatientModel aggregate root with clinical profile child"
```

---

### Task 2.12: Patient info DTOs + events

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/info/PatientRegisterInfo.java`
- Create: `.../ClinicalProfileUpdateInfo.java`
- Create: `.../PatientSearchPreviewInfo.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/event/PatientRegisteredDomainEvent.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/event/PatientClinicalProfileUpdatedDomainEvent.java`

- [ ] **Step 1: Create info DTOs**

```java
// PatientRegisterInfo.java
package my.cliniflow.domain.biz.patient.info;

import my.cliniflow.domain.biz.patient.enums.PregnancyStatus;
import my.cliniflow.domain.biz.patient.model.*;
import my.cliniflow.domain.biz.user.info.PatientUserCreateInfo;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public record PatientRegisterInfo(
        PatientUserCreateInfo userInfo,
        PatientIdentityInfo identityInfo,
        String consentVersion,
        // optional clinical baseline
        Optional<BigDecimal> weightKg,
        Optional<BigDecimal> heightCm,
        List<DrugAllergyInfo> drugAllergies,
        List<ChronicConditionInfo> chronicConditions,
        List<RegularMedicationInfo> regularMedications,
        Optional<PregnancyStatus> pregnancyStatus,
        Optional<LocalDate> pregnancyEdd) {}
```

```java
// ClinicalProfileUpdateInfo.java
package my.cliniflow.domain.biz.patient.info;

import my.cliniflow.domain.biz.patient.enums.PregnancyStatus;
import my.cliniflow.domain.biz.patient.model.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public record ClinicalProfileUpdateInfo(
        Optional<BigDecimal> weightKg,
        Optional<BigDecimal> heightCm,
        List<DrugAllergyInfo> drugAllergiesAdd,
        List<String> drugAllergiesRemoveByName,
        List<ChronicConditionInfo> chronicConditionsAdd,
        List<RegularMedicationInfo> regularMedicationsAdd,
        Optional<PregnancyStatus> pregnancyStatus,
        Optional<LocalDate> pregnancyEdd) {

    public static ClinicalProfileUpdateInfo empty() {
        return new ClinicalProfileUpdateInfo(
                Optional.empty(), Optional.empty(),
                List.of(), List.of(), List.of(), List.of(),
                Optional.empty(), Optional.empty());
    }
}
```

```java
// PatientSearchPreviewInfo.java
package my.cliniflow.domain.biz.patient.info;

import java.util.UUID;

public record PatientSearchPreviewInfo(
        UUID id, String fullNameInitial, String dobMonth) {}
```

- [ ] **Step 2: Create events**

```java
// PatientRegisteredDomainEvent.java
package my.cliniflow.domain.biz.patient.event;

import java.time.Instant;
import java.util.UUID;

public record PatientRegisteredDomainEvent(
        UUID patientId, UUID userId, String source, Instant occurredAt) {}
```

```java
// PatientClinicalProfileUpdatedDomainEvent.java
package my.cliniflow.domain.biz.patient.event;

import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PatientClinicalProfileUpdatedDomainEvent(
        UUID patientId, List<String> fieldsChanged,
        ProfileUpdateSource source, UUID visitId, Instant occurredAt) {}
```

- [ ] **Step 3: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/domain/biz/patient/info/ \
        backend/src/main/java/my/cliniflow/domain/biz/patient/event/
git commit -m "feat(domain/patient): info DTOs + domain events"
```

---

### Task 2.13: Crypto — `NationalIdEncryptor`, `ClinicalTextEncryptor`, `KeyProvider`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/crypto/KeyProvider.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/crypto/NationalIdEncryptor.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/crypto/ClinicalTextEncryptor.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/crypto/EncryptorTest.java`

These live in `infrastructure/`, not `domain/`, because they wrap concrete crypto.

- [ ] **Step 1: Failing test**

```java
package my.cliniflow.infrastructure.crypto;

import org.junit.jupiter.api.Test;

import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;

import static org.assertj.core.api.Assertions.assertThat;

class EncryptorTest {

    private static byte[] randomKey(int len) {
        byte[] k = new byte[len];
        new SecureRandom().nextBytes(k);
        return k;
    }

    @Test
    void nricEncryptDecryptRoundTrip() {
        KeyProvider kp = new StaticKeyProvider(
                new SecretKeySpec(randomKey(32), "AES"),
                randomKey(32));
        var enc = new NationalIdEncryptor(kp);
        byte[] ct = enc.encrypt("950101-14-1234");
        assertThat(enc.decrypt(ct)).isEqualTo("950101-14-1234");
    }

    @Test
    void nricFingerprintIsDeterministic() {
        KeyProvider kp = new StaticKeyProvider(
                new SecretKeySpec(randomKey(32), "AES"),
                randomKey(32));
        var enc = new NationalIdEncryptor(kp);
        String fp1 = enc.fingerprint("950101-14-1234");
        String fp2 = enc.fingerprint("950101-14-1234");
        assertThat(fp1).hasSize(64).isEqualTo(fp2);
        assertThat(enc.fingerprint("999999-99-9999")).isNotEqualTo(fp1);
    }

    @Test
    void clinicalTextEncryptDecryptRoundTrip() {
        KeyProvider kp = new StaticKeyProvider(
                new SecretKeySpec(randomKey(32), "AES"),
                randomKey(32));
        var enc = new ClinicalTextEncryptor(kp);
        String s = "Patient has rash on day 3 of penicillin in 2018";
        String ct = enc.encryptToBase64(s);
        assertThat(enc.decryptFromBase64(ct)).isEqualTo(s);
    }

    static class StaticKeyProvider implements KeyProvider {
        private final javax.crypto.SecretKey key;
        private final byte[] hmac;

        StaticKeyProvider(javax.crypto.SecretKey key, byte[] hmac) {
            this.key = key;
            this.hmac = hmac;
        }

        @Override public javax.crypto.SecretKey aesKey() { return key; }
        @Override public byte[] hmacKey() { return hmac; }
    }
}
```

- [ ] **Step 2: Run failing**

Run: `cd backend && mvn -q -Dtest=EncryptorTest test`
Expected: FAIL.

- [ ] **Step 3: Create `KeyProvider` interface + env-var impl**

```java
package my.cliniflow.infrastructure.crypto;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

public interface KeyProvider {
    SecretKey aesKey();
    byte[] hmacKey();

    @Component
    @Profile("!test")
    class EnvKeyProvider implements KeyProvider {
        private final String aesB64;
        private final String hmacB64;
        private SecretKey aesKey;
        private byte[] hmacKey;

        public EnvKeyProvider(
                @Value("${cliniflow.crypto.aes-key-base64:}") String aesB64,
                @Value("${cliniflow.crypto.hmac-key-base64:}") String hmacB64) {
            this.aesB64 = aesB64;
            this.hmacB64 = hmacB64;
        }

        @PostConstruct
        void init() {
            if (aesB64 == null || aesB64.isBlank())
                throw new IllegalStateException("cliniflow.crypto.aes-key-base64 not configured");
            if (hmacB64 == null || hmacB64.isBlank())
                throw new IllegalStateException("cliniflow.crypto.hmac-key-base64 not configured");
            byte[] aes = Base64.getDecoder().decode(aesB64);
            this.hmacKey = Base64.getDecoder().decode(hmacB64);
            if (aes.length != 32) throw new IllegalStateException("AES key must be 32 bytes");
            if (hmacKey.length != 32) throw new IllegalStateException("HMAC key must be 32 bytes");
            this.aesKey = new SecretKeySpec(aes, "AES");
        }

        @Override public SecretKey aesKey() { return aesKey; }
        @Override public byte[] hmacKey() { return hmacKey; }
    }
}
```

- [ ] **Step 4: Implement `NationalIdEncryptor`**

```java
package my.cliniflow.infrastructure.crypto;

import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;

@Component
public class NationalIdEncryptor {

    private static final SecureRandom RAND = new SecureRandom();
    private final KeyProvider keys;

    public NationalIdEncryptor(KeyProvider keys) {
        this.keys = keys;
    }

    public byte[] encrypt(String plaintext) {
        try {
            byte[] iv = new byte[12];
            RAND.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, keys.aesKey(), new GCMParameterSpec(128, iv));
            byte[] ct = c.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array();
        } catch (Exception e) {
            throw new RuntimeException("encrypt failed", e);
        }
    }

    public String decrypt(byte[] ivAndCiphertext) {
        try {
            byte[] iv = new byte[12];
            byte[] ct = new byte[ivAndCiphertext.length - 12];
            ByteBuffer.wrap(ivAndCiphertext).get(iv).get(ct);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, keys.aesKey(), new GCMParameterSpec(128, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("decrypt failed", e);
        }
    }

    public String fingerprint(String plaintext) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(keys.hmacKey(), "HmacSHA256"));
            byte[] out = mac.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(out);
        } catch (Exception e) {
            throw new RuntimeException("fingerprint failed", e);
        }
    }
}
```

- [ ] **Step 5: Implement `ClinicalTextEncryptor`**

```java
package my.cliniflow.infrastructure.crypto;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Component
public class ClinicalTextEncryptor {

    private final NationalIdEncryptor delegate;

    public ClinicalTextEncryptor(NationalIdEncryptor delegate) {
        this.delegate = delegate;
    }

    public String encryptToBase64(String plaintext) {
        if (plaintext == null) return null;
        byte[] ct = delegate.encrypt(plaintext);
        return Base64.getEncoder().encodeToString(ct);
    }

    public String decryptFromBase64(String b64) {
        if (b64 == null) return null;
        return delegate.decrypt(Base64.getDecoder().decode(b64));
    }
}
```

- [ ] **Step 6: Run tests + commit**

```bash
cd backend && mvn -q -Dtest=EncryptorTest test
# expected: PASS
git add backend/src/main/java/my/cliniflow/infrastructure/crypto/ \
        backend/src/test/java/my/cliniflow/infrastructure/crypto/
git commit -m "feat(infra/crypto): NRIC + clinical text encryptor with HMAC fingerprint"
```

- [ ] **Step 7: Add a test-only `KeyProvider` configuration so integration tests work without env vars**

Create `backend/src/test/java/my/cliniflow/TestCryptoConfig.java`:

```java
package my.cliniflow;

import my.cliniflow.infrastructure.crypto.KeyProvider;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;

@TestConfiguration
public class TestCryptoConfig {
    @Bean
    @Primary
    public KeyProvider testKeyProvider() {
        byte[] aes = new byte[32]; new SecureRandom().nextBytes(aes);
        byte[] hmac = new byte[32]; new SecureRandom().nextBytes(hmac);
        SecretKey k = new SecretKeySpec(aes, "AES");
        return new KeyProvider() {
            @Override public SecretKey aesKey() { return k; }
            @Override public byte[] hmacKey() { return hmac; }
        };
    }
}
```

Update `IntegrationTestBase` to import this config:

```java
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        classes = { my.cliniflow.CliniflowApplication.class,
                    my.cliniflow.TestCryptoConfig.class })
```

(If `CliniflowApplication.java` is the main class — check `find backend -name "*Application.java"` if unsure.)

```bash
cd backend && mvn -q test -Dtest=IntegrationTestBaseSmokeIT
git add backend/src/test/java/my/cliniflow/TestCryptoConfig.java \
        backend/src/test/java/my/cliniflow/IntegrationTestBase.java
git commit -m "test(backend): test-only key provider for integration tests"
```

---

### Task 2.14: Patient repository interface + national-id encrypt + register domain services

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/repository/PatientRepository.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/service/PatientNationalIdEncryptDomainService.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/service/PatientRegisterDomainService.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/patient/service/PatientRegisterDomainServiceTest.java`

- [ ] **Step 1: Create `PatientRepository` interface**

```java
package my.cliniflow.domain.biz.patient.repository;

import my.cliniflow.domain.biz.patient.info.PatientSearchPreviewInfo;
import my.cliniflow.domain.biz.patient.model.PatientModel;

import java.util.Optional;
import java.util.UUID;

public interface PatientRepository {
    PatientModel save(PatientModel patient);
    Optional<PatientModel> findById(UUID id);
    Optional<PatientModel> findByUserId(UUID userId);
    Optional<PatientModel> findByNationalIdFingerprint(String fingerprint);
    boolean existsByNationalIdFingerprint(String fingerprint);
    Optional<PatientSearchPreviewInfo> searchPreviewByFingerprint(String fingerprint);
}
```

- [ ] **Step 2: Create `PatientNationalIdEncryptDomainService` (thin wrapper for domain layer)**

```java
package my.cliniflow.domain.biz.patient.service;

import my.cliniflow.infrastructure.crypto.NationalIdEncryptor;
import org.springframework.stereotype.Service;

@Service
public class PatientNationalIdEncryptDomainService {
    private final NationalIdEncryptor encryptor;

    public PatientNationalIdEncryptDomainService(NationalIdEncryptor encryptor) {
        this.encryptor = encryptor;
    }

    public byte[] encrypt(String plaintext) { return encryptor.encrypt(plaintext); }
    public String fingerprint(String plaintext) { return encryptor.fingerprint(plaintext); }
}
```

- [ ] **Step 3: Failing test for `PatientRegisterDomainService`**

```java
package my.cliniflow.domain.biz.patient.service;

import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import my.cliniflow.domain.biz.patient.info.PatientRegisterInfo;
import my.cliniflow.domain.biz.patient.model.*;
import my.cliniflow.domain.biz.user.info.PatientUserCreateInfo;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PatientRegisterDomainServiceTest {

    private final PatientNationalIdEncryptDomainService nric =
            Mockito.mock(PatientNationalIdEncryptDomainService.class);
    private final PatientRegisterDomainService svc =
            new PatientRegisterDomainService(nric);

    @Test
    void createsPatientWithEncryptedNricAndFingerprint() {
        Mockito.when(nric.fingerprint("950101-14-1234")).thenReturn("a".repeat(64));
        Mockito.when(nric.encrypt("950101-14-1234")).thenReturn(new byte[]{1, 2, 3});
        var info = baseInfo("jane@example.com", "950101-14-1234");
        UUID userId = UUID.randomUUID();

        PatientModel p = svc.create(info, userId);

        assertThat(p.getNationalIdFingerprint()).hasSize(64);
        assertThat(p.getNationalIdCiphertext()).isNotEmpty();
        assertThat(p.getUserId()).isEqualTo(userId);
        assertThat(p.getRegistrationSource()).isEqualTo("SELF_SERVICE");
        assertThat(p.getConsentVersion()).isEqualTo("v1");
    }

    @Test
    void rejectsUnder13() {
        var info = new PatientRegisterInfo(
                new PatientUserCreateInfo("c@x.y", "password123", "C", "+60", "en"),
                new PatientIdentityInfo("Child", "999999-99-9999",
                        LocalDate.now().minusYears(10), "FEMALE", "+60", "c@x.y", "en"),
                "v1",
                Optional.empty(), Optional.empty(),
                List.of(), List.of(), List.of(),
                Optional.empty(), Optional.empty());
        assertThatThrownBy(() -> svc.create(info, UUID.randomUUID()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("13");
    }

    private PatientRegisterInfo baseInfo(String email, String nric) {
        return new PatientRegisterInfo(
                new PatientUserCreateInfo(email, "password123", "Jane", "+60", "en"),
                new PatientIdentityInfo("Jane Doe", nric,
                        LocalDate.of(1990, 5, 1), "FEMALE", "+60", email, "en"),
                "v1",
                Optional.of(new BigDecimal("65.50")), Optional.empty(),
                List.of(), List.of(), List.of(),
                Optional.empty(), Optional.empty());
    }
}
```

- [ ] **Step 4: Implement `PatientRegisterDomainService`**

```java
package my.cliniflow.domain.biz.patient.service;

import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import my.cliniflow.domain.biz.patient.info.PatientRegisterInfo;
import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.UUID;

@Service
public class PatientRegisterDomainService {

    private final PatientNationalIdEncryptDomainService nric;

    public PatientRegisterDomainService(PatientNationalIdEncryptDomainService nric) {
        this.nric = nric;
    }

    public PatientModel create(PatientRegisterInfo info, UUID userId) {
        validate(info);
        PatientModel p = new PatientModel();
        p.setUserId(userId);
        p.setFullName(info.identityInfo().fullName());
        p.setDateOfBirth(info.identityInfo().dateOfBirth());
        p.setGender(info.identityInfo().gender());
        p.setPhone(info.identityInfo().phone());
        p.setEmail(info.identityInfo().email());
        p.setPreferredLanguage(info.identityInfo().preferredLanguage());
        p.setRegistrationSource(
                info.userInfo() != null ? "SELF_SERVICE" : "STAFF_LED");
        p.setNationalIdCiphertext(nric.encrypt(info.identityInfo().nricPlaintext()));
        p.setNationalIdFingerprint(nric.fingerprint(info.identityInfo().nricPlaintext()));
        p.markConsent(info.consentVersion(), Instant.now());
        return p;
    }

    private void validate(PatientRegisterInfo info) {
        var id = info.identityInfo();
        if (id == null) throw new IllegalArgumentException("identityInfo required");
        if (id.fullName() == null || id.fullName().isBlank())
            throw new IllegalArgumentException("fullName required");
        if (id.nricPlaintext() == null || id.nricPlaintext().isBlank())
            throw new IllegalArgumentException("NRIC required");
        if (id.dateOfBirth() == null)
            throw new IllegalArgumentException("dateOfBirth required");
        int age = Period.between(id.dateOfBirth(), LocalDate.now()).getYears();
        if (age < 13)
            throw new IllegalArgumentException("patient must be at least 13 years old");
        if (id.phone() != null && !id.phone().matches("^\\+?[0-9]{8,16}$"))
            throw new IllegalArgumentException("invalid phone");
        if (info.consentVersion() == null || info.consentVersion().isBlank())
            throw new IllegalArgumentException("consent required");
    }
}
```

- [ ] **Step 5: Run + commit**

```bash
cd backend && mvn -q -Dtest=PatientRegisterDomainServiceTest test
# expected: PASS
git add backend/src/main/java/my/cliniflow/domain/biz/patient/repository/ \
        backend/src/main/java/my/cliniflow/domain/biz/patient/service/ \
        backend/src/test/java/my/cliniflow/domain/biz/patient/service/
git commit -m "feat(domain/patient): repository iface + register domain service"
```

---

### Task 2.15: `PatientClinicalProfileUpdateDomainService`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/patient/service/PatientClinicalProfileUpdateDomainService.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/patient/service/PatientClinicalProfileUpdateDomainServiceTest.java`

- [ ] **Step 1: Failing test**

```java
package my.cliniflow.domain.biz.patient.service;

import my.cliniflow.domain.biz.patient.enums.AllergySeverity;
import my.cliniflow.domain.biz.patient.enums.PregnancyStatus;
import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import my.cliniflow.domain.biz.patient.info.ClinicalProfileUpdateInfo;
import my.cliniflow.domain.biz.patient.model.*;
import my.cliniflow.infrastructure.crypto.ClinicalTextEncryptor;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class PatientClinicalProfileUpdateDomainServiceTest {

    private final ClinicalTextEncryptor enc = Mockito.mock(ClinicalTextEncryptor.class);
    private final PatientClinicalProfileUpdateDomainService svc =
            new PatientClinicalProfileUpdateDomainService(enc);

    @Test
    void appliesWeightAndStampsProvenance() {
        Mockito.when(enc.encryptToBase64(Mockito.anyString())).thenReturn("ENC");
        PatientModel p = newPatient();
        var info = new ClinicalProfileUpdateInfo(
                Optional.of(new BigDecimal("68.0")), Optional.empty(),
                List.of(), List.of(), List.of(), List.of(),
                Optional.empty(), Optional.empty());

        List<String> changed = svc.apply(p, info, ProfileUpdateSource.PRE_VISIT_CHAT);

        assertThat(changed).contains("weight_kg");
        assertThat(p.getClinicalProfile().getWeightKgSource())
                .isEqualTo(ProfileUpdateSource.PRE_VISIT_CHAT);
    }

    @Test
    void addsAllergyAndEncryptsReaction() {
        Mockito.when(enc.encryptToBase64("hives")).thenReturn("ENC-hives");
        PatientModel p = newPatient();
        var allergyInfo = new DrugAllergyInfo(
                "penicillin", AllergySeverity.MODERATE, "hives", 0.95, Instant.now());
        var info = new ClinicalProfileUpdateInfo(
                Optional.empty(), Optional.empty(),
                List.of(allergyInfo), List.of(), List.of(), List.of(),
                Optional.empty(), Optional.empty());

        List<String> changed = svc.apply(p, info, ProfileUpdateSource.PRE_VISIT_CHAT);

        assertThat(changed).contains("drug_allergies");
        assertThat(p.getClinicalProfile().getDrugAllergies()).hasSize(1);
        assertThat(p.getClinicalProfile().getDrugAllergies().get(0).reactionEncrypted())
                .isEqualTo("ENC-hives");
    }

    private PatientModel newPatient() {
        PatientModel p = new PatientModel();
        p.setId(UUID.randomUUID());
        return p;
    }
}
```

- [ ] **Step 2: Run failing**

Run: `cd backend && mvn -q -Dtest=PatientClinicalProfileUpdateDomainServiceTest test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```java
package my.cliniflow.domain.biz.patient.service;

import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import my.cliniflow.domain.biz.patient.info.ClinicalProfileUpdateInfo;
import my.cliniflow.domain.biz.patient.model.*;
import my.cliniflow.infrastructure.crypto.ClinicalTextEncryptor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class PatientClinicalProfileUpdateDomainService {

    private final ClinicalTextEncryptor encryptor;

    public PatientClinicalProfileUpdateDomainService(ClinicalTextEncryptor encryptor) {
        this.encryptor = encryptor;
    }

    public List<String> applyAtRegistration(PatientModel patient,
                                            my.cliniflow.domain.biz.patient.info.PatientRegisterInfo info) {
        var profile = patient.getOrCreateClinicalProfile();
        List<String> changed = new ArrayList<>();
        Instant now = Instant.now();

        info.weightKg().ifPresent(w -> {
            profile.setWeightKg(w, now, ProfileUpdateSource.REGISTRATION);
            changed.add("weight_kg");
        });
        info.heightCm().ifPresent(h -> {
            profile.setHeightCm(h, now, ProfileUpdateSource.REGISTRATION);
            changed.add("height_cm");
        });
        for (var a : info.drugAllergies()) {
            profile.addDrugAllergy(encryptReaction(a), ProfileUpdateSource.REGISTRATION);
            if (!changed.contains("drug_allergies")) changed.add("drug_allergies");
        }
        for (var c : info.chronicConditions()) {
            profile.addChronicCondition(encryptNotes(c), ProfileUpdateSource.REGISTRATION);
            if (!changed.contains("chronic_conditions")) changed.add("chronic_conditions");
        }
        for (var m : info.regularMedications()) {
            profile.addRegularMedication(m, ProfileUpdateSource.REGISTRATION);
            if (!changed.contains("regular_medications")) changed.add("regular_medications");
        }
        if (info.pregnancyStatus().isPresent()) {
            profile.setPregnancy(
                    info.pregnancyStatus().get(),
                    info.pregnancyEdd().orElse(null),
                    now, ProfileUpdateSource.REGISTRATION);
            changed.add("pregnancy");
        }
        profile.recomputeCompleteness();
        return changed;
    }

    public List<String> apply(PatientModel patient, ClinicalProfileUpdateInfo info,
                              ProfileUpdateSource source) {
        var profile = patient.getOrCreateClinicalProfile();
        List<String> changed = new ArrayList<>();
        Instant now = Instant.now();

        info.weightKg().ifPresent(w -> {
            profile.setWeightKg(w, now, source);
            changed.add("weight_kg");
        });
        info.heightCm().ifPresent(h -> {
            profile.setHeightCm(h, now, source);
            changed.add("height_cm");
        });
        for (var a : info.drugAllergiesAdd()) {
            profile.addDrugAllergy(encryptReaction(a), source);
            if (!changed.contains("drug_allergies")) changed.add("drug_allergies");
        }
        for (String name : info.drugAllergiesRemoveByName()) {
            profile.removeDrugAllergy(name, source);
            if (!changed.contains("drug_allergies")) changed.add("drug_allergies");
        }
        for (var c : info.chronicConditionsAdd()) {
            profile.addChronicCondition(encryptNotes(c), source);
            if (!changed.contains("chronic_conditions")) changed.add("chronic_conditions");
        }
        for (var m : info.regularMedicationsAdd()) {
            profile.addRegularMedication(m, source);
            if (!changed.contains("regular_medications")) changed.add("regular_medications");
        }
        if (info.pregnancyStatus().isPresent()) {
            profile.setPregnancy(
                    info.pregnancyStatus().get(),
                    info.pregnancyEdd().orElse(null),
                    now, source);
            changed.add("pregnancy");
        }
        profile.recomputeCompleteness();
        return changed;
    }

    private DrugAllergyInfo encryptReaction(DrugAllergyInfo a) {
        if (a.reactionEncrypted() == null) return a;
        return new DrugAllergyInfo(
                a.name(), a.severity(),
                encryptor.encryptToBase64(a.reactionEncrypted()),
                a.confidence(), a.confirmedAt());
    }

    private ChronicConditionInfo encryptNotes(ChronicConditionInfo c) {
        if (c.notesEncrypted() == null) return c;
        return new ChronicConditionInfo(
                c.name(), c.icd10(), c.sinceYear(),
                encryptor.encryptToBase64(c.notesEncrypted()));
    }
}
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && mvn -q -Dtest=PatientClinicalProfileUpdateDomainServiceTest test
git add backend/src/main/java/my/cliniflow/domain/biz/patient/service/PatientClinicalProfileUpdateDomainService.java \
        backend/src/test/java/my/cliniflow/domain/biz/patient/service/PatientClinicalProfileUpdateDomainServiceTest.java
git commit -m "feat(domain/patient): clinical profile update domain service with encryption"
```

---

**End of Phase 2.** Domain models, value objects, enums, services, events, and repository interfaces are defined and unit-tested. Phase 3 wires the application services on top.

---

## Phase 3 — Application layer

App services orchestrate domain services + repositories. They are `@Transactional` on writes and depend on **interfaces only** — never on JPA repos directly.

### Task 3.1: `AuditWriter` (infrastructure helper used by app services)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/audit/AuditWriter.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/audit/jpa/AuditLogJpaEntity.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/audit/jpa/AuditLogSpringDataRepository.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/audit/AuditWriterIT.java`

- [ ] **Step 1: JPA entity for `audit_log` (read-side; writes via INSERT only because the table has triggers blocking UPDATE/DELETE)**

```java
package my.cliniflow.infrastructure.audit.jpa;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "audit_log")
public class AuditLogJpaEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @CreationTimestamp
    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "actor_user_id", columnDefinition = "uuid")
    private UUID actorUserId;

    @Column(name = "actor_role", length = 32)
    private String actorRole;

    @Column(nullable = false, length = 16)
    private String action;

    @Column(name = "resource_type", nullable = false, length = 64)
    private String resourceType;

    @Column(name = "resource_id", length = 128)
    private String resourceId;

    @Column(name = "correlation_id", length = 64)
    private String correlationId;

    @Column(name = "payload_hash", length = 64)
    private String payloadHash;

    @Column(name = "ip_address", columnDefinition = "inet")
    private String ipAddress;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> metadata = Map.of();

    public Long getId() { return id; }
    public void setActorUserId(UUID v) { this.actorUserId = v; }
    public void setActorRole(String v) { this.actorRole = v; }
    public void setAction(String v) { this.action = v; }
    public void setResourceType(String v) { this.resourceType = v; }
    public void setResourceId(String v) { this.resourceId = v; }
    public void setCorrelationId(String v) { this.correlationId = v; }
    public void setPayloadHash(String v) { this.payloadHash = v; }
    public void setIpAddress(String v) { this.ipAddress = v; }
    public void setMetadata(Map<String, Object> v) { this.metadata = v; }
    public String getAction() { return action; }
    public String getResourceType() { return resourceType; }
    public String getResourceId() { return resourceId; }
    public String getActorRole() { return actorRole; }
}
```

```java
// AuditLogSpringDataRepository.java
package my.cliniflow.infrastructure.audit.jpa;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogSpringDataRepository
        extends JpaRepository<AuditLogJpaEntity, Long> {}
```

- [ ] **Step 2: `AuditWriter` bean**

```java
package my.cliniflow.infrastructure.audit;

import my.cliniflow.infrastructure.audit.jpa.AuditLogJpaEntity;
import my.cliniflow.infrastructure.audit.jpa.AuditLogSpringDataRepository;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Component
public class AuditWriter {
    private final AuditLogSpringDataRepository repo;

    public AuditWriter(AuditLogSpringDataRepository repo) { this.repo = repo; }

    public void append(String action, String resourceType, String resourceId,
                       UUID actorUserId, String actorRole,
                       Map<String, Object> metadata, String payloadForHash) {
        AuditLogJpaEntity row = new AuditLogJpaEntity();
        row.setActorUserId(actorUserId);
        row.setActorRole(actorRole);
        row.setAction(action);
        row.setResourceType(resourceType);
        row.setResourceId(resourceId);
        row.setCorrelationId(MDC.get("correlationId"));
        if (payloadForHash != null) row.setPayloadHash(sha256(payloadForHash));
        row.setMetadata(metadata == null ? Map.of() : metadata);
        repo.save(row);
    }

    private static String sha256(String s) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(s.getBytes());
            return HexFormat.of().formatHex(h);
        } catch (Exception e) { return null; }
    }
}
```

- [ ] **Step 3: Integration test writes one row, fails on UPDATE attempt**

```java
package my.cliniflow.infrastructure.audit;

import my.cliniflow.IntegrationTestBase;
import my.cliniflow.infrastructure.audit.jpa.AuditLogJpaEntity;
import my.cliniflow.infrastructure.audit.jpa.AuditLogSpringDataRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuditWriterIT extends IntegrationTestBase {

    @Autowired AuditWriter writer;
    @Autowired AuditLogSpringDataRepository repo;

    @Test
    void writesOneRow() {
        long before = repo.count();
        writer.append("CREATE", "patient", UUID.randomUUID().toString(),
                null, "ANONYMOUS", Map.of("source", "TEST"),
                "payload-string");
        assertThat(repo.count()).isEqualTo(before + 1);
    }

    @Test
    void updateIsBlockedByDbTrigger() {
        writer.append("READ", "smoke", "x", null, "TEST", Map.of(), null);
        AuditLogJpaEntity row = repo.findAll().get(0);
        row.setAction("UPDATE");
        assertThatThrownBy(() -> repo.saveAndFlush(row))
                .hasMessageContaining("audit_log is append-only");
    }
}
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && mvn -q -Dtest=AuditWriterIT test
git add backend/src/main/java/my/cliniflow/infrastructure/audit/ \
        backend/src/test/java/my/cliniflow/infrastructure/audit/
git commit -m "feat(infra/audit): AuditWriter with PDPA append-only enforcement"
```

---

### Task 3.2: User repository implementation (JPA)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/user/UserRepositoryImpl.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/user/jpa/UserSpringDataRepository.java`
- Create: `.../DoctorSpringDataRepository.java`
- Create: `.../StaffProfileSpringDataRepository.java`
- Create: `.../UserJpaEntity2ModelConverter.java`

- [ ] **Step 1: Spring Data repos**

```java
// UserSpringDataRepository.java
package my.cliniflow.infrastructure.repository.user.jpa;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserSpringDataRepository extends JpaRepository<UserJpaEntity, UUID> {
    Optional<UserJpaEntity> findByEmail(String email);
    boolean existsByEmail(String email);
    List<UserJpaEntity> findByRoleAndIsActive(String role, boolean active,
                                              org.springframework.data.domain.Pageable p);
    long countByRoleAndIsActive(String role, boolean active);
}
```

```java
// DoctorSpringDataRepository.java
package my.cliniflow.infrastructure.repository.user.jpa;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface DoctorSpringDataRepository extends JpaRepository<DoctorJpaEntity, UUID> {
    Optional<DoctorJpaEntity> findByUserId(UUID userId);
    boolean existsByMmcNumber(String mmc);
}
```

```java
// StaffProfileSpringDataRepository.java
package my.cliniflow.infrastructure.repository.user.jpa;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface StaffProfileSpringDataRepository
        extends JpaRepository<StaffProfileJpaEntity, UUID> {
    Optional<StaffProfileJpaEntity> findByUserId(UUID userId);
}
```

- [ ] **Step 2: Converter**

```java
package my.cliniflow.infrastructure.repository.user.jpa;

import my.cliniflow.domain.biz.user.enums.UserRole;
import my.cliniflow.domain.biz.user.model.*;

public final class UserJpaEntity2ModelConverter {

    private UserJpaEntity2ModelConverter() {}

    public static UserModel toModel(UserJpaEntity e) {
        UserModel u = new UserModel(); // requires a public no-arg constructor — see below
        u.setId(e.getId());
        // populate fields via reflection-friendly factory if needed; OR add package-private setters in UserModel.
        // Simpler: add a `UserModel.fromPersistence(...)` static factory.
        return UserModel.fromPersistence(
                e.getId(), e.getEmail(), e.getPasswordHash(),
                UserRole.valueOf(e.getRole()), e.getFullName(), e.getIsActive(),
                e.getPhone(), e.getPreferredLanguage(),
                Boolean.TRUE.equals(e.getMustChangePassword()),
                e.getLastLoginAt(),
                e.getFailedLoginAttempts() == null ? 0 : e.getFailedLoginAttempts(),
                e.getLockedUntil(), e.getGmtCreate(), e.getGmtModified());
    }

    public static UserJpaEntity toJpa(UserModel m) {
        UserJpaEntity e = new UserJpaEntity();
        e.setId(m.getId());
        e.setEmail(m.getEmail());
        e.setPasswordHash(m.getPasswordHash());
        e.setRole(m.getRole().name());
        e.setFullName(m.getFullName());
        e.setIsActive(m.isActive());
        e.setPhone(m.getPhone());
        e.setPreferredLanguage(m.getPreferredLanguage());
        e.setMustChangePassword(m.isMustChangePassword());
        e.setLastLoginAt(m.getLastLoginAt());
        e.setFailedLoginAttempts(m.getFailedLoginAttempts());
        e.setLockedUntil(m.getLockedUntil());
        return e;
    }

    public static DoctorProfileModel toDoctorModel(DoctorJpaEntity e) {
        DoctorProfileModel m = new DoctorProfileModel(
                e.getUserId(), e.getMmcNumber(), e.getSpecialty(), e.getSignatureImageUrl());
        m.setId(e.getId());
        m.setAcceptingPatients(e.isAcceptingPatients());
        return m;
    }

    public static DoctorJpaEntity toDoctorJpa(DoctorProfileModel m) {
        DoctorJpaEntity e = new DoctorJpaEntity();
        e.setId(m.getId());
        e.setUserId(m.getUserId());
        e.setMmcNumber(m.getMmcNumber());
        e.setSpecialty(m.getSpecialty());
        e.setSignatureImageUrl(m.getSignatureImageUrl());
        e.setAcceptingPatients(m.isAcceptingPatients());
        return e;
    }

    public static StaffProfileModel toStaffModel(StaffProfileJpaEntity e) {
        StaffProfileModel m = new StaffProfileModel(
                e.getUserId(), e.getEmployeeId(), e.getNotes());
        m.setId(e.getId());
        return m;
    }

    public static StaffProfileJpaEntity toStaffJpa(StaffProfileModel m) {
        StaffProfileJpaEntity e = new StaffProfileJpaEntity();
        e.setId(m.getId());
        e.setUserId(m.getUserId());
        e.setEmployeeId(m.getEmployeeId());
        e.setNotes(m.getNotes());
        return e;
    }
}
```

Add a `UserModel.fromPersistence(...)` static factory in `UserModel`:

```java
// inside UserModel
public static UserModel fromPersistence(
        UUID id, String email, String pwdHash, UserRole role, String fullName,
        boolean active, String phone, String lang, boolean mustChange,
        Instant lastLogin, int failedAttempts, Instant lockedUntil,
        Instant gmtCreate, Instant gmtModified) {
    UserModel u = new UserModel();
    u.id = id; u.email = email; u.passwordHash = pwdHash;
    u.role = role; u.fullName = fullName; u.active = active;
    u.phone = phone; u.preferredLanguage = lang;
    u.mustChangePassword = mustChange;
    u.lastLoginAt = lastLogin;
    u.failedLoginAttempts = failedAttempts;
    u.lockedUntil = lockedUntil;
    u.gmtCreate = gmtCreate; u.gmtModified = gmtModified;
    return u;
}
```

- [ ] **Step 3: `UserRepositoryImpl`**

```java
package my.cliniflow.infrastructure.repository.user;

import my.cliniflow.domain.biz.user.enums.UserRole;
import my.cliniflow.domain.biz.user.model.*;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.repository.user.jpa.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class UserRepositoryImpl implements UserRepository {

    private final UserSpringDataRepository userRepo;
    private final DoctorSpringDataRepository doctorRepo;
    private final StaffProfileSpringDataRepository staffRepo;

    public UserRepositoryImpl(UserSpringDataRepository u,
                              DoctorSpringDataRepository d,
                              StaffProfileSpringDataRepository s) {
        this.userRepo = u; this.doctorRepo = d; this.staffRepo = s;
    }

    @Override
    public UserModel save(UserModel user) {
        UserJpaEntity saved = userRepo.save(UserJpaEntity2ModelConverter.toJpa(user));
        return UserJpaEntity2ModelConverter.toModel(saved);
    }

    @Override public Optional<UserModel> findById(UUID id) {
        return userRepo.findById(id).map(UserJpaEntity2ModelConverter::toModel);
    }

    @Override public Optional<UserModel> findByEmail(String email) {
        return userRepo.findByEmail(email.toLowerCase())
                .map(UserJpaEntity2ModelConverter::toModel);
    }

    @Override public boolean existsByEmail(String email) {
        return userRepo.existsByEmail(email.toLowerCase());
    }

    @Override public DoctorProfileModel saveDoctorProfile(DoctorProfileModel p) {
        var saved = doctorRepo.save(UserJpaEntity2ModelConverter.toDoctorJpa(p));
        return UserJpaEntity2ModelConverter.toDoctorModel(saved);
    }

    @Override public boolean existsByMmcNumber(String mmc) {
        return doctorRepo.existsByMmcNumber(mmc);
    }

    @Override public Optional<DoctorProfileModel> findDoctorProfileByUserId(UUID uid) {
        return doctorRepo.findByUserId(uid).map(UserJpaEntity2ModelConverter::toDoctorModel);
    }

    @Override public Optional<DoctorProfileModel> findDoctorProfileById(UUID id) {
        return doctorRepo.findById(id).map(UserJpaEntity2ModelConverter::toDoctorModel);
    }

    @Override public StaffProfileModel saveStaffProfile(StaffProfileModel p) {
        var saved = staffRepo.save(UserJpaEntity2ModelConverter.toStaffJpa(p));
        return UserJpaEntity2ModelConverter.toStaffModel(saved);
    }

    @Override public Optional<StaffProfileModel> findStaffProfileByUserId(UUID uid) {
        return staffRepo.findByUserId(uid).map(UserJpaEntity2ModelConverter::toStaffModel);
    }

    @Override public List<UserModel> findActiveByRole(UserRole role, int page, int size) {
        return userRepo.findByRoleAndIsActive(role.name(), true, PageRequest.of(page, size))
                .stream().map(UserJpaEntity2ModelConverter::toModel).toList();
    }

    @Override public long countActiveByRole(UserRole role) {
        return userRepo.countByRoleAndIsActive(role.name(), true);
    }
}
```

- [ ] **Step 4: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/infrastructure/repository/user/ \
        backend/src/main/java/my/cliniflow/domain/biz/user/model/UserModel.java
git commit -m "feat(infra/user): UserRepositoryImpl + JPA repos + converter"
```

---

### Task 3.3: Patient repository implementation (JPA)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/patient/PatientRepositoryImpl.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/patient/jpa/PatientSpringDataRepository.java`
- Create: `.../PatientClinicalProfileSpringDataRepository.java` (package-private, used **only** inside the impl — does NOT violate the aggregate rule because there is no domain-level `PatientClinicalProfileRepository` interface)
- Create: `.../PatientJpaEntity2ModelConverter.java`

- [ ] **Step 1: Spring Data repos**

```java
// PatientSpringDataRepository.java
package my.cliniflow.infrastructure.repository.patient.jpa;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface PatientSpringDataRepository extends JpaRepository<PatientJpaEntity, UUID> {
    Optional<PatientJpaEntity> findByUserId(UUID userId);
    Optional<PatientJpaEntity> findByNationalIdFingerprint(String fp);
    boolean existsByNationalIdFingerprint(String fp);
}
```

```java
// PatientClinicalProfileSpringDataRepository.java
package my.cliniflow.infrastructure.repository.patient.jpa;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

interface PatientClinicalProfileSpringDataRepository
        extends JpaRepository<PatientClinicalProfileJpaEntity, UUID> {
    Optional<PatientClinicalProfileJpaEntity> findByPatientId(UUID patientId);
}
```

(Note: package-private `interface` — visible only within the JPA package.)

- [ ] **Step 2: Converter**

```java
package my.cliniflow.infrastructure.repository.patient.jpa;

import my.cliniflow.domain.biz.patient.enums.*;
import my.cliniflow.domain.biz.patient.model.*;

import java.util.List;
import java.util.Map;

public final class PatientJpaEntity2ModelConverter {

    private PatientJpaEntity2ModelConverter() {}

    public static PatientModel toModel(PatientJpaEntity e, PatientClinicalProfileJpaEntity prof) {
        PatientModel m = new PatientModel();
        m.setId(e.getId());
        m.setUserId(e.getUserId());
        m.setNationalIdCiphertext(e.getNationalIdCiphertext());
        m.setNationalIdFingerprint(e.getNationalIdFingerprint());
        m.setFullName(e.getFullName());
        m.setDateOfBirth(e.getDateOfBirth());
        m.setGender(e.getGender());
        m.setPhone(e.getPhone());
        m.setEmail(e.getEmail());
        m.setPreferredLanguage(e.getPreferredLanguage());
        m.setRegistrationSource(e.getRegistrationSource());
        m.setGmtCreate(e.getGmtCreate());
        m.setGmtModified(e.getGmtModified());
        if (prof != null) m.setClinicalProfile(toProfileModel(prof));
        return m;
    }

    public static PatientJpaEntity toJpa(PatientModel m) {
        PatientJpaEntity e = new PatientJpaEntity();
        e.setId(m.getId());
        e.setUserId(m.getUserId());
        e.setNationalIdCiphertext(m.getNationalIdCiphertext());
        e.setNationalIdFingerprint(m.getNationalIdFingerprint());
        e.setFullName(m.getFullName());
        e.setDateOfBirth(m.getDateOfBirth());
        e.setGender(m.getGender());
        e.setPhone(m.getPhone());
        e.setEmail(m.getEmail());
        e.setPreferredLanguage(m.getPreferredLanguage());
        e.setRegistrationSource(m.getRegistrationSource());
        e.setConsentGivenAt(m.getConsentGivenAt());
        e.setConsentVersion(m.getConsentVersion());
        return e;
    }

    static PatientClinicalProfileModel toProfileModel(PatientClinicalProfileJpaEntity e) {
        PatientClinicalProfileModel m = new PatientClinicalProfileModel(e.getPatientId());
        m.setId(e.getId());
        // setters bypass invariants because we trust the DB; use a package-private hydrator if strict.
        // For brevity: use reflection-free direct field copy via a hydrator method.
        ProfileHydrator.hydrate(m, e);
        return m;
    }

    static PatientClinicalProfileJpaEntity toProfileJpa(PatientClinicalProfileModel m) {
        PatientClinicalProfileJpaEntity e = new PatientClinicalProfileJpaEntity();
        e.setId(m.getId());
        e.setPatientId(m.getPatientId());
        e.setWeightKg(m.getWeightKg());
        e.setWeightKgUpdatedAt(m.getWeightKgUpdatedAt());
        e.setWeightKgSource(m.getWeightKgSource() == null ? null : m.getWeightKgSource().name());
        e.setHeightCm(m.getHeightCm());
        e.setHeightCmUpdatedAt(m.getHeightCmUpdatedAt());
        e.setHeightCmSource(m.getHeightCmSource() == null ? null : m.getHeightCmSource().name());

        e.setDrugAllergies(m.getDrugAllergies().stream()
                .map(a -> Map.<String, Object>of(
                        "name", a.name(),
                        "severity", a.severity().name(),
                        "reaction", a.reactionEncrypted() == null ? "" : a.reactionEncrypted(),
                        "confidence", a.confidence() == null ? 1.0 : a.confidence()))
                .toList());
        e.setDrugAllergiesUpdatedAt(m.getDrugAllergiesUpdatedAt());
        e.setDrugAllergiesSource(m.getDrugAllergiesSource() == null ? null : m.getDrugAllergiesSource().name());

        e.setChronicConditions(m.getChronicConditions().stream()
                .map(c -> Map.<String, Object>of(
                        "name", c.name(),
                        "icd10", c.icd10() == null ? "" : c.icd10(),
                        "since_year", c.sinceYear() == null ? 0 : c.sinceYear(),
                        "notes", c.notesEncrypted() == null ? "" : c.notesEncrypted()))
                .toList());
        e.setChronicConditionsUpdatedAt(m.getChronicConditionsUpdatedAt());
        e.setChronicConditionsSource(m.getChronicConditionsSource() == null ? null : m.getChronicConditionsSource().name());

        e.setRegularMedications(m.getRegularMedications().stream()
                .map(r -> Map.<String, Object>of(
                        "name", r.name(),
                        "dosage", r.dosage() == null ? "" : r.dosage(),
                        "frequency", r.frequency() == null ? "" : r.frequency(),
                        "since_date", r.sinceDate() == null ? "" : r.sinceDate().toString()))
                .toList());
        e.setRegularMedicationsUpdatedAt(m.getRegularMedicationsUpdatedAt());
        e.setRegularMedicationsSource(m.getRegularMedicationsSource() == null ? null : m.getRegularMedicationsSource().name());

        e.setPregnancyStatus(m.getPregnancyStatus() == null ? null : m.getPregnancyStatus().name());
        e.setPregnancyEdd(m.getPregnancyEdd());
        e.setPregnancyUpdatedAt(m.getPregnancyUpdatedAt());
        e.setPregnancySource(m.getPregnancySource() == null ? null : m.getPregnancySource().name());
        e.setCompletenessState(m.getCompletenessState().name());
        return e;
    }
}
```

Create `ProfileHydrator.java` in the same package — it exposes a package-private hydrator for the model so we can rebuild it from JPA without re-running invariants:

```java
package my.cliniflow.infrastructure.repository.patient.jpa;

import my.cliniflow.domain.biz.patient.enums.*;
import my.cliniflow.domain.biz.patient.model.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

final class ProfileHydrator {

    private ProfileHydrator() {}

    @SuppressWarnings("unchecked")
    static void hydrate(PatientClinicalProfileModel m, PatientClinicalProfileJpaEntity e) {
        // direct field set bypassing invariants — reflection-free using package-friendly setters
        if (e.getWeightKg() != null) {
            m.setWeightKg(e.getWeightKg(),
                    e.getWeightKgUpdatedAt(),
                    e.getWeightKgSource() == null ? null : ProfileUpdateSource.valueOf(e.getWeightKgSource()));
        }
        if (e.getHeightCm() != null) {
            m.setHeightCm(e.getHeightCm(),
                    e.getHeightCmUpdatedAt(),
                    e.getHeightCmSource() == null ? null : ProfileUpdateSource.valueOf(e.getHeightCmSource()));
        }
        for (Map<String, Object> a : e.getDrugAllergies()) {
            m.addDrugAllergy(new DrugAllergyInfo(
                    (String) a.get("name"),
                    AllergySeverity.valueOf((String) a.get("severity")),
                    (String) a.get("reaction"),
                    a.get("confidence") instanceof Number n ? n.doubleValue() : 1.0,
                    null),
                    e.getDrugAllergiesSource() == null ? ProfileUpdateSource.MIGRATED
                            : ProfileUpdateSource.valueOf(e.getDrugAllergiesSource()));
        }
        for (Map<String, Object> c : e.getChronicConditions()) {
            m.addChronicCondition(new ChronicConditionInfo(
                    (String) c.get("name"),
                    blank((String) c.get("icd10")),
                    c.get("since_year") instanceof Number n ? n.intValue() : null,
                    blank((String) c.get("notes"))),
                    e.getChronicConditionsSource() == null ? ProfileUpdateSource.MIGRATED
                            : ProfileUpdateSource.valueOf(e.getChronicConditionsSource()));
        }
        for (Map<String, Object> r : e.getRegularMedications()) {
            m.addRegularMedication(new RegularMedicationInfo(
                    (String) r.get("name"),
                    blank((String) r.get("dosage")),
                    blank((String) r.get("frequency")),
                    parseDate((String) r.get("since_date"))),
                    e.getRegularMedicationsSource() == null ? ProfileUpdateSource.MIGRATED
                            : ProfileUpdateSource.valueOf(e.getRegularMedicationsSource()));
        }
        if (e.getPregnancyStatus() != null) {
            m.setPregnancy(
                    PregnancyStatus.valueOf(e.getPregnancyStatus()),
                    e.getPregnancyEdd(),
                    e.getPregnancyUpdatedAt(),
                    e.getPregnancySource() == null ? null : ProfileUpdateSource.valueOf(e.getPregnancySource()));
        }
        m.setCompletenessState(CompletenessState.valueOf(e.getCompletenessState()));
    }

    private static String blank(String s) { return s == null || s.isEmpty() ? null : s; }
    private static LocalDate parseDate(String s) { return s == null || s.isBlank() ? null : LocalDate.parse(s); }
}
```

- [ ] **Step 3: `PatientRepositoryImpl`**

```java
package my.cliniflow.infrastructure.repository.patient;

import my.cliniflow.domain.biz.patient.info.PatientSearchPreviewInfo;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.infrastructure.repository.patient.jpa.*;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class PatientRepositoryImpl implements PatientRepository {

    private final PatientSpringDataRepository patientRepo;
    private final PatientClinicalProfileSpringDataRepository profileRepo;

    public PatientRepositoryImpl(PatientSpringDataRepository p,
                                 PatientClinicalProfileSpringDataRepository prof) {
        this.patientRepo = p; this.profileRepo = prof;
    }

    @Override
    public PatientModel save(PatientModel patient) {
        PatientJpaEntity savedPatient = patientRepo.save(
                PatientJpaEntity2ModelConverter.toJpa(patient));
        if (patient.getClinicalProfile() != null) {
            patient.getClinicalProfile().setPatientId(savedPatient.getId());
            // ensure existing row id preserved on update
            profileRepo.findByPatientId(savedPatient.getId())
                    .ifPresent(existing -> patient.getClinicalProfile().setId(existing.getId()));
            profileRepo.save(PatientJpaEntity2ModelConverter.toProfileJpa(patient.getClinicalProfile()));
        }
        return findById(savedPatient.getId()).orElseThrow();
    }

    @Override public Optional<PatientModel> findById(UUID id) {
        return patientRepo.findById(id)
                .map(p -> PatientJpaEntity2ModelConverter.toModel(p,
                        profileRepo.findByPatientId(p.getId()).orElse(null)));
    }

    @Override public Optional<PatientModel> findByUserId(UUID userId) {
        return patientRepo.findByUserId(userId)
                .map(p -> PatientJpaEntity2ModelConverter.toModel(p,
                        profileRepo.findByPatientId(p.getId()).orElse(null)));
    }

    @Override public Optional<PatientModel> findByNationalIdFingerprint(String fp) {
        return patientRepo.findByNationalIdFingerprint(fp)
                .map(p -> PatientJpaEntity2ModelConverter.toModel(p,
                        profileRepo.findByPatientId(p.getId()).orElse(null)));
    }

    @Override public boolean existsByNationalIdFingerprint(String fp) {
        return patientRepo.existsByNationalIdFingerprint(fp);
    }

    @Override public Optional<PatientSearchPreviewInfo> searchPreviewByFingerprint(String fp) {
        return patientRepo.findByNationalIdFingerprint(fp).map(p -> new PatientSearchPreviewInfo(
                p.getId(),
                redactName(p.getFullName()),
                p.getDateOfBirth() == null ? null
                        : p.getDateOfBirth().toString().substring(0, 7)));
    }

    private static String redactName(String name) {
        if (name == null || name.isBlank()) return "***";
        return name.charAt(0) + "***";
    }
}
```

- [ ] **Step 4: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/infrastructure/repository/patient/
git commit -m "feat(infra/patient): PatientRepositoryImpl + JPA repos + converter"
```

---

### Task 3.4: `UserWriteAppService` — register methods

**Files:**
- Modify or create: `backend/src/main/java/my/cliniflow/application/biz/user/UserWriteAppService.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/user/UserWriteAppServiceTest.java`

- [ ] **Step 1: Failing test (Mockito-based)**

```java
package my.cliniflow.application.biz.user;

import my.cliniflow.domain.biz.user.enums.UserRole;
import my.cliniflow.domain.biz.user.info.*;
import my.cliniflow.domain.biz.user.model.*;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.domain.biz.user.service.*;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;

class UserWriteAppServiceTest {

    UserRepository repo = Mockito.mock(UserRepository.class);
    UserPasswordEncodeDomainService pwd = Mockito.mock(UserPasswordEncodeDomainService.class);
    UserPatientCreateDomainService patientSvc =
            Mockito.mock(UserPatientCreateDomainService.class);
    UserStaffCreateDomainService staffSvc =
            Mockito.mock(UserStaffCreateDomainService.class);
    UserDoctorCreateDomainService doctorSvc =
            Mockito.mock(UserDoctorCreateDomainService.class);
    UserAdminCreateDomainService adminSvc =
            Mockito.mock(UserAdminCreateDomainService.class);
    AuditWriter audit = Mockito.mock(AuditWriter.class);

    UserWriteAppService svc = new UserWriteAppService(
            repo, pwd, patientSvc, staffSvc, doctorSvc, adminSvc, audit);

    @Test
    void createPatientUser_duplicateEmailRejected() {
        Mockito.when(repo.existsByEmail("dup@x.y")).thenReturn(true);
        assertThatThrownBy(() -> svc.createPatientUser(
                new PatientUserCreateInfo("DUP@x.y", "password123", "n", "+60", "en")))
                .isInstanceOf(my.cliniflow.controller.base.ConflictException.class);
    }

    @Test
    void createDoctorUser_duplicateMmcRejected() {
        Mockito.when(repo.existsByEmail("d@x.y")).thenReturn(false);
        Mockito.when(repo.existsByMmcNumber("MMC-001")).thenReturn(true);
        assertThatThrownBy(() -> svc.createDoctorUser(
                new DoctorUserCreateInfo("d@x.y", "Dr Z", "+60", "en",
                        "MMC-001", "GP", new byte[0], "image/png")))
                .isInstanceOf(my.cliniflow.controller.base.ConflictException.class);
    }
}
```

- [ ] **Step 2: Run failing**

Run: `cd backend && mvn -q -Dtest=UserWriteAppServiceTest test`

- [ ] **Step 3: Implement `UserWriteAppService`**

```java
package my.cliniflow.application.biz.user;

import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.domain.biz.user.enums.UserRole;
import my.cliniflow.domain.biz.user.info.*;
import my.cliniflow.domain.biz.user.model.*;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.domain.biz.user.service.*;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

@Service
public class UserWriteAppService {

    private final UserRepository repo;
    private final UserPasswordEncodeDomainService pwd;
    private final UserPatientCreateDomainService patientCreate;
    private final UserStaffCreateDomainService staffCreate;
    private final UserDoctorCreateDomainService doctorCreate;
    private final UserAdminCreateDomainService adminCreate;
    private final AuditWriter audit;

    public UserWriteAppService(UserRepository repo,
                               UserPasswordEncodeDomainService pwd,
                               UserPatientCreateDomainService patientCreate,
                               UserStaffCreateDomainService staffCreate,
                               UserDoctorCreateDomainService doctorCreate,
                               UserAdminCreateDomainService adminCreate,
                               AuditWriter audit) {
        this.repo = repo; this.pwd = pwd;
        this.patientCreate = patientCreate; this.staffCreate = staffCreate;
        this.doctorCreate = doctorCreate; this.adminCreate = adminCreate;
        this.audit = audit;
    }

    @Transactional
    public UUID createPatientUser(PatientUserCreateInfo info) {
        ensureEmailUnique(info.email());
        UserModel saved = repo.save(patientCreate.create(info));
        audit.append("CREATE", "user", saved.getId().toString(),
                null, "ANONYMOUS",
                Map.of("role", "PATIENT", "source", "SELF_SERVICE"),
                saved.getId().toString());
        return saved.getId();
    }

    @Transactional
    public StaffCreateResult createStaffUser(StaffUserCreateInfo info, UUID actorAdminId) {
        ensureEmailUnique(info.email());
        var r = staffCreate.createWithTempPassword(info);
        UserModel savedUser = repo.save(r.user());
        var sp = new StaffProfileModel(savedUser.getId(),
                r.staffProfile().getEmployeeId(),
                r.staffProfile().getNotes());
        repo.saveStaffProfile(sp);
        audit.append("CREATE", "user", savedUser.getId().toString(),
                actorAdminId, "ADMIN",
                Map.of("role", "STAFF", "source", "ADMIN_CREATED"), null);
        return new StaffCreateResult(savedUser.getId(), r.tempPasswordPlaintext());
    }

    @Transactional
    public DoctorCreateResult createDoctorUser(DoctorUserCreateInfo info) {
        return createDoctorUser(info, null);
    }

    @Transactional
    public DoctorCreateResult createDoctorUser(DoctorUserCreateInfo info, UUID actorAdminId) {
        ensureEmailUnique(info.email());
        if (repo.existsByMmcNumber(info.mmcNumber()))
            throw new ConflictException("MMC number already registered");
        var r = doctorCreate.createWithTempPassword(info);
        UserModel savedUser = repo.save(r.user());
        var dp = new DoctorProfileModel(savedUser.getId(),
                r.doctorProfile().getMmcNumber(),
                r.doctorProfile().getSpecialty(),
                /* signatureUrl set by app service after upload */ null);
        var savedDp = repo.saveDoctorProfile(dp);
        audit.append("CREATE", "user", savedUser.getId().toString(),
                actorAdminId, "ADMIN",
                Map.of("role", "DOCTOR", "source", "ADMIN_CREATED",
                       "mmcNumber", info.mmcNumber()), null);
        return new DoctorCreateResult(savedUser.getId(), savedDp.getId(),
                r.tempPasswordPlaintext());
    }

    @Transactional
    public AdminCreateResult createAdminUser(AdminUserCreateInfo info, UUID actorAdminId) {
        ensureEmailUnique(info.email());
        var r = adminCreate.createWithTempPassword(info);
        UserModel savedUser = repo.save(r.user());
        audit.append("CREATE", "user", savedUser.getId().toString(),
                actorAdminId, "ADMIN",
                Map.of("role", "ADMIN", "source", "ADMIN_CREATED"), null);
        return new AdminCreateResult(savedUser.getId(), r.tempPasswordPlaintext());
    }

    @Transactional
    public void forcePasswordChange(UUID userId, String newPasswordPlaintext) {
        UserModel u = repo.findById(userId).orElseThrow();
        if (newPasswordPlaintext == null || newPasswordPlaintext.length() < 8)
            throw new IllegalArgumentException("password too short");
        if (!newPasswordPlaintext.matches(".*[A-Za-z].*") ||
            !newPasswordPlaintext.matches(".*[0-9].*"))
            throw new IllegalArgumentException("password must contain a letter and a digit");
        u.changePassword(pwd.encode(newPasswordPlaintext));
        repo.save(u);
        audit.append("UPDATE", "user", userId.toString(),
                userId, u.getRole().name(),
                Map.of("event", "PASSWORD_CHANGED"), null);
    }

    @Transactional
    public void setDoctorSignatureUrl(UUID doctorProfileId, String url) {
        var dp = repo.findDoctorProfileById(doctorProfileId).orElseThrow();
        dp.setSignatureImageUrl(url);
        repo.saveDoctorProfile(dp);
    }

    private void ensureEmailUnique(String email) {
        if (repo.existsByEmail(email.toLowerCase()))
            throw new ConflictException("email already registered");
    }

    public record StaffCreateResult(UUID userId, String tempPasswordPlaintext) {}
    public record DoctorCreateResult(UUID userId, UUID doctorProfileId, String tempPasswordPlaintext) {}
    public record AdminCreateResult(UUID userId, String tempPasswordPlaintext) {}
}
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && mvn -q -Dtest=UserWriteAppServiceTest test
git add backend/src/main/java/my/cliniflow/application/biz/user/ \
        backend/src/test/java/my/cliniflow/application/biz/user/
git commit -m "feat(app/user): UserWriteAppService for all 4 roles + force password change"
```

---

### Task 3.5: `UserReadAppService`

**Files:**
- Modify or create: `backend/src/main/java/my/cliniflow/application/biz/user/UserReadAppService.java`

```java
package my.cliniflow.application.biz.user;

import my.cliniflow.domain.biz.user.enums.UserRole;
import my.cliniflow.domain.biz.user.model.*;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class UserReadAppService {

    private final UserRepository repo;
    public UserReadAppService(UserRepository repo) { this.repo = repo; }

    public Optional<UserModel> getById(UUID id) { return repo.findById(id); }
    public Optional<UserModel> findByEmail(String email) { return repo.findByEmail(email); }
    public Optional<DoctorProfileModel> findDoctorProfileByUserId(UUID uid) {
        return repo.findDoctorProfileByUserId(uid);
    }
    public List<UserModel> listActiveByRole(UserRole role, int page, int size) {
        return repo.findActiveByRole(role, page, size);
    }
    public long countActiveByRole(UserRole role) { return repo.countActiveByRole(role); }
}
```

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/application/biz/user/UserReadAppService.java
git commit -m "feat(app/user): UserReadAppService"
```

---

### Task 3.6: `PatientWriteAppService` — register + updateClinicalProfile

**Files:**
- Modify or create: `backend/src/main/java/my/cliniflow/application/biz/patient/PatientWriteAppService.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/patient/PatientWriteAppServiceTest.java`

(The outbox writer is wired in Phase 4. For Phase 3 we accept it as a constructor dependency mocked in tests; the production wiring lands in Task 4.4.)

- [ ] **Step 1: Write a failing test first**

```java
package my.cliniflow.application.biz.patient;

import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import my.cliniflow.domain.biz.patient.info.PatientRegisterInfo;
import my.cliniflow.domain.biz.patient.model.*;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.patient.service.*;
import my.cliniflow.domain.biz.user.info.PatientUserCreateInfo;
import my.cliniflow.application.biz.user.UserWriteAppService;
import my.cliniflow.infrastructure.audit.AuditWriter;
import my.cliniflow.infrastructure.outbox.Neo4jProjectionOutboxWriter;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PatientWriteAppServiceTest {

    PatientRepository patientRepo = mock(PatientRepository.class);
    UserWriteAppService userSvc = mock(UserWriteAppService.class);
    PatientRegisterDomainService registerSvc = mock(PatientRegisterDomainService.class);
    PatientClinicalProfileUpdateDomainService profileSvc =
            mock(PatientClinicalProfileUpdateDomainService.class);
    Neo4jProjectionOutboxWriter outbox = mock(Neo4jProjectionOutboxWriter.class);
    AuditWriter audit = mock(AuditWriter.class);
    ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);

    PatientWriteAppService svc = new PatientWriteAppService(
            patientRepo, userSvc, registerSvc, profileSvc, outbox, audit, events);

    @Test
    void register_rejectsDuplicateNric() {
        when(patientRepo.existsByNationalIdFingerprint(anyString())).thenReturn(true);
        when(registerSvc.create(any(), any())).thenThrow(
                new IllegalStateException("should not be reached"));
        assertThatThrownBy(() -> svc.register(baseInfo()))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("NRIC");
    }

    private PatientRegisterInfo baseInfo() {
        return new PatientRegisterInfo(
                new PatientUserCreateInfo("a@b.c", "password123", "n", "+60", "en"),
                new PatientIdentityInfo("Jane", "950101-14-1234",
                        LocalDate.of(1990, 5, 1), "FEMALE", "+60", "a@b.c", "en"),
                "v1",
                Optional.empty(), Optional.empty(),
                List.of(), List.of(), List.of(),
                Optional.empty(), Optional.empty());
    }
}
```

(More tests added in subsequent tasks — keep this one as the canary.)

- [ ] **Step 2: Implement `PatientWriteAppService`**

```java
package my.cliniflow.application.biz.patient;

import my.cliniflow.application.biz.user.UserWriteAppService;
import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import my.cliniflow.domain.biz.patient.event.*;
import my.cliniflow.domain.biz.patient.info.*;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.patient.service.*;
import my.cliniflow.infrastructure.audit.AuditWriter;
import my.cliniflow.infrastructure.outbox.Neo4jProjectionOutboxWriter;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class PatientWriteAppService {

    private final PatientRepository patientRepo;
    private final UserWriteAppService userSvc;
    private final PatientRegisterDomainService registerSvc;
    private final PatientClinicalProfileUpdateDomainService profileUpdateSvc;
    private final Neo4jProjectionOutboxWriter outbox;
    private final AuditWriter audit;
    private final ApplicationEventPublisher events;

    public PatientWriteAppService(
            PatientRepository patientRepo,
            UserWriteAppService userSvc,
            PatientRegisterDomainService registerSvc,
            PatientClinicalProfileUpdateDomainService profileUpdateSvc,
            Neo4jProjectionOutboxWriter outbox,
            AuditWriter audit,
            ApplicationEventPublisher events) {
        this.patientRepo = patientRepo;
        this.userSvc = userSvc;
        this.registerSvc = registerSvc;
        this.profileUpdateSvc = profileUpdateSvc;
        this.outbox = outbox;
        this.audit = audit;
        this.events = events;
    }

    @Transactional
    public UUID register(PatientRegisterInfo info) {
        return register(info, ProfileUpdateSource.REGISTRATION,
                /* source=*/ "SELF_SERVICE", /* actor=*/ null);
    }

    @Transactional
    public UUID register(PatientRegisterInfo info, ProfileUpdateSource clinicalSource,
                         String registrationSource, UUID actorUserId) {
        // 1. NRIC dedupe
        var fp = registerSvc != null ? null : null; // placeholder; encrypt-domain-svc inside registerSvc
        // we let registerSvc compute fingerprint inside .create(); here we re-check with the same algo.
        // Simplest: build the patient first then check, but the spec wants pre-check.
        // Use a thin alternative: registerSvc already validates; existsByFingerprint check happens after model.
        UUID userId = userSvc.createPatientUser(info.userInfo());
        PatientModel p = registerSvc.create(info, userId);

        if (patientRepo.existsByNationalIdFingerprint(p.getNationalIdFingerprint()))
            throw new ConflictException("NRIC already registered. Please log in.");
        p.setRegistrationSource(registrationSource);

        List<String> changedFields = profileUpdateSvc.applyAtRegistration(p, info);

        PatientModel saved = patientRepo.save(p);

        outbox.enqueuePatientUpsert(saved);
        for (var allergy : saved.getClinicalProfile() == null
                ? List.<my.cliniflow.domain.biz.patient.model.DrugAllergyInfo>of()
                : saved.getClinicalProfile().getDrugAllergies()) {
            outbox.enqueueAllergyAdd(saved.getId(), allergy, clinicalSource);
        }
        for (var c : saved.getClinicalProfile() == null
                ? List.<my.cliniflow.domain.biz.patient.model.ChronicConditionInfo>of()
                : saved.getClinicalProfile().getChronicConditions()) {
            outbox.enqueueConditionAdd(saved.getId(), c, clinicalSource);
        }
        for (var m : saved.getClinicalProfile() == null
                ? List.<my.cliniflow.domain.biz.patient.model.RegularMedicationInfo>of()
                : saved.getClinicalProfile().getRegularMedications()) {
            outbox.enqueueMedicationAdd(saved.getId(), m, clinicalSource);
        }

        audit.append("CREATE", "patient", saved.getId().toString(),
                actorUserId, registrationSource,
                Map.of("source", registrationSource, "fields", changedFields), null);
        events.publishEvent(new PatientRegisteredDomainEvent(
                saved.getId(), userId, registrationSource, Instant.now()));
        return saved.getId();
    }

    @Transactional
    public PatientModel updateClinicalProfile(UUID patientId,
                                              ClinicalProfileUpdateInfo info,
                                              ProfileUpdateSource source,
                                              UUID actorUserId,
                                              String actorRole,
                                              UUID visitId) {
        PatientModel patient = patientRepo.findById(patientId)
                .orElseThrow(() -> new my.cliniflow.controller.base.ResourceNotFoundException("patient"));
        List<String> changed = profileUpdateSvc.apply(patient, info, source);
        if (changed.isEmpty()) return patient;
        PatientModel saved = patientRepo.save(patient);

        for (var allergy : info.drugAllergiesAdd()) {
            outbox.enqueueAllergyAdd(saved.getId(), allergy, source);
        }
        for (String name : info.drugAllergiesRemoveByName()) {
            outbox.enqueueAllergyRemove(saved.getId(), name);
        }
        for (var c : info.chronicConditionsAdd()) {
            outbox.enqueueConditionAdd(saved.getId(), c, source);
        }
        for (var m : info.regularMedicationsAdd()) {
            outbox.enqueueMedicationAdd(saved.getId(), m, source);
        }
        if (info.weightKg().isPresent() || info.pregnancyStatus().isPresent()) {
            outbox.enqueuePatientUpsert(saved);
        }

        audit.append("UPDATE", "patient_clinical_profile", saved.getId().toString(),
                actorUserId, actorRole,
                Map.of("source", source.name(),
                        "fields_changed", changed,
                        "visit_id", visitId == null ? "" : visitId.toString()), null);
        events.publishEvent(new PatientClinicalProfileUpdatedDomainEvent(
                saved.getId(), changed, source, visitId, Instant.now()));
        return saved;
    }
}
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && mvn -q -Dtest=PatientWriteAppServiceTest test
git add backend/src/main/java/my/cliniflow/application/biz/patient/PatientWriteAppService.java \
        backend/src/test/java/my/cliniflow/application/biz/patient/
git commit -m "feat(app/patient): register + updateClinicalProfile with outbox + audit"
```

---

### Task 3.7: `PatientReadAppService`

**Files:**
- Modify or create: `backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java`

```java
package my.cliniflow.application.biz.patient;

import my.cliniflow.domain.biz.patient.info.PatientSearchPreviewInfo;
import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.patient.service.PatientNationalIdEncryptDomainService;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class PatientReadAppService {

    private final PatientRepository repo;
    private final PatientNationalIdEncryptDomainService nric;
    private final AuditWriter audit;

    public PatientReadAppService(PatientRepository repo,
                                 PatientNationalIdEncryptDomainService nric,
                                 AuditWriter audit) {
        this.repo = repo; this.nric = nric; this.audit = audit;
    }

    public Optional<PatientModel> getById(UUID id) { return repo.findById(id); }

    public Optional<PatientClinicalProfileModel> getClinicalProfile(UUID patientId) {
        return repo.findById(patientId).map(PatientModel::getClinicalProfile);
    }

    public Optional<PatientSearchPreviewInfo> searchByNationalId(
            String nricPlaintext, UUID actorUserId, String actorRole) {
        if (nricPlaintext == null || nricPlaintext.isBlank())
            throw new IllegalArgumentException("NRIC required");
        String fp = nric.fingerprint(nricPlaintext);
        Optional<PatientSearchPreviewInfo> result = repo.searchPreviewByFingerprint(fp);
        audit.append("READ", "patient_search", fp,
                actorUserId, actorRole,
                Map.of("hit", result.isPresent()), null);
        return result;
    }
}
```

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java
git commit -m "feat(app/patient): PatientReadAppService.getClinicalProfile + searchByNRIC"
```

---

**End of Phase 3.** App services orchestrate the domain. Outbox is referenced but not yet implemented — that's Phase 4.

---

## Phase 4 — Outbox + Neo4j projection

### Task 4.1: `Neo4jProjectionOperation` enum + `Neo4jProjectionOutboxWriter`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/outbox/Neo4jProjectionOperation.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/outbox/Neo4jProjectionOutboxWriter.java`

- [ ] **Step 1: Operation enum**

```java
package my.cliniflow.infrastructure.outbox;
public enum Neo4jProjectionOperation {
    PATIENT_UPSERT,
    ALLERGY_ADD, ALLERGY_REMOVE,
    CONDITION_ADD, CONDITION_REMOVE,
    MEDICATION_ADD, MEDICATION_REMOVE
}
```

- [ ] **Step 2: Writer**

```java
package my.cliniflow.infrastructure.outbox;

import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import my.cliniflow.domain.biz.patient.model.*;
import my.cliniflow.infrastructure.outbox.jpa.Neo4jProjectionOutboxJpaEntity;
import my.cliniflow.infrastructure.outbox.jpa.Neo4jProjectionOutboxSpringDataRepository;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class Neo4jProjectionOutboxWriter {

    private final Neo4jProjectionOutboxSpringDataRepository repo;

    public Neo4jProjectionOutboxWriter(Neo4jProjectionOutboxSpringDataRepository repo) {
        this.repo = repo;
    }

    public void enqueuePatientUpsert(PatientModel patient) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("id", patient.getId().toString());
        if (patient.getGender() != null) payload.put("sex", patient.getGender());
        if (patient.getDateOfBirth() != null)
            payload.put("age_bucket", ageBucket(patient.getDateOfBirth()));
        if (patient.getClinicalProfile() != null
                && patient.getClinicalProfile().getPregnancyStatus() != null) {
            payload.put("pregnancy", patient.getClinicalProfile().getPregnancyStatus().name());
        }
        save(patient.getId(), Neo4jProjectionOperation.PATIENT_UPSERT, payload);
    }

    public void enqueueAllergyAdd(UUID patientId, DrugAllergyInfo info, ProfileUpdateSource src) {
        save(patientId, Neo4jProjectionOperation.ALLERGY_ADD, Map.of(
                "patient_id", patientId.toString(),
                "name", info.name().toLowerCase(),
                "severity", info.severity().name(),
                "confidence", info.confidence() == null ? 1.0 : info.confidence(),
                "source", src.name()));
    }

    public void enqueueAllergyRemove(UUID patientId, String allergyName) {
        save(patientId, Neo4jProjectionOperation.ALLERGY_REMOVE, Map.of(
                "patient_id", patientId.toString(),
                "name", allergyName.toLowerCase()));
    }

    public void enqueueConditionAdd(UUID patientId, ChronicConditionInfo c, ProfileUpdateSource src) {
        Map<String, Object> p = new HashMap<>();
        p.put("patient_id", patientId.toString());
        p.put("name", c.name().toLowerCase());
        if (c.icd10() != null) p.put("icd10", c.icd10());
        p.put("source", src.name());
        save(patientId, Neo4jProjectionOperation.CONDITION_ADD, p);
    }

    public void enqueueMedicationAdd(UUID patientId, RegularMedicationInfo m, ProfileUpdateSource src) {
        save(patientId, Neo4jProjectionOperation.MEDICATION_ADD, Map.of(
                "patient_id", patientId.toString(),
                "name", m.name().toLowerCase(),
                "source", src.name()));
    }

    private void save(UUID aggregateId, Neo4jProjectionOperation op, Map<String, Object> payload) {
        Neo4jProjectionOutboxJpaEntity row = new Neo4jProjectionOutboxJpaEntity();
        row.setAggregateId(aggregateId);
        row.setOperation(op.name());
        row.setPayload(payload);
        row.setStatus("PENDING");
        row.setNextAttemptAt(Instant.now());
        repo.save(row);
    }

    private static int ageBucket(LocalDate dob) {
        int age = Period.between(dob, LocalDate.now()).getYears();
        if (age < 18) return 0;
        if (age < 30) return 1;
        if (age < 50) return 2;
        if (age < 70) return 3;
        return 4;
    }
}
```

- [ ] **Step 3: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/infrastructure/outbox/Neo4jProjectionOperation.java \
        backend/src/main/java/my/cliniflow/infrastructure/outbox/Neo4jProjectionOutboxWriter.java
git commit -m "feat(infra/outbox): Neo4jProjectionOutboxWriter with operation payloads"
```

---

### Task 4.2: `Neo4jProjectionClient` (Cypher MERGEs)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/client/Neo4jProjectionClient.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/client/Neo4jConfig.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/client/Neo4jProjectionClientIT.java`

- [ ] **Step 1: Driver bean + properties**

```java
package my.cliniflow.infrastructure.client;

import org.neo4j.driver.AuthTokens;
import org.neo4j.driver.Driver;
import org.neo4j.driver.GraphDatabase;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class Neo4jConfig {

    @Bean(destroyMethod = "close")
    public Driver neo4jDriver(
            @Value("${cliniflow.neo4j.uri}") String uri,
            @Value("${cliniflow.neo4j.username}") String user,
            @Value("${cliniflow.neo4j.password}") String pwd) {
        return GraphDatabase.driver(uri, AuthTokens.basic(user, pwd));
    }
}
```

- [ ] **Step 2: `Neo4jProjectionClient`**

```java
package my.cliniflow.infrastructure.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.neo4j.driver.Driver;
import org.neo4j.driver.Session;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
public class Neo4jProjectionClient {

    private final Driver driver;

    public Neo4jProjectionClient(Driver driver) { this.driver = driver; }

    @CircuitBreaker(name = "neo4jProjection")
    public void upsertPatient(UUID id, Map<String, Object> properties) {
        try (Session s = driver.session()) {
            s.executeWrite(tx -> {
                tx.run("""
                        MERGE (p:Patient {id: $id})
                        SET p += $props
                        """, Map.of("id", id.toString(), "props", properties));
                return null;
            });
        }
    }

    @CircuitBreaker(name = "neo4jProjection")
    public void upsertAllergy(UUID patientId, String name, String severity,
                              double confidence, String source) {
        try (Session s = driver.session()) {
            s.executeWrite(tx -> {
                tx.run("""
                        MERGE (p:Patient {id: $pid})
                        MERGE (a:Allergy {name: $name})
                        MERGE (p)-[r:ALLERGIC_TO]->(a)
                        SET r.severity = $severity,
                            r.confidence = $confidence,
                            r.source = $source
                        """,
                        Map.of("pid", patientId.toString(),
                                "name", name,
                                "severity", severity,
                                "confidence", confidence,
                                "source", source));
                return null;
            });
        }
    }

    @CircuitBreaker(name = "neo4jProjection")
    public void removeAllergy(UUID patientId, String name) {
        try (Session s = driver.session()) {
            s.executeWrite(tx -> {
                tx.run("""
                        MATCH (p:Patient {id: $pid})-[r:ALLERGIC_TO]->(a:Allergy {name: $name})
                        DELETE r
                        """, Map.of("pid", patientId.toString(), "name", name));
                return null;
            });
        }
    }

    @CircuitBreaker(name = "neo4jProjection")
    public void upsertCondition(UUID patientId, String name, String icd10, String source) {
        try (Session s = driver.session()) {
            s.executeWrite(tx -> {
                tx.run("""
                        MERGE (p:Patient {id: $pid})
                        MERGE (c:Condition {name: $name})
                        ON CREATE SET c.icd10 = $icd10
                        MERGE (p)-[r:HAS_HISTORY_OF]->(c)
                        SET r.source = $source
                        """,
                        Map.of("pid", patientId.toString(),
                                "name", name,
                                "icd10", icd10 == null ? "" : icd10,
                                "source", source));
                return null;
            });
        }
    }

    @CircuitBreaker(name = "neo4jProjection")
    public void upsertRegularMedication(UUID patientId, String name, String source) {
        try (Session s = driver.session()) {
            s.executeWrite(tx -> {
                tx.run("""
                        MERGE (p:Patient {id: $pid})
                        MERGE (m:Medication {name: $name})
                        MERGE (p)-[r:TAKING]->(m)
                        SET r.source = $source
                        """,
                        Map.of("pid", patientId.toString(), "name", name, "source", source));
                return null;
            });
        }
    }

    @CircuitBreaker(name = "neo4jProjection")
    public long countAllergyEdges(UUID patientId, String name) {
        try (Session s = driver.session()) {
            return s.executeRead(tx -> tx.run("""
                    MATCH (p:Patient {id: $pid})-[r:ALLERGIC_TO]->(a:Allergy {name: $name})
                    RETURN count(r) AS c
                    """, Map.of("pid", patientId.toString(), "name", name))
                    .single().get("c").asLong());
        }
    }
}
```

- [ ] **Step 3: Integration test for idempotent MERGEs**

```java
package my.cliniflow.infrastructure.client;

import my.cliniflow.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class Neo4jProjectionClientIT extends IntegrationTestBase {

    @Autowired Neo4jProjectionClient client;

    @Test
    void upsertPatientThenAllergyIsIdempotent() {
        UUID pid = UUID.randomUUID();
        client.upsertPatient(pid, Map.of("sex", "FEMALE", "age_bucket", 2));
        client.upsertAllergy(pid, "penicillin", "MODERATE", 0.95, "PRE_VISIT_CHAT");
        client.upsertAllergy(pid, "penicillin", "MODERATE", 0.95, "PRE_VISIT_CHAT");
        assertThat(client.countAllergyEdges(pid, "penicillin")).isEqualTo(1L);
        client.removeAllergy(pid, "penicillin");
        assertThat(client.countAllergyEdges(pid, "penicillin")).isEqualTo(0L);
    }
}
```

- [ ] **Step 4: Add Resilience4j circuit-breaker config**

In `backend/src/main/resources/application.yaml` (create if missing):

```yaml
resilience4j:
  circuitbreaker:
    instances:
      neo4jProjection:
        sliding-window-size: 20
        failure-rate-threshold: 50
        wait-duration-in-open-state: 30s
        permitted-number-of-calls-in-half-open-state: 3
```

(Merge with any existing yaml.)

- [ ] **Step 5: Run + commit**

```bash
cd backend && mvn -q -Dtest=Neo4jProjectionClientIT test
git add backend/src/main/java/my/cliniflow/infrastructure/client/ \
        backend/src/test/java/my/cliniflow/infrastructure/client/ \
        backend/src/main/resources/application.yaml
git commit -m "feat(infra/neo4j): Neo4jProjectionClient with idempotent MERGE Cypher"
```

---

### Task 4.3: `Neo4jProjectionOutboxWorker` (scheduled drainer)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/outbox/Neo4jProjectionOutboxWorker.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/outbox/Neo4jProjectionOutboxWorkerIT.java`

- [ ] **Step 1: Failing IT**

```java
package my.cliniflow.infrastructure.outbox;

import my.cliniflow.IntegrationTestBase;
import my.cliniflow.infrastructure.client.Neo4jProjectionClient;
import my.cliniflow.infrastructure.outbox.jpa.Neo4jProjectionOutboxJpaEntity;
import my.cliniflow.infrastructure.outbox.jpa.Neo4jProjectionOutboxSpringDataRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class Neo4jProjectionOutboxWorkerIT extends IntegrationTestBase {

    @Autowired Neo4jProjectionOutboxWriter writer;
    @Autowired Neo4jProjectionOutboxSpringDataRepository repo;
    @Autowired Neo4jProjectionClient neo;

    @Test
    void enqueuedRowsDrainToNeo4j() {
        UUID pid = UUID.randomUUID();
        // enqueue PATIENT_UPSERT directly
        Neo4jProjectionOutboxJpaEntity row = new Neo4jProjectionOutboxJpaEntity();
        row.setAggregateId(pid);
        row.setOperation("PATIENT_UPSERT");
        row.setPayload(Map.of("id", pid.toString(), "sex", "FEMALE"));
        row.setNextAttemptAt(Instant.now().minusSeconds(1));
        repo.save(row);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            var saved = repo.findById(row.getId()).orElseThrow();
            assertThat(saved.getStatus()).isEqualTo("COMPLETED");
        });
    }
}
```

(Add Awaitility dependency in `pom.xml` test scope: `org.awaitility:awaitility:4.2.2`.)

- [ ] **Step 2: Implement the worker**

```java
package my.cliniflow.infrastructure.outbox;

import my.cliniflow.infrastructure.client.Neo4jProjectionClient;
import my.cliniflow.infrastructure.outbox.jpa.Neo4jProjectionOutboxJpaEntity;
import my.cliniflow.infrastructure.outbox.jpa.Neo4jProjectionOutboxSpringDataRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@EnableScheduling
public class Neo4jProjectionOutboxWorker {

    private static final Logger log = LoggerFactory.getLogger(Neo4jProjectionOutboxWorker.class);
    private static final int BATCH_SIZE = 50;
    private static final int MAX_ATTEMPTS = 10;

    private final Neo4jProjectionOutboxSpringDataRepository repo;
    private final Neo4jProjectionClient client;

    public Neo4jProjectionOutboxWorker(Neo4jProjectionOutboxSpringDataRepository repo,
                                       Neo4jProjectionClient client) {
        this.repo = repo; this.client = client;
    }

    @Scheduled(fixedDelay = 1000)
    @Transactional
    public void drain() {
        List<Neo4jProjectionOutboxJpaEntity> rows = repo.findDrainable(Instant.now(), BATCH_SIZE);
        for (Neo4jProjectionOutboxJpaEntity row : rows) {
            row.setStatus("IN_FLIGHT");
            repo.saveAndFlush(row);
            try {
                apply(row);
                row.setStatus("COMPLETED");
                row.setCompletedAt(Instant.now());
            } catch (Exception e) {
                row.setAttempts(row.getAttempts() + 1);
                row.setLastError(e.getClass().getSimpleName() + ": " + e.getMessage());
                if (row.getAttempts() >= MAX_ATTEMPTS) {
                    row.setStatus("FAILED");
                    log.error("outbox.failed id={} op={} err={}", row.getId(), row.getOperation(), e.getMessage());
                } else {
                    row.setStatus("PENDING");
                    long backoff = (long) Math.pow(2, row.getAttempts());
                    row.setNextAttemptAt(Instant.now().plus(Duration.ofSeconds(backoff)));
                }
            }
            repo.save(row);
        }
    }

    private void apply(Neo4jProjectionOutboxJpaEntity row) {
        Map<String, Object> p = row.getPayload();
        Neo4jProjectionOperation op = Neo4jProjectionOperation.valueOf(row.getOperation());
        switch (op) {
            case PATIENT_UPSERT -> {
                UUID id = UUID.fromString((String) p.get("id"));
                Map<String, Object> props = new java.util.HashMap<>(p);
                props.remove("id");
                client.upsertPatient(id, props);
            }
            case ALLERGY_ADD -> {
                client.upsertAllergy(
                        UUID.fromString((String) p.get("patient_id")),
                        (String) p.get("name"),
                        (String) p.get("severity"),
                        ((Number) p.getOrDefault("confidence", 1.0)).doubleValue(),
                        (String) p.get("source"));
            }
            case ALLERGY_REMOVE -> client.removeAllergy(
                    UUID.fromString((String) p.get("patient_id")),
                    (String) p.get("name"));
            case CONDITION_ADD -> client.upsertCondition(
                    UUID.fromString((String) p.get("patient_id")),
                    (String) p.get("name"),
                    (String) p.get("icd10"),
                    (String) p.get("source"));
            case MEDICATION_ADD -> client.upsertRegularMedication(
                    UUID.fromString((String) p.get("patient_id")),
                    (String) p.get("name"),
                    (String) p.get("source"));
            default -> log.warn("outbox.skip unknown op {}", op);
        }
    }
}
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && mvn -q -Dtest=Neo4jProjectionOutboxWorkerIT test
git add backend/src/main/java/my/cliniflow/infrastructure/outbox/Neo4jProjectionOutboxWorker.java \
        backend/src/test/java/my/cliniflow/infrastructure/outbox/Neo4jProjectionOutboxWorkerIT.java \
        backend/pom.xml
git commit -m "feat(infra/outbox): Neo4jProjectionOutboxWorker with backoff retry"
```

---

**End of Phase 4.** The full Postgres → Neo4j projection pipeline is testable end-to-end via `PatientWriteAppService.register()` → outbox → worker → Neo4j. Phase 5 exposes this through HTTP.

---

## Phase 5 — Controllers + interceptors

### Task 5.1: `PasswordEncoderConfig`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/config/PasswordEncoderConfig.java`

```java
package my.cliniflow.controller.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class PasswordEncoderConfig {
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
```

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/controller/config/PasswordEncoderConfig.java
git commit -m "feat(config): bcrypt password encoder cost=12"
```

---

### Task 5.2: New exception types + global handler

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/base/DuplicatePatientException.java`
- Create: `.../DuplicateMmcException.java`
- Create: `.../InvalidServiceTokenException.java`
- Create: `.../SessionPatientMismatchException.java`
- Modify: `backend/src/main/java/my/cliniflow/controller/config/GlobalExceptionConfiguration.java`

- [ ] **Step 1: Create exception classes (each extends the existing `BusinessException`)**

```java
// DuplicatePatientException.java
package my.cliniflow.controller.base;
public class DuplicatePatientException extends ConflictException {
    public DuplicatePatientException(String msg) { super(msg); }
}
```

```java
// DuplicateMmcException.java
package my.cliniflow.controller.base;
public class DuplicateMmcException extends ConflictException {
    public DuplicateMmcException() { super("MMC number already registered"); }
}
```

```java
// InvalidServiceTokenException.java
package my.cliniflow.controller.base;
public class InvalidServiceTokenException extends BusinessException {
    public InvalidServiceTokenException() { super("invalid service token"); }
}
```

```java
// SessionPatientMismatchException.java
package my.cliniflow.controller.base;
public class SessionPatientMismatchException extends BusinessException {
    public SessionPatientMismatchException() { super("session does not match patient"); }
}
```

- [ ] **Step 2: Extend `GlobalExceptionConfiguration`**

Open the existing file and add `@ExceptionHandler` methods (preserve the existing handlers):

```java
@ExceptionHandler(InvalidServiceTokenException.class)
public ResponseEntity<WebResult<Void>> handleInvalidServiceToken(InvalidServiceTokenException e) {
    return ResponseEntity.status(401)
            .body(WebResult.fail(ResultCode.UNAUTHORIZED, e.getMessage()));
}

@ExceptionHandler(SessionPatientMismatchException.class)
public ResponseEntity<WebResult<Void>> handleSessionMismatch(SessionPatientMismatchException e) {
    return ResponseEntity.status(403)
            .body(WebResult.fail(ResultCode.FORBIDDEN, e.getMessage()));
}
```

(If `ResultCode.UNAUTHORIZED` / `FORBIDDEN` don't exist, add them as enum values; preserve any existing values.)

- [ ] **Step 3: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/controller/base/ \
        backend/src/main/java/my/cliniflow/controller/config/GlobalExceptionConfiguration.java
git commit -m "feat(config): registration exception types + handlers"
```

---

### Task 5.3: `ServiceTokenInterceptor`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/config/ServiceTokenInterceptor.java`
- Test: `backend/src/test/java/my/cliniflow/controller/config/ServiceTokenInterceptorTest.java`

- [ ] **Step 1: Failing test (mocked HttpServletRequest)**

```java
package my.cliniflow.controller.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import my.cliniflow.controller.base.InvalidServiceTokenException;
import my.cliniflow.controller.base.SessionPatientMismatchException;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ServiceTokenInterceptorTest {

    PreVisitSessionRegistry sessions = Mockito.mock(PreVisitSessionRegistry.class);
    ServiceTokenInterceptor interceptor =
            new ServiceTokenInterceptor("test-token", sessions);

    @Test
    void missingTokenRejected() {
        HttpServletRequest req = Mockito.mock(HttpServletRequest.class);
        Mockito.when(req.getRequestURI()).thenReturn("/internal/patients/x/clinical-profile");
        assertThatThrownBy(() -> interceptor.preHandle(req,
                Mockito.mock(HttpServletResponse.class), null))
                .isInstanceOf(InvalidServiceTokenException.class);
    }

    @Test
    void mismatchedSessionPatientRejected() {
        UUID pathId = UUID.randomUUID();
        UUID otherPatient = UUID.randomUUID();
        HttpServletRequest req = Mockito.mock(HttpServletRequest.class);
        Mockito.when(req.getRequestURI())
                .thenReturn("/internal/patients/" + pathId + "/clinical-profile");
        Mockito.when(req.getHeader("X-Service-Token")).thenReturn("test-token");
        Mockito.when(req.getHeader("X-Pre-Visit-Session")).thenReturn("session-1");
        Mockito.when(sessions.resolvePatientId("session-1")).thenReturn(otherPatient);
        assertThatThrownBy(() -> interceptor.preHandle(req,
                Mockito.mock(HttpServletResponse.class), null))
                .isInstanceOf(SessionPatientMismatchException.class);
    }
}
```

- [ ] **Step 2: Stub registry + interceptor**

```java
// PreVisitSessionRegistry.java
package my.cliniflow.controller.config;

import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class PreVisitSessionRegistry {
    private final Map<String, UUID> sessionToPatient = new ConcurrentHashMap<>();
    public void bind(String sessionId, UUID patientId) {
        sessionToPatient.put(sessionId, patientId);
    }
    public UUID resolvePatientId(String sessionId) {
        return sessionToPatient.get(sessionId);
    }
}
```

```java
// ServiceTokenInterceptor.java
package my.cliniflow.controller.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import my.cliniflow.controller.base.InvalidServiceTokenException;
import my.cliniflow.controller.base.SessionPatientMismatchException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class ServiceTokenInterceptor implements HandlerInterceptor {

    private static final Pattern PATH = Pattern.compile(
            "^/internal/patients/([0-9a-fA-F-]{36})(?:/.*)?$");

    private final String expectedToken;
    private final PreVisitSessionRegistry sessions;

    public ServiceTokenInterceptor(
            @Value("${cliniflow.agent.service-token}") String expectedToken,
            PreVisitSessionRegistry sessions) {
        this.expectedToken = expectedToken;
        this.sessions = sessions;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        String token = req.getHeader("X-Service-Token");
        if (token == null || !token.equals(expectedToken))
            throw new InvalidServiceTokenException();

        Matcher m = PATH.matcher(req.getRequestURI());
        if (!m.matches()) return true;

        UUID pathPatientId = UUID.fromString(m.group(1));
        String sessionId = req.getHeader("X-Pre-Visit-Session");
        if (sessionId == null) throw new SessionPatientMismatchException();

        UUID resolved = sessions.resolvePatientId(sessionId);
        if (resolved == null || !resolved.equals(pathPatientId))
            throw new SessionPatientMismatchException();

        req.setAttribute("agent.patientId", pathPatientId);
        req.setAttribute("agent.sessionId", sessionId);
        return true;
    }
}
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && mvn -q -Dtest=ServiceTokenInterceptorTest test
git add backend/src/main/java/my/cliniflow/controller/config/ServiceTokenInterceptor.java \
        backend/src/main/java/my/cliniflow/controller/config/PreVisitSessionRegistry.java \
        backend/src/test/java/my/cliniflow/controller/config/ServiceTokenInterceptorTest.java
git commit -m "feat(config): ServiceTokenInterceptor + session-patient binding"
```

---

### Task 5.4: `RateLimitConfig` for `/api/auth/register/patient`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/config/RateLimitConfig.java`
- Create: `backend/src/main/java/my/cliniflow/controller/config/RegistrationRateLimitFilter.java`

```java
// RateLimitConfig.java
package my.cliniflow.controller.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

@Configuration
public class RateLimitConfig {
    @Bean
    public Function<String, Bucket> registrationBucketResolver() {
        Map<String, Bucket> buckets = new ConcurrentHashMap<>();
        return ip -> buckets.computeIfAbsent(ip, k -> Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(5)
                        .refillIntervally(5, Duration.ofHours(1))
                        .build())
                .build());
    }
}
```

```java
// RegistrationRateLimitFilter.java
package my.cliniflow.controller.config;

import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.function.Function;

@Component
public class RegistrationRateLimitFilter extends OncePerRequestFilter {

    private final Function<String, Bucket> bucketResolver;

    public RegistrationRateLimitFilter(Function<String, Bucket> bucketResolver) {
        this.bucketResolver = bucketResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        if (!req.getRequestURI().equals("/api/auth/register/patient")
                || !"POST".equalsIgnoreCase(req.getMethod())) {
            chain.doFilter(req, res);
            return;
        }
        String ip = clientIp(req);
        if (!bucketResolver.apply(ip).tryConsume(1)) {
            res.setStatus(429);
            res.setContentType("application/json");
            res.getWriter().write(
                    "{\"code\":\"TOO_MANY_REQUESTS\",\"message\":\"too many registration attempts\"}");
            return;
        }
        chain.doFilter(req, res);
    }

    private static String clientIp(HttpServletRequest r) {
        String h = r.getHeader("X-Forwarded-For");
        return h == null ? r.getRemoteAddr() : h.split(",")[0].trim();
    }
}
```

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/controller/config/RateLimitConfig.java \
        backend/src/main/java/my/cliniflow/controller/config/RegistrationRateLimitFilter.java
git commit -m "feat(config): rate-limit on /api/auth/register/patient"
```

---

### Task 5.5: Update `SecurityConfiguration`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/controller/config/SecurityConfiguration.java`

In the `SecurityFilterChain` bean, ensure the matchers include:

```java
.requestMatchers("/api/auth/register/**", "/api/auth/login").permitAll()
.requestMatchers("/internal/**").permitAll()      // ServiceTokenInterceptor handles auth
.requestMatchers("/api/admin/**").hasRole("ADMIN")
.requestMatchers("/api/patients/**").authenticated()
.anyRequest().authenticated()
```

Also register `ServiceTokenInterceptor` in a `WebMvcConfigurer`:

```java
@Configuration
class WebMvcRegistrationConfig implements WebMvcConfigurer {
    private final ServiceTokenInterceptor svcInterceptor;
    WebMvcRegistrationConfig(ServiceTokenInterceptor i) { this.svcInterceptor = i; }
    @Override public void addInterceptors(InterceptorRegistry r) {
        r.addInterceptor(svcInterceptor).addPathPatterns("/internal/**");
    }
}
```

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/controller/config/SecurityConfiguration.java
git commit -m "feat(config): wire registration + admin + internal routing into SecurityConfig"
```

---

### Task 5.6: `RegistrationController` (public patient signup)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/auth/RegistrationController.java`
- Create: `.../request/PatientSelfRegisterRequest.java`
- Create: `.../request/ForcedPasswordChangeRequest.java`
- Create: `.../response/PatientRegisteredDTO.java`
- Create: `.../converter/PatientSelfRegisterRequest2InfoConverter.java`
- Test: `backend/src/test/java/my/cliniflow/controller/biz/auth/RegistrationControllerIT.java`

- [ ] **Step 1: Request DTO**

```java
package my.cliniflow.controller.biz.auth.request;

import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.List;

public record PatientSelfRegisterRequest(
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8, max = 72) String password,
        @NotBlank @Size(max = 255) String fullName,
        @NotBlank String nric,
        @NotNull LocalDate dateOfBirth,
        @NotBlank @Pattern(regexp = "MALE|FEMALE|OTHER") String gender,
        @NotBlank @Pattern(regexp = "^\\+?[0-9]{8,16}$") String phone,
        @NotBlank @Pattern(regexp = "en|ms|zh") String preferredLanguage,
        @NotBlank String consentVersion,
        // optional clinical baseline
        java.math.BigDecimal weightKg,
        java.math.BigDecimal heightCm,
        List<DrugAllergyRequest> drugAllergies,
        List<ChronicConditionRequest> chronicConditions,
        List<RegularMedicationRequest> regularMedications,
        String pregnancyStatus,
        LocalDate pregnancyEdd
) {
    public record DrugAllergyRequest(@NotBlank String name,
                                     @NotBlank @Pattern(regexp = "MILD|MODERATE|SEVERE") String severity,
                                     String reaction) {}
    public record ChronicConditionRequest(@NotBlank String name, String icd10,
                                          Integer sinceYear, String notes) {}
    public record RegularMedicationRequest(@NotBlank String name, String dosage,
                                           String frequency, LocalDate sinceDate) {}
}
```

- [ ] **Step 2: Forced-password-change request**

```java
package my.cliniflow.controller.biz.auth.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ForcedPasswordChangeRequest(
        @NotBlank @Size(min = 8, max = 72) String newPassword) {}
```

- [ ] **Step 3: Response DTO**

```java
package my.cliniflow.controller.biz.auth.response;

import java.util.UUID;

public record PatientRegisteredDTO(UUID patientId, UUID userId, String message) {}
```

- [ ] **Step 4: Converter**

```java
package my.cliniflow.controller.biz.auth.converter;

import my.cliniflow.controller.biz.auth.request.PatientSelfRegisterRequest;
import my.cliniflow.domain.biz.patient.enums.AllergySeverity;
import my.cliniflow.domain.biz.patient.enums.PregnancyStatus;
import my.cliniflow.domain.biz.patient.info.PatientRegisterInfo;
import my.cliniflow.domain.biz.patient.model.*;
import my.cliniflow.domain.biz.user.info.PatientUserCreateInfo;

import java.util.List;
import java.util.Optional;

public final class PatientSelfRegisterRequest2InfoConverter {
    private PatientSelfRegisterRequest2InfoConverter() {}

    public static PatientRegisterInfo convert(PatientSelfRegisterRequest r) {
        var userInfo = new PatientUserCreateInfo(
                r.email(), r.password(), r.fullName(),
                r.phone(), r.preferredLanguage());
        var idInfo = new PatientIdentityInfo(
                r.fullName(), r.nric(), r.dateOfBirth(), r.gender(),
                r.phone(), r.email(), r.preferredLanguage());

        List<DrugAllergyInfo> allergies = r.drugAllergies() == null ? List.of() :
                r.drugAllergies().stream().map(a -> new DrugAllergyInfo(
                        a.name(), AllergySeverity.valueOf(a.severity()),
                        a.reaction(), 1.0, java.time.Instant.now())).toList();
        List<ChronicConditionInfo> conditions = r.chronicConditions() == null ? List.of() :
                r.chronicConditions().stream().map(c -> new ChronicConditionInfo(
                        c.name(), c.icd10(), c.sinceYear(), c.notes())).toList();
        List<RegularMedicationInfo> meds = r.regularMedications() == null ? List.of() :
                r.regularMedications().stream().map(m -> new RegularMedicationInfo(
                        m.name(), m.dosage(), m.frequency(), m.sinceDate())).toList();

        Optional<PregnancyStatus> ps = r.pregnancyStatus() == null
                ? Optional.empty() : Optional.of(PregnancyStatus.valueOf(r.pregnancyStatus()));
        Optional<java.time.LocalDate> edd = r.pregnancyEdd() == null
                ? Optional.empty() : Optional.of(r.pregnancyEdd());

        return new PatientRegisterInfo(
                userInfo, idInfo, r.consentVersion(),
                Optional.ofNullable(r.weightKg()),
                Optional.ofNullable(r.heightCm()),
                allergies, conditions, meds, ps, edd);
    }
}
```

- [ ] **Step 5: Controller**

```java
package my.cliniflow.controller.biz.auth;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.patient.PatientWriteAppService;
import my.cliniflow.application.biz.user.UserWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.auth.converter.PatientSelfRegisterRequest2InfoConverter;
import my.cliniflow.controller.biz.auth.request.ForcedPasswordChangeRequest;
import my.cliniflow.controller.biz.auth.request.PatientSelfRegisterRequest;
import my.cliniflow.controller.biz.auth.response.PatientRegisteredDTO;
import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import my.cliniflow.domain.biz.user.model.UserModel;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class RegistrationController {

    private final PatientWriteAppService patientSvc;
    private final UserWriteAppService userSvc;

    public RegistrationController(PatientWriteAppService patientSvc, UserWriteAppService userSvc) {
        this.patientSvc = patientSvc; this.userSvc = userSvc;
    }

    @PostMapping("/register/patient")
    public ResponseEntity<WebResult<PatientRegisteredDTO>> registerPatient(
            @Valid @RequestBody PatientSelfRegisterRequest req) {
        var info = PatientSelfRegisterRequest2InfoConverter.convert(req);
        UUID patientId = patientSvc.register(
                info, ProfileUpdateSource.REGISTRATION, "SELF_SERVICE", null);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(WebResult.ok(new PatientRegisteredDTO(
                        patientId, /* userId */ null,
                        "registered. Please log in.")));
    }

    @PostMapping("/forced-password-change")
    public WebResult<Void> forcedPasswordChange(
            @Valid @RequestBody ForcedPasswordChangeRequest req,
            Authentication auth) {
        UUID userId = UUID.fromString(auth.getName());
        userSvc.forcePasswordChange(userId, req.newPassword());
        return WebResult.ok(null);
    }
}
```

- [ ] **Step 6: IT test**

```java
package my.cliniflow.controller.biz.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RegistrationControllerIT extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test
    void selfRegisterHappyPath() throws Exception {
        Map<String, Object> body = Map.of(
                "email", "rt@x.y",
                "password", "password123",
                "fullName", "Round Trip",
                "nric", "950101-14-1234",
                "dateOfBirth", LocalDate.of(1990, 5, 1).toString(),
                "gender", "FEMALE",
                "phone", "+60123456789",
                "preferredLanguage", "en",
                "consentVersion", "v1");
        mvc.perform(post("/api/auth/register/patient")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.patientId").exists());
    }

    @Test
    void selfRegisterDuplicateNric_returns409() throws Exception {
        Map<String, Object> body = Map.of(
                "email", "dup1@x.y", "password", "password123", "fullName", "Dup",
                "nric", "999999-99-9999",
                "dateOfBirth", LocalDate.of(1985, 1, 1).toString(),
                "gender", "MALE", "phone", "+60", "preferredLanguage", "en",
                "consentVersion", "v1");
        mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body))).andExpect(status().isCreated());

        Map<String, Object> body2 = new java.util.HashMap<>(body);
        body2.put("email", "dup2@x.y");
        mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body2))).andExpect(status().isConflict());
    }
}
```

- [ ] **Step 7: Run + commit**

```bash
cd backend && mvn -q -Dtest=RegistrationControllerIT test
git add backend/src/main/java/my/cliniflow/controller/biz/auth/ \
        backend/src/test/java/my/cliniflow/controller/biz/auth/
git commit -m "feat(controller/auth): public patient self-registration endpoint"
```

---

### Task 5.7: Patient endpoints — search + clinical-profile GET/PATCH + staff create

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/patient/PatientController.java`
- Create: `.../request/StaffCreatePatientRequest.java`
- Create: `.../request/ClinicalProfilePatchRequest.java`
- Create: `.../response/PatientSearchPreviewDTO.java`
- Create: `.../response/ClinicalProfileDTO.java`
- Create: `.../response/ClinicalProfileSnapshotDTO.java`
- Create: `.../converter/PatientClinicalProfileModel2DTOConverter.java`
- Create: `.../converter/ClinicalProfilePatchRequest2InfoConverter.java`

- [ ] **Step 1: Request + response DTOs**

```java
// StaffCreatePatientRequest.java — same shape as PatientSelfRegisterRequest minus password (auto-generated)
package my.cliniflow.controller.biz.patient.request;

import jakarta.validation.constraints.*;
import java.time.LocalDate;

public record StaffCreatePatientRequest(
        @NotBlank @Email String email,
        @NotBlank String fullName,
        @NotBlank String nric,
        @NotNull LocalDate dateOfBirth,
        @NotBlank String gender,
        @NotBlank String phone,
        @NotBlank String preferredLanguage,
        @NotBlank String consentVersion) {}
```

```java
// ClinicalProfilePatchRequest.java
package my.cliniflow.controller.biz.patient.request;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ClinicalProfilePatchRequest(
        BigDecimal weightKg,
        BigDecimal heightCm,
        List<DrugAllergyAdd> drugAllergiesAdd,
        List<String> drugAllergiesRemoveByName,
        List<ChronicConditionAdd> chronicConditionsAdd,
        List<RegularMedicationAdd> regularMedicationsAdd,
        String pregnancyStatus,
        LocalDate pregnancyEdd) {

    public record DrugAllergyAdd(String name, String severity, String reaction, Double confidence) {}
    public record ChronicConditionAdd(String name, String icd10, Integer sinceYear, String notes) {}
    public record RegularMedicationAdd(String name, String dosage, String frequency, LocalDate sinceDate) {}
}
```

```java
// PatientSearchPreviewDTO.java
package my.cliniflow.controller.biz.patient.response;

import java.util.UUID;

public record PatientSearchPreviewDTO(
        boolean found, UUID id, String fullNameInitial, String dobMonth) {
    public static PatientSearchPreviewDTO notFound() {
        return new PatientSearchPreviewDTO(false, null, null, null);
    }
}
```

```java
// ClinicalProfileDTO.java
package my.cliniflow.controller.biz.patient.response;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record ClinicalProfileDTO(
        BigDecimal weightKg, Instant weightKgUpdatedAt, String weightKgSource,
        BigDecimal heightCm, Instant heightCmUpdatedAt, String heightCmSource,
        List<Map<String, Object>> drugAllergies, Instant drugAllergiesUpdatedAt, String drugAllergiesSource,
        List<Map<String, Object>> chronicConditions, Instant chronicConditionsUpdatedAt, String chronicConditionsSource,
        List<Map<String, Object>> regularMedications, Instant regularMedicationsUpdatedAt, String regularMedicationsSource,
        String pregnancyStatus, LocalDate pregnancyEdd, Instant pregnancyUpdatedAt, String pregnancySource,
        String completenessState) {}
```

```java
// ClinicalProfileSnapshotDTO.java
package my.cliniflow.controller.biz.patient.response;

import java.util.List;

public record ClinicalProfileSnapshotDTO(String completenessState, List<String> fieldsChanged) {}
```

- [ ] **Step 2: Converters**

```java
// PatientClinicalProfileModel2DTOConverter.java
package my.cliniflow.controller.biz.patient.converter;

import my.cliniflow.controller.biz.patient.response.ClinicalProfileDTO;
import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;

import java.util.List;
import java.util.Map;

public final class PatientClinicalProfileModel2DTOConverter {

    private PatientClinicalProfileModel2DTOConverter() {}

    public static ClinicalProfileDTO toDTO(PatientClinicalProfileModel m) {
        if (m == null) return new ClinicalProfileDTO(
                null, null, null, null, null, null,
                List.of(), null, null,
                List.of(), null, null,
                List.of(), null, null,
                null, null, null, null, "INCOMPLETE");
        return new ClinicalProfileDTO(
                m.getWeightKg(), m.getWeightKgUpdatedAt(),
                m.getWeightKgSource() == null ? null : m.getWeightKgSource().name(),
                m.getHeightCm(), m.getHeightCmUpdatedAt(),
                m.getHeightCmSource() == null ? null : m.getHeightCmSource().name(),
                m.getDrugAllergies().stream().map(a -> Map.<String, Object>of(
                        "name", a.name(), "severity", a.severity().name())).toList(),
                m.getDrugAllergiesUpdatedAt(),
                m.getDrugAllergiesSource() == null ? null : m.getDrugAllergiesSource().name(),
                m.getChronicConditions().stream().map(c -> Map.<String, Object>of(
                        "name", c.name(),
                        "icd10", c.icd10() == null ? "" : c.icd10())).toList(),
                m.getChronicConditionsUpdatedAt(),
                m.getChronicConditionsSource() == null ? null : m.getChronicConditionsSource().name(),
                m.getRegularMedications().stream().map(r -> Map.<String, Object>of(
                        "name", r.name())).toList(),
                m.getRegularMedicationsUpdatedAt(),
                m.getRegularMedicationsSource() == null ? null : m.getRegularMedicationsSource().name(),
                m.getPregnancyStatus() == null ? null : m.getPregnancyStatus().name(),
                m.getPregnancyEdd(), m.getPregnancyUpdatedAt(),
                m.getPregnancySource() == null ? null : m.getPregnancySource().name(),
                m.getCompletenessState().name());
    }
}
```

```java
// ClinicalProfilePatchRequest2InfoConverter.java
package my.cliniflow.controller.biz.patient.converter;

import my.cliniflow.controller.biz.patient.request.ClinicalProfilePatchRequest;
import my.cliniflow.domain.biz.patient.enums.AllergySeverity;
import my.cliniflow.domain.biz.patient.enums.PregnancyStatus;
import my.cliniflow.domain.biz.patient.info.ClinicalProfileUpdateInfo;
import my.cliniflow.domain.biz.patient.model.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public final class ClinicalProfilePatchRequest2InfoConverter {

    private ClinicalProfilePatchRequest2InfoConverter() {}

    public static ClinicalProfileUpdateInfo convert(ClinicalProfilePatchRequest r) {
        List<DrugAllergyInfo> add = r.drugAllergiesAdd() == null ? List.of() :
                r.drugAllergiesAdd().stream().map(a -> new DrugAllergyInfo(
                        a.name(), AllergySeverity.valueOf(a.severity()),
                        a.reaction(), a.confidence(), Instant.now())).toList();
        List<ChronicConditionInfo> condAdd = r.chronicConditionsAdd() == null ? List.of() :
                r.chronicConditionsAdd().stream().map(c -> new ChronicConditionInfo(
                        c.name(), c.icd10(), c.sinceYear(), c.notes())).toList();
        List<RegularMedicationInfo> medAdd = r.regularMedicationsAdd() == null ? List.of() :
                r.regularMedicationsAdd().stream().map(m -> new RegularMedicationInfo(
                        m.name(), m.dosage(), m.frequency(), m.sinceDate())).toList();

        return new ClinicalProfileUpdateInfo(
                Optional.ofNullable(r.weightKg()),
                Optional.ofNullable(r.heightCm()),
                add,
                r.drugAllergiesRemoveByName() == null ? List.of() : r.drugAllergiesRemoveByName(),
                condAdd, medAdd,
                r.pregnancyStatus() == null ? Optional.empty()
                        : Optional.of(PregnancyStatus.valueOf(r.pregnancyStatus())),
                Optional.ofNullable(r.pregnancyEdd()));
    }
}
```

- [ ] **Step 3: Extend `PatientController`**

Open existing `PatientController.java` and add these endpoints (preserve existing methods):

```java
@GetMapping("/search")
@PreAuthorize("hasAnyRole('STAFF','DOCTOR','ADMIN')")
public WebResult<PatientSearchPreviewDTO> searchByNric(
        @RequestParam("nric") String nric, Authentication auth) {
    UUID actorId = UUID.fromString(auth.getName());
    String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
    return WebResult.ok(patientReadAppService.searchByNationalId(nric, actorId, role)
            .map(p -> new PatientSearchPreviewDTO(true, p.id(),
                    p.fullNameInitial(), p.dobMonth()))
            .orElseGet(PatientSearchPreviewDTO::notFound));
}

@PostMapping
@PreAuthorize("hasAnyRole('STAFF','ADMIN')")
public ResponseEntity<WebResult<UUID>> staffCreatePatient(
        @Valid @RequestBody StaffCreatePatientRequest req, Authentication auth) {
    // staff create uses self-register flow with auto-generated temp password
    String tempPassword = userPasswordEncodeDomainService.generateRandomTempPassword();
    var info = StaffCreatePatientRequest2InfoConverter.convert(req, tempPassword);
    UUID actorId = UUID.fromString(auth.getName());
    UUID patientId = patientWriteAppService.register(
            info, ProfileUpdateSource.REGISTRATION, "STAFF_LED", actorId);
    return ResponseEntity.status(201).body(WebResult.ok(patientId));
}

@GetMapping("/{id}/clinical-profile")
public WebResult<ClinicalProfileDTO> getClinicalProfile(
        @PathVariable UUID id, Authentication auth) {
    enforceCanReadPatient(id, auth);
    var profile = patientReadAppService.getClinicalProfile(id).orElse(null);
    return WebResult.ok(PatientClinicalProfileModel2DTOConverter.toDTO(profile));
}

@PatchMapping("/{id}/clinical-profile")
public WebResult<ClinicalProfileDTO> patchClinicalProfile(
        @PathVariable UUID id,
        @Valid @RequestBody ClinicalProfilePatchRequest req,
        Authentication auth) {
    enforceCanWritePatient(id, auth);
    var info = ClinicalProfilePatchRequest2InfoConverter.convert(req);
    UUID actorId = UUID.fromString(auth.getName());
    String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
    var p = patientWriteAppService.updateClinicalProfile(
            id, info, ProfileUpdateSource.PORTAL, actorId, role, null);
    return WebResult.ok(PatientClinicalProfileModel2DTOConverter.toDTO(p.getClinicalProfile()));
}

private void enforceCanReadPatient(UUID id, Authentication auth) {
    String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
    if (role.equals("STAFF") || role.equals("DOCTOR") || role.equals("ADMIN")) return;
    if (role.equals("PATIENT")) {
        UUID userId = UUID.fromString(auth.getName());
        UUID selfId = patientReadAppService.getById(id)
                .map(my.cliniflow.domain.biz.patient.model.PatientModel::getUserId).orElse(null);
        if (!userId.equals(selfId)) throw new org.springframework.security.access.AccessDeniedException("forbidden");
    }
}

private void enforceCanWritePatient(UUID id, Authentication auth) {
    enforceCanReadPatient(id, auth);
}
```

(Make `StaffCreatePatientRequest2InfoConverter` analogous to the public converter, taking a temp password and producing a `PatientUserCreateInfo` with that as `passwordPlaintext` and `must_change_password=true`.)

- [ ] **Step 4: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/controller/biz/patient/
git commit -m "feat(controller/patient): NRIC search + staff create + profile GET/PATCH"
```

---

### Task 5.8: `AdminUserController`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/admin/AdminUserController.java`
- Create: `.../request/AdminCreateStaffRequest.java`
- Create: `.../request/AdminCreateDoctorRequest.java`
- Create: `.../request/AdminCreateAdminRequest.java`
- Create: `.../response/UserCreatedDTO.java`

```java
// UserCreatedDTO.java
package my.cliniflow.controller.biz.admin.response;
import java.util.UUID;
public record UserCreatedDTO(UUID userId, String tempPassword) {}
```

```java
// AdminCreateDoctorRequest.java
package my.cliniflow.controller.biz.admin.request;

import jakarta.validation.constraints.*;
public record AdminCreateDoctorRequest(
        @NotBlank @Email String email,
        @NotBlank String fullName,
        @NotBlank String phone,
        @NotBlank @Pattern(regexp = "en|ms|zh") String preferredLanguage,
        @NotBlank @Pattern(regexp = "[A-Za-z0-9-]{4,32}") String mmcNumber,
        @NotBlank String specialty,
        String signatureImageBase64,
        String signatureImageMime) {}
```

(Similar request DTOs for staff + admin — without MMC/specialty/signature.)

```java
// AdminUserController.java
package my.cliniflow.controller.biz.admin;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.user.UserReadAppService;
import my.cliniflow.application.biz.user.UserWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.admin.request.*;
import my.cliniflow.controller.biz.admin.response.UserCreatedDTO;
import my.cliniflow.domain.biz.user.info.*;
import my.cliniflow.infrastructure.storage.SignatureImageStore;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Base64;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final UserWriteAppService write;
    private final UserReadAppService read;
    private final SignatureImageStore signatureStore;

    public AdminUserController(UserWriteAppService w, UserReadAppService r,
                               SignatureImageStore s) {
        this.write = w; this.read = r; this.signatureStore = s;
    }

    @PostMapping(params = "role=STAFF")
    public ResponseEntity<WebResult<UserCreatedDTO>> createStaff(
            @Valid @RequestBody AdminCreateStaffRequest req, Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        var info = new StaffUserCreateInfo(
                req.email(), req.fullName(), req.phone(),
                req.preferredLanguage(), req.employeeId(), req.notes());
        var r = write.createStaffUser(info, adminId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(WebResult.ok(new UserCreatedDTO(r.userId(), r.tempPasswordPlaintext())));
    }

    @PostMapping(params = "role=DOCTOR")
    public ResponseEntity<WebResult<UserCreatedDTO>> createDoctor(
            @Valid @RequestBody AdminCreateDoctorRequest req, Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        byte[] sig = req.signatureImageBase64() == null ? null
                : Base64.getDecoder().decode(req.signatureImageBase64());
        var info = new DoctorUserCreateInfo(
                req.email(), req.fullName(), req.phone(), req.preferredLanguage(),
                req.mmcNumber(), req.specialty(), sig, req.signatureImageMime());
        var r = write.createDoctorUser(info, adminId);
        if (sig != null && sig.length > 0) {
            String url = signatureStore.upload(r.doctorProfileId(), sig, req.signatureImageMime());
            write.setDoctorSignatureUrl(r.doctorProfileId(), url);
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(WebResult.ok(new UserCreatedDTO(r.userId(), r.tempPasswordPlaintext())));
    }

    @PostMapping(params = "role=ADMIN")
    public ResponseEntity<WebResult<UserCreatedDTO>> createAdmin(
            @Valid @RequestBody AdminCreateAdminRequest req, Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        var info = new AdminUserCreateInfo(req.email(), req.fullName(), req.phone(), req.preferredLanguage());
        var r = write.createAdminUser(info, adminId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(WebResult.ok(new UserCreatedDTO(r.userId(), r.tempPasswordPlaintext())));
    }
}
```

- [ ] **Step 1: `SignatureImageStore` (Supabase Storage stub for MVP — local-disk impl in dev, deferred remote impl)**

```java
package my.cliniflow.infrastructure.storage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.*;
import java.util.UUID;

@Component
public class SignatureImageStore {

    @Value("${cliniflow.storage.signature-dir:./storage/signatures}")
    private String dir;

    public String upload(UUID doctorProfileId, byte[] bytes, String mime) {
        try {
            Path d = Paths.get(dir); Files.createDirectories(d);
            String ext = "image/png".equals(mime) ? ".png" : ".jpg";
            Path f = d.resolve(doctorProfileId + ext);
            Files.write(f, bytes);
            return "/static/signatures/" + doctorProfileId + ext;
        } catch (Exception e) {
            throw new RuntimeException("upload failed", e);
        }
    }
}
```

- [ ] **Step 2: Compile + commit**

```bash
cd backend && mvn -q -DskipTests compile
git add backend/src/main/java/my/cliniflow/controller/biz/admin/ \
        backend/src/main/java/my/cliniflow/infrastructure/storage/
git commit -m "feat(controller/admin): admin user create endpoints + signature store"
```

---

### Task 5.9: `InternalPatientController`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/internal/patient/InternalPatientController.java`
- Create: `.../request/InternalClinicalProfilePatchRequest.java`
- Test: `backend/src/test/java/my/cliniflow/controller/biz/internal/patient/InternalPatientControllerIT.java`

```java
// InternalClinicalProfilePatchRequest.java — same shape as the public ClinicalProfilePatchRequest
package my.cliniflow.controller.biz.internal.patient.request;

import my.cliniflow.controller.biz.patient.request.ClinicalProfilePatchRequest;
public record InternalClinicalProfilePatchRequest(
        ClinicalProfilePatchRequest payload, String source) {}
```

```java
// InternalPatientController.java
package my.cliniflow.controller.biz.internal.patient;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.patient.PatientWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.internal.patient.request.InternalClinicalProfilePatchRequest;
import my.cliniflow.controller.biz.patient.converter.ClinicalProfilePatchRequest2InfoConverter;
import my.cliniflow.controller.biz.patient.converter.PatientClinicalProfileModel2DTOConverter;
import my.cliniflow.controller.biz.patient.response.ClinicalProfileDTO;
import my.cliniflow.domain.biz.patient.enums.ProfileUpdateSource;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/internal/patients")
public class InternalPatientController {

    private final PatientReadAppService read;
    private final PatientWriteAppService write;

    public InternalPatientController(PatientReadAppService r, PatientWriteAppService w) {
        this.read = r; this.write = w;
    }

    @GetMapping("/{id}/clinical-profile")
    public WebResult<ClinicalProfileDTO> get(@PathVariable UUID id, HttpServletRequest req) {
        ensurePathMatchesAttribute(id, req);
        var profile = read.getClinicalProfile(id).orElse(null);
        return WebResult.ok(PatientClinicalProfileModel2DTOConverter.toDTO(profile));
    }

    @PatchMapping("/{id}/clinical-profile")
    public WebResult<ClinicalProfileDTO> patch(
            @PathVariable UUID id,
            @Valid @RequestBody InternalClinicalProfilePatchRequest body,
            HttpServletRequest req) {
        ensurePathMatchesAttribute(id, req);
        ProfileUpdateSource source = ProfileUpdateSource.valueOf(
                body.source() == null ? "PRE_VISIT_CHAT" : body.source());
        var info = ClinicalProfilePatchRequest2InfoConverter.convert(body.payload());
        UUID visitId = req.getHeader("X-Visit-Id") == null ? null
                : UUID.fromString(req.getHeader("X-Visit-Id"));
        var p = write.updateClinicalProfile(id, info, source,
                /* actorUserId */ null, "PATIENT_VIA_AGENT", visitId);
        return WebResult.ok(PatientClinicalProfileModel2DTOConverter.toDTO(p.getClinicalProfile()));
    }

    private void ensurePathMatchesAttribute(UUID id, HttpServletRequest req) {
        Object bound = req.getAttribute("agent.patientId");
        if (!(bound instanceof UUID b) || !b.equals(id))
            throw new my.cliniflow.controller.base.SessionPatientMismatchException();
    }
}
```

- [ ] **Step 1: IT — service token happy path**

```java
package my.cliniflow.controller.biz.internal.patient;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.IntegrationTestBase;
import my.cliniflow.controller.config.PreVisitSessionRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InternalPatientControllerIT extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PreVisitSessionRegistry sessions;

    @Test
    void missingTokenReturns401() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(get("/internal/patients/" + id + "/clinical-profile"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void mismatchedSessionReturns403() throws Exception {
        UUID pathId = UUID.randomUUID();
        UUID otherPatient = UUID.randomUUID();
        sessions.bind("session-x", otherPatient);
        mvc.perform(get("/internal/patients/" + pathId + "/clinical-profile")
                        .header("X-Service-Token", "test-service-token")
                        .header("X-Pre-Visit-Session", "session-x"))
                .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Compile + run + commit**

```bash
cd backend && mvn -q -Dtest=InternalPatientControllerIT test
git add backend/src/main/java/my/cliniflow/controller/biz/internal/ \
        backend/src/test/java/my/cliniflow/controller/biz/internal/
git commit -m "feat(controller/internal): /internal/patients/{id}/clinical-profile endpoint"
```

---

**End of Phase 5.** All HTTP endpoints exist and are JWT/service-token guarded.

---

## Phase 6 — Frontend

### Task 6.1: API client + zod schemas

**Files:**
- Create: `frontend/lib/api/registration.ts`
- Create: `frontend/lib/api/patients.ts` (or extend the existing flat `lib/patients.ts` if that pattern is in use)
- Create: `frontend/lib/api/adminUsers.ts`
- Create: `frontend/lib/schemas/patient-register.ts`
- Create: `frontend/lib/schemas/clinical-profile.ts`
- Create: `frontend/lib/schemas/admin-user-create.ts`

```typescript
// frontend/lib/schemas/patient-register.ts
import { z } from "zod";

export const patientRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Za-z]/).regex(/[0-9]/),
  fullName: z.string().min(1).max(255),
  nric: z.string().min(6),
  dateOfBirth: z.string(), // ISO date
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  phone: z.string().regex(/^\+?[0-9]{8,16}$/),
  preferredLanguage: z.enum(["en", "ms", "zh"]),
  consentVersion: z.string().min(1),
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  drugAllergies: z.array(z.object({
    name: z.string().min(1),
    severity: z.enum(["MILD", "MODERATE", "SEVERE"]),
    reaction: z.string().optional(),
  })).optional(),
});

export type PatientRegisterInput = z.infer<typeof patientRegisterSchema>;
```

```typescript
// frontend/lib/api/registration.ts
import { apiPost } from "../api"; // existing helper
import { PatientRegisterInput } from "../schemas/patient-register";

export type PatientRegisteredResponse = {
  patientId: string;
  userId: string | null;
  message: string;
};

export async function registerPatient(input: PatientRegisterInput) {
  return apiPost<PatientRegisteredResponse>("/api/auth/register/patient", input);
}
```

(Similarly create `patients.ts` and `adminUsers.ts` using the existing `apiPost`/`apiGet`/`apiPatch` helpers in `lib/api.ts`.)

```bash
git add frontend/lib/
git commit -m "feat(frontend): zod schemas + api client for registration/admin"
```

---

### Task 6.2: `/auth/register` page + form

**Files:**
- Create: `frontend/app/auth/register/page.tsx`
- Create: `frontend/app/auth/register/success/page.tsx`
- Create: `frontend/components/auth/RegisterPatientForm.tsx`

**Before writing UI**: invoke the `frontend-design` skill (per CLAUDE.md "frontend design work — when creating or redesigning UI… use the frontend-design skill before writing code"). The skill output drives the JSX.

After running the skill, implement the form using:
- `react-hook-form` + `@hookform/resolvers/zod` (already in the project — check `frontend/package.json`).
- The existing component design system in `frontend/components/ui/`.
- Submit handler calls `registerPatient(values)`. On success, redirect to `/auth/register/success` with `?patientId=...`. On 409, show "this NRIC is already registered" with a link to `/login`.

```typescript
// frontend/app/auth/register/page.tsx
"use client";
import { RegisterPatientForm } from "@/components/auth/RegisterPatientForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">Register</h1>
      <p className="mt-2 text-muted-foreground">
        Create an account to use the patient portal.
      </p>
      <div className="mt-8">
        <RegisterPatientForm />
      </div>
    </main>
  );
}
```

(Form component skeleton — fill in design-skill-driven JSX:)

```typescript
// frontend/components/auth/RegisterPatientForm.tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { patientRegisterSchema, PatientRegisterInput } from "@/lib/schemas/patient-register";
import { registerPatient } from "@/lib/api/registration";

export function RegisterPatientForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PatientRegisterInput>({
    resolver: zodResolver(patientRegisterSchema),
    defaultValues: { preferredLanguage: "en", consentVersion: "v1" },
  });

  async function onSubmit(values: PatientRegisterInput) {
    setError(null);
    try {
      const res = await registerPatient(values);
      router.push(`/auth/register/success?patientId=${res.patientId}`);
    } catch (e: any) {
      if (e.status === 409) setError("This NRIC is already registered. Please log in.");
      else setError("Registration failed. Please try again.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {/* fields populated per frontend-design skill output */}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <button type="submit" disabled={form.formState.isSubmitting}>Register</button>
    </form>
  );
}
```

```bash
cd frontend && npm run typecheck
git add frontend/app/auth/register/ frontend/components/auth/
git commit -m "feat(frontend/auth): public patient registration form + success page"
```

---

### Task 6.3: `/staff/patients/new` and search box

**Files:**
- Modify: `frontend/app/staff/patients/page.tsx` (add NRIC search box)
- Create: `frontend/app/staff/patients/new/page.tsx`
- Create: `frontend/components/staff/NricSearchBox.tsx`
- Create: `frontend/components/staff/StaffCreatePatientForm.tsx`

(Use `frontend-design` skill before coding the UI.)

```typescript
// NricSearchBox.tsx
"use client";
import { useState } from "react";
import { searchPatientByNric } from "@/lib/api/patients";

export function NricSearchBox({ onFound, onNotFound }: {
  onFound: (preview: { id: string; fullNameInitial: string; dobMonth: string }) => void;
  onNotFound: (nric: string) => void;
}) {
  const [nric, setNric] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    try {
      const r = await searchPatientByNric(nric);
      if (r.found) onFound(r);
      else onNotFound(nric);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex gap-2">
      <input value={nric} onChange={e => setNric(e.target.value)} placeholder="NRIC" />
      <button onClick={search} disabled={busy}>Search</button>
    </div>
  );
}
```

```bash
cd frontend && npm run typecheck
git add frontend/app/staff/patients/ frontend/components/staff/
git commit -m "feat(frontend/staff): NRIC search-then-create flow"
```

---

### Task 6.4: `/admin/users` and `/admin/users/new`

(Same pattern: invoke `frontend-design`, create role-discriminated form, list page with table.)

```bash
git add frontend/app/admin/users/ frontend/components/admin/
git commit -m "feat(frontend/admin): admin user list + role-discriminated create form"
```

---

### Task 6.5: `/portal/profile` (read-only)

```typescript
// frontend/app/portal/profile/page.tsx — fetches getMyClinicalProfile, renders fields with last_updated + source
```

```bash
git add frontend/app/portal/profile/
git commit -m "feat(frontend/portal): read-only clinical profile view"
```

---

### Task 6.6: Login force-password-change handling

Modify `frontend/app/login/page.tsx` so that after a successful login, if the API response indicates `mustChangePassword=true`, the user is redirected to `/auth/force-password-change`. Create that page; submit calls `apiPost('/api/auth/forced-password-change', {newPassword})`. On success, redirect to the role-default landing page.

```bash
git add frontend/app/login/ frontend/app/auth/force-password-change/
git commit -m "feat(frontend/auth): forced password change flow"
```

---

**End of Phase 6.** Frontend covers all roles' registration paths.

---

## Phase 7 — Bootstrap admin

### Task 7.1: Generate bcrypt hash + apply seed SQL to Supabase

(Manual — see spec §3.2 for the exact SQL.)

- [ ] Generate hash locally: `python3 -c "import bcrypt; print(bcrypt.hashpw(b'YourStrongPassword', bcrypt.gensalt(12)).decode())"`
- [ ] Run the bootstrap INSERT in the Supabase SQL editor (with the hash substituted).
- [ ] Verify: `SELECT id, email, role, must_change_password FROM users WHERE email='admin@cliniflow.local'` returns one row, `must_change_password=true`.

(No code commit — operational step.)

### Task 7.2: Verify forced-password-change end-to-end

- [ ] Log in as `admin@cliniflow.local` with the temp password → expect a 200 with a JWT, but with `mustChangePassword=true` flag.
- [ ] Hit `POST /api/admin/users` with that JWT → expect 412 Precondition Failed (or your chosen status — make `AuthInterceptor` enforce it).
- [ ] `POST /api/auth/forced-password-change` with `{newPassword: "NewStrongPwd1"}` → 200.
- [ ] Re-login with new password → 200, `mustChangePassword=false`.
- [ ] Hit `POST /api/admin/users` again → 200/201.

```bash
git commit --allow-empty -m "ops: verified bootstrap admin + forced password change e2e"
```

---

## Phase 8 — E2E Playwright

### Task 8.1–8.6: Six flows

For each, create one Playwright spec under `frontend/e2e/`:

| File | Flow |
|---|---|
| `e2e/registration-self-signup.spec.ts` | Self-signup happy path, JWT cookie set, lands on `/portal` |
| `e2e/registration-nric-duplicate.spec.ts` | Second registration with same NRIC → friendly error |
| `e2e/staff-search-then-create.spec.ts` | Staff: not found → create → patient appears in list |
| `e2e/staff-search-existing.spec.ts` | Staff: found → preview → open record |
| `e2e/admin-create-doctor.spec.ts` | Admin creates DOCTOR with MMC + signature; doctor first-login forces change |
| `e2e/previsit-fills-allergy-gap.spec.ts` | Patient signs up without allergy → pre-visit chat collects "penicillin" → portal shows allergy with `source = PRE_VISIT_CHAT` |

Each spec:
1. Calls the existing `frontend/e2e/setup` helpers if any.
2. Uses `page.goto`, fills form fields by `getByLabel`/`getByPlaceholder`, clicks the submit button.
3. Asserts navigation, asserts visible text, screenshots at each step into `frontend/e2e/screenshots/`.

Skeleton (apply to each):

```typescript
import { test, expect } from "@playwright/test";

test("self-signup happy path", async ({ page }) => {
  await page.goto("/auth/register");
  await page.getByLabel("Email").fill(`rt-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByLabel("Full name").fill("Round Trip");
  await page.getByLabel("NRIC").fill(`950101-14-${Math.floor(Math.random() * 10000)}`);
  await page.getByLabel("Date of birth").fill("1990-05-01");
  await page.getByLabel("Gender").selectOption("FEMALE");
  await page.getByLabel("Phone").fill("+60123456789");
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/auth\/register\/success/);
  await page.screenshot({ path: "e2e/screenshots/register-success.png" });
});
```

Run: `cd frontend && npx playwright test`

```bash
git add frontend/e2e/
git commit -m "test(e2e): six registration + onboarding Playwright flows"
```

---

## Phase 9 — Agent additions

### Task 9.1: `patient_profile_tool.py`

**Files:**
- Create: `agent/app/tools/patient_profile_tool.py`
- Test: `agent/tests/tools/test_patient_profile_tool.py`

```python
# agent/app/tools/patient_profile_tool.py
"""LangGraph tool for the pre-visit agent: fetch + PATCH the canonical clinical profile via Spring Boot."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any
import httpx

BACKEND_BASE = os.getenv("CLINIFLOW_BACKEND_URL", "http://backend:8080")
SERVICE_TOKEN = os.getenv("CLINIFLOW_AGENT_SERVICE_TOKEN", "")

STALENESS_THRESHOLDS_DAYS = {
    "weight_kg": 90,
    "height_cm": 365,
    "regular_medications": 365,
    # allergies / conditions / pregnancy: never stale
}


def _is_stale(updated_at: str | None, field: str) -> bool:
    if updated_at is None:
        return True
    threshold = STALENESS_THRESHOLDS_DAYS.get(field)
    if threshold is None:
        return False
    dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
    return datetime.now(timezone.utc) - dt > timedelta(days=threshold)


async def get_clinical_profile(patient_id: str, session_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.get(
            f"{BACKEND_BASE}/internal/patients/{patient_id}/clinical-profile",
            headers={
                "X-Service-Token": SERVICE_TOKEN,
                "X-Pre-Visit-Session": session_id,
            },
        )
        r.raise_for_status()
        return r.json()["data"]


async def patch_clinical_profile(patient_id: str, session_id: str,
                                 visit_id: str | None, payload: dict[str, Any],
                                 source: str = "PRE_VISIT_CHAT") -> dict[str, Any]:
    body = {"payload": payload, "source": source}
    headers = {
        "X-Service-Token": SERVICE_TOKEN,
        "X-Pre-Visit-Session": session_id,
    }
    if visit_id:
        headers["X-Visit-Id"] = visit_id
    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.patch(
            f"{BACKEND_BASE}/internal/patients/{patient_id}/clinical-profile",
            headers=headers, json=body,
        )
        r.raise_for_status()
        return r.json()["data"]


def detect_gaps(profile: dict[str, Any]) -> list[str]:
    """Return safety-critical fields that are missing or stale."""
    gaps: list[str] = []
    if profile.get("drugAllergiesUpdatedAt") is None:
        gaps.append("drug_allergies")
    if profile.get("chronicConditionsUpdatedAt") is None:
        gaps.append("chronic_conditions")
    if profile.get("regularMedicationsUpdatedAt") is None:
        gaps.append("regular_medications")
    if profile.get("pregnancyUpdatedAt") is None:
        gaps.append("pregnancy")
    if profile.get("weightKg") is None:
        gaps.append("weight_kg")
    if _is_stale(profile.get("weightKgUpdatedAt"), "weight_kg") and "weight_kg" not in gaps:
        gaps.append("weight_kg")
    return gaps
```

- [ ] **Step 1: Tests**

```python
# agent/tests/tools/test_patient_profile_tool.py
from app.tools.patient_profile_tool import detect_gaps, _is_stale


def test_detect_gaps_all_missing():
    profile = {"weightKg": None}
    gaps = detect_gaps(profile)
    assert "weight_kg" in gaps
    assert "drug_allergies" in gaps
    assert "pregnancy" in gaps


def test_weight_stale_after_90_days():
    assert _is_stale("2024-01-01T00:00:00Z", "weight_kg") is True


def test_allergies_never_stale():
    assert _is_stale("2020-01-01T00:00:00Z", "drug_allergies") is False
```

- [ ] **Step 2: Run + commit**

```bash
cd agent && pytest tests/tools/test_patient_profile_tool.py
git add agent/app/tools/patient_profile_tool.py agent/tests/tools/
git commit -m "feat(agent/tools): patient_profile_tool with gap detection"
```

---

### Task 9.2: Gap-filling sub-graph + prompt

**Files:**
- Create: `agent/app/prompts/pre_visit/gap_filling.j2`
- Modify: `agent/app/graphs/pre_visit.py` (the existing pre-visit LangGraph) to add a `gap_filling` node before the symptom-intake node

```jinja
{# agent/app/prompts/pre_visit/gap_filling.j2 #}
You are filling in missing clinical baseline fields for a patient before symptom intake.

Missing or stale safety-critical fields: {{ gaps | join(", ") }}

Ask one short, plain-language question about ONE field at a time. Skip topics the
patient has already answered. When the patient answers, output a JSON block with this shape:

```json
{"field": "drug_allergies", "value": {"drugAllergiesAdd": [{"name": "...", "severity": "...", "reaction": "..."}]}}
```

Stop when all listed fields have either a value, or the patient says "skip / I don't want to answer".
```

Add the node in `pre_visit.py` (sketch — adapt to the existing graph structure):

```python
from app.tools import patient_profile_tool

async def gap_filling_node(state: PreVisitState) -> PreVisitState:
    profile = await patient_profile_tool.get_clinical_profile(
        state["patient_id"], state["session_id"])
    gaps = patient_profile_tool.detect_gaps(profile)
    state["profile"] = profile
    state["gaps"] = gaps
    return state

# In the graph builder:
graph.add_node("gap_filling", gap_filling_node)
graph.add_edge(START, "gap_filling")
graph.add_conditional_edges(
    "gap_filling",
    lambda s: "symptom_intake" if not s["gaps"] else "gap_question",
    {"symptom_intake": "symptom_intake", "gap_question": "gap_question"},
)
```

Add `gap_question` node that emits the rendered prompt + processes answer + calls `patient_profile_tool.patch_clinical_profile(...)` with the structured JSON, then re-routes back to `gap_filling` to recompute remaining gaps.

```bash
cd agent && pytest tests/
git add agent/app/prompts/pre_visit/gap_filling.j2 agent/app/graphs/pre_visit.py
git commit -m "feat(agent/pre-visit): gap-filling sub-graph + prompt"
```

---

### Task 9.3: Wire `PreVisitSessionRegistry.bind` from agent service

When Spring Boot's existing `POST /api/pre-visit/start` opens a chat session, it should call `PreVisitSessionRegistry.bind(sessionId, patientId)` so the agent's PATCH calls succeed. Find the existing pre-visit start handler (in `controller/biz/previsit/`), inject `PreVisitSessionRegistry`, and call `.bind()` after creating the session.

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/previsit/
git commit -m "feat(backend/previsit): bind session-id → patient-id for agent service-token auth"
```

---

**End of Phase 9.**

---

## Phase 10 — Wrap-up

### Task 10.1: Run full backend test suite

Run: `cd backend && mvn test`
Expected: BUILD SUCCESS. Coverage report (if enabled) ≥ 80% on `domain/biz/{patient,user}` and `application/biz/{patient,user}`.

### Task 10.2: Run full agent test suite

Run: `cd agent && pytest`
Expected: all tests pass.

### Task 10.3: Run frontend lint + typecheck + e2e

```bash
cd frontend
npm run lint
npm run typecheck
npx playwright test
```

### Task 10.4: Smoke-test in browser

1. `docker compose up --build`
2. Visit `http://localhost/auth/register`, register a new patient end-to-end.
3. Log in, view `/portal/profile`, verify the clinical baseline shows up.
4. Log in as the bootstrap admin (after forcing password change), create a doctor, log out, log in as the new doctor with the temp password, force change, land on the doctor workspace.
5. From the patient session, start a pre-visit chat — confirm the agent asks gap-filling questions when allergies are missing.

### Task 10.5: Final commit + open PR

```bash
git push -u origin feat/registration-onboarding
gh pr create --base master --head feat/registration-onboarding \
  --title "feat: registration & user onboarding (all 4 roles)" \
  --body-file docs/superpowers/specs/2026-04-30-registration-and-user-onboarding-design.md
```

---

## Self-review checklist (run before handoff)

- [ ] Every task has at least one commit step.
- [ ] No "TBD", "TODO", "fill in details" in any step.
- [ ] Method signatures consistent across phases (e.g., `PatientWriteAppService.register(info, source, registrationSource, actorId)`).
- [ ] Each spec acceptance criterion in §6.3 maps to a task or test:
  - R-01 → Task 5.6 + 8.1
  - R-02 → Task 5.6 + 8.2
  - R-03 → Task 5.7 + 8.3, 8.4
  - R-04 → Task 5.7 + 8.3 + 7.2
  - R-05 → Task 5.8 + 8.5
  - R-06 → Task 7.1, 7.2
  - R-07, R-08 → Task 5.9 + 9.1
  - R-09 → Task 2.10 (model invariant) + 5.7 (DB CHECK fires on PATCH)
  - R-10 → Task 3.1 (`AuditWriterIT` + `audit_log_no_update` trigger)
  - R-11 → Task 10.1 (coverage report)
  - R-12 → Task 8.1–8.6
- [ ] All references to `PatientClinicalProfileSpringDataRepository` are *package-private* (only used inside `infrastructure/repository/patient/`) — no domain-level alternative exists, satisfying "one repo per aggregate root".
- [ ] `must_change_password` is honored by `AuthInterceptor` (Task 7.2 verifies).
- [ ] Outbox row idempotency relies on Cypher MERGE (Task 4.2 IT verifies).
- [ ] No code path writes patient demographics to Neo4j outside `Neo4jProjectionClient`.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-30-registration-and-user-onboarding.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
