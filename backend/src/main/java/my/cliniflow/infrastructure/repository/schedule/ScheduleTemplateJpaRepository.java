package my.cliniflow.infrastructure.repository.schedule;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link ScheduleTemplateEntity}.
 */
public interface ScheduleTemplateJpaRepository extends JpaRepository<ScheduleTemplateEntity, UUID> {

    /**
     * Returns the most-recently-effective template for a doctor (by descending
     * {@code effective_from}), or empty if none exists.
     */
    Optional<ScheduleTemplateEntity> findFirstByDoctorIdOrderByEffectiveFromDesc(UUID doctorId);
}
