package my.cliniflow.infrastructure.repository.schedule;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
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
     * Returns all appointments for a given doctor on a specific calendar date,
     * regardless of status. Joins through {@link AppointmentSlotEntity} to
     * filter by doctor and day.
     *
     * <p>The {@code CAST} to {@code java.time.LocalDate} aligns the
     * timestamptz column's date part with the supplied date in UTC.
     */
    @Query("""
        SELECT a FROM AppointmentEntity a
        JOIN AppointmentSlotEntity s ON s.id = a.slotId
         WHERE s.doctorId = :doctorId
           AND CAST(s.startAt AS LocalDate) = :date
         ORDER BY s.startAt
        """)
    List<AppointmentEntity> findByDoctorOnDate(
        @Param("doctorId") UUID doctorId,
        @Param("date") LocalDate date);
}
