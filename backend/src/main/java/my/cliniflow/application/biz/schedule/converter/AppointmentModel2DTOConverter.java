package my.cliniflow.application.biz.schedule.converter;

import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import org.springframework.stereotype.Component;

/**
 * Maps {@link AppointmentModel} (optionally joined with its
 * {@link AppointmentSlotModel}) to {@link AppointmentDTO}.
 *
 * <p>Two overloads are provided:
 * <ul>
 *   <li>{@link #convert(AppointmentModel)} — slot fields ({@code startAt},
 *       {@code endAt}, {@code doctorId}) are {@code null}.</li>
 *   <li>{@link #convert(AppointmentModel, AppointmentSlotModel)} — slot fields
 *       are populated from the supplied slot.</li>
 * </ul>
 */
@Component
public class AppointmentModel2DTOConverter {

    /**
     * Converts an appointment without slot details. Slot fields in the
     * resulting DTO ({@code startAt}, {@code endAt}, {@code doctorId})
     * will be {@code null}.
     */
    public AppointmentDTO convert(AppointmentModel m) {
        return new AppointmentDTO(
            m.getId(),
            m.getSlotId(),
            null,
            null,
            null,
            m.getPatientId(),
            m.getVisitId(),
            m.getType().name(),
            m.getParentVisitId(),
            m.getStatus().name(),
            m.getCancelledAt()
        );
    }

    /**
     * Converts an appointment joined with its slot. Slot fields
     * ({@code startAt}, {@code endAt}, {@code doctorId}) are taken from
     * the supplied {@code slot}.
     */
    public AppointmentDTO convert(AppointmentModel m, AppointmentSlotModel slot) {
        return new AppointmentDTO(
            m.getId(),
            m.getSlotId(),
            slot.getStartAt(),
            slot.getEndAt(),
            slot.getDoctorId(),
            m.getPatientId(),
            m.getVisitId(),
            m.getType().name(),
            m.getParentVisitId(),
            m.getStatus().name(),
            m.getCancelledAt()
        );
    }
}
