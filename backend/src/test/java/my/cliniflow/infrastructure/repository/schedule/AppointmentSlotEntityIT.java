package my.cliniflow.infrastructure.repository.schedule;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Round-trip integration test for {@link AppointmentSlotEntity}.
 *
 * <p>Verifies:
 * <ul>
 *   <li>3 slots across two days are persisted correctly.</li>
 *   <li>The windowed query returns only slots within the requested range.</li>
 *   <li>{@code deleteFutureAvailable} removes only AVAILABLE-future rows,
 *       leaving BLOCKED rows intact.</li>
 * </ul>
 */
@SpringBootTest
@Transactional
class AppointmentSlotEntityIT {

    static final UUID DOCTOR_ID = UUID.fromString("00000000-0000-0000-0000-000000000020");

    // Reference base time: 2026-05-01 08:00 UTC
    static final OffsetDateTime BASE = OffsetDateTime.of(2026, 5, 1, 8, 0, 0, 0, ZoneOffset.UTC);

    @Autowired
    AppointmentSlotJpaRepository repo;

    @Test
    void save_and_findById_roundTrip() {
        AppointmentSlotEntity slot = buildSlot(BASE, BASE.plusMinutes(15), "AVAILABLE");
        AppointmentSlotEntity saved = repo.saveAndFlush(slot);

        assertThat(saved.getId()).isNotNull();
        AppointmentSlotEntity loaded = repo.findById(saved.getId()).orElseThrow();
        assertThat(loaded.getDoctorId()).isEqualTo(DOCTOR_ID);
        assertThat(loaded.getStatus()).isEqualTo("AVAILABLE");
        assertThat(loaded.getEndAt()).isAfter(loaded.getStartAt());
    }

    @Test
    void findByDoctorAndWindowAndStatus_returnsCorrectSlots() {
        // Day 1: two slots at 09:00 and 09:15
        OffsetDateTime day1 = OffsetDateTime.of(2026, 5, 2, 9, 0, 0, 0, ZoneOffset.UTC);
        AppointmentSlotEntity s1 = buildSlot(day1, day1.plusMinutes(15), "AVAILABLE");
        AppointmentSlotEntity s2 = buildSlot(day1.plusMinutes(15), day1.plusMinutes(30), "AVAILABLE");

        // Day 2: one slot at 09:00 (different day)
        OffsetDateTime day2 = OffsetDateTime.of(2026, 5, 3, 9, 0, 0, 0, ZoneOffset.UTC);
        AppointmentSlotEntity s3 = buildSlot(day2, day2.plusMinutes(15), "AVAILABLE");

        repo.saveAndFlush(s1);
        repo.saveAndFlush(s2);
        repo.saveAndFlush(s3);

        // Query for day 1 window only
        OffsetDateTime windowStart = OffsetDateTime.of(2026, 5, 2, 0, 0, 0, 0, ZoneOffset.UTC);
        OffsetDateTime windowEnd   = OffsetDateTime.of(2026, 5, 3, 0, 0, 0, 0, ZoneOffset.UTC);

        List<AppointmentSlotEntity> results =
            repo.findByDoctorAndWindowAndStatus(DOCTOR_ID, windowStart, windowEnd, "AVAILABLE");

        assertThat(results).hasSize(2);
        // Ordered by start_at ascending
        assertThat(results.get(0).getStartAt()).isEqualTo(day1);
        assertThat(results.get(1).getStartAt()).isEqualTo(day1.plusMinutes(15));
    }

    @Test
    void deleteFutureAvailable_removesOnlyAvailableFutureRows() {
        OffsetDateTime now = OffsetDateTime.of(2026, 5, 4, 10, 0, 0, 0, ZoneOffset.UTC);

        // Future AVAILABLE — should be deleted
        AppointmentSlotEntity future = buildSlot(now.plusHours(1), now.plusHours(1).plusMinutes(15), "AVAILABLE");

        // Future BLOCKED — must NOT be deleted
        AppointmentSlotEntity blocked = buildSlot(now.plusHours(2), now.plusHours(2).plusMinutes(15), "BLOCKED");

        AppointmentSlotEntity savedFuture  = repo.saveAndFlush(future);
        AppointmentSlotEntity savedBlocked = repo.saveAndFlush(blocked);

        int deleted = repo.deleteFutureAvailable(DOCTOR_ID, now);

        assertThat(deleted).isGreaterThanOrEqualTo(1);
        assertThat(repo.findById(savedFuture.getId())).isEmpty();
        assertThat(repo.findById(savedBlocked.getId())).isPresent();
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private AppointmentSlotEntity buildSlot(OffsetDateTime start, OffsetDateTime end, String status) {
        AppointmentSlotEntity e = new AppointmentSlotEntity();
        e.setDoctorId(DOCTOR_ID);
        e.setStartAt(start);
        e.setEndAt(end);
        e.setStatus(status);
        return e;
    }
}
