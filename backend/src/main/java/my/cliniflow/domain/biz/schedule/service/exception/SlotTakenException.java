package my.cliniflow.domain.biz.schedule.service.exception;

/**
 * Thrown by {@link my.cliniflow.domain.biz.schedule.service.AppointmentBookDomainService}
 * when a slot is no longer available — either because its status moved off
 * AVAILABLE between availability listing and booking, or because the partial
 * unique index on the appointments table rejected a concurrent insert.
 *
 * <p>HTTP layer should map this to {@code 409 Conflict}.
 */
public class SlotTakenException extends RuntimeException {
    public SlotTakenException(String message) {
        super(message);
    }
}
