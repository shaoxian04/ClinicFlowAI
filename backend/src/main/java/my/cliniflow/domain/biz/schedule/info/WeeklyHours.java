package my.cliniflow.domain.biz.schedule.info;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * Weekly working-hours specification: for each {@link DayOfWeek}, an ordered
 * list of {@link TimeWindow} segments. JSON-round-trippable to/from the
 * {@code schedule_template.weekly_hours} jsonb column.
 *
 * <p>Days not present in the map are treated as days off ({@link #windowsFor}
 * returns an empty list).
 */
public record WeeklyHours(Map<DayOfWeek, List<TimeWindow>> hours) {

    public WeeklyHours {
        Objects.requireNonNull(hours, "hours");
    }

    public List<TimeWindow> windowsFor(DayOfWeek dow) {
        return hours.getOrDefault(dow, List.of());
    }

    private static final Map<String, DayOfWeek> DOW_ALIASES = Map.of(
        "MON", DayOfWeek.MONDAY,
        "TUE", DayOfWeek.TUESDAY,
        "WED", DayOfWeek.WEDNESDAY,
        "THU", DayOfWeek.THURSDAY,
        "FRI", DayOfWeek.FRIDAY,
        "SAT", DayOfWeek.SATURDAY,
        "SUN", DayOfWeek.SUNDAY
    );

    private static final Map<DayOfWeek, String> DOW_TO_ABBREV = Map.of(
        DayOfWeek.MONDAY,    "MON",
        DayOfWeek.TUESDAY,   "TUE",
        DayOfWeek.WEDNESDAY, "WED",
        DayOfWeek.THURSDAY,  "THU",
        DayOfWeek.FRIDAY,    "FRI",
        DayOfWeek.SATURDAY,  "SAT",
        DayOfWeek.SUNDAY,    "SUN"
    );

    @SuppressWarnings("unchecked")
    public static WeeklyHours fromJson(Map<String, Object> json) {
        EnumMap<DayOfWeek, List<TimeWindow>> out = new EnumMap<>(DayOfWeek.class);
        for (var entry : json.entrySet()) {
            String key = entry.getKey();
            DayOfWeek dow = DOW_ALIASES.containsKey(key)
                ? DOW_ALIASES.get(key)
                : DayOfWeek.valueOf(key);
            List<List<String>> windows = (List<List<String>>) entry.getValue();
            List<TimeWindow> parsed = new ArrayList<>(windows.size());
            for (List<String> ws : windows) {
                parsed.add(new TimeWindow(LocalTime.parse(ws.get(0)), LocalTime.parse(ws.get(1))));
            }
            out.put(dow, List.copyOf(parsed));
        }
        return new WeeklyHours(Map.copyOf(out));
    }

    public Map<String, Object> toJson() {
        Map<String, Object> out = new TreeMap<>();
        for (var e : hours.entrySet()) {
            List<List<String>> windows = e.getValue().stream()
                .map(w -> List.of(w.start().toString(), w.end().toString()))
                .toList();
            out.put(DOW_TO_ABBREV.get(e.getKey()), windows);
        }
        return Map.copyOf(out);
    }
}
