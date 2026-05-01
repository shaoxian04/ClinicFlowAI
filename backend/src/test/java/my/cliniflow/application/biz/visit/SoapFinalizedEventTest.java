package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.event.SoapFinalizedDomainEvent;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.MedicationRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Asserts that finalising a SOAP report publishes a {@link SoapFinalizedDomainEvent}
 * with the correct {@code hasMedications} flag.
 */
@SpringBootTest
@Import(SoapFinalizedEventTest.EventCapturer.class)
@Transactional
class SoapFinalizedEventTest {

    static final UUID DOCTOR_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final UUID PATIENT_ID     = UUID.fromString("00000000-0000-0000-0000-000000000010");

    @Autowired SoapWriteAppService soap;
    @Autowired VisitRepository visits;
    @Autowired MedicalReportRepository reports;
    @Autowired MedicationRepository medications;
    @Autowired EventCapturer capturer;

    @Test
    void finalize_publishes_event_with_hasMedications_false_when_no_meds() {
        UUID visitId = seedVisit();
        seedDraftReport(visitId);
        capturer.reset();

        soap.finalize(visitId, DOCTOR_USER_ID,
            "subj", "obj", "assess", "plan");

        SoapFinalizedDomainEvent ev = capturer.captured.get();
        assertThat(ev).isNotNull();
        assertThat(ev.visitId()).isEqualTo(visitId);
        assertThat(ev.patientId()).isEqualTo(PATIENT_ID);
        assertThat(ev.hasMedications()).isFalse();
        assertThat(ev.followUpDate()).isNull();
    }

    @Test
    void finalize_publishes_event_with_hasMedications_true_when_meds_exist() {
        UUID visitId = seedVisit();
        seedDraftReport(visitId);
        seedMedication(visitId);
        capturer.reset();

        soap.finalize(visitId, DOCTOR_USER_ID,
            "subj", "obj", "assess", "plan");

        SoapFinalizedDomainEvent ev = capturer.captured.get();
        assertThat(ev).isNotNull();
        assertThat(ev.hasMedications()).isTrue();
    }

    private UUID seedVisit() {
        VisitModel v = new VisitModel();
        v.setPatientId(PATIENT_ID);
        v.setDoctorId(DOCTOR_USER_ID);
        v.setStatus(VisitStatus.IN_PROGRESS);
        return visits.save(v).getId();
    }

    private void seedDraftReport(UUID visitId) {
        MedicalReportModel r = new MedicalReportModel();
        r.setVisitId(visitId);
        r.setSubjective("draft");
        r.setObjective("draft");
        r.setAssessment("draft");
        r.setPlan("draft");
        reports.save(r);
    }

    private void seedMedication(UUID visitId) {
        MedicationModel m = new MedicationModel();
        m.setVisitId(visitId);
        m.setName("Paracetamol");
        m.setDosage("500mg");
        m.setFrequency("TDS");
        m.setDurationDays(5);
        medications.save(m);
    }

    @Component
    static class EventCapturer {
        final AtomicReference<SoapFinalizedDomainEvent> captured = new AtomicReference<>();

        @EventListener
        void onFinalized(SoapFinalizedDomainEvent ev) {
            captured.set(ev);
        }

        void reset() { captured.set(null); }
    }
}
