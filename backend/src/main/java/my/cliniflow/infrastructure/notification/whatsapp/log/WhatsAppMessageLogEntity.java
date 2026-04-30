package my.cliniflow.infrastructure.notification.whatsapp.log;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * JPA entity for the {@code whatsapp_message_log} table.
 *
 * <p>Each row records one Twilio dispatch attempt for a given
 * {@code notification_outbox} row.  Multiple rows per outbox are allowed
 * (retry attempts each produce a new SID and status transition).
 *
 * <p>{@code gmt_create} / {@code gmt_modified} are DB-defaulted and are therefore
 * declared {@code insertable=false, updatable=false}.
 */
@Entity
@Table(name = "whatsapp_message_log")
public class WhatsAppMessageLogEntity {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "outbox_id", nullable = false)
    private UUID outboxId;

    /** Twilio message SID; absent until Twilio accepts the request. */
    @Column(name = "twilio_sid", length = 64)
    private String twilioSid;

    @Column(name = "to_phone_hash", nullable = false, length = 64)
    private String toPhoneHash;

    @Column(name = "template_id", nullable = false, length = 64)
    private String templateId;

    @Column(name = "rendered_locale", nullable = false, length = 8)
    private String renderedLocale;

    /** Stored as a String; values constrained by DB CHECK. */
    @Column(name = "delivery_status", nullable = false, length = 24)
    private String deliveryStatus;

    /** Twilio error code string; null on success. */
    @Column(name = "twilio_error_code", length = 16)
    private String twilioErrorCode;

    /** DB-defaulted; {@code @Generated} forces a re-select after insert so callers see a non-null value. */
    @Generated(event = EventType.INSERT)
    @Column(name = "gmt_create", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Generated(event = {EventType.INSERT, EventType.UPDATE})
    @Column(name = "gmt_modified", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    // -----------------------------------------------------------------------
    // Getters / Setters
    // -----------------------------------------------------------------------

    public UUID getId() { return id; }

    public UUID getOutboxId() { return outboxId; }
    public void setOutboxId(UUID v) { this.outboxId = v; }

    public String getTwilioSid() { return twilioSid; }
    public void setTwilioSid(String v) { this.twilioSid = v; }

    public String getToPhoneHash() { return toPhoneHash; }
    public void setToPhoneHash(String v) { this.toPhoneHash = v; }

    public String getTemplateId() { return templateId; }
    public void setTemplateId(String v) { this.templateId = v; }

    public String getRenderedLocale() { return renderedLocale; }
    public void setRenderedLocale(String v) { this.renderedLocale = v; }

    public String getDeliveryStatus() { return deliveryStatus; }
    public void setDeliveryStatus(String v) { this.deliveryStatus = v; }

    public String getTwilioErrorCode() { return twilioErrorCode; }
    public void setTwilioErrorCode(String v) { this.twilioErrorCode = v; }

    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
