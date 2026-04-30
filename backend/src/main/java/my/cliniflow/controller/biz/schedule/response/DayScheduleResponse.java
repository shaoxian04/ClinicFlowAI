package my.cliniflow.controller.biz.schedule.response;

import java.time.LocalDate;
import java.util.List;

/**
 * Doctor / staff view of one calendar day: all slots (any status) plus all
 * active appointments for that day.
 */
public record DayScheduleResponse(
    LocalDate date,
    List<SlotDTO> slots,
    List<AppointmentDTO> appointments
) {}
