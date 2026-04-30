package my.cliniflow.infrastructure.repository.schedule;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Round-trip integration test for {@link ScheduleTemplateEntity}.
 *
 * <p>Uses the seeded doctor row (id = 00000000-0000-0000-0000-000000000020)
 * inserted by {@code data.sql}.
 */
@SpringBootTest
@Transactional
class ScheduleTemplateEntityIT {

    static final UUID DOCTOR_ID = UUID.fromString("00000000-0000-0000-0000-000000000020");

    @Autowired
    ScheduleTemplateJpaRepository repo;

    @Test
    void save_and_findById_roundTrip() {
        ScheduleTemplateEntity entity = buildTemplate(LocalDate.of(2026, 5, 1));
        ScheduleTemplateEntity saved = repo.saveAndFlush(entity);

        assertThat(saved.getId()).isNotNull();

        Optional<ScheduleTemplateEntity> found = repo.findById(saved.getId());
        assertThat(found).isPresent();

        ScheduleTemplateEntity loaded = found.get();
        assertThat(loaded.getDoctorId()).isEqualTo(DOCTOR_ID);
        assertThat(loaded.getSlotMinutes()).isEqualTo((short) 15);
        assertThat(loaded.getCancelLeadHours()).isEqualTo((short) 2);
        assertThat(loaded.getGenerationHorizonDays()).isEqualTo((short) 28);
    }

    @Test
    void weeklyHours_json_survives_roundTrip() {
        // Two windows on Monday, one window on Tuesday
        Map<String, Object> weeklyHours = Map.of(
            "MON", List.of(List.of("09:00", "12:00"), List.of("14:00", "17:00")),
            "TUE", List.of(List.of("09:00", "13:00"))
        );

        ScheduleTemplateEntity entity = buildTemplate(LocalDate.of(2026, 6, 1));
        entity.setWeeklyHours(weeklyHours);

        ScheduleTemplateEntity saved = repo.saveAndFlush(entity);
        ScheduleTemplateEntity loaded = repo.findById(saved.getId()).orElseThrow();

        @SuppressWarnings("unchecked")
        Map<String, Object> roundTripped = loaded.getWeeklyHours();
        assertThat(roundTripped).containsKey("MON");
        assertThat(roundTripped).containsKey("TUE");

        // MON has two windows
        @SuppressWarnings("unchecked")
        List<Object> monWindows = (List<Object>) roundTripped.get("MON");
        assertThat(monWindows).hasSize(2);

        // TUE has one window
        @SuppressWarnings("unchecked")
        List<Object> tueWindows = (List<Object>) roundTripped.get("TUE");
        assertThat(tueWindows).hasSize(1);
    }

    @Test
    void findFirstByDoctorIdOrderByEffectiveFromDesc_returnsLatest() {
        ScheduleTemplateEntity older = buildTemplate(LocalDate.of(2026, 4, 1));
        ScheduleTemplateEntity newer = buildTemplate(LocalDate.of(2026, 5, 1));
        repo.saveAndFlush(older);
        repo.saveAndFlush(newer);

        Optional<ScheduleTemplateEntity> latest =
            repo.findFirstByDoctorIdOrderByEffectiveFromDesc(DOCTOR_ID);

        assertThat(latest).isPresent();
        assertThat(latest.get().getEffectiveFrom()).isEqualTo(LocalDate.of(2026, 5, 1));
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private ScheduleTemplateEntity buildTemplate(LocalDate effectiveFrom) {
        ScheduleTemplateEntity e = new ScheduleTemplateEntity();
        e.setDoctorId(DOCTOR_ID);
        e.setEffectiveFrom(effectiveFrom);
        e.setSlotMinutes((short) 15);
        e.setWeeklyHours(Map.of(
            "MON", List.of(List.of("09:00", "12:00")),
            "WED", List.of(List.of("14:00", "17:00"))
        ));
        return e;
    }
}
