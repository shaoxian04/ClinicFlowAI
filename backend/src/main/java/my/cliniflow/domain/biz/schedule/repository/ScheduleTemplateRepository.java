package my.cliniflow.domain.biz.schedule.repository;

import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;

import java.util.Optional;
import java.util.UUID;

/**
 * Domain repository interface for {@link ScheduleTemplateModel}. Framework-free —
 * the infrastructure layer provides the JPA-backed implementation.
 */
public interface ScheduleTemplateRepository {

    ScheduleTemplateModel save(ScheduleTemplateModel m);

    Optional<ScheduleTemplateModel> findById(UUID id);

    /** Most-recently-effective template for a doctor. */
    Optional<ScheduleTemplateModel> findCurrentForDoctor(UUID doctorId);
}
