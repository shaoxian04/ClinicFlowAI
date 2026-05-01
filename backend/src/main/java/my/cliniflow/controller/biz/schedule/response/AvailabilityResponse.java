package my.cliniflow.controller.biz.schedule.response;

import java.util.List;

/**
 * Wrapper for {@code GET /api/appointments/availability} — list of
 * AVAILABLE slots within the requested date window.
 */
public record AvailabilityResponse(
    List<SlotDTO> slots
) {}
