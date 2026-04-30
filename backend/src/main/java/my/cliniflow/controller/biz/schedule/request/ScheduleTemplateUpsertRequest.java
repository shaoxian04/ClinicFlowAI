package my.cliniflow.controller.biz.schedule.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Admin/staff request to upsert a doctor's weekly schedule template.
 * {@code weeklyHours} format: {@code {"MON":[["09:00","12:00"],["14:00","17:00"]],...}}
 * — keys are 3-letter day abbreviations, values are lists of [startTime, endTime] window pairs.
 */
public record ScheduleTemplateUpsertRequest(
    @NotNull LocalDate effectiveFrom,
    @Min(10) @Max(60) short slotMinutes,
    @NotNull Map<String, List<List<String>>> weeklyHours,
    @Min(0) @Max(168) short cancelLeadHours,
    @Min(1) @Max(90) short generationHorizonDays
) {}
