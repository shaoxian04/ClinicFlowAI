package my.cliniflow.infrastructure.notification.listener;

import my.cliniflow.application.biz.schedule.AppointmentReadAppService;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.domain.biz.schedule.event.AppointmentBookedDomainEvent;
import my.cliniflow.infrastructure.notification.outbox.NotificationEventType;
import my.cliniflow.infrastructure.notification.outbox.NotificationOutboxWriter;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.HashMap;
import java.util.Map;

/**
 * Enqueues an {@code APPOINTMENT_BOOKED} WhatsApp confirmation row after the
 * booking transaction commits. Runs in a new transaction so a failure here
 * doesn't roll back the appointment.
 */
@Component
public class AppointmentBookedListener {

    private final NotificationOutboxWriter writer;
    private final AppointmentReadAppService reads;

    public AppointmentBookedListener(NotificationOutboxWriter writer,
                                      AppointmentReadAppService reads) {
        this.writer = writer;
        this.reads = reads;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onBooked(AppointmentBookedDomainEvent ev) {
        AppointmentDTO a = reads.findOneInternal(ev.appointmentId());

        Map<String, Object> payload = new HashMap<>();
        payload.put("patientId", ev.patientId().toString());
        payload.put("appointmentId", ev.appointmentId().toString());
        if (a.startAt() != null) payload.put("slotStartAt", a.startAt().toString());
        if (a.doctorId() != null) payload.put("doctorId", a.doctorId().toString());

        writer.enqueueWhatsApp(
            NotificationEventType.APPOINTMENT_BOOKED,
            "appointment_confirmation_v1",
            ev.patientId(),
            payload,
            "APPOINTMENT_BOOKED:" + ev.appointmentId());
    }
}
