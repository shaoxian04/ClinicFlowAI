package my.cliniflow.infrastructure.notification.outbox;

/**
 * Domain event types that can trigger an outbound notification.
 *
 * <p>Maps to the {@code event_type} column in {@code notification_outbox}.
 */
public enum NotificationEventType {
    APPOINTMENT_BOOKED,
    APPOINTMENT_CANCELLED,
    SOAP_FINALIZED_MEDS,
    SOAP_FINALIZED_FOLLOWUP
}
