package my.cliniflow.domain.biz.schedule.info;

import org.junit.jupiter.api.Test;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;

class WeeklyHoursTest {

    @Test
    void parses_from_jsonb_map() {
        Map<String, Object> json = Map.of(
            "MON", List.of(List.of("09:00", "12:00"), List.of("14:00", "17:00")),
            "TUE", List.of(List.of("09:00", "12:00")));
        WeeklyHours wh = WeeklyHours.fromJson(json);
        assertThat(wh.windowsFor(DayOfWeek.MONDAY)).hasSize(2);
        assertThat(wh.windowsFor(DayOfWeek.TUESDAY)).hasSize(1);
        assertThat(wh.windowsFor(DayOfWeek.SUNDAY)).isEmpty();
    }

    @Test
    void serialises_to_json_round_trip() {
        Map<String, Object> json = Map.of("WED", List.of(List.of("10:30", "16:30")));
        assertThat(WeeklyHours.fromJson(json).toJson()).isEqualTo(json);
    }

    @Test
    void rejects_null_hours_map() {
        assertThatThrownBy(() -> new WeeklyHours(null))
            .isInstanceOf(NullPointerException.class);
    }
}
