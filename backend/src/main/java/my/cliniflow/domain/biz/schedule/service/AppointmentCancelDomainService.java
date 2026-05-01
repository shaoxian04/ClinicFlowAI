package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.service.exception.CancelWindowPassedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Domain service that performs the CANCEL transition: BOOKED appointment +
 * BOOKED slot → CANCELLED appointment + AVAILABLE slot.
 *
 * <p>Lead-time enforcement: if the slot's start time is closer than
 * {@code cancelLeadHours} hours away from {@code now}, the cancel is rejected
 * with {@link CancelWindowPassedException}. The lead-time value comes from the
 * doctor's {@code schedule_template.cancel_lead_hours} and is passed in by the
 * caller (this service is template-agnostic).
 */
@Service
public class AppointmentCancelDomainService {

    private final AppointmentRepository appts;
    private final AppointmentSlotRepository slots;

    public AppointmentCancelDomainService(AppointmentRepository appts,
                                          AppointmentSlotRepository slots) {
        this.appts = appts;
        this.slots = slots;
    }

    @Transactional
    public void cancel(UUID appointmentId,
                       UUID byUser,
                       OffsetDateTime now,
                       String reason,
                       int cancelLeadHours) {
        AppointmentModel appointment = appts.findById(appointmentId)
            .orElseThrow(() -> new IllegalStateException("appointment not found: " + appointmentId));
        if (appointment.getStatus() != AppointmentStatus.BOOKED) {
            throw new IllegalStateException(
                "can only cancel BOOKED appointment, was: " + appointment.getStatus());
        }

        AppointmentSlotModel slot = slots.findByIdForUpdate(appointment.getSlotId())
            .orElseThrow(() -> new IllegalStateException(
                "slot row missing for appointment: " + appointmentId));

        long minutesUntilStart = Duration.between(now, slot.getStartAt()).toMinutes();
        if (minutesUntilStart < cancelLeadHours * 60L) {
            throw new CancelWindowPassedException(
                "cancel lead time of " + cancelLeadHours + "h not met for slot at " + slot.getStartAt());
        }

        appointment.cancel(reason, byUser, now);
        slot.release();
        appts.save(appointment);
        slots.save(slot);
    }
}
