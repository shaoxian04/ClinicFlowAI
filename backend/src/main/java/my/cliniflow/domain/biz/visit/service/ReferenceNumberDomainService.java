package my.cliniflow.domain.biz.visit.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Atomic per-day daily-sequence allocator. Returns visit reference numbers
 * shaped V-yyyy-MM-dd-NNNN. Always called inside an existing transaction
 * (REQUIRES) — relies on row-level UPSERT for cross-thread safety.
 */
@Service
public class ReferenceNumberDomainService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final JdbcTemplate jdbc;

    public ReferenceNumberDomainService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public String nextFor(LocalDate date) {
        Integer seq = jdbc.queryForObject(
                "INSERT INTO visit_reference_counter (counter_date, last_seq) VALUES (?, 1) " +
                "ON CONFLICT (counter_date) DO UPDATE SET last_seq = visit_reference_counter.last_seq + 1 " +
                "RETURNING last_seq",
                Integer.class,
                date
        );
        return String.format("V-%s-%04d", date.format(DATE_FMT), seq);
    }
}
