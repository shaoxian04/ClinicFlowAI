package my.cliniflow.application.biz.schedule.converter;

import my.cliniflow.controller.biz.schedule.response.ScheduleTemplateDTO;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Maps {@link ScheduleTemplateModel} to {@link ScheduleTemplateDTO}.
 */
@Component
public class ScheduleTemplateModel2DTOConverter {

    /**
     * Converts a schedule template domain model to its read DTO.
     *
     * <p>{@code weeklyHours} is obtained via {@link my.cliniflow.domain.biz.schedule.info.WeeklyHours#toJson()},
     * which returns a {@code Map<String, Object>} whose values are
     * {@code List<List<String>>}; the unchecked cast is safe by construction.
     */
    @SuppressWarnings("unchecked")
    public ScheduleTemplateDTO convert(ScheduleTemplateModel m) {
        Map<String, List<List<String>>> weeklyHours =
            (Map<String, List<List<String>>>) (Map<String, ?>) m.getWeeklyHours().toJson();

        return new ScheduleTemplateDTO(
            m.getId(),
            m.getDoctorId(),
            m.getEffectiveFrom(),
            m.getSlotMinutes(),
            weeklyHours,
            m.getCancelLeadHours(),
            m.getGenerationHorizonDays()
        );
    }
}
