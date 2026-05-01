package my.cliniflow.domain.biz.schedule.service.exception;

/**
 * Thrown by {@link my.cliniflow.domain.biz.schedule.service.SlotBlockDomainService}
 * when a requested day-close or window-block conflicts with an existing active
 * (BOOKED) appointment in that time window.
 *
 * <p>HTTP layer should map this to {@code 409 Conflict}.
 */
public class BookingsInWindowException extends RuntimeException {
    public BookingsInWindowException(String message) {
        super(message);
    }
}
