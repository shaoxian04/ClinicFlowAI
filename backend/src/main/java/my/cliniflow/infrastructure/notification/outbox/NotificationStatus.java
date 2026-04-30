package my.cliniflow.infrastructure.notification.outbox;

/**
 * Lifecycle states for a {@link NotificationOutboxEntity} row.
 *
 * <p>Maps 1-to-1 with the {@code status} CHECK constraint in V11 SQL.
 */
public enum NotificationStatus {
    PENDING,
    SENDING,
    SENT,
    FAILED,
    SKIPPED_NO_CONSENT
}
