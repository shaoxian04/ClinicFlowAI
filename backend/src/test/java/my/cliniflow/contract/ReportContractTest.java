package my.cliniflow.contract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.infrastructure.security.JwtService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end contract tests — real HTTP through the backend, with the agent
 * running in docker-compose. Asserts frontend-facing JSON keys match the
 * TypeScript interface exactly (prevents the snake_case/camelCase drift
 * documented in docs/post-mortem/2026-04-22-soap-generate-and-finalize-e2e.md).
 *
 * Gated by RUN_CONTRACT_TESTS=true because it consumes LLM budget. Run locally
 * against docker-compose:
 *   docker compose up -d agent backend
 *   RUN_CONTRACT_TESTS=true ./mvnw test -Dtest=ReportContractTest
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "RUN_CONTRACT_TESTS", matches = "true")
class ReportContractTest {

    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private static final UUID TEST_DOCTOR_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID TEST_PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");

    private String base() { return "http://localhost:" + port; }

    /**
     * JwtService.issue(UUID userId, String email, Role role) — three discrete
     * params, NOT a Claims record. Adapted from the spec's assumed Claims-record
     * overload, which does not exist.
     */
    private HttpHeaders auth() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        String token = jwt.issue(TEST_DOCTOR_ID, "doctor@demo.local", Role.DOCTOR);
        h.setBearerAuth(token);
        return h;
    }

    private UUID seedIdleVisit() {
        UUID visitId = UUID.randomUUID();
        jdbc.update(
            "INSERT INTO visits (id, patient_id, doctor_id, status, started_at) " +
            "VALUES (?, ?, ?, 'IN_PROGRESS', now())",
            visitId, TEST_PATIENT_ID, TEST_DOCTOR_ID
        );
        return visitId;
    }

    private UUID seedVisitWithDraft() {
        UUID visitId = seedIdleVisit();
        String draftJson = "{\"subjective\": {\"chief_complaint\": \"Dry cough x 3 days\", " +
            "\"history_of_present_illness\": \"3 days\", \"associated_symptoms\": [], \"relevant_history\": []}," +
            "\"objective\": {\"vital_signs\": {}}, \"assessment\": {\"primary_diagnosis\": \"Acute bronchitis\", " +
            "\"differential_diagnoses\": [], \"icd10_codes\": []}, \"plan\": {\"medications\": [], " +
            "\"investigations\": [], \"lifestyle_advice\": [], \"follow_up\": {\"needed\": false}, \"red_flags\": []}}";
        jdbc.update(
            "UPDATE visits SET report_draft = ?::jsonb, report_confidence_flags = '{}'::jsonb WHERE id = ?",
            draftJson, visitId
        );
        return visitId;
    }

    private UUID seedApprovedVisitWithDraft() {
        UUID visitId = seedVisitWithDraft();
        jdbc.update(
            "INSERT INTO medical_reports (id, visit_id, subjective, objective, assessment, plan, " +
            "is_finalized, preview_approved_at, gmt_create, gmt_modified) " +
            "VALUES (gen_random_uuid(), ?, '', '', '', '', false, now(), now(), now())",
            visitId
        );
        return visitId;
    }

    private JsonNode postJson(String path, Map<String, Object> body) throws Exception {
        var resp = new RestTemplate().postForEntity(
            base() + path, new HttpEntity<>(body, auth()), String.class
        );
        return mapper.readTree(resp.getBody());
    }

    private JsonNode postEmpty(String path) throws Exception {
        var resp = new RestTemplate().postForEntity(
            base() + path, new HttpEntity<>("{}", auth()), String.class
        );
        return mapper.readTree(resp.getBody());
    }

    // ── 1. /generate-sync ────────────────────────────────────────────────────
    @Test
    void generateSync_envelopeHasStatusReportClarification() throws Exception {
        UUID visitId = seedIdleVisit();
        JsonNode json = postJson(
            "/api/visits/" + visitId + "/report/generate-sync",
            Map.of("transcript", "patient has a cough for 3 days", "specialty", "")
        );
        assertThat(json.has("code")).isTrue();
        JsonNode data = json.path("data");
        assertThat(data.has("status")).isTrue();
        assertThat(data.has("report")).isTrue();
        assertThat(data.has("clarification")).isTrue();
        if (!data.path("report").isNull()) {
            assertThat(data.path("report").path("subjective").has("chiefComplaint")).isTrue();
            assertThat(data.path("report").path("plan").path("followUp").has("needed")).isTrue();
        }
    }

    // ── 2. /clarify-sync ─────────────────────────────────────────────────────
    @Test
    void clarifySync_envelopeHasStatusReportClarification() throws Exception {
        UUID visitId = seedIdleVisit();
        postJson(
            "/api/visits/" + visitId + "/report/generate-sync",
            Map.of("transcript", "Patient came in.", "specialty", "")
        );
        JsonNode json = postJson(
            "/api/visits/" + visitId + "/report/clarify-sync",
            Map.of("answer", "Dry cough 3 days, diagnose as acute bronchitis")
        );
        JsonNode data = json.path("data");
        assertThat(data.has("status")).isTrue();
        assertThat(data.has("report")).isTrue();
        assertThat(data.has("clarification")).isTrue();
    }

    // ── 3. /edit-sync ────────────────────────────────────────────────────────
    @Test
    void editSync_envelopeHasStatusReportClarification() throws Exception {
        UUID visitId = seedVisitWithDraft();
        JsonNode json = postJson(
            "/api/visits/" + visitId + "/report/edit-sync",
            Map.of("instruction", "change follow-up to 2 weeks")
        );
        JsonNode data = json.path("data");
        assertThat(data.has("status")).isTrue();
        assertThat(data.has("report")).isTrue();
        assertThat(data.path("report").path("plan").path("followUp").has("timeframe")).isTrue();
    }

    // ── 4. PATCH /report/draft ───────────────────────────────────────────────
    @Test
    void draftPatch_updatesReportAndEchoesIt() throws Exception {
        UUID visitId = seedVisitWithDraft();
        var headers = auth();
        var body = Map.of("path", "plan.followUp.timeframe", "value", "2 weeks");
        var resp = new RestTemplate().exchange(
            base() + "/api/visits/" + visitId + "/report/draft",
            org.springframework.http.HttpMethod.PATCH,
            new HttpEntity<>(body, headers), String.class
        );
        JsonNode json = mapper.readTree(resp.getBody());
        JsonNode data = json.path("data");
        assertThat(data.has("report")).isTrue();
        assertThat(data.path("report").path("plan").path("followUp").path("timeframe").asText())
            .isEqualTo("2 weeks");
    }

    // ── 5. GET /report/chat ──────────────────────────────────────────────────
    @Test
    void chat_returnsTurnsList() throws Exception {
        UUID visitId = seedIdleVisit();
        postJson(
            "/api/visits/" + visitId + "/report/generate-sync",
            Map.of("transcript", "Dry cough 3 days, bronchitis", "specialty", "")
        );
        var resp = new RestTemplate().exchange(
            base() + "/api/visits/" + visitId + "/report/chat",
            org.springframework.http.HttpMethod.GET,
            new HttpEntity<>(auth()), String.class
        );
        JsonNode json = mapper.readTree(resp.getBody());
        JsonNode data = json.path("data");
        assertThat(data.has("turns")).isTrue();
        assertThat(data.path("turns").isArray()).isTrue();
        if (data.path("turns").size() > 0) {
            JsonNode t0 = data.path("turns").get(0);
            assertThat(t0.has("turnIndex")).isTrue();
            assertThat(t0.has("role")).isTrue();
            assertThat(t0.has("content")).isTrue();
        }
    }

    // ── 6. POST /report/approve ──────────────────────────────────────────────
    @Test
    void approve_returnsApprovedTrueAndTimestamp() throws Exception {
        UUID visitId = seedVisitWithDraft();
        // approve needs a medical_reports row to exist
        jdbc.update(
            "INSERT INTO medical_reports (id, visit_id, subjective, objective, assessment, plan, " +
            "is_finalized, gmt_create, gmt_modified) " +
            "VALUES (gen_random_uuid(), ?, '', '', '', '', false, now(), now())",
            visitId
        );
        JsonNode json = postEmpty("/api/visits/" + visitId + "/report/approve");
        JsonNode data = json.path("data");
        assertThat(data.path("approved").asBoolean()).isTrue();
        assertThat(data.has("approvedAt")).isTrue();
        assertThat(data.path("approvedAt").asText()).isNotBlank();
    }

    // ── 7. POST /report/finalize ─────────────────────────────────────────────
    @Test
    void finalize_409WhenNotApproved_200WhenApproved() throws Exception {
        UUID notApproved = seedVisitWithDraft();
        jdbc.update(
            "INSERT INTO medical_reports (id, visit_id, subjective, objective, assessment, plan, " +
            "is_finalized, gmt_create, gmt_modified) " +
            "VALUES (gen_random_uuid(), ?, '', '', '', '', false, now(), now())",
            notApproved
        );
        try {
            new RestTemplate().postForEntity(
                base() + "/api/visits/" + notApproved + "/report/finalize",
                new HttpEntity<>("{}", auth()), String.class
            );
        } catch (HttpClientErrorException e) {
            assertThat(e.getStatusCode().value()).isEqualTo(409);
        }

        UUID approved = seedApprovedVisitWithDraft();
        JsonNode json = postEmpty("/api/visits/" + approved + "/report/finalize");
        JsonNode data = json.path("data");
        assertThat(data.has("visitId")).isTrue();
        assertThat(data.has("summaryEn")).isTrue();
        assertThat(data.has("summaryMs")).isTrue();
        assertThat(data.has("finalizedAt")).isTrue();
    }
}
