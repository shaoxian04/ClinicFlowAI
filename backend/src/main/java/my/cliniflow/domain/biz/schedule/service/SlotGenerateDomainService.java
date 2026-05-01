package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.OverrideType;
import my.cliniflow.domain.biz.schedule.info.TimeWindow;
import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.model.ScheduleDayOverrideModel;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.repository.ScheduleDayOverrideRepository;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

/**
 * Domain service that eager-materialises appointment slots from a
 * {@link ScheduleTemplateModel}.
 *
 * <p>Generation strategy:
 * <ol>
 *   <li>Deletes future-AVAILABLE slots for the doctor (regeneration is idempotent).</li>
 *   <li>Walks each calendar day in {@code [today_KL, today_KL + horizon_days)}.</li>
 *   <li>Skips days closed by a {@link OverrideType#DAY_CLOSED} override.</li>
 *   <li>Within each working window, emits slots of {@code template.slotMinutes}.</li>
 *   <li>Skips slots overlapping any {@link OverrideType#WINDOW_BLOCKED} window.</li>
 *   <li>Skips slots whose {@code startAt} is not strictly after {@code now}.</li>
 * </ol>
 *
 * <p>All time arithmetic is performed in {@code Asia/Kuala_Lumpur} so slots near
 * midnight are not silently misattributed to the wrong calendar day by a UTC
 * cast.
 */
@Service
public class SlotGenerateDomainService {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final AppointmentSlotRepository slots;
    private final ScheduleDayOverrideRepository overrides;

    public SlotGenerateDomainService(AppointmentSlotRepository slots,
                                     ScheduleDayOverrideRepository overrides) {
        this.slots = slots;
        this.overrides = overrides;
    }

    public int generate(ScheduleTemplateModel tpl, OffsetDateTime now) {
        slots.deleteFutureAvailable(tpl.getDoctorId(), now);
        WeeklyHours wh = tpl.getWeeklyHours();
        int slotMinutes = tpl.getSlotMinutes();
        int horizonDays = tpl.getGenerationHorizonDays();
        LocalDate today = now.atZoneSameInstant(KL).toLocalDate();
        int inserted = 0;

        for (int d = 0; d < horizonDays; d++) {
            LocalDate date = today.plusDays(d);
            DayOfWeek dow = date.getDayOfWeek();
            List<ScheduleDayOverrideModel> dayOverrides =
                overrides.findByDoctorAndDate(tpl.getDoctorId(), date);
            if (dayOverrides.stream().anyMatch(o -> o.getType() == OverrideType.DAY_CLOSED)) {
                continue;
            }
            for (TimeWindow w : wh.windowsFor(dow)) {
                LocalTime cursor = w.start();
                while (cursor.plusMinutes(slotMinutes).compareTo(w.end()) <= 0) {
                    LocalTime slotStart = cursor;
                    LocalTime slotEnd = cursor.plusMinutes(slotMinutes);
                    if (isBlocked(dayOverrides, slotStart, slotEnd)) {
                        cursor = cursor.plusMinutes(slotMinutes);
                        continue;
                    }
                    OffsetDateTime startAt = ZonedDateTime.of(date, slotStart, KL).toOffsetDateTime();
                    OffsetDateTime endAt   = ZonedDateTime.of(date, slotEnd,   KL).toOffsetDateTime();
                    if (!startAt.isAfter(now)) {
                        cursor = cursor.plusMinutes(slotMinutes);
                        continue;
                    }
                    slots.save(AppointmentSlotModel.newAvailable(tpl.getDoctorId(), startAt, endAt));
                    inserted++;
                    cursor = cursor.plusMinutes(slotMinutes);
                }
            }
        }
        return inserted;
    }

    /**
     * True iff any {@link OverrideType#WINDOW_BLOCKED} override has a window
     * overlapping {@code [slotStart, slotEnd)} (half-open).
     */
    private boolean isBlocked(List<ScheduleDayOverrideModel> overrides,
                              LocalTime slotStart, LocalTime slotEnd) {
        return overrides.stream()
            .filter(o -> o.getType() == OverrideType.WINDOW_BLOCKED)
            .anyMatch(o -> !(slotEnd.compareTo(o.getWindowStart()) <= 0
                          || slotStart.compareTo(o.getWindowEnd()) >= 0));
    }
}
