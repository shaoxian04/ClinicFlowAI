package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.model.ScheduleDayOverrideModel;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/**
 * Domain service that blocks a time window or closes a day for a doctor.
 */
public interface SlotBlockDomainService {

    /**
     * Blocks a specific time window on the given date for a doctor.
     *
     * @throws my.cliniflow.domain.biz.schedule.service.exception.BookingsInWindowException
     *         if there is at least one BOOKED appointment overlapping the window
     */
    ScheduleDayOverrideModel blockWindow(UUID doctorId,
                                         LocalDate date,
                                         LocalTime windowStart,
                                         LocalTime windowEnd,
                                         String reason,
                                         UUID byUser);

    /**
     * Closes the entire day for a doctor.
     *
     * @throws my.cliniflow.domain.biz.schedule.service.exception.BookingsInWindowException
     *         if there is at least one BOOKED appointment anywhere on that day
     */
    ScheduleDayOverrideModel closeDay(UUID doctorId,
                                      LocalDate date,
                                      String reason,
                                      UUID byUser);
}
