package my.cliniflow.infrastructure.repository.schedule;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link AppointmentSlotEntity}.
 */
public interface AppointmentSlotJpaRepository extends JpaRepository<AppointmentSlotEntity, UUID> {

    /**
     * Acquires a pessimistic write lock on the slot with the given id.
     * Used by the booking transaction to prevent concurrent double-bookings.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM AppointmentSlotEntity s WHERE s.id = :id")
    Optional<AppointmentSlotEntity> findByIdForUpdate(@Param("id") UUID id);

    /**
     * Returns all slots for a doctor within a half-open time window
     * [{@code from}, {@code to}) filtered by {@code status}, ordered by
     * {@code start_at} ascending.
     */
    @Query("""
        SELECT s FROM AppointmentSlotEntity s
         WHERE s.doctorId = :doctorId
           AND s.startAt >= :from
           AND s.startAt <  :to
           AND s.status = :status
         ORDER BY s.startAt
        """)
    List<AppointmentSlotEntity> findByDoctorAndWindowAndStatus(
        @Param("doctorId") UUID doctorId,
        @Param("from") OffsetDateTime from,
        @Param("to") OffsetDateTime to,
        @Param("status") String status);

    /**
     * Bulk-deletes all future AVAILABLE slots for a doctor (used when a
     * template changes and materialized slots must be regenerated).
     *
     * @return number of rows deleted
     */
    @Modifying(clearAutomatically = true)
    @Query("""
        DELETE FROM AppointmentSlotEntity s
         WHERE s.doctorId = :doctorId
           AND s.status = 'AVAILABLE'
           AND s.startAt > :now
           AND NOT EXISTS (
               SELECT 1 FROM AppointmentEntity a WHERE a.slotId = s.id
           )
        """)
    int deleteFutureAvailable(
        @Param("doctorId") UUID doctorId,
        @Param("now") OffsetDateTime now);

    @Query("""
        SELECT s.startAt FROM AppointmentSlotEntity s
         WHERE s.doctorId = :doctorId
           AND s.startAt > :now
        """)
    List<OffsetDateTime> findFutureStartAts(
        @Param("doctorId") UUID doctorId,
        @Param("now") OffsetDateTime now);

    /**
     * Returns all slots in the half-open window {@code [from, to)}, regardless
     * of doctor or status. Used by the staff "today" view which lists every
     * doctor's appointments for the day.
     */
    @Query("""
        SELECT s FROM AppointmentSlotEntity s
         WHERE s.startAt >= :from
           AND s.startAt <  :to
         ORDER BY s.startAt
        """)
    List<AppointmentSlotEntity> findByStartAtBetween(
        @Param("from") OffsetDateTime from,
        @Param("to")   OffsetDateTime to);
}
