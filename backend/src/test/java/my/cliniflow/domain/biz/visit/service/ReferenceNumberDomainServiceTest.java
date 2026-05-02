package my.cliniflow.domain.biz.visit.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class ReferenceNumberDomainServiceTest {

    @Autowired ReferenceNumberDomainService svc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void next_starts_at_0001_on_first_call_of_day() {
        jdbc.update("DELETE FROM visit_reference_counter WHERE counter_date = ?", LocalDate.now());
        String ref = svc.nextFor(LocalDate.parse("2026-05-02"));
        assertThat(ref).isEqualTo("V-2026-05-02-0001");
    }

    @Test
    void next_increments_within_same_day() {
        LocalDate d = LocalDate.parse("2026-05-03");
        jdbc.update("DELETE FROM visit_reference_counter WHERE counter_date = ?", d);
        assertThat(svc.nextFor(d)).isEqualTo("V-2026-05-03-0001");
        assertThat(svc.nextFor(d)).isEqualTo("V-2026-05-03-0002");
        assertThat(svc.nextFor(d)).isEqualTo("V-2026-05-03-0003");
    }

    @Test
    void next_resets_per_day() {
        LocalDate d1 = LocalDate.parse("2026-05-04");
        LocalDate d2 = LocalDate.parse("2026-05-05");
        jdbc.update("DELETE FROM visit_reference_counter WHERE counter_date IN (?, ?)", d1, d2);
        svc.nextFor(d1);
        svc.nextFor(d1);
        assertThat(svc.nextFor(d2)).isEqualTo("V-2026-05-05-0001");
    }
}
