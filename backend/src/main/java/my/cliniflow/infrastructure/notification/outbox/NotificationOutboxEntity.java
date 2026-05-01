package my.cliniflow.infrastructure.notification.outbox;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * JPA entity for the {@code notification_outbox} table.
 *
 * <p>Rows are enqueued whenever a domain event (e.g. APPOINTMENT_BOOKED) requires
 * an outbound notification.  The drainer (TwilioWhatsAppSender) polls
 * {@link NotificationOutboxJpaRepository#findDueForSend} every 30 s and attempts
 * delivery via Twilio.
 *
 * <p>{@code gmt_create} / {@code gmt_modified} are DB-defaulted and are therefore
 * declared {@code insertable=false, updatable=false}.
 *
 * <p>{@code nextAttemptAt} and {@code attempts} are application-managed: the
 * drainer updates them on each retry cycle.  Callers must set both before saving.
 */
@Entity
@Table(
    name = "notification_outbox",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_outbox_idempotency",
        columnNames = {"idempotency_key"}
    )
)
public class NotificationOutboxEntity {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "event_type", nullable = false, length = 48)
    private String eventType;

    @Column(name = "channel", nullable = false, length = 16)
    private String channel;

    @Column(name = "template_id", nullable = false, length = 64)
    private String templateId;

    @Column(name = "recipient_patient_id", nullable = false)
    private UUID recipientPatientId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> payload;

    @Column(name = "idempotency_key", nullable = false, length = 128)
    private String idempotencyKey;

    /** Stored as a String to avoid mapping complexity; values constrained by DB CHECK. */
    @Column(name = "status", nullable = false, length = 24)
    private String status = "PENDING";

    /** No Java default — callers must set explicitly before save. */
    @Column(name = "attempts", nullable = false)
    private Short attempts;

    /** No Java default — callers must set explicitly before save. */
    @Column(name = "next_attempt_at", nullable = false)
    private OffsetDateTime nextAttemptAt;

    @Column(name = "last_error", columnDefinition = "text")
    private String lastError;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    @Column(name = "gmt_create", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    // -----------------------------------------------------------------------
    // Getters / Setters
    // -----------------------------------------------------------------------

    public UUID getId() { return id; }

    public String getEventType() { return eventType; }
    public void setEventType(String v) { this.eventType = v; }

    public String getChannel() { return channel; }
    public void setChannel(String v) { this.channel = v; }

    public String getTemplateId() { return templateId; }
    public void setTemplateId(String v) { this.templateId = v; }

    public UUID getRecipientPatientId() { return recipientPatientId; }
    public void setRecipientPatientId(UUID v) { this.recipientPatientId = v; }

    public Map<String, Object> getPayload() { return payload; }
    public void setPayload(Map<String, Object> v) { this.payload = v; }

    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String v) { this.idempotencyKey = v; }

    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }

    public Short getAttempts() { return attempts; }
    public void setAttempts(Short v) { this.attempts = v; }

    public OffsetDateTime getNextAttemptAt() { return nextAttemptAt; }
    public void setNextAttemptAt(OffsetDateTime v) { this.nextAttemptAt = v; }

    public String getLastError() { return lastError; }
    public void setLastError(String v) { this.lastError = v; }

    public OffsetDateTime getSentAt() { return sentAt; }
    public void setSentAt(OffsetDateTime v) { this.sentAt = v; }

    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
