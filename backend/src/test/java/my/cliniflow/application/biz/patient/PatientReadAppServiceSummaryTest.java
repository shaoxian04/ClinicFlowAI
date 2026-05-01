package my.cliniflow.application.biz.patient;

import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.biz.patient.response.PatientSummaryDTO;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientClinicalProfileRepository;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.MedicationRepository;
import my.cliniflow.domain.biz.visit.repository.PostVisitSummaryRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import my.cliniflow.infrastructure.crypto.NationalIdEncryptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PatientReadAppServiceSummaryTest {

    private PatientRepository patients;
    private VisitRepository visits;
    private PostVisitSummaryRepository summaries;
    private MedicalReportRepository medicalReports;
    private MedicationRepository meds;
    private UserRepository users;
    private AgentServiceClient agent;
    private PatientClinicalProfileRepository clinicalProfiles;
    private NationalIdEncryptor nidEncryptor;

    private PatientReadAppService svc;

    @BeforeEach
    void setUp() {
        patients = mock(PatientRepository.class);
        visits = mock(VisitRepository.class);
        summaries = mock(PostVisitSummaryRepository.class);
        medicalReports = mock(MedicalReportRepository.class);
        meds = mock(MedicationRepository.class);
        users = mock(UserRepository.class);
        agent = mock(AgentServiceClient.class);
        clinicalProfiles = mock(PatientClinicalProfileRepository.class);
        nidEncryptor = mock(NationalIdEncryptor.class);

        svc = new PatientReadAppService(
            patients, visits, summaries, medicalReports, meds, users,
            agent, clinicalProfiles, nidEncryptor);
    }

    @Test
    void summaryThrowsResourceNotFoundForUnknownPatient() {
        UUID unknown = UUID.randomUUID();
        when(patients.findById(unknown)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.summary(unknown))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void summaryReturnsDemographicsAndVisitPreviewsForKnownPatient() {
        UUID patientId = UUID.randomUUID();
        PatientModel p = new PatientModel();
        p.setId(patientId);
        p.setFullName("Pat Demo");
        p.setEmail("pat@example.com");
        p.setPhone("+60123456789");
        p.setDateOfBirth(LocalDate.of(1990, 1, 1));

        UUID visitId = UUID.randomUUID();
        MedicalReportModel report = new MedicalReportModel();
        report.setVisitId(visitId);
        report.setSummaryEn("This is a finalized visit summary in English describing the encounter.");
        report.setFinalizedAt(OffsetDateTime.parse("2026-04-01T10:15:30+08:00"));

        when(patients.findById(patientId)).thenReturn(Optional.of(p));
        when(medicalReports.findFinalizedByPatientId(eq(patientId), any()))
            .thenReturn(List.of(report));

        PatientSummaryDTO out = svc.summary(patientId);

        assertThat(out.id()).isEqualTo(patientId);
        assertThat(out.name()).isEqualTo("Pat Demo");
        assertThat(out.email()).isEqualTo("pat@example.com");
        assertThat(out.phone()).isEqualTo("+60123456789");
        assertThat(out.dateOfBirth()).isEqualTo(LocalDate.of(1990, 1, 1));
        assertThat(out.visits()).hasSize(1);
        PatientSummaryDTO.VisitPreview vp = out.visits().get(0);
        assertThat(vp.visitId()).isEqualTo(visitId);
        assertThat(vp.finalizedAt()).isEqualTo("2026-04-01T10:15:30+08:00");
        assertThat(vp.summaryEnPreview()).contains("finalized visit summary");
    }
}
