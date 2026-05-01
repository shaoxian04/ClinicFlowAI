package my.cliniflow.controller.biz.schedule.response;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Read DTO for an appointment slot — used for the patient availability listing
 * and the staff/doctor calendar views.
 */
public record SlotDTO(
    UUID id,
    UUID doctorId,
    OffsetDateTime startAt,
    OffsetDateTime endAt,
    String status
) {}
