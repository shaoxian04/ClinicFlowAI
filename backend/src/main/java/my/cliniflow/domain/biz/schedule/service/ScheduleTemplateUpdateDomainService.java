package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;
import my.cliniflow.domain.biz.schedule.repository.ScheduleTemplateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Optional;
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
@Service
public class ScheduleTemplateUpdateDomainService {

    private final ScheduleTemplateRepository templates;

    public ScheduleTemplateUpdateDomainService(ScheduleTemplateRepository templates) {
        this.templates = templates;
    }

    @Transactional
    public ScheduleTemplateModel upsert(UUID doctorId,
                                        LocalDate effectiveFrom,
                                        short slotMinutes,
                                        WeeklyHours weeklyHours,
                                        short cancelLeadHours,
                                        short generationHorizonDays) {
        ScheduleTemplateModel fresh = ScheduleTemplateModel.create(
            doctorId, effectiveFrom, slotMinutes, weeklyHours,
            cancelLeadHours, generationHorizonDays);

        Optional<ScheduleTemplateModel> existing = templates.findCurrentForDoctor(doctorId);
        if (existing.isPresent()
                && existing.get().getEffectiveFrom().equals(effectiveFrom)) {
            fresh.hydrateId(existing.get().getId());
        }

        return templates.save(fresh);
    }
}
