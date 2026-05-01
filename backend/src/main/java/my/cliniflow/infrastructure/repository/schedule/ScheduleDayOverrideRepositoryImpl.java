package my.cliniflow.infrastructure.repository.schedule;

import my.cliniflow.domain.biz.schedule.enums.OverrideType;
import my.cliniflow.domain.biz.schedule.model.ScheduleDayOverrideModel;
import my.cliniflow.domain.biz.schedule.repository.ScheduleDayOverrideRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * JPA-backed implementation of {@link ScheduleDayOverrideRepository}. Converts between
 * {@link ScheduleDayOverrideModel} and {@link ScheduleDayOverrideEntity} at the
 * persistence boundary.
 */
@Repository
public class ScheduleDayOverrideRepositoryImpl implements ScheduleDayOverrideRepository {

    private final ScheduleDayOverrideJpaRepository jpa;

    public ScheduleDayOverrideRepositoryImpl(ScheduleDayOverrideJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public ScheduleDayOverrideModel save(ScheduleDayOverrideModel m) {
        ScheduleDayOverrideEntity e;
        if (m.getId() == null) {
            e = new ScheduleDayOverrideEntity();
        } else {
            e = jpa.findById(m.getId()).orElseThrow(() ->
                new IllegalStateException("schedule day override not found for update: " + m.getId()));
        }

        e.setDoctorId(m.getDoctorId());
        e.setOverrideDate(m.getOverrideDate());
        e.setOverrideType(m.getType().name());
        e.setWindowStart(m.getWindowStart());
        e.setWindowEnd(m.getWindowEnd());
        e.setReason(m.getReason());
        e.setCreatedBy(m.getCreatedBy());

        ScheduleDayOverrideEntity saved = jpa.save(e);
        m.hydrateId(saved.getId());
        return m;
    }

    @Override
    public Optional<ScheduleDayOverrideModel> findById(UUID id) {
        return jpa.findById(id).map(this::toModel);
    }

    @Override
    public List<ScheduleDayOverrideModel> findByDoctorAndDate(UUID doctorId, LocalDate date) {
        return jpa.findByDoctorIdAndOverrideDate(doctorId, date)
                  .stream().map(this::toModel).toList();
    }

    @Override
    public void delete(UUID id) {
        jpa.deleteById(id);
    }

    private ScheduleDayOverrideModel toModel(ScheduleDayOverrideEntity e) {
        return ScheduleDayOverrideModel.hydrate(
            e.getId(),
            e.getDoctorId(),
            e.getOverrideDate(),
            OverrideType.valueOf(e.getOverrideType()),
            e.getWindowStart(),
            e.getWindowEnd(),
            e.getReason(),
            e.getCreatedBy());
    }
}
