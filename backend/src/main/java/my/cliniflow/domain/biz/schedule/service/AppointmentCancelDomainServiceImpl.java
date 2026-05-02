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

@Service
public class AppointmentCancelDomainServiceImpl implements AppointmentCancelDomainService {

    private final AppointmentRepository appts;
    private final AppointmentSlotRepository slots;

    public AppointmentCancelDomainServiceImpl(AppointmentRepository appts,
                                              AppointmentSlotRepository slots) {
        this.appts = appts;
        this.slots = slots;
    }

    @Override
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
