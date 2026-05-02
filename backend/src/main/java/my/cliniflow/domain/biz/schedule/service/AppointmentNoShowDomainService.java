package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.model.AppointmentModel;

import java.util.UUID;

/**
 * Domain service that performs the NO_SHOW transition for a BOOKED appointment.
 */
public interface AppointmentNoShowDomainService {

    /**
     * Marks the appointment as NO_SHOW.
     *
     * @throws IllegalStateException if the appointment does not exist or is not BOOKED
     */
    AppointmentModel markNoShow(UUID appointmentId);
}
