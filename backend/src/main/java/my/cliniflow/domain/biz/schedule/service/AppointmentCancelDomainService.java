package my.cliniflow.domain.biz.schedule.service;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Domain service that performs the CANCEL transition: BOOKED appointment +
 * BOOKED slot → CANCELLED appointment + AVAILABLE slot.
 *
 * <p>Lead-time enforcement: if the slot's start time is closer than
 * {@code cancelLeadHours} hours away from {@code now}, the cancel is rejected
 * with {@link my.cliniflow.domain.biz.schedule.service.exception.CancelWindowPassedException}.
 */
public interface AppointmentCancelDomainService {

    void cancel(UUID appointmentId,
                UUID byUser,
                OffsetDateTime now,
                String reason,
                int cancelLeadHours);
}
