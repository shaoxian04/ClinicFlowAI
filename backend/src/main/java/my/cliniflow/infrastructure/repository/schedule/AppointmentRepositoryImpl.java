package my.cliniflow.infrastructure.repository.schedule;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * JPA-backed implementation of {@link AppointmentRepository}. Converts between
 * {@link AppointmentModel} and {@link AppointmentEntity} at the persistence boundary.
 */
@Repository
public class AppointmentRepositoryImpl implements AppointmentRepository {

    private final AppointmentJpaRepository jpa;

    public AppointmentRepositoryImpl(AppointmentJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public AppointmentModel save(AppointmentModel m) {
        AppointmentEntity e;
        if (m.getId() == null) {
            e = new AppointmentEntity();
        } else {
            e = jpa.findById(m.getId()).orElseThrow(() ->
                new IllegalStateException("appointment not found for update: " + m.getId()));
        }

        e.setSlotId(m.getSlotId());
        e.setPatientId(m.getPatientId());
        e.setVisitId(m.getVisitId());
        e.setAppointmentType(m.getType().name());
        e.setParentVisitId(m.getParentVisitId());
        e.setStatus(m.getStatus().name());
        e.setCancelReason(m.getCancelReason());
        e.setCancelledAt(m.getCancelledAt());
        e.setCancelledBy(m.getCancelledBy());
        e.setCheckedInAt(m.getCheckedInAt());

        AppointmentEntity saved = jpa.save(e);
        m.hydrateId(saved.getId());
        return m;
    }

    @Override
    public Optional<AppointmentModel> findById(UUID id) {
        return jpa.findById(id).map(this::toModel);
    }

    @Override
    public Optional<AppointmentModel> findActiveByVisitId(UUID visitId) {
        return jpa.findFirstByVisitIdAndStatus(visitId, AppointmentStatus.BOOKED.name()).map(this::toModel);
    }

    @Override
    public Optional<AppointmentModel> findActiveBySlotId(UUID slotId) {
        return jpa.findFirstBySlotIdAndStatus(slotId, AppointmentStatus.BOOKED.name()).map(this::toModel);
    }

    @Override
    public List<AppointmentModel> findByPatient(UUID patientId) {
        return jpa.findByPatientId(patientId).stream().map(this::toModel).toList();
    }

    @Override
    public List<AppointmentModel> findByDoctorAndDayWindow(UUID doctorId,
                                                            OffsetDateTime dayStart,
                                                            OffsetDateTime dayEnd,
                                                            Collection<String> activeStatuses) {
        return jpa.findByDoctorAndDayWindow(doctorId, dayStart, dayEnd, activeStatuses)
                  .stream().map(this::toModel).toList();
    }

    @Override
    public List<AppointmentModel> findBySlotIdInAndStatusIn(Collection<UUID> slotIds,
                                                              Collection<AppointmentStatus> statuses) {
        if (slotIds == null || slotIds.isEmpty() || statuses == null || statuses.isEmpty()) {
            return List.of();
        }
        List<String> statusNames = statuses.stream().map(Enum::name).toList();
        return jpa.findBySlotIdInAndStatusIn(slotIds, statusNames)
                  .stream().map(this::toModel).toList();
    }

    private AppointmentModel toModel(AppointmentEntity e) {
        return AppointmentModel.hydrate(
            e.getId(),
            e.getSlotId(),
            e.getPatientId(),
            e.getVisitId(),
            AppointmentType.valueOf(e.getAppointmentType()),
            e.getParentVisitId(),
            AppointmentStatus.valueOf(e.getStatus()),
            e.getCancelReason(),
            e.getCancelledAt(),
            e.getCancelledBy(),
            e.getCheckedInAt());
    }
}
