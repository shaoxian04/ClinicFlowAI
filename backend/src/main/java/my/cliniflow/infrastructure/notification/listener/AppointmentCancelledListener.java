package my.cliniflow.infrastructure.notification.listener;

import my.cliniflow.application.biz.schedule.AppointmentReadAppService;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.domain.biz.schedule.event.AppointmentCancelledDomainEvent;
import my.cliniflow.infrastructure.notification.outbox.NotificationEventType;
import my.cliniflow.infrastructure.notification.outbox.NotificationOutboxWriter;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.HashMap;
import java.util.Map;

@Component
public class AppointmentCancelledListener {

    private final NotificationOutboxWriter writer;
    private final AppointmentReadAppService reads;

    public AppointmentCancelledListener(NotificationOutboxWriter writer,
                                         AppointmentReadAppService reads) {
        this.writer = writer;
        this.reads = reads;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onCancelled(AppointmentCancelledDomainEvent ev) {
        AppointmentDTO a = reads.findOneInternal(ev.appointmentId());

        Map<String, Object> payload = new HashMap<>();
        payload.put("patientId", ev.patientId().toString());
        payload.put("appointmentId", ev.appointmentId().toString());
        if (a.startAt() != null) payload.put("slotStartAt", a.startAt().toString());

        writer.enqueueWhatsApp(
            NotificationEventType.APPOINTMENT_CANCELLED,
            "appointment_cancelled_v1",
            ev.patientId(),
            payload,
            "APPOINTMENT_CANCELLED:" + ev.appointmentId());
    }
}
