package my.cliniflow.infrastructure.repository.schedule;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link AppointmentEntity}.
 */
public interface AppointmentJpaRepository extends JpaRepository<AppointmentEntity, UUID> {

    /** Returns the first appointment for a given visit id and status. */
    Optional<AppointmentEntity> findFirstByVisitIdAndStatus(UUID visitId, String status);

    /** Returns the first appointment for a given slot id and status. */
    Optional<AppointmentEntity> findFirstBySlotIdAndStatus(UUID slotId, String status);

    /** Returns all appointments for a patient across all statuses. */
    List<AppointmentEntity> findByPatientId(UUID patientId);

    /**
     * Returns all active appointments for a given doctor within an explicit
     * day window expressed as {@link OffsetDateTime} boundaries.
     *
     * <p>Callers must supply {@code dayStart} and {@code dayEnd} computed in
     * the clinic's local timezone (e.g. {@code Asia/Kuala_Lumpur}) so that
     * slots near midnight are not silently mis-attributed to the wrong date by
     * a UTC cast.
     *
     * @param doctorId      the doctor's {@code doctors.id}
     * @param dayStart      start of the day (inclusive) in clinic local time
     * @param dayEnd        start of the next day (exclusive) in clinic local time
     * @param activeStatuses set of status values to include (e.g. {@code Set.of("BOOKED")})
     */
    @Query("""
        SELECT a FROM AppointmentEntity a, AppointmentSlotEntity s
         WHERE a.slotId = s.id
           AND s.doctorId = :doctorId
           AND s.startAt >= :dayStart
           AND s.startAt <  :dayEnd
           AND a.status IN :activeStatuses
         ORDER BY s.startAt
        """)
    List<AppointmentEntity> findByDoctorAndDayWindow(
        @Param("doctorId")       UUID doctorId,
        @Param("dayStart")       OffsetDateTime dayStart,
        @Param("dayEnd")         OffsetDateTime dayEnd,
        @Param("activeStatuses") Collection<String> activeStatuses);

    /**
     * Returns appointments whose {@code slot_id} is one of {@code slotIds}
     * and whose {@code status} is one of {@code statuses}. Caller is
     * responsible for any ordering.
     */
    @Query("""
        SELECT a FROM AppointmentEntity a
         WHERE a.slotId IN :slotIds
           AND a.status IN :statuses
        """)
    List<AppointmentEntity> findBySlotIdInAndStatusIn(
        @Param("slotIds")  Collection<UUID> slotIds,
        @Param("statuses") Collection<String> statuses);
}
