package my.cliniflow.domain.biz.schedule.info;

import org.junit.jupiter.api.Test;
import java.time.LocalTime;
import static org.assertj.core.api.Assertions.*;

class TimeWindowTest {

    @Test
    void rejects_zero_or_negative_window() {
        assertThatThrownBy(() -> new TimeWindow(LocalTime.of(9, 0), LocalTime.of(9, 0)))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TimeWindow(LocalTime.of(10, 0), LocalTime.of(9, 0)))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejects_null_endpoints() {
        assertThatThrownBy(() -> new TimeWindow(null, LocalTime.of(9, 0)))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TimeWindow(LocalTime.of(9, 0), null))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void contains_returns_true_for_inclusive_start_exclusive_end() {
        TimeWindow w = new TimeWindow(LocalTime.of(9, 0), LocalTime.of(12, 0));
        assertThat(w.contains(LocalTime.of(9, 0))).isTrue();
        assertThat(w.contains(LocalTime.of(11, 59))).isTrue();
        assertThat(w.contains(LocalTime.of(12, 0))).isFalse();
        assertThat(w.contains(LocalTime.of(8, 59))).isFalse();
    }
}
