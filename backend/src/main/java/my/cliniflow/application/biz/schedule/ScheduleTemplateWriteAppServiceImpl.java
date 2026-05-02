package my.cliniflow.application.biz.schedule;

import my.cliniflow.application.biz.schedule.converter.ScheduleTemplateModel2DTOConverter;
import my.cliniflow.controller.biz.schedule.request.ScheduleTemplateUpsertRequest;
import my.cliniflow.controller.biz.schedule.response.ScheduleTemplateDTO;
import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;
import my.cliniflow.domain.biz.schedule.service.ScheduleTemplateUpdateDomainService;
import my.cliniflow.domain.biz.schedule.service.SlotGenerateDomainService;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ScheduleTemplateWriteAppServiceImpl implements ScheduleTemplateWriteAppService {

    private final ScheduleTemplateUpdateDomainService updateSvc;
    private final SlotGenerateDomainService slotGen;
    private final ScheduleTemplateModel2DTOConverter converter;
    private final UserRepository users;
    private final AuditWriter audit;
    private final UUID doctorId;

    public ScheduleTemplateWriteAppServiceImpl(
            ScheduleTemplateUpdateDomainService updateSvc,
            SlotGenerateDomainService slotGen,
            ScheduleTemplateModel2DTOConverter converter,
            UserRepository users,
            AuditWriter audit,
            @Value("${cliniflow.dev.seeded-doctor-pk}") String doctorId) {
        this.updateSvc = updateSvc;
        this.slotGen = slotGen;
        this.converter = converter;
        this.users = users;
        this.audit = audit;
        this.doctorId = UUID.fromString(doctorId);
    }

    @Override
    @Transactional
    public ScheduleTemplateDTO upsert(UUID actorUserId, ScheduleTemplateUpsertRequest req) {
        WeeklyHours wh = WeeklyHours.fromJson(toJsonMap(req.weeklyHours()));
        ScheduleTemplateModel saved = updateSvc.upsert(
            doctorId,
            req.effectiveFrom(),
            req.slotMinutes(),
            wh,
            req.cancelLeadHours(),
            req.generationHorizonDays());

        slotGen.generate(saved, OffsetDateTime.now());

        String role = users.findById(actorUserId).orElseThrow().getRole().name();
        audit.append("UPDATE", "SCHEDULE_TEMPLATE", saved.getId().toString(), actorUserId, role);

        return converter.convert(saved);
    }

    /** Coerces the strongly-typed wire map to the {@code Map<String,Object>} shape WeeklyHours expects. */
    private static Map<String, Object> toJsonMap(Map<String, List<List<String>>> wh) {
        Map<String, Object> out = new HashMap<>(wh.size());
        out.putAll(wh);
        return out;
    }
}
