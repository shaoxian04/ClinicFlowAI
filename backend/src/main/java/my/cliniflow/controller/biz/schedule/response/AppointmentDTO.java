package my.cliniflow.controller.biz.schedule.response;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Read DTO for an appointment, joined with its slot for the caller's
 * convenience ({@code startAt}, {@code endAt}, {@code doctorId} come from
 * the slot row).
 */
public record AppointmentDTO(
    UUID id,
    UUID slotId,
    OffsetDateTime startAt,
    OffsetDateTime endAt,
    UUID doctorId,
    UUID patientId,
    UUID visitId,
    String type,
    UUID parentVisitId,
    String status,
    OffsetDateTime cancelledAt,
    String doctorName,
    String patientName
) {
    /** Backwards-compatible constructor for callers that don't have names. */
    public AppointmentDTO(UUID id, UUID slotId, OffsetDateTime startAt, OffsetDateTime endAt,
                          UUID doctorId, UUID patientId, UUID visitId, String type,
                          UUID parentVisitId, String status, OffsetDateTime cancelledAt) {
        this(id, slotId, startAt, endAt, doctorId, patientId, visitId, type,
             parentVisitId, status, cancelledAt, null, null);
    }
}
