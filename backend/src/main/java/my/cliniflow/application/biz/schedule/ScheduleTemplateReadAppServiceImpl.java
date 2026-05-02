package my.cliniflow.application.biz.schedule;

import my.cliniflow.application.biz.schedule.converter.ScheduleTemplateModel2DTOConverter;
import my.cliniflow.controller.biz.schedule.response.ScheduleTemplateDTO;
import my.cliniflow.domain.biz.schedule.repository.ScheduleTemplateRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ScheduleTemplateReadAppServiceImpl implements ScheduleTemplateReadAppService {

    private final ScheduleTemplateRepository templates;
    private final ScheduleTemplateModel2DTOConverter converter;
    private final UUID doctorId;

    public ScheduleTemplateReadAppServiceImpl(
            ScheduleTemplateRepository templates,
            ScheduleTemplateModel2DTOConverter converter,
            @Value("${cliniflow.dev.seeded-doctor-pk}") String doctorId) {
        this.templates = templates;
        this.converter = converter;
        this.doctorId = UUID.fromString(doctorId);
    }

    @Override
    public Optional<ScheduleTemplateDTO> getCurrent() {
        return templates.findCurrentForDoctor(doctorId).map(converter::convert);
    }
}
