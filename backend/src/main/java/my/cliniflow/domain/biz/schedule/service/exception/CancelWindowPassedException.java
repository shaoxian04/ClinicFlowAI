package my.cliniflow.domain.biz.schedule.service.exception;

/**
 * Thrown by {@link my.cliniflow.domain.biz.schedule.service.AppointmentCancelDomainService}
 * when a cancel attempt arrives after the policy lead-time has passed
 * (e.g. cancelling a 09:00 slot at 08:30 when policy requires 2h).
 *
 * <p>HTTP layer should map this to {@code 409 Conflict} (or 422 — choice
 * deferred to controller layer).
 */
public class CancelWindowPassedException extends RuntimeException {
    public CancelWindowPassedException(String message) {
        super(message);
    }
}
