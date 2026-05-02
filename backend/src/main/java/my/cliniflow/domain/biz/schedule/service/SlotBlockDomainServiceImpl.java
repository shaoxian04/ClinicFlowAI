package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.model.ScheduleDayOverrideModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.ScheduleDayOverrideRepository;
import my.cliniflow.domain.biz.schedule.service.exception.BookingsInWindowException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class SlotBlockDomainServiceImpl implements SlotBlockDomainService {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final AppointmentRepository appts;
    private final ScheduleDayOverrideRepository overrides;

    public SlotBlockDomainServiceImpl(AppointmentRepository appts,
                                      ScheduleDayOverrideRepository overrides) {
        this.appts = appts;
        this.overrides = overrides;
    }

    @Override
    @Transactional
    public ScheduleDayOverrideModel blockWindow(UUID doctorId,
                                                LocalDate date,
                                                LocalTime windowStart,
                                                LocalTime windowEnd,
                                                String reason,
                                                UUID byUser) {
        OffsetDateTime windowStartAt = ZonedDateTime.of(date, windowStart, KL).toOffsetDateTime();
        OffsetDateTime windowEndAt   = ZonedDateTime.of(date, windowEnd, KL).toOffsetDateTime();

        List<?> conflicts = appts.findByDoctorAndDayWindow(
            doctorId, windowStartAt, windowEndAt,
            List.of(AppointmentStatus.BOOKED.name()));

        if (!conflicts.isEmpty()) {
            throw new BookingsInWindowException(
                "cannot block window: " + conflicts.size()
                + " active booking(s) overlap [" + windowStart + ", " + windowEnd
                + "] on " + date + " for doctor " + doctorId);
        }

        ScheduleDayOverrideModel override =
            ScheduleDayOverrideModel.blockWindow(doctorId, date, windowStart, windowEnd, reason, byUser);
        return overrides.save(override);
    }

    @Override
    @Transactional
    public ScheduleDayOverrideModel closeDay(UUID doctorId,
                                              LocalDate date,
                                              String reason,
                                              UUID byUser) {
        OffsetDateTime dayStart = ZonedDateTime.of(date, LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime dayEnd   = ZonedDateTime.of(date.plusDays(1), LocalTime.MIN, KL).toOffsetDateTime();

        List<?> conflicts = appts.findByDoctorAndDayWindow(
            doctorId, dayStart, dayEnd,
            List.of(AppointmentStatus.BOOKED.name()));

        if (!conflicts.isEmpty()) {
            throw new BookingsInWindowException(
                "cannot close day: " + conflicts.size()
                + " active booking(s) on " + date + " for doctor " + doctorId);
        }

        ScheduleDayOverrideModel override =
            ScheduleDayOverrideModel.closeDay(doctorId, date, reason, byUser);
        return overrides.save(override);
    }
}
