package my.cliniflow.domain.biz.schedule.repository;

import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Domain repository interface for {@link AppointmentSlotModel}. Framework-free —
 * the infrastructure layer provides the JPA-backed implementation.
 */
public interface AppointmentSlotRepository {

    AppointmentSlotModel save(AppointmentSlotModel m);

    Optional<AppointmentSlotModel> findById(UUID id);

    /** Pessimistic-write lock for the booking transaction. */
    Optional<AppointmentSlotModel> findByIdForUpdate(UUID id);

    /** All slots for a doctor in [from, to) at given status, ordered by startAt. */
    List<AppointmentSlotModel> findByDoctorAndWindowAndStatus(UUID doctorId,
                                                               OffsetDateTime from,
                                                               OffsetDateTime to,
                                                               SlotStatus status);

    /** Bulk-deletes future AVAILABLE slots; used when regenerating from template. */
    int deleteFutureAvailable(UUID doctorId, OffsetDateTime now);
}
