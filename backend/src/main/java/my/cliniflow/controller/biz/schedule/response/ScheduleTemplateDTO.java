package my.cliniflow.controller.biz.schedule.response;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Read DTO for a schedule template. {@code weeklyHours} mirrors the request
 * format (3-letter day keys, list-of-pairs values).
 */
public record ScheduleTemplateDTO(
    UUID id,
    UUID doctorId,
    LocalDate effectiveFrom,
    short slotMinutes,
    Map<String, List<List<String>>> weeklyHours,
    short cancelLeadHours,
    short generationHorizonDays
) {}
