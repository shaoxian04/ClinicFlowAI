package my.cliniflow.controller.biz.schedule.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Staff request to mark a sub-day window as blocked (WINDOW_BLOCKED override).
 * Both {@code windowStart} and {@code windowEnd} must be supplied; the domain
 * service validates {@code windowEnd > windowStart}.
 */
public record WindowBlockRequest(
    @NotNull LocalDate date,
    @NotNull LocalTime windowStart,
    @NotNull LocalTime windowEnd,
    @Size(max = 255) String reason
) {}
