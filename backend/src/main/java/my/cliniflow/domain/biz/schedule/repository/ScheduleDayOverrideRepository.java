package my.cliniflow.domain.biz.schedule.repository;

import my.cliniflow.domain.biz.schedule.model.ScheduleDayOverrideModel;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Domain repository interface for {@link ScheduleDayOverrideModel}. Framework-free —
 * the infrastructure layer provides the JPA-backed implementation.
 */
public interface ScheduleDayOverrideRepository {

    ScheduleDayOverrideModel save(ScheduleDayOverrideModel m);

    Optional<ScheduleDayOverrideModel> findById(UUID id);

    List<ScheduleDayOverrideModel> findByDoctorAndDate(UUID doctorId, LocalDate date);
}
