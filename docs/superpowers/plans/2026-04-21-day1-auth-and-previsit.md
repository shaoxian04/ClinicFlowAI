# Day 1 — Auth + Pre-Visit Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an end-to-end pre-visit flow where a patient logs in, answers a 5-question AI intake, and a structured report is persisted as the first half of a new `visits` row.

**Architecture:** JWT-based stateless auth in Spring Boot (BCrypt + HS256). Pre-visit conversation state lives server-side inside `pre_visit_reports.structured` (JSONB) — the agent service stays stateless and receives the full history each turn. LangGraph on the agent side runs a simple "next missing field" state machine over 5 canned questions, backed by one OpenAI-compatible LLM call per turn for field extraction.

**Tech Stack:** Spring Boot 3.3 / Java 21 / Maven · JJWT 0.12 · Spring Data JPA · FastAPI + LangGraph 0.2 · `langchain-openai` 0.2 · Next.js 14 App Router · React 18. (**Flyway removed** — schema managed manually via Supabase.)

---

## Scope Contract

**In scope:** Auth (login only, seeded users), pre-visit chat flow, structured-report persistence, minimal frontend for both screens.

**Out of scope (moved to later days):** registration, password reset, role-gated route guards (Day 5), audit logging (Day 5), SOAP generation (Day 2), patient portal (Day 3), any polish.

**Done means:** You run `docker compose up`, hit the frontend on `:80`, log in as `patient@demo.local`, click "Start pre-visit", answer 5 questions, see the structured summary, and verify one `visits` + one `pre_visit_reports` row exist in Postgres.

---

## File Map

### Backend (Java)

| File | Responsibility |
|---|---|
| `domain/biz/user/enums/Role.java` | CREATE — 4-value enum matching DB `role` check constraint |
| `domain/biz/user/model/UserModel.java` | CREATE — JPA entity mapped to `users` |
| `domain/biz/user/repository/UserRepository.java` | CREATE — Spring Data repo, `findByEmail` |
| `domain/biz/visit/enums/VisitStatus.java` | CREATE — 4-value enum matching DB `status` check |
| `domain/biz/visit/model/VisitModel.java` | CREATE — aggregate root, JPA entity mapped to `visits` |
| `domain/biz/visit/model/PreVisitReportModel.java` | CREATE — child entity, `structured` is JSONB |
| `domain/biz/visit/repository/VisitRepository.java` | CREATE — one repo per aggregate root |
| `infrastructure/security/JwtService.java` | CREATE — HS256 sign/parse with HMAC secret |
| `infrastructure/security/JwtAuthenticationFilter.java` | CREATE — `OncePerRequestFilter` reading `Authorization: Bearer …` |
| `controller/config/SecurityConfiguration.java` | MODIFY — register JWT filter + `PasswordEncoder` bean |
| `controller/biz/auth/AuthController.java` | CREATE — `POST /api/auth/login` |
| `controller/biz/auth/request/LoginRequest.java` | CREATE — DTO |
| `controller/biz/auth/response/LoginResponse.java` | CREATE — DTO |
| `application/biz/visit/PreVisitWriteAppService.java` | CREATE — start session + apply turn |
| `controller/biz/previsit/PreVisitController.java` | CREATE — `POST /api/previsit/sessions`, `POST /api/previsit/sessions/{id}/turn` |
| `controller/biz/previsit/request/PreVisitTurnRequest.java` | CREATE — DTO |
| `controller/biz/previsit/response/PreVisitSessionResponse.java` | CREATE — DTO |
| `infrastructure/client/AgentServiceClient.java` | MODIFY — add `callPreVisitTurn` |
| `src/main/resources/db/migration/V2__seed_dev_users.sql` | CREATE — 1 doctor + 1 patient + 1 linked `patients` row |
| `src/main/resources/application.yml` | MODIFY — add `cliniflow.dev.seeded-doctor-id` |
| Tests (Java): `JwtServiceTest`, `UserRepositoryTest`, `AuthControllerIntegrationTest`, `PreVisitControllerIntegrationTest` | CREATE |

### Agent (Python)

| File | Responsibility |
|---|---|
| `agent/app/llm/__init__.py` | CREATE — empty |
| `agent/app/llm/openai_client.py` | CREATE — `ChatOpenAI` factory using settings |
| `agent/app/graphs/__init__.py` | CREATE — empty |
| `agent/app/graphs/pre_visit.py` | CREATE — LangGraph state machine (5 field nodes) |
| `agent/app/routes/pre_visit.py` | REPLACE — single `/turn` endpoint backed by `graphs/pre_visit.py` |
| `agent/tests/__init__.py` | CREATE — empty |
| `agent/tests/test_pre_visit_graph.py` | CREATE — unit test for state machine with mocked LLM |
| `agent/tests/test_pre_visit_route.py` | CREATE — route test with mocked graph |
| `agent/pyproject.toml` | MODIFY — add `pytest`, `pytest-asyncio` to dev deps |

### Frontend (TypeScript)

| File | Responsibility |
|---|---|
| `frontend/lib/api.ts` | CREATE — fetch wrapper that attaches `Authorization: Bearer` |
| `frontend/lib/auth.ts` | CREATE — localStorage JWT helpers |
| `frontend/app/login/page.tsx` | CREATE — login form |
| `frontend/app/previsit/new/page.tsx` | CREATE — chat UI |
| `frontend/app/page.tsx` | MODIFY — add links to `/login` and `/previsit/new` |

---

## Task 1: Backend — Role enum + User aggregate

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/enums/Role.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/model/UserModel.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/user/repository/UserRepository.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/user/repository/UserRepositoryTest.java`

- [ ] **Step 1: Create the `Role` enum**

```java
package my.cliniflow.domain.biz.user.enums;

public enum Role {
    PATIENT, DOCTOR, STAFF, ADMIN
}
```

- [ ] **Step 2: Create the `UserModel` entity**

```java
package my.cliniflow.domain.biz.user.model;

import jakarta.persistence.*;
import my.cliniflow.domain.biz.user.enums.Role;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Role role;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "gmt_create", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
```

- [ ] **Step 3: Create the `UserRepository`**

```java
package my.cliniflow.domain.biz.user.repository;

import my.cliniflow.domain.biz.user.model.UserModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<UserModel, UUID> {
    Optional<UserModel> findByEmail(String email);
}
```

- [ ] **Step 4: Write the failing repository test**

Note: this test uses the real Postgres via Testcontainers. For hackathon speed we instead point at an H2-in-memory Postgres-compat schema via `@DataJpaTest` with `spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect` — but H2 won't run our Postgres-specific migrations. Simplest path: `@SpringBootTest` against the same Postgres the dev stack uses, with `@Transactional` rollback. Create test:

```java
package my.cliniflow.domain.biz.user.repository;

import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class UserRepositoryTest {

    @Autowired UserRepository repo;

    @Test
    void findByEmail_roundtrip() {
        UserModel u = new UserModel();
        u.setEmail("r1@example.com");
        u.setPasswordHash("$2a$10$fake");
        u.setRole(Role.DOCTOR);
        u.setFullName("Dr. Test");
        repo.save(u);

        var found = repo.findByEmail("r1@example.com");
        assertTrue(found.isPresent());
        assertEquals(Role.DOCTOR, found.get().getRole());
    }
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `cd backend && ./mvnw -Dtest=UserRepositoryTest test`
Expected: 1 test, 0 failures. (Requires local Postgres with V1 migration applied — `docker compose up neo4j postgres` or point at Supabase.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/user backend/src/test/java/my/cliniflow/domain/biz/user
git commit -m "feat: add user aggregate with Role enum and repository"
```

---

## Task 2: Backend — JwtService

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/security/JwtService.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/security/JwtServiceTest.java`

- [ ] **Step 1: Write the failing test**

```java
package my.cliniflow.infrastructure.security;

import my.cliniflow.domain.biz.user.enums.Role;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private final JwtService svc = new JwtService(
        "test-secret-key-that-is-at-least-32-chars-long!",
        60
    );

    @Test
    void issue_then_parse_roundtrip() {
        UUID uid = UUID.randomUUID();
        String token = svc.issue(uid, "x@y.z", Role.PATIENT);
        JwtService.Claims c = svc.parse(token);
        assertEquals(uid, c.userId());
        assertEquals("x@y.z", c.email());
        assertEquals(Role.PATIENT, c.role());
    }

    @Test
    void parse_rejects_garbage() {
        assertThrows(RuntimeException.class, () -> svc.parse("not-a-jwt"));
    }
}
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && ./mvnw -Dtest=JwtServiceTest test`
Expected: compilation failure — `JwtService` does not exist.

- [ ] **Step 3: Implement `JwtService`**

```java
package my.cliniflow.infrastructure.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import my.cliniflow.domain.biz.user.enums.Role;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    private final SecretKey key;
    private final long expiryMinutes;

    public JwtService(
        @Value("${cliniflow.jwt.secret}") String secret,
        @Value("${cliniflow.jwt.expiry-minutes}") long expiryMinutes
    ) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiryMinutes = expiryMinutes;
    }

    public String issue(UUID userId, String email, Role role) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId.toString())
            .claim("email", email)
            .claim("role", role.name())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(expiryMinutes, ChronoUnit.MINUTES)))
            .signWith(key)
            .compact();
    }

    public Claims parse(String token) {
        io.jsonwebtoken.Claims c = Jwts.parser()
            .verifyWith(key).build()
            .parseSignedClaims(token).getPayload();
        return new Claims(
            UUID.fromString(c.getSubject()),
            c.get("email", String.class),
            Role.valueOf(c.get("role", String.class))
        );
    }

    public record Claims(UUID userId, String email, Role role) {}
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd backend && ./mvnw -Dtest=JwtServiceTest test`
Expected: 2 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/security/JwtService.java backend/src/test/java/my/cliniflow/infrastructure/security
git commit -m "feat: add JwtService with issue/parse roundtrip"
```

---

## Task 3: Backend — JWT filter + Security wiring

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/security/JwtAuthenticationFilter.java`
- Modify: `backend/src/main/java/my/cliniflow/controller/config/SecurityConfiguration.java`

- [ ] **Step 1: Create the filter**

```java
package my.cliniflow.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwt;

    public JwtAuthenticationFilter(JwtService jwt) {
        this.jwt = jwt;
    }

    @Override
    protected void doFilterInternal(
        @NonNull HttpServletRequest req,
        @NonNull HttpServletResponse res,
        @NonNull FilterChain chain
    ) throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                JwtService.Claims c = jwt.parse(header.substring(7));
                var auth = new UsernamePasswordAuthenticationToken(
                    c,
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + c.role().name()))
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (Exception ignored) {
                // invalid token → stay anonymous; controllers requiring auth will 401
            }
        }
        chain.doFilter(req, res);
    }
}
```

- [ ] **Step 2: Modify `SecurityConfiguration` to register filter + PasswordEncoder**

Replace file contents with:

```java
package my.cliniflow.controller.config;

import my.cliniflow.infrastructure.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfiguration {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, JwtAuthenticationFilter jwtFilter) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                .requestMatchers("/actuator/prometheus").permitAll()
                .requestMatchers("/api/auth/**").permitAll()
                .anyRequest().authenticated()
            )
            .httpBasic(basic -> basic.disable())
            .formLogin(form -> form.disable())
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
```

- [ ] **Step 3: Compile to verify wiring**

Run: `cd backend && ./mvnw -DskipTests compile`
Expected: `BUILD SUCCESS`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/security/JwtAuthenticationFilter.java backend/src/main/java/my/cliniflow/controller/config/SecurityConfiguration.java
git commit -m "feat: register JWT filter and BCrypt PasswordEncoder"
```

---

## Task 4: Backend — Auth controller

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/auth/request/LoginRequest.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/auth/response/LoginResponse.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/auth/AuthController.java`
- Test: `backend/src/test/java/my/cliniflow/controller/biz/auth/AuthControllerIntegrationTest.java`

- [ ] **Step 1: Create DTOs**

`LoginRequest.java`:

```java
package my.cliniflow.controller.biz.auth.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
    @Email @NotBlank String email,
    @NotBlank String password
) {}
```

`LoginResponse.java`:

```java
package my.cliniflow.controller.biz.auth.response;

import my.cliniflow.domain.biz.user.enums.Role;

import java.util.UUID;

public record LoginResponse(
    String token,
    UUID userId,
    String email,
    Role role,
    String fullName
) {}
```

- [ ] **Step 2: Create `AuthController`**

```java
package my.cliniflow.controller.biz.auth;

import jakarta.validation.Valid;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.auth.request.LoginRequest;
import my.cliniflow.controller.biz.auth.response.LoginResponse;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    @PostMapping("/login")
    public WebResult<LoginResponse> login(@Valid @RequestBody LoginRequest req) {
        UserModel u = users.findByEmail(req.email())
            .filter(UserModel::isActive)
            .orElse(null);
        if (u == null || !encoder.matches(req.password(), u.getPasswordHash())) {
            return WebResult.error(ResultCode.UNAUTHORIZED, "invalid credentials");
        }
        String token = jwt.issue(u.getId(), u.getEmail(), u.getRole());
        return WebResult.ok(new LoginResponse(token, u.getId(), u.getEmail(), u.getRole(), u.getFullName()));
    }
}
```

- [ ] **Step 3: Write the failing integration test**

```java
package my.cliniflow.controller.biz.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.auth.request.LoginRequest;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuthControllerIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper om;

    @BeforeEach
    void seed() {
        UserModel u = new UserModel();
        u.setEmail("login-test@example.com");
        u.setPasswordHash(encoder.encode("pw123456"));
        u.setRole(Role.PATIENT);
        u.setFullName("Login Test");
        users.save(u);
    }

    @Test
    void login_happy_path_returns_token() throws Exception {
        String body = om.writeValueAsString(new LoginRequest("login-test@example.com", "pw123456"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.token").isNotEmpty())
            .andExpect(jsonPath("$.data.role").value("PATIENT"));
    }

    @Test
    void login_wrong_password_returns_unauthorized_envelope() throws Exception {
        String body = om.writeValueAsString(new LoginRequest("login-test@example.com", "wrong"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())  // envelope is 200 with error code
            .andExpect(jsonPath("$.code").value(401));
    }
}
```

- [ ] **Step 4: Run test**

Run: `cd backend && ./mvnw -Dtest=AuthControllerIntegrationTest test`
Expected: both tests pass. If `WebResult.error` returns a different code shape than `401`, open `controller/base/ResultCode.java` and confirm `UNAUTHORIZED` maps to code `401`; adjust the assertion if it's different.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/auth backend/src/test/java/my/cliniflow/controller/biz/auth
git commit -m "feat: add POST /api/auth/login with JWT issuance"
```

---

## Task 5: Backend — Seed dev users

**Files:**
- Create: `backend/src/main/resources/db/migration/V2__seed_dev_users.sql`
- Modify: `backend/src/main/resources/application.yml`

This migration provides one doctor and one patient for demo + tests. BCrypt hashes below are for `"password"` with cost factor 10 — produced once with `BCryptPasswordEncoder.encode("password")`. If you want different passwords, generate new hashes by running a throwaway `main` method calling the encoder.

- [ ] **Step 1: Create the seed migration**

```sql
-- V2__seed_dev_users.sql
-- BCrypt hashes are for the literal string "password".
INSERT INTO users (id, email, password_hash, role, full_name, is_active)
VALUES
    ('00000000-0000-0000-0000-000000000001',
     'doctor@demo.local',
     '$2a$10$7EqJtq98hPqEX7fNZaFWoOa8B.M5oVbJgPdK0ZaVqfPPpP3gbAOoa',
     'DOCTOR',
     'Dr. Demo',
     true),
    ('00000000-0000-0000-0000-000000000002',
     'patient@demo.local',
     '$2a$10$7EqJtq98hPqEX7fNZaFWoOa8B.M5oVbJgPdK0ZaVqfPPpP3gbAOoa',
     'PATIENT',
     'Pat Demo',
     true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO patients (id, user_id, full_name, date_of_birth, gender, phone, email)
VALUES
    ('00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000002',
     'Pat Demo',
     '1990-01-01',
     'OTHER',
     '+60-12-000-0000',
     'patient@demo.local')
ON CONFLICT (id) DO NOTHING;
```

**Important:** the BCrypt hash shown is a *real* hash of `"password"` — but every BCrypt encode produces a different salt, so if you copy this verbatim it will still validate. If your encoder rejects it, regenerate by running this one-liner inside a Spring Boot test or JShell:

```java
new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("password")
```

Replace the hash in V2 with the output.

- [ ] **Step 2: Add a config knob for the seeded doctor**

Append to `backend/src/main/resources/application.yml` under the `cliniflow:` section:

```yaml
  dev:
    seeded-doctor-id: 00000000-0000-0000-0000-000000000001
    seeded-patient-id: 00000000-0000-0000-0000-000000000010
```

- [ ] **Step 3: Boot the backend and verify seed**

Run: `cd backend && ./mvnw spring-boot:run`
In another terminal:

```bash
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"patient@demo.local","password":"password"}'
```

Expected: JSON envelope with `code: 0`, `data.token: <jwt>`, `data.role: "PATIENT"`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V2__seed_dev_users.sql backend/src/main/resources/application.yml
git commit -m "chore: seed demo doctor and patient for dev and tests"
```

---

## Task 6: Backend — Visit aggregate

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/enums/VisitStatus.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/VisitModel.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/PreVisitReportModel.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/repository/VisitRepository.java`

- [ ] **Step 1: Create `VisitStatus` enum**

```java
package my.cliniflow.domain.biz.visit.enums;

public enum VisitStatus {
    SCHEDULED, IN_PROGRESS, FINALIZED, CANCELLED
}
```

- [ ] **Step 2: Create `VisitModel` (aggregate root)**

```java
package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "visits")
public class VisitModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "patient_id", nullable = false)
    private UUID patientId;

    @Column(name = "doctor_id", nullable = false)
    private UUID doctorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private VisitStatus status = VisitStatus.SCHEDULED;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "finalized_at")
    private OffsetDateTime finalizedAt;

    @OneToOne(mappedBy = "visit", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
    private PreVisitReportModel preVisitReport;

    public UUID getId() { return id; }
    public UUID getPatientId() { return patientId; }
    public void setPatientId(UUID v) { this.patientId = v; }
    public UUID getDoctorId() { return doctorId; }
    public void setDoctorId(UUID v) { this.doctorId = v; }
    public VisitStatus getStatus() { return status; }
    public void setStatus(VisitStatus v) { this.status = v; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(OffsetDateTime v) { this.startedAt = v; }
    public OffsetDateTime getFinalizedAt() { return finalizedAt; }
    public void setFinalizedAt(OffsetDateTime v) { this.finalizedAt = v; }
    public PreVisitReportModel getPreVisitReport() { return preVisitReport; }
    public void setPreVisitReport(PreVisitReportModel v) {
        this.preVisitReport = v;
        if (v != null) v.setVisit(this);
    }
}
```

- [ ] **Step 3: Create `PreVisitReportModel`**

JSONB storage note: Postgres `jsonb` maps in Hibernate 6.4+ to `Map<String,Object>` via `@JdbcTypeCode(SqlTypes.JSON)`. No extra dependency needed.

```java
package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "pre_visit_reports")
public class PreVisitReportModel {

    @Id
    @GeneratedValue
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "visit_id", nullable = false, unique = true)
    private VisitModel visit;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> structured = new HashMap<>();

    @Column(nullable = false, length = 32)
    private String source = "AI";

    public UUID getId() { return id; }
    public VisitModel getVisit() { return visit; }
    public void setVisit(VisitModel v) { this.visit = v; }
    public Map<String, Object> getStructured() { return structured; }
    public void setStructured(Map<String, Object> v) { this.structured = v; }
    public String getSource() { return source; }
    public void setSource(String v) { this.source = v; }
}
```

- [ ] **Step 4: Create `VisitRepository`**

```java
package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.VisitModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface VisitRepository extends JpaRepository<VisitModel, UUID> {
}
```

- [ ] **Step 5: Compile**

Run: `cd backend && ./mvnw -DskipTests compile`
Expected: `BUILD SUCCESS`. If Hibernate complains about JSONB type mapping, double-check the `@JdbcTypeCode(SqlTypes.JSON)` annotation — Hibernate 6.4 (Spring Boot 3.3 default) supports this out of the box.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit
git commit -m "feat: add Visit aggregate with PreVisitReport child"
```

---

## Task 7: Backend — PreVisitWriteAppService + controller

**Files:**
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/PreVisitWriteAppService.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/previsit/request/PreVisitTurnRequest.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/previsit/response/PreVisitSessionResponse.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/previsit/PreVisitController.java`

Contract reminder:
- `POST /api/previsit/sessions` → creates a visit + empty pre_visit_report. Returns `{ visitId, assistantMessage }`.
- `POST /api/previsit/sessions/{visitId}/turn` with `{ userMessage }` → appends user message, calls agent, appends assistant reply, returns `{ assistantMessage, structured, done }`.

We'll implement the agent call as a stub returning a hardcoded reply on this task and wire the real call in Task 8. This lets the controller test pass without the agent running.

- [ ] **Step 1: Create DTOs**

`PreVisitTurnRequest.java`:

```java
package my.cliniflow.controller.biz.previsit.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PreVisitTurnRequest(
    @NotBlank @Size(max = 2000) String userMessage
) {}
```

`PreVisitSessionResponse.java`:

```java
package my.cliniflow.controller.biz.previsit.response;

import java.util.Map;
import java.util.UUID;

public record PreVisitSessionResponse(
    UUID visitId,
    String assistantMessage,
    Map<String, Object> structured,
    boolean done
) {}
```

- [ ] **Step 2: Create `PreVisitWriteAppService`**

```java
package my.cliniflow.application.biz.visit;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.previsit.response.PreVisitSessionResponse;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.PreVisitReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

@Service
public class PreVisitWriteAppService {

    private final VisitRepository visits;
    private final AgentServiceClient agent;
    private final UUID seededDoctorId;

    public PreVisitWriteAppService(
        VisitRepository visits,
        AgentServiceClient agent,
        @Value("${cliniflow.dev.seeded-doctor-id}") String seededDoctorId
    ) {
        this.visits = visits;
        this.agent = agent;
        this.seededDoctorId = UUID.fromString(seededDoctorId);
    }

    @Transactional
    public PreVisitSessionResponse startSession(UUID patientId) {
        VisitModel v = new VisitModel();
        v.setPatientId(patientId);
        v.setDoctorId(seededDoctorId);
        v.setStatus(VisitStatus.IN_PROGRESS);
        v.setStartedAt(OffsetDateTime.now());

        PreVisitReportModel r = new PreVisitReportModel();
        Map<String, Object> initial = new HashMap<>();
        initial.put("history", new ArrayList<Map<String, String>>());
        initial.put("fields", new HashMap<String, Object>());
        initial.put("done", false);
        r.setStructured(initial);
        v.setPreVisitReport(r);

        v = visits.save(v);

        // First assistant prompt is fixed — the chief complaint question.
        String first = "Hi! I'm your pre-visit assistant. What's the main reason for your visit today?";
        appendHistory(r, "assistant", first);
        visits.save(v);

        return new PreVisitSessionResponse(v.getId(), first, r.getStructured(), false);
    }

    @Transactional
    public PreVisitSessionResponse applyTurn(UUID visitId, String userMessage) {
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        PreVisitReportModel r = v.getPreVisitReport();
        if (r == null) throw new IllegalStateException("visit has no pre-visit report: " + visitId);
        if (Boolean.TRUE.equals(r.getStructured().get("done"))) {
            throw new IllegalStateException("pre-visit already complete");
        }

        appendHistory(r, "user", userMessage);

        AgentServiceClient.PreVisitTurnResult result = agent.callPreVisitTurn(
            r.getStructured()
        );

        appendHistory(r, "assistant", result.assistantMessage());
        r.getStructured().put("fields", result.fields());
        r.getStructured().put("done", result.done());

        visits.save(v);
        return new PreVisitSessionResponse(v.getId(), result.assistantMessage(), r.getStructured(), result.done());
    }

    @SuppressWarnings("unchecked")
    private void appendHistory(PreVisitReportModel r, String role, String content) {
        List<Map<String, String>> history = (List<Map<String, String>>) r.getStructured()
            .computeIfAbsent("history", k -> new ArrayList<Map<String, String>>());
        history.add(Map.of("role", role, "content", content));
    }
}
```

- [ ] **Step 3: Create `PreVisitController`**

```java
package my.cliniflow.controller.biz.previsit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.PreVisitWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.previsit.request.PreVisitTurnRequest;
import my.cliniflow.controller.biz.previsit.response.PreVisitSessionResponse;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/previsit")
public class PreVisitController {

    private final PreVisitWriteAppService svc;

    public PreVisitController(PreVisitWriteAppService svc) {
        this.svc = svc;
    }

    @PostMapping("/sessions")
    public WebResult<PreVisitSessionResponse> start(
        @AuthenticationPrincipal JwtService.Claims principal
    ) {
        // For Day 1: we treat the logged-in user as the patient. Patient→User
        // linkage is via the `patients.user_id` seed row. We resolve the
        // patient row via a lookup in the service on Day 2+; for now the seed
        // patient_id is hardcoded via config.
        UUID patientId = UUID.fromString("00000000-0000-0000-0000-000000000010");
        return WebResult.ok(svc.startSession(patientId));
    }

    @PostMapping("/sessions/{visitId}/turn")
    public WebResult<PreVisitSessionResponse> turn(
        @PathVariable UUID visitId,
        @Valid @RequestBody PreVisitTurnRequest req
    ) {
        return WebResult.ok(svc.applyTurn(visitId, req.userMessage()));
    }
}
```

Known tech debt (accepted for Day 1): hardcoded `patientId`. Day 2 or 3 replaces it with a `patients` lookup by `user_id=principal.userId()`.

- [ ] **Step 4: Compile (Task 8 wires the agent; we expect a compile error until then)**

Run: `cd backend && ./mvnw -DskipTests compile`
Expected: compile error on `AgentServiceClient.callPreVisitTurn` and `AgentServiceClient.PreVisitTurnResult` — those don't exist yet. That's the cue to move to Task 8.

- [ ] **Step 5: Commit (with Task 8 — one commit lands both)**

Don't commit yet — leave the uncommitted change in the tree. Task 8 completes the compile.

---

## Task 8: Backend — Wire AgentServiceClient.callPreVisitTurn

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java`
- Test: `backend/src/test/java/my/cliniflow/controller/biz/previsit/PreVisitControllerIntegrationTest.java`

- [ ] **Step 1: Replace `AgentServiceClient` contents**

```java
package my.cliniflow.infrastructure.client;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

@Component
public class AgentServiceClient {

    private final WebClient client;

    public AgentServiceClient(
        @Value("${cliniflow.agent.base-url}") String baseUrl,
        @Value("${cliniflow.agent.service-token}") String serviceToken
    ) {
        this.client = WebClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader("X-Service-Token", serviceToken)
            .defaultHeader("Content-Type", "application/json")
            .build();
    }

    public PreVisitTurnResult callPreVisitTurn(Map<String, Object> structured) {
        return withCorrelation(client.post().uri("/agents/pre-visit/turn"))
            .bodyValue(new PreVisitTurnRequest(structured))
            .retrieve()
            .bodyToMono(PreVisitTurnResult.class)
            .block();  // Blocking is fine — controller stack is servlet, not reactive.
    }

    private WebClient.RequestBodySpec withCorrelation(WebClient.RequestBodySpec spec) {
        String cid = MDC.get("correlationId");
        if (cid != null) {
            spec = (WebClient.RequestBodySpec) spec.header("X-Correlation-ID", cid);
        }
        return spec;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PreVisitTurnRequest(Map<String, Object> structured) {}

    public record PreVisitTurnResult(
        String assistantMessage,
        Map<String, Object> fields,
        boolean done
    ) {}
}
```

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw -DskipTests compile`
Expected: `BUILD SUCCESS`.

- [ ] **Step 3: Write the failing integration test with WireMock-style stub**

Because the controller test shouldn't depend on the agent running, we use `@MockBean` on `AgentServiceClient`:

```java
package my.cliniflow.controller.biz.previsit;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.auth.request.LoginRequest;
import my.cliniflow.controller.biz.previsit.request.PreVisitTurnRequest;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PreVisitControllerIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @MockBean AgentServiceClient agent;

    @Test
    void full_two_turn_happy_path() throws Exception {
        // 1. log in as seeded patient
        String loginBody = om.writeValueAsString(new LoginRequest("patient@demo.local", "password"));
        MvcResult login = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody))
            .andExpect(status().isOk()).andReturn();
        String token = om.readTree(login.getResponse().getContentAsString())
            .path("data").path("token").asText();

        // 2. stub agent reply
        when(agent.callPreVisitTurn(any())).thenReturn(
            new AgentServiceClient.PreVisitTurnResult(
                "How long have you had this?",
                Map.of("chief_complaint", "headache"),
                false
            )
        );

        // 3. POST /sessions
        MvcResult start = mvc.perform(post("/api/previsit/sessions")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.visitId").isNotEmpty())
            .andReturn();
        String visitId = om.readTree(start.getResponse().getContentAsString())
            .path("data").path("visitId").asText();

        // 4. POST /sessions/{id}/turn
        String turnBody = om.writeValueAsString(new PreVisitTurnRequest("I have a headache"));
        mvc.perform(post("/api/previsit/sessions/" + visitId + "/turn")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(turnBody))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.assistantMessage").value("How long have you had this?"))
            .andExpect(jsonPath("$.data.done").value(false))
            .andExpect(jsonPath("$.data.structured.fields.chief_complaint").value("headache"));
    }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd backend && ./mvnw -Dtest=PreVisitControllerIntegrationTest test`
Expected: 1 test, 0 failures.

- [ ] **Step 5: Commit Tasks 7 + 8 together**

```bash
git add backend/src/main/java/my/cliniflow/application backend/src/main/java/my/cliniflow/controller/biz/previsit backend/src/main/java/my/cliniflow/infrastructure/client backend/src/test/java/my/cliniflow/controller/biz/previsit
git commit -m "feat: add pre-visit session and turn endpoints with agent client"
```

---

## Task 9: Agent — OpenAI client wrapper

**Files:**
- Create: `agent/app/llm/__init__.py` (empty)
- Create: `agent/app/llm/openai_client.py`

- [ ] **Step 1: Create empty `__init__.py`**

```python
```

(file is empty)

- [ ] **Step 2: Create the client factory**

```python
# agent/app/llm/openai_client.py
from functools import lru_cache

from langchain_openai import ChatOpenAI

from app.config import settings


@lru_cache(maxsize=1)
def get_chat_model() -> ChatOpenAI:
    """
    Singleton chat model. OpenAI-compatible — swap to Z.AI GLM by changing
    OPENAI_BASE_URL/OPENAI_API_KEY/OPENAI_MODEL env vars.
    """
    return ChatOpenAI(
        base_url=settings.openai_base_url,
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,  # resilience4j on the backend side handles retries
    )
```

- [ ] **Step 3: Smoke-check the import path**

Run: `cd agent && python -c "from app.llm.openai_client import get_chat_model; print(get_chat_model())"`
Expected: prints a `ChatOpenAI(...)` repr without network calls. If `pydantic_settings` complains about a missing field, set `OPENAI_API_KEY=sk-test` in your shell (or use `.env`).

- [ ] **Step 4: Commit**

```bash
git add agent/app/llm
git commit -m "feat: add OpenAI-compatible chat model factory"
```

---

## Task 10: Agent — Pre-visit LangGraph state machine

**Files:**
- Create: `agent/app/graphs/__init__.py` (empty)
- Create: `agent/app/graphs/pre_visit.py`
- Modify: `agent/pyproject.toml`
- Create: `agent/tests/__init__.py` (empty)
- Create: `agent/tests/test_pre_visit_graph.py`

State machine behavior (mandatory for the test to make sense):
- Required fields asked in order: `chief_complaint`, `duration`, `severity`, `allergies`, `current_medications`.
- On each turn, we look at the last user message + known fields, ask the LLM to extract *the missing field we just asked about*, then emit the next question for the next missing field.
- When all 5 are filled, emit a closing message and `done=True`.

- [ ] **Step 1: Add pytest to dev deps**

Check `agent/pyproject.toml`. If it doesn't declare dev deps, add:

```toml
[project.optional-dependencies]
dev = ["pytest==8.3.3", "pytest-asyncio==0.24.0"]
```

Install: `cd agent && pip install -e ".[dev]"`

- [ ] **Step 2: Write the failing state-machine test**

```python
# agent/tests/test_pre_visit_graph.py
from unittest.mock import AsyncMock, patch

import pytest

from app.graphs.pre_visit import run_turn


@pytest.mark.asyncio
async def test_extracts_chief_complaint_and_asks_duration():
    structured = {
        "history": [
            {"role": "assistant", "content": "What's the main reason for your visit today?"},
            {"role": "user", "content": "I have a terrible headache"},
        ],
        "fields": {},
        "done": False,
    }
    with patch("app.graphs.pre_visit._extract_field",
               new=AsyncMock(return_value="headache")):
        result = await run_turn(structured)

    assert result["fields"]["chief_complaint"] == "headache"
    assert result["done"] is False
    assert "how long" in result["assistant_message"].lower()


@pytest.mark.asyncio
async def test_marks_done_after_all_fields_filled():
    structured = {
        "history": [
            {"role": "assistant", "content": "Any current medications?"},
            {"role": "user", "content": "None"},
        ],
        "fields": {
            "chief_complaint": "headache",
            "duration": "2 days",
            "severity": "7",
            "allergies": "none",
        },
        "done": False,
    }
    with patch("app.graphs.pre_visit._extract_field",
               new=AsyncMock(return_value="none")):
        result = await run_turn(structured)

    assert result["fields"]["current_medications"] == "none"
    assert result["done"] is True
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd agent && pytest tests/test_pre_visit_graph.py -v`
Expected: `ImportError` — `app.graphs.pre_visit` not found.

- [ ] **Step 4: Implement `pre_visit.py`**

```python
# agent/app/graphs/pre_visit.py
"""Stateless pre-visit turn handler.

The backend owns the conversation state. Each turn we receive the full
history + known fields and return the next assistant message + updated
fields. We do NOT keep any in-memory state across requests.
"""
from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm.openai_client import get_chat_model

REQUIRED_FIELDS: list[str] = [
    "chief_complaint",
    "duration",
    "severity",
    "allergies",
    "current_medications",
]

NEXT_QUESTION: dict[str, str] = {
    "chief_complaint": "What's the main reason for your visit today?",
    "duration": "How long have you had this?",
    "severity": "On a scale of 1 to 10, how severe is it?",
    "allergies": "Do you have any allergies I should know about?",
    "current_medications": "Are you taking any medications right now?",
}

CLOSING_MESSAGE = (
    "Thank you — I've captured everything the doctor needs before your "
    "appointment. You can close this chat now."
)

_EXTRACT_PROMPT = """\
You extract a single structured field from a patient's reply during a
pre-visit intake chat. Return ONLY the extracted value as plain text,
nothing else. No quotes, no JSON, no preamble.

Field to extract: {field_name}
Question just asked: {question}
Patient's reply: {reply}

Field value:"""


async def _extract_field(field_name: str, question: str, reply: str) -> str:
    model = get_chat_model()
    prompt = _EXTRACT_PROMPT.format(
        field_name=field_name, question=question, reply=reply
    )
    response = await model.ainvoke(
        [SystemMessage(content="You extract structured fields from free text."),
         HumanMessage(content=prompt)]
    )
    return (response.content or "").strip()


def _first_missing(fields: dict[str, Any]) -> str | None:
    for f in REQUIRED_FIELDS:
        if f not in fields or not fields[f]:
            return f
    return None


async def run_turn(structured: dict[str, Any]) -> dict[str, Any]:
    fields: dict[str, Any] = dict(structured.get("fields", {}))
    history: list[dict[str, str]] = list(structured.get("history", []))

    # What question did we just ask? (last assistant message)
    last_assistant = next(
        (m["content"] for m in reversed(history) if m["role"] == "assistant"),
        None,
    )
    last_user = next(
        (m["content"] for m in reversed(history) if m["role"] == "user"),
        "",
    )

    # Which field was that question targeting? Match against our canned bank.
    current_field: str | None = None
    for field, q in NEXT_QUESTION.items():
        if last_assistant == q:
            current_field = field
            break

    if current_field and last_user and current_field not in fields:
        value = await _extract_field(current_field, last_assistant, last_user)
        fields[current_field] = value

    next_field = _first_missing(fields)
    if next_field is None:
        return {
            "assistant_message": CLOSING_MESSAGE,
            "fields": fields,
            "done": True,
        }
    return {
        "assistant_message": NEXT_QUESTION[next_field],
        "fields": fields,
        "done": False,
    }
```

- [ ] **Step 5: Run test, verify it passes**

Run: `cd agent && pytest tests/test_pre_visit_graph.py -v`
Expected: 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add agent/app/graphs agent/app/llm agent/tests agent/pyproject.toml
git commit -m "feat: add pre-visit state machine with 5 canned fields"
```

---

## Task 11: Agent — Wire /agents/pre-visit/turn route

**Files:**
- Replace: `agent/app/routes/pre_visit.py`
- Create: `agent/tests/test_pre_visit_route.py`

Contract:
- Request: `{ "structured": { history, fields, done } }`
- Response: `{ "assistantMessage": str, "fields": dict, "done": bool }` — camelCase to match the Java `PreVisitTurnResult` record accessor names.

- [ ] **Step 1: Replace route file**

```python
# agent/app/routes/pre_visit.py
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.graphs.pre_visit import run_turn

router = APIRouter()


class TurnRequest(BaseModel):
    structured: dict[str, Any] = Field(default_factory=dict)


class TurnResponse(BaseModel):
    assistantMessage: str  # noqa: N815 — camelCase matches Java record accessor
    fields: dict[str, Any]
    done: bool


@router.post("/turn", response_model=TurnResponse)
async def turn(req: TurnRequest) -> TurnResponse:
    result = await run_turn(req.structured)
    return TurnResponse(
        assistantMessage=result["assistant_message"],
        fields=result["fields"],
        done=result["done"],
    )
```

- [ ] **Step 2: Write the failing route test**

```python
# agent/tests/test_pre_visit_route.py
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_turn_route_requires_service_token():
    resp = client.post("/agents/pre-visit/turn", json={"structured": {}})
    assert resp.status_code in (401, 403)


def test_turn_route_happy_path():
    with patch("app.routes.pre_visit.run_turn",
               new=AsyncMock(return_value={
                   "assistant_message": "ok",
                   "fields": {"chief_complaint": "x"},
                   "done": False,
               })):
        resp = client.post(
            "/agents/pre-visit/turn",
            json={"structured": {"history": [], "fields": {}, "done": False}},
            headers={"X-Service-Token": "change-me"},  # matches default in config.py
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["assistantMessage"] == "ok"
    assert body["fields"] == {"chief_complaint": "x"}
    assert body["done"] is False
```

- [ ] **Step 3: Run test, verify it passes**

Run: `cd agent && pytest tests/test_pre_visit_route.py -v`
Expected: 2 tests passed. If the service-token auth header name or default value differs, inspect `agent/app/deps.py` and adjust the header name in the test.

- [ ] **Step 4: Boot the agent and smoke-test**

Run: `cd agent && uvicorn app.main:app --reload --port 8000`
In another terminal:

```bash
curl -s -X POST http://localhost:8000/agents/pre-visit/turn \
  -H "X-Service-Token: change-me" \
  -H "Content-Type: application/json" \
  -d '{"structured": {"history": [], "fields": {}, "done": false}}'
```

Expected: `{"assistantMessage": "What's the main reason for your visit today?", "fields": {}, "done": false}`

Note: This calls OpenAI only when `current_field` matches; on a fresh history, no LLM call is made — so the smoke test works without an `OPENAI_API_KEY`.

- [ ] **Step 5: Commit**

```bash
git add agent/app/routes/pre_visit.py agent/tests/test_pre_visit_route.py
git commit -m "feat: wire /agents/pre-visit/turn route to state machine"
```

---

## Task 12: Frontend — API client + auth helper

**Files:**
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/auth.ts`

- [ ] **Step 1: Create `auth.ts` — localStorage JWT helpers**

```typescript
// frontend/lib/auth.ts
const TOKEN_KEY = "cliniflow.token";
const USER_KEY = "cliniflow.user";

export type AuthUser = {
    userId: string;
    email: string;
    role: "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";
    fullName: string;
};

export function saveAuth(token: string, user: AuthUser): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function clearAuth(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}
```

- [ ] **Step 2: Create `api.ts` — fetch wrapper**

```typescript
// frontend/lib/api.ts
import { getToken } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export type WebResult<T> = {
    code: number;
    message: string;
    data: T | null;
};

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const envelope: WebResult<T> = await res.json();
    if (envelope.code !== 0) {
        throw new Error(envelope.message || `code ${envelope.code}`);
    }
    if (envelope.data == null) throw new Error("empty response data");
    return envelope.data;
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib
git commit -m "feat: add frontend API client and auth storage"
```

---

## Task 13: Frontend — /login page

**Files:**
- Create: `frontend/app/login/page.tsx`

- [ ] **Step 1: Create login page**

```tsx
// frontend/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiPost } from "../../lib/api";
import { saveAuth, type AuthUser } from "../../lib/auth";

type LoginResponse = AuthUser & { token: string };

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("patient@demo.local");
    const [password, setPassword] = useState("password");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            const data = await apiPost<LoginResponse>("/auth/login", { email, password });
            const { token, ...user } = data;
            saveAuth(token, user);
            router.push(user.role === "PATIENT" ? "/previsit/new" : "/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "login failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main style={{ maxWidth: 380, margin: "4rem auto", fontFamily: "system-ui" }}>
            <h1>Sign in</h1>
            <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
                <label>
                    Email
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                           style={{ width: "100%", padding: "0.5rem" }} required />
                </label>
                <label>
                    Password
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                           style={{ width: "100%", padding: "0.5rem" }} required />
                </label>
                <button type="submit" disabled={busy} style={{ padding: "0.5rem" }}>
                    {busy ? "Signing in…" : "Sign in"}
                </button>
                {error && <p style={{ color: "crimson" }}>{error}</p>}
                <small>
                    Demo: <code>patient@demo.local</code> / <code>doctor@demo.local</code>, password <code>password</code>
                </small>
            </form>
        </main>
    );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/login
git commit -m "feat: add /login page with demo credentials"
```

---

## Task 14: Frontend — /previsit/new chat page + end-to-end smoke

**Files:**
- Create: `frontend/app/previsit/new/page.tsx`
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Create the chat page**

```tsx
// frontend/app/previsit/new/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiPost } from "../../../lib/api";
import { getToken } from "../../../lib/auth";

type Session = {
    visitId: string;
    assistantMessage: string;
    structured: { history: Array<{ role: string; content: string }>; fields: Record<string, unknown>; done: boolean };
    done: boolean;
};

type Message = { role: "assistant" | "user"; content: string };

export default function PreVisitNewPage() {
    const router = useRouter();
    const [visitId, setVisitId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [fields, setFields] = useState<Record<string, unknown>>({});
    const [done, setDone] = useState(false);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const started = useRef(false);

    useEffect(() => {
        if (!getToken()) {
            router.push("/login");
            return;
        }
        if (started.current) return;
        started.current = true;
        (async () => {
            try {
                setBusy(true);
                const s = await apiPost<Session>("/previsit/sessions", {});
                setVisitId(s.visitId);
                setMessages([{ role: "assistant", content: s.assistantMessage }]);
            } catch (err) {
                setError(err instanceof Error ? err.message : "failed to start");
            } finally {
                setBusy(false);
            }
        })();
    }, [router]);

    async function send(e: React.FormEvent) {
        e.preventDefault();
        if (!visitId || !input.trim() || done) return;
        const userMsg = input.trim();
        setInput("");
        setMessages((m) => [...m, { role: "user", content: userMsg }]);
        setBusy(true);
        setError(null);
        try {
            const s = await apiPost<Session>(`/previsit/sessions/${visitId}/turn`, { userMessage: userMsg });
            setMessages((m) => [...m, { role: "assistant", content: s.assistantMessage }]);
            setFields(s.structured.fields);
            setDone(s.done);
        } catch (err) {
            setError(err instanceof Error ? err.message : "turn failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui" }}>
            <h1>Pre-visit intake</h1>
            <div style={{
                border: "1px solid #ddd", borderRadius: 8, padding: "1rem",
                minHeight: 300, display: "grid", gap: "0.5rem"
            }}>
                {messages.map((m, i) => (
                    <div key={i} style={{
                        justifySelf: m.role === "user" ? "end" : "start",
                        background: m.role === "user" ? "#e0f2fe" : "#f1f5f9",
                        padding: "0.5rem 0.75rem", borderRadius: 12, maxWidth: "80%"
                    }}>
                        {m.content}
                    </div>
                ))}
            </div>

            {!done && (
                <form onSubmit={send} style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                    <input value={input} onChange={(e) => setInput(e.target.value)}
                           disabled={busy || !visitId}
                           placeholder="Type your answer…"
                           style={{ flex: 1, padding: "0.5rem" }} />
                    <button type="submit" disabled={busy || !visitId || !input.trim()}>Send</button>
                </form>
            )}

            {done && (
                <section style={{ marginTop: "1.5rem", padding: "1rem", background: "#f0fdf4", borderRadius: 8 }}>
                    <h2>Thanks! Here's what the doctor will see:</h2>
                    <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(fields, null, 2)}</pre>
                </section>
            )}

            {error && <p style={{ color: "crimson" }}>{error}</p>}
        </main>
    );
}
```

- [ ] **Step 2: Add nav links from home**

Replace `frontend/app/page.tsx`:

```tsx
import Link from "next/link";

export default function Home() {
    return (
        <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
            <h1>CliniFlow AI</h1>
            <p>Pre-visit → Visit → Post-visit clinical workflow.</p>
            <ul>
                <li><Link href="/login">Sign in</Link></li>
                <li><Link href="/previsit/new">Start pre-visit intake (requires login)</Link></li>
            </ul>
        </main>
    );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: End-to-end smoke test (manual)**

Terminal 1: `cd agent && uvicorn app.main:app --reload --port 8000`
Terminal 2: `cd backend && ./mvnw spring-boot:run`
Terminal 3: `cd frontend && npm run dev`

Browser: `http://localhost:3000/login`

1. Sign in with `patient@demo.local` / `password`
2. Redirect lands on `/previsit/new`, first assistant question appears
3. Answer "I have a headache" → next question appears
4. Continue through all 5 questions
5. After the 5th answer, the done panel shows the structured fields as JSON

Verify in Postgres (psql or Supabase console):

```sql
SELECT id, status FROM visits ORDER BY gmt_create DESC LIMIT 1;
SELECT visit_id, structured FROM pre_visit_reports ORDER BY gmt_create DESC LIMIT 1;
```

Expected: one row each, `status='IN_PROGRESS'`, `structured->'fields'` has all 5 keys.

- [ ] **Step 5: Commit**

```bash
git add frontend/app
git commit -m "feat: add pre-visit chat UI with 5-question intake"
```

---

## Exit Criteria

By end of Day 1, all of the following must be true:

- `./mvnw test` passes on the backend (JwtServiceTest, UserRepositoryTest, AuthControllerIntegrationTest, PreVisitControllerIntegrationTest).
- `pytest` passes on the agent (test_pre_visit_graph.py, test_pre_visit_route.py).
- `npm run typecheck` passes on the frontend.
- Manual E2E smoke from Task 14 Step 4 completes successfully.
- A new `visits` row and a new `pre_visit_reports` row exist in Postgres after the smoke test.
- No console errors in the browser during the happy path.

## Accepted Tech Debt (To Address Later)

- `PreVisitController` hardcodes `patientId` — Day 2 wires a `patients.user_id` lookup.
- No rate limiting on `/api/auth/login`. Day 5 problem.
- JWT stored in `localStorage` (XSS-vulnerable). Accepted for hackathon demo. Production would use httpOnly cookies.
- `apiPost` throws on non-200 HTTP status instead of distinguishing envelope-error vs transport-error. Fine for Day 1.
- No global error boundary on the React side.
- No refresh token; session lives for the JWT `expiry-minutes` window.

## Self-Review Notes

- **Spec coverage (Day 1 of the phase plan):** ✅ Login endpoint, JWT auth, PreVisit session start + turn, LangGraph state machine with 5 canned questions, structured report persisted, minimal frontend for both screens. Every Day 1 bullet in the spec maps to at least one task.
- **Placeholders:** none. Every step has executable code or exact commands.
- **Type consistency:** `PreVisitTurnResult.assistantMessage / fields / done` — the Java record accessors and the agent's `TurnResponse` Pydantic fields match (camelCase), which is what `WebClient.bodyToMono` decodes into. `AuthUser.role` enum values match the DB check constraint values.
- **Known ambiguity:** Task 1 Step 4 test requires a running Postgres. For CI this becomes a problem; the accepted mitigation for hackathon speed is "run tests against the dev stack Postgres." A Testcontainers migration is explicitly out of scope.
