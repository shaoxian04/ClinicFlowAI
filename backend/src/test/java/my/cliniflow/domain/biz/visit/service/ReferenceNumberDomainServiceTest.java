package my.cliniflow.domain.biz.visit.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

// No @Transactional — ReferenceCounterInitializer uses REQUIRES_NEW which commits in a
// separate connection. A surrounding test-level transaction would prevent the outer
// connection from seeing those commits (snapshot isolation), causing queryForObject to
// return empty results. Tests clean up their own dates explicitly instead.
@SpringBootTest
class ReferenceNumberDomainServiceTest {

    private static final LocalDate D1 = LocalDate.parse("2026-05-02");
    private static final LocalDate D2 = LocalDate.parse("2026-05-03");
    private static final LocalDate D3 = LocalDate.parse("2026-05-04");
    private static final LocalDate D4 = LocalDate.parse("2026-05-05");

    @Autowired ReferenceNumberDomainService svc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void cleanCounters() {
        jdbc.update("DELETE FROM visit_reference_counter WHERE counter_date IN (?, ?, ?, ?)", D1, D2, D3, D4);
    }

    @Test
    void next_starts_at_0001_on_first_call_of_day() {
        String ref = svc.nextFor(D1);
        assertThat(ref).isEqualTo("V-2026-05-02-0001");
    }

    @Test
    void next_increments_within_same_day() {
        assertThat(svc.nextFor(D2)).isEqualTo("V-2026-05-03-0001");
        assertThat(svc.nextFor(D2)).isEqualTo("V-2026-05-03-0002");
        assertThat(svc.nextFor(D2)).isEqualTo("V-2026-05-03-0003");
    }

    @Test
    void next_resets_per_day() {
        svc.nextFor(D3);
        svc.nextFor(D3);
        assertThat(svc.nextFor(D4)).isEqualTo("V-2026-05-05-0001");
    }
}
