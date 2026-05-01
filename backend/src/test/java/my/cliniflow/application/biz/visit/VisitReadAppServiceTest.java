package my.cliniflow.application.biz.visit;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.visit.converter.EvaluatorFindingModel2DTOConverter;
import my.cliniflow.controller.biz.visit.response.VisitDetailResponse;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.PreVisitReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.EvaluatorFindingRepository;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VisitReadAppServiceTest {

    @Mock VisitRepository visits;
    @Mock MedicalReportRepository reports;
    @Mock PatientRepository patients;
    @Mock EvaluatorFindingRepository findingRepo;
    @Mock EvaluatorFindingModel2DTOConverter findingConverter;
    @Mock AuditWriter auditWriter;

    VisitReadAppService svc;

    @BeforeEach
    void setUp() {
        svc = new VisitReadAppService(visits, reports, patients, new ObjectMapper(),
            findingRepo, findingConverter, auditWriter);
    }

    @Test
    void detail_convertsSnakeCaseFieldsToCamelCase() {
        UUID visitId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();

        VisitModel v = visitWithPreVisit(visitId, patientId, Map.of(
            "fields", Map.of(
                "chief_complaint", "headache",
                "symptom_duration", "2 days",
                "pain_severity", 7,
                "known_allergies", List.of("penicillin"),
                "current_medications", List.of(),
                "relevant_history", List.of("asthma")
            ),
            "history", List.of(),
            "done", false
        ));

        when(visits.findById(visitId)).thenReturn(Optional.of(v));
        when(reports.findByVisitId(visitId)).thenReturn(Optional.empty());
        when(patients.findById(patientId)).thenReturn(Optional.empty());
        when(visits.findReportDraftJson(visitId)).thenReturn(null);

        VisitDetailResponse resp = svc.detail(visitId);

        var fields = resp.preVisitStructured().fields();
        assertThat(fields).isNotNull();
        assertThat(fields.chiefComplaint()).isEqualTo("headache");
        assertThat(fields.symptomDuration()).isEqualTo("2 days");
        assertThat(fields.painSeverity()).isEqualTo(7);
        assertThat(fields.knownAllergies()).containsExactly("penicillin");
        assertThat(fields.currentMedications()).isEmpty();
        assertThat(fields.relevantHistory()).containsExactly("asthma");
        assertThat(resp.preVisitStructured().done()).isFalse();
    }

    @Test
    void detail_returnsEmptyStructuredWhenNoPreVisitReport() {
        UUID visitId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();

        VisitModel v = visitWithoutPreVisit(visitId, patientId);

        when(visits.findById(visitId)).thenReturn(Optional.of(v));
        when(reports.findByVisitId(visitId)).thenReturn(Optional.empty());
        when(patients.findById(patientId)).thenReturn(Optional.empty());
        when(visits.findReportDraftJson(visitId)).thenReturn(null);

        VisitDetailResponse resp = svc.detail(visitId);

        assertThat(resp.preVisitStructured()).isNotNull();
        assertThat(resp.preVisitStructured().fields()).isNull();
        assertThat(resp.preVisitStructured().done()).isFalse();
    }

    @Test
    void detail_returnsFallbackWhenConversionFails() {
        UUID visitId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();

        // pain_severity has a non-numeric value that would fail Integer conversion
        VisitModel v = visitWithPreVisit(visitId, patientId, Map.of(
            "fields", Map.of("pain_severity", "not-a-number"),
            "history", List.of(),
            "done", false
        ));

        when(visits.findById(visitId)).thenReturn(Optional.of(v));
        when(reports.findByVisitId(visitId)).thenReturn(Optional.empty());
        when(patients.findById(patientId)).thenReturn(Optional.empty());
        when(visits.findReportDraftJson(visitId)).thenReturn(null);

        VisitDetailResponse resp = svc.detail(visitId);

        // Must not throw; fallback returns null fields
        assertThat(resp.preVisitStructured()).isNotNull();
        assertThat(resp.preVisitStructured().fields()).isNull();
    }

    // --- helpers ---

    private VisitModel visitWithPreVisit(UUID visitId, UUID patientId, Map<String, Object> structured) {
        VisitModel v = visitWithoutPreVisit(visitId, patientId);
        PreVisitReportModel pv = new PreVisitReportModel();
        pv.setStructured(new java.util.HashMap<>(structured));
        v.setPreVisitReport(pv);
        return v;
    }

    private VisitModel visitWithoutPreVisit(UUID visitId, UUID patientId) {
        VisitModel v = new VisitModel();
        // Set id via reflection since there is no public setter (generated by JPA)
        try {
            var field = VisitModel.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(v, visitId);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        v.setPatientId(patientId);
        v.setStatus(VisitStatus.IN_PROGRESS);
        return v;
    }
}
