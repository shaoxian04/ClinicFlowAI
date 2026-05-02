package my.cliniflow.application.biz.staff;

import my.cliniflow.controller.biz.staff.response.WaitingEntryDTO;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/**
 * Read-side application service for the staff (front-desk) portal.
 *
 * <p>Computes the "today" waiting list by joining {@code appointment_slots}
 * to {@code appointments} (in {@code BOOKED} or {@code CHECKED_IN} status)
 * and decorating each entry with patient/doctor names + a coarse pre-visit
 * status derived from {@code pre_visit_reports}.
 */
public interface StaffReadAppService {

    /**
     * Returns today's waiting list (all doctors), sorted by scheduled slot
     * start ascending. Day boundaries are computed in {@code zone} so that
     * slots near midnight aren't silently mis-attributed to a UTC date.
     */
    List<WaitingEntryDTO> today(LocalDate date, ZoneId zone);
}
