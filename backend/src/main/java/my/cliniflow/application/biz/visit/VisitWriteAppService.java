package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Application service for visit-write operations not covered by the existing
 * {@link PreVisitWriteAppService}. Currently only exposes the follow-up
 * visit factory used by appointment booking.
 */
@Service
public class VisitWriteAppService {

    private final VisitRepository visits;
    private final UUID seededDoctorId;

    public VisitWriteAppService(VisitRepository visits,
                                @Value("${cliniflow.dev.seeded-doctor-id}") String seededDoctorId) {
        this.visits = visits;
        this.seededDoctorId = UUID.fromString(seededDoctorId);
    }

    /**
     * Opens a fresh Visit row for a follow-up appointment.
     *
     * <p>Follow-ups deliberately bypass pre-visit symptom intake — the patient
     * already had that conversation with the doctor on the parent visit. The
     * {@code parent_visit_id} link is stored on the appointment, not on the
     * visit, so this method is parent-visit-agnostic.
     */
    @Transactional
    public UUID openFollowUpVisit(UUID patientId, UUID parentVisitId) {
        VisitModel v = new VisitModel();
        v.setPatientId(patientId);
        v.setDoctorId(seededDoctorId);
        v.setStatus(VisitStatus.IN_PROGRESS);
        v.setStartedAt(OffsetDateTime.now());
        v = visits.save(v);
        return v.getId();
    }
}
