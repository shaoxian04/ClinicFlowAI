package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;
import my.cliniflow.domain.biz.schedule.repository.ScheduleTemplateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

@Service
public class ScheduleTemplateUpdateDomainServiceImpl implements ScheduleTemplateUpdateDomainService {

    private final ScheduleTemplateRepository templates;

    public ScheduleTemplateUpdateDomainServiceImpl(ScheduleTemplateRepository templates) {
        this.templates = templates;
    }

    @Override
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
