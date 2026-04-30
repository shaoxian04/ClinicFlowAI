package my.cliniflow.controller.biz.schedule.request;

import jakarta.validation.constraints.Size;

/**
 * Optional cancel reason (free-text, ≤ 64 chars to fit the
 * {@code appointments.cancel_reason} column).
 */
public record AppointmentCancelRequest(
    @Size(max = 64) String reason
) {}
