package my.cliniflow.domain.biz.schedule.info;

import java.time.LocalTime;

/**
 * Half-open time interval [start, end) — start inclusive, end exclusive.
 *
 * <p>Used by {@link WeeklyHours} to describe doctor working hours and by
 * {@code SlotGenerateDomainService} to enumerate slot start times within a
 * window.
 */
public record TimeWindow(LocalTime start, LocalTime end) {
    public TimeWindow {
        if (start == null || end == null || !end.isAfter(start)) {
            throw new IllegalArgumentException("end must be after start");
        }
    }

    public boolean contains(LocalTime t) {
        return !t.isBefore(start) && t.isBefore(end);
    }
}
