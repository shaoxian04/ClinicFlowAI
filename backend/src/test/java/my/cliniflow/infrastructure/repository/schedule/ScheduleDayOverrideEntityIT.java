package my.cliniflow.infrastructure.repository.schedule;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/**
 * Round-trip integration test for {@link ScheduleDayOverrideEntity}.
 *
 * <p>Verifies:
 * <ul>
 *   <li>DAY_CLOSED row persists with null window fields.</li>
 *   <li>WINDOW_BLOCKED row persists with non-null window fields.</li>
 *   <li>Both rows are returned by {@code findByDoctorIdAndOverrideDate}.</li>
 *   <li>Inserting WINDOW_BLOCKED with null {@code windowStart} is rejected
 *       by the DB-level CHECK constraint
 *       ({@code window_required_when_blocked}).</li>
 * </ul>
 */
@SpringBootTest
@Transactional
class ScheduleDayOverrideEntityIT {

    static final UUID DOCTOR_ID      = UUID.fromString("00000000-0000-0000-0000-000000000020");
    static final UUID DOCTOR_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final LocalDate TEST_DATE = LocalDate.of(2026, 6, 10);

    @Autowired ScheduleDayOverrideJpaRepository repo;
    @Autowired EntityManager                    em;

    @Test
    void dayClosed_persistsAndReadBack() {
        ScheduleDayOverrideEntity override = new ScheduleDayOverrideEntity();
        override.setDoctorId(DOCTOR_ID);
        override.setOverrideDate(TEST_DATE);
        override.setOverrideType("DAY_CLOSED");
        override.setReason("Public holiday");
        override.setCreatedBy(DOCTOR_USER_ID);

        ScheduleDayOverrideEntity saved = repo.saveAndFlush(override);

        assertThat(saved.getId()).isNotNull();
        ScheduleDayOverrideEntity loaded = repo.findById(saved.getId()).orElseThrow();
        assertThat(loaded.getOverrideType()).isEqualTo("DAY_CLOSED");
        assertThat(loaded.getWindowStart()).isNull();
        assertThat(loaded.getWindowEnd()).isNull();
        assertThat(loaded.getReason()).isEqualTo("Public holiday");
    }

    @Test
    void windowBlocked_persistsAndReadBack() {
        ScheduleDayOverrideEntity override = new ScheduleDayOverrideEntity();
        override.setDoctorId(DOCTOR_ID);
        override.setOverrideDate(TEST_DATE);
        override.setOverrideType("WINDOW_BLOCKED");
        override.setWindowStart(LocalTime.of(12, 0));
        override.setWindowEnd(LocalTime.of(14, 0));
        override.setReason("Staff meeting");
        override.setCreatedBy(DOCTOR_USER_ID);

        ScheduleDayOverrideEntity saved = repo.saveAndFlush(override);

        ScheduleDayOverrideEntity loaded = repo.findById(saved.getId()).orElseThrow();
        assertThat(loaded.getOverrideType()).isEqualTo("WINDOW_BLOCKED");
        assertThat(loaded.getWindowStart()).isEqualTo(LocalTime.of(12, 0));
        assertThat(loaded.getWindowEnd()).isEqualTo(LocalTime.of(14, 0));
    }

    @Test
    void findByDoctorIdAndOverrideDate_returnsBothRows() {
        // DAY_CLOSED
        ScheduleDayOverrideEntity closed = new ScheduleDayOverrideEntity();
        closed.setDoctorId(DOCTOR_ID);
        closed.setOverrideDate(TEST_DATE.plusDays(1));
        closed.setOverrideType("DAY_CLOSED");
        closed.setCreatedBy(DOCTOR_USER_ID);
        repo.saveAndFlush(closed);

        // WINDOW_BLOCKED on same doctor + date
        ScheduleDayOverrideEntity blocked = new ScheduleDayOverrideEntity();
        blocked.setDoctorId(DOCTOR_ID);
        blocked.setOverrideDate(TEST_DATE.plusDays(1));
        blocked.setOverrideType("WINDOW_BLOCKED");
        blocked.setWindowStart(LocalTime.of(10, 0));
        blocked.setWindowEnd(LocalTime.of(11, 0));
        blocked.setCreatedBy(DOCTOR_USER_ID);
        repo.saveAndFlush(blocked);

        List<ScheduleDayOverrideEntity> results =
            repo.findByDoctorIdAndOverrideDate(DOCTOR_ID, TEST_DATE.plusDays(1));

        assertThat(results).hasSize(2);
        assertThat(results)
            .extracting(ScheduleDayOverrideEntity::getOverrideType)
            .containsExactlyInAnyOrder("DAY_CLOSED", "WINDOW_BLOCKED");
    }

    @Test
    void windowBlocked_withNullWindowStart_failsCheckConstraint() {
        ScheduleDayOverrideEntity bad = new ScheduleDayOverrideEntity();
        bad.setDoctorId(DOCTOR_ID);
        bad.setOverrideDate(TEST_DATE.plusDays(2));
        bad.setOverrideType("WINDOW_BLOCKED");
        // Intentionally null window_start — violates window_required_when_blocked
        bad.setWindowStart(null);
        bad.setWindowEnd(null);
        bad.setCreatedBy(DOCTOR_USER_ID);

        assertThatThrownBy(() -> {
            repo.saveAndFlush(bad);
            em.flush(); // ensure the flush reaches DB
        }).isInstanceOf(Exception.class); // JPA wraps DB check violation in a ConstraintViolationException or similar
    }
}
