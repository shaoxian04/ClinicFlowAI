package my.cliniflow.infrastructure.repository.schedule;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link ScheduleDayOverrideEntity}.
 */
public interface ScheduleDayOverrideJpaRepository
        extends JpaRepository<ScheduleDayOverrideEntity, UUID> {

    /**
     * Returns all overrides for a given doctor on a specific calendar date
     * (may include multiple entries — e.g. multiple WINDOW_BLOCKED windows).
     */
    List<ScheduleDayOverrideEntity> findByDoctorIdAndOverrideDate(UUID doctorId, LocalDate date);
}
