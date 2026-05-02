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

/**
 * Write-side application service for the staff (front-desk) portal.
 *
 * <p>Currently exposes the patient check-in flip: {@link #checkIn(UUID, UUID)}
 * transitions an appointment from {@link AppointmentStatus#BOOKED} to
 * {@link AppointmentStatus#CHECKED_IN}, stamps {@code checked_in_at}, and
 * writes a single PDPA audit row with {@code metadata={"checked_in": true}}.
 *
 * <p>Idempotency: calling {@link #checkIn(UUID, UUID)} on an appointment that
 * is already {@code CHECKED_IN} is a no-op — no save, no audit row.
 *
 * <p>Terminal statuses ({@code CANCELLED}, {@code NO_SHOW}, {@code COMPLETED})
 * are rejected with {@link ConflictException} to surface a 409 to the caller.
 */
@Service
public class StaffWriteAppService {

    private final AppointmentRepository appts;
    private final AuditWriter audit;

    public StaffWriteAppService(AppointmentRepository appts, AuditWriter audit) {
        this.appts = appts;
        this.audit = audit;
    }

    /**
     * Marks the appointment as checked in. Idempotent on {@code CHECKED_IN};
     * rejects terminal statuses with {@link ConflictException}.
     *
     * @param appointmentId target appointment
     * @param actorUserId   staff user id derived from the JWT principal
     */
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
