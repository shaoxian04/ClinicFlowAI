package my.cliniflow.controller.biz.schedule.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Staff request to mark an entire day as closed (DAY_CLOSED override).
 */
public record DayClosureRequest(
    @NotNull LocalDate date,
    @Size(max = 255) String reason
) {}
