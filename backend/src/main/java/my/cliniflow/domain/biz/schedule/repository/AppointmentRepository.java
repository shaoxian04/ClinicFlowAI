package my.cliniflow.domain.biz.schedule.repository;

import my.cliniflow.domain.biz.schedule.model.AppointmentModel;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Domain repository interface for {@link AppointmentModel}. Framework-free —
 * the infrastructure layer provides the JPA-backed implementation.
 */
public interface AppointmentRepository {

    AppointmentModel save(AppointmentModel m);

    Optional<AppointmentModel> findById(UUID id);

    /** Returns the BOOKED appointment for a visit, if any. */
    Optional<AppointmentModel> findActiveByVisitId(UUID visitId);

    /** Returns the BOOKED appointment for a slot, if any. */
    Optional<AppointmentModel> findActiveBySlotId(UUID slotId);

    List<AppointmentModel> findByPatient(UUID patientId);

    /**
     * Returns active appointments for a doctor within a half-open day window
     * expressed in OffsetDateTime (callers compute boundaries in clinic local time).
     */
    List<AppointmentModel> findByDoctorAndDayWindow(UUID doctorId,
                                                     OffsetDateTime dayStart,
                                                     OffsetDateTime dayEnd,
                                                     Collection<String> activeStatuses);
}
