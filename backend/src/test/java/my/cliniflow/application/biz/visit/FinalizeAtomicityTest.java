package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Enforces spec §5.5: finalize is ONE atomic transaction. If the audit_log
 * INSERT fails (simulated here by renaming the audit_log table so the
 * relation does not exist), the visit.status must NOT flip to FINALIZED
 * and medical_reports.is_finalized must stay false.
 *
 * Uses the real Spring context + H2 in-memory (MODE=PostgreSQL). The RENAME
 * trick works in H2 and faithfully exercises the @Transactional rollback
 * without mocking the transaction machinery itself.
 *
 * NOTE: This test is NOT @Transactional — by design. We need to verify that
 * the FAILED finalize call (which rolls back its own transaction) does not
 * leave committed state behind. If the test method itself were @Transactional,
 * any rollback inside svc.finalize() would be invisible to our assertions.
 */
@SpringBootTest
class FinalizeAtomicityTest {

    // Seeded by data.sql — must match the UUIDs in that file.
    private static final UUID DOCTOR_ID  = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");

    @Autowired ReportReviewAppService svc;
    @Autowired VisitRepository visits;
    @Autowired MedicalReportRepository reports;
    @Autowired JdbcTemplate jdbc;

    // Replace the real AgentServiceClient so we don't need the agent running.
    @MockBean AgentServiceClient agent;

    private UUID visitId;

    @BeforeEach
    void setUp() {
        // Seed: visit in IN_PROGRESS with an approved medical_report stub.
        VisitModel v = new VisitModel();
        v.setPatientId(PATIENT_ID);
        v.setDoctorId(DOCTOR_ID);
        v.setStatus(VisitStatus.IN_PROGRESS);
        v.setStartedAt(OffsetDateTime.now());
        VisitModel saved = visits.save(v);
        visitId = saved.getId();

        MedicalReportModel r = new MedicalReportModel();
        r.setVisitId(visitId);
        r.setPreviewApprovedAt(OffsetDateTime.now());
        reports.save(r);

        // Stub the agent to return a fully-valid MedicalReport shape.
        Map<String, Object> fakeAgentResponse = Map.of(
            "ok", true,
            "summary_en", "Patient seen for cough",
            "summary_ms", "Pesakit dilihat kerana batuk",
            "report", Map.of(
                "subjective", Map.of(
                    "chief_complaint", "cough",
                    "history_of_present_illness", "3 days",
                    "associated_symptoms", List.of(),
                    "relevant_history", List.of()
                ),
                "objective", Map.of("vital_signs", Map.of()),
                "assessment", Map.of(
                    "primary_diagnosis", "bronchitis",
                    "differential_diagnoses", List.of(),
                    "icd10_codes", List.of()
                ),
                "plan", Map.of(
                    "medications", List.of(),
                    "investigations", List.of(),
                    "lifestyle_advice", List.of(),
                    "follow_up", Map.of("needed", false),
                    "red_flags", List.of()
                ),
                "confidence_flags", Map.of()
            )
        );
        Mockito.when(agent.reportFinalize(Mockito.any(UUID.class))).thenReturn(fakeAgentResponse);
    }

    @AfterEach
    void tearDown() {
        // Ensure audit_log is restored if the sabotage test failed mid-way.
        try {
            jdbc.execute("ALTER TABLE audit_log_broken RENAME TO audit_log");
        } catch (Exception ignore) {
            // Table was already named audit_log — nothing to restore.
        }
        // Clean up rows created during this test.
        try { jdbc.update("DELETE FROM audit_log WHERE resource_id = ?", visitId.toString()); } catch (Exception ignore) {}
        try { jdbc.update("DELETE FROM medical_reports WHERE visit_id = ?", visitId); } catch (Exception ignore) {}
        try { jdbc.update("DELETE FROM visits WHERE id = ?", visitId); } catch (Exception ignore) {}
    }

    @Test
    void happyPath_finalizesEverythingAtomically() {
        svc.finalize(visitId, DOCTOR_ID);

        VisitModel afterVisit = visits.findById(visitId).orElseThrow();
        assertThat(afterVisit.getStatus()).isEqualTo(VisitStatus.FINALIZED);

        MedicalReportModel afterReport = reports.findByVisitId(visitId).orElseThrow();
        assertThat(afterReport.isFinalized()).isTrue();
        assertThat(afterReport.getSummaryEn()).isEqualTo("Patient seen for cough");

        Integer auditCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM audit_log WHERE resource_id = ?",
            Integer.class, visitId.toString()
        );
        assertThat(auditCount).isEqualTo(1);
    }

    @Test
    void auditInsertFailure_rollsBackVisitAndReport() {
        // Sabotage: rename audit_log so the INSERT inside finalize fails with
        // "Table not found" — this forces the @Transactional to roll back.
        jdbc.execute("ALTER TABLE audit_log RENAME TO audit_log_broken");
        try {
            assertThatThrownBy(() -> svc.finalize(visitId, DOCTOR_ID))
                .isInstanceOf(Exception.class);

            // Critical invariant: after the failed finalize, state must be UNCHANGED.
            VisitModel afterVisit = visits.findById(visitId).orElseThrow();
            assertThat(afterVisit.getStatus())
                .as("visit status must not flip to FINALIZED if audit INSERT fails")
                .isEqualTo(VisitStatus.IN_PROGRESS);

            MedicalReportModel afterReport = reports.findByVisitId(visitId).orElseThrow();
            assertThat(afterReport.isFinalized())
                .as("medical_reports.is_finalized must stay false if audit INSERT fails")
                .isFalse();
            assertThat(afterReport.getSummaryEn())
                .as("medical_reports.summary_en must not be written if audit INSERT fails")
                .isNullOrEmpty();
        } finally {
            // Always restore the table so tearDown and other tests still work.
            jdbc.execute("ALTER TABLE audit_log_broken RENAME TO audit_log");
        }
    }
}
