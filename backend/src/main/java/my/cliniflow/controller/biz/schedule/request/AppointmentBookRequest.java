package my.cliniflow.controller.biz.schedule.request;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Patient request to book an appointment slot. Exactly one of {@code visitId}
 * (for NEW_SYMPTOM) or {@code parentVisitId} (for FOLLOW_UP) must be supplied;
 * the other is null. The application service validates this pairing.
 */
public record AppointmentBookRequest(
    @NotNull UUID slotId,
    @NotNull String type,            // NEW_SYMPTOM | FOLLOW_UP
    UUID visitId,                    // required when NEW_SYMPTOM
    UUID parentVisitId               // required when FOLLOW_UP
) {}
