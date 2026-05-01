package my.cliniflow.infrastructure.notification.listener;

import my.cliniflow.domain.biz.visit.event.SoapFinalizedDomainEvent;
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
public class SoapFinalizedListener {

    private final NotificationOutboxWriter writer;

    public SoapFinalizedListener(NotificationOutboxWriter writer) {
        this.writer = writer;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onFinalized(SoapFinalizedDomainEvent ev) {
        if (ev.hasMedications()) {
            writer.enqueueWhatsApp(
                NotificationEventType.SOAP_FINALIZED_MEDS,
                "soap_meds_summary_v1",
                ev.patientId(),
                Map.of("visitId", ev.visitId().toString()),
                "SOAP_FINALIZED_MEDS:" + ev.visitId());
        }
        if (ev.followUpDate() != null) {
            Map<String, Object> payload = new HashMap<>();
            payload.put("visitId", ev.visitId().toString());
            payload.put("followUpDate", ev.followUpDate().toString());
            writer.enqueueWhatsApp(
                NotificationEventType.SOAP_FINALIZED_FOLLOWUP,
                "soap_followup_reminder_v1",
                ev.patientId(),
                payload,
                "SOAP_FINALIZED_FOLLOWUP:" + ev.visitId());
        }
    }
}
