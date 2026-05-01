package my.cliniflow.infrastructure.notification.outbox;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Writes a row into the {@code notification_outbox} table inside the caller's
 * transaction. {@code propagation = MANDATORY} means callers must already have
 * an active tx; this avoids accidentally enqueueing notifications outside of
 * the domain operation that triggered them.
 *
 * <p>Idempotency: callers supply a deterministic {@code idempotencyKey}
 * (e.g. {@code "APPOINTMENT_BOOKED:<appointmentId>"}). If the key already
 * exists the writer returns {@code Optional.empty()} without inserting.
 */
@Component
public class NotificationOutboxWriter {

    private final NotificationOutboxJpaRepository repo;

    public NotificationOutboxWriter(NotificationOutboxJpaRepository repo) {
        this.repo = repo;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<UUID> enqueueWhatsApp(NotificationEventType eventType,
                                           String templateId,
                                           UUID patientId,
                                           Map<String, Object> payload,
                                           String idempotencyKey) {
        if (repo.findByIdempotencyKey(idempotencyKey).isPresent()) {
            return Optional.empty();
        }
        NotificationOutboxEntity e = new NotificationOutboxEntity();
        e.setEventType(eventType.name());
        e.setChannel("WHATSAPP");
        e.setTemplateId(templateId);
        e.setRecipientPatientId(patientId);
        e.setPayload(payload);
        e.setIdempotencyKey(idempotencyKey);
        e.setStatus(NotificationStatus.PENDING.name());
        e.setAttempts((short) 0);
        e.setNextAttemptAt(OffsetDateTime.now());
        return Optional.of(repo.save(e).getId());
    }
}
