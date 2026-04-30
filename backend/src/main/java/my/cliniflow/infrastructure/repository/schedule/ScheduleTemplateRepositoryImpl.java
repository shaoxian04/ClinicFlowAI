package my.cliniflow.infrastructure.repository.schedule;

import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;
import my.cliniflow.domain.biz.schedule.repository.ScheduleTemplateRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * JPA-backed implementation of {@link ScheduleTemplateRepository}. Converts between
 * {@link ScheduleTemplateModel} and {@link ScheduleTemplateEntity} at the persistence boundary.
 *
 * <p>{@code weeklyHours} is stored as a {@code Map<String, Object>} jsonb column
 * on the entity and converted to/from {@link WeeklyHours} at this boundary.
 */
@Repository
public class ScheduleTemplateRepositoryImpl implements ScheduleTemplateRepository {

    private final ScheduleTemplateJpaRepository jpa;

    public ScheduleTemplateRepositoryImpl(ScheduleTemplateJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public ScheduleTemplateModel save(ScheduleTemplateModel m) {
        ScheduleTemplateEntity e;
        if (m.getId() == null) {
            e = new ScheduleTemplateEntity();
        } else {
            e = jpa.findById(m.getId()).orElseGet(ScheduleTemplateEntity::new);
        }

        e.setDoctorId(m.getDoctorId());
        e.setEffectiveFrom(m.getEffectiveFrom());
        e.setSlotMinutes(m.getSlotMinutes());
        e.setWeeklyHours(m.getWeeklyHours().toJson());
        e.setCancelLeadHours(m.getCancelLeadHours());
        e.setGenerationHorizonDays(m.getGenerationHorizonDays());

        ScheduleTemplateEntity saved = jpa.save(e);
        m.hydrateId(saved.getId());
        return m;
    }

    @Override
    public Optional<ScheduleTemplateModel> findById(UUID id) {
        return jpa.findById(id).map(this::toModel);
    }

    @Override
    public Optional<ScheduleTemplateModel> findCurrentForDoctor(UUID doctorId) {
        return jpa.findFirstByDoctorIdOrderByEffectiveFromDesc(doctorId).map(this::toModel);
    }

    private ScheduleTemplateModel toModel(ScheduleTemplateEntity e) {
        return ScheduleTemplateModel.hydrate(
            e.getId(),
            e.getDoctorId(),
            e.getEffectiveFrom(),
            e.getSlotMinutes(),
            WeeklyHours.fromJson(e.getWeeklyHours()),
            e.getCancelLeadHours(),
            e.getGenerationHorizonDays());
    }
}
