package my.cliniflow.infrastructure.repository.schedule;

import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * JPA-backed implementation of {@link AppointmentSlotRepository}. Converts between
 * {@link AppointmentSlotModel} and {@link AppointmentSlotEntity} at the persistence boundary.
 *
 * <p>The unique constraint on {@code (doctor_id, start_at)} will surface as a
 * {@code DataIntegrityViolationException} on duplicate inserts — callers are
 * responsible for handling it (not caught here).
 */
@Repository
public class AppointmentSlotRepositoryImpl implements AppointmentSlotRepository {

    private final AppointmentSlotJpaRepository jpa;

    public AppointmentSlotRepositoryImpl(AppointmentSlotJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public AppointmentSlotModel save(AppointmentSlotModel m) {
        AppointmentSlotEntity e;
        if (m.getId() == null) {
            e = new AppointmentSlotEntity();
        } else {
            e = jpa.findById(m.getId()).orElseThrow(() ->
                new IllegalStateException("appointment slot not found for update: " + m.getId()));
        }

        e.setDoctorId(m.getDoctorId());
        e.setStartAt(m.getStartAt());
        e.setEndAt(m.getEndAt());
        e.setStatus(m.getStatus().name());

        AppointmentSlotEntity saved = jpa.save(e);
        m.hydrateId(saved.getId());
        return m;
    }

    @Override
    public Optional<AppointmentSlotModel> findById(UUID id) {
        return jpa.findById(id).map(this::toModel);
    }

    @Override
    public Optional<AppointmentSlotModel> findByIdForUpdate(UUID id) {
        return jpa.findByIdForUpdate(id).map(this::toModel);
    }

    @Override
    public List<AppointmentSlotModel> findByDoctorAndWindowAndStatus(UUID doctorId,
                                                                      OffsetDateTime from,
                                                                      OffsetDateTime to,
                                                                      SlotStatus status) {
        return jpa.findByDoctorAndWindowAndStatus(doctorId, from, to, status.name())
                  .stream().map(this::toModel).toList();
    }

    @Override
    public int deleteFutureAvailable(UUID doctorId, OffsetDateTime now) {
        return jpa.deleteFutureAvailable(doctorId, now);
    }

    @Override
    public Set<OffsetDateTime> findFutureStartAts(UUID doctorId, OffsetDateTime now) {
        return new HashSet<>(jpa.findFutureStartAts(doctorId, now));
    }

    private AppointmentSlotModel toModel(AppointmentSlotEntity e) {
        return AppointmentSlotModel.hydrate(
            e.getId(),
            e.getDoctorId(),
            e.getStartAt(),
            e.getEndAt(),
            SlotStatus.valueOf(e.getStatus()));
    }
}
