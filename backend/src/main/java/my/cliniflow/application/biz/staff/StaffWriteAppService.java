package my.cliniflow.application.biz.staff;

import java.util.UUID;

/**
 * Write-side application service for the staff (front-desk) portal.
 *
 * <p>Currently exposes the patient check-in flip: {@link #checkIn(UUID, UUID)}.
 */
public interface StaffWriteAppService {

    /**
     * Marks the appointment as checked in. Idempotent on {@code CHECKED_IN};
     * rejects terminal statuses with
     * {@link my.cliniflow.controller.base.ConflictException}.
     */
    void checkIn(UUID appointmentId, UUID actorUserId);
}
