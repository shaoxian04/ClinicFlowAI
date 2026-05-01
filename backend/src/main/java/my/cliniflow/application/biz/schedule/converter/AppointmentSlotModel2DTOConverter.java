package my.cliniflow.application.biz.schedule.converter;

import my.cliniflow.controller.biz.schedule.response.SlotDTO;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import org.springframework.stereotype.Component;

/**
 * Maps {@link AppointmentSlotModel} to {@link SlotDTO}.
 */
@Component
public class AppointmentSlotModel2DTOConverter {

    /**
     * Converts a slot domain model to its read DTO.
     */
    public SlotDTO convert(AppointmentSlotModel m) {
        return new SlotDTO(
            m.getId(),
            m.getDoctorId(),
            m.getStartAt(),
            m.getEndAt(),
            m.getStatus().name()
        );
    }
}
