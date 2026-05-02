package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;

import java.util.UUID;

/**
 * Domain service that performs the BOOK transition: AVAILABLE slot → BOOKED slot
 * + new BOOKED appointment.
 */
public interface AppointmentBookDomainService {

    AppointmentModel book(UUID slotId,
                          UUID patientId,
                          UUID visitId,
                          AppointmentType type,
                          UUID parentVisitId);
}
