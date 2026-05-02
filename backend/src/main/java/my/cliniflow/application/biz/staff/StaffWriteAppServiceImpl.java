package my.cliniflow.application.biz.staff;

import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Service
public class StaffWriteAppServiceImpl implements StaffWriteAppService {

    private final AppointmentRepository appts;
    private final AuditWriter audit;

    public StaffWriteAppServiceImpl(AppointmentRepository appts, AuditWriter audit) {
        this.appts = appts;
        this.audit = audit;
    }

    @Override
    @Transactional
    public void checkIn(UUID appointmentId, UUID actorUserId) {
        AppointmentModel a = appts.findById(appointmentId).orElseThrow(
            () -> new ResourceNotFoundException("APPOINTMENT", appointmentId));

        switch (a.getStatus()) {
            case CHECKED_IN -> {
                // Idempotent: already checked in — no save, no audit row.
                return;
            }
            case BOOKED -> {
                a.setStatus(AppointmentStatus.CHECKED_IN);
                a.setCheckedInAt(OffsetDateTime.now());
                appts.save(a);
                audit.append(
                    "UPDATE",
                    "APPOINTMENT",
                    appointmentId.toString(),
                    actorUserId,
                    "STAFF",
                    Map.of("checked_in", true));
            }
            default -> throw new ConflictException(
                "cannot check in appointment in status " + a.getStatus());
        }
    }
}
