package my.cliniflow.application.biz.schedule;

import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.controller.biz.schedule.response.AvailabilityResponse;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Read-side application service for appointments — list availability, list
 * a patient's bookings, fetch a single appointment with ownership check.
 */
public interface AppointmentReadAppService {

    AvailabilityResponse listAvailability(LocalDate from, LocalDate to);

    List<AppointmentDTO> listMine(UUID userId, AppointmentStatus filter);

    AppointmentDTO findOne(UUID id, UUID userId);

    /** Internal — no ownership check, for notification listeners. */
    AppointmentDTO findOneInternal(UUID id);
}
