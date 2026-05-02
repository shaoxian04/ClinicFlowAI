package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Domain service that upserts a doctor's schedule template.
 *
 * <p>Upsert logic:
 * <ul>
 *   <li>If no template exists yet → insert a new row.</li>
 *   <li>If an existing template has the same {@code effectiveFrom} → overwrite
 *       its fields by reusing the existing id (UPDATE semantics).</li>
 *   <li>If the existing template has a different {@code effectiveFrom} → insert
 *       a new row (the old template is kept as history).</li>
 * </ul>
 *
 * <p>Slot regeneration is the application service's responsibility, not this service.
 */
public interface ScheduleTemplateUpdateDomainService {

    ScheduleTemplateModel upsert(UUID doctorId,
                                 LocalDate effectiveFrom,
                                 short slotMinutes,
                                 WeeklyHours weeklyHours,
                                 short cancelLeadHours,
                                 short generationHorizonDays);
}
