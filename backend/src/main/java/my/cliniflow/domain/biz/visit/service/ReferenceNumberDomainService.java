package my.cliniflow.domain.biz.visit.service;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Atomic per-day daily-sequence allocator. Returns visit reference numbers
 * shaped {@code V-yyyy-MM-dd-NNNN}. Always called inside an existing transaction
 * (REQUIRED) — relies on row-level lock from {@code UPDATE} for cross-thread
 * safety and a duplicate-key catch for the first-of-day race.
 *
 * <p>The implementation deliberately avoids PostgreSQL's
 * {@code INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING} so the same code
 * runs against H2 PostgreSQL-mode in tests. The cost is one extra round-trip
 * (the trailing {@code SELECT}); the benefit is portability and a much simpler
 * test setup. Concurrency is preserved because:
 * <ul>
 *   <li>The {@code UPDATE ... WHERE counter_date = ?} acquires a row-level
 *       lock for the day, serialising concurrent allocators within the same
 *       transaction window.</li>
 *   <li>The {@code INSERT} branch only runs on the first call of a day; the
 *       second concurrent first-call loses the unique-key race, retries the
 *       {@code UPDATE}, and now finds the row.</li>
 * </ul>
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
        int updated = jdbc.update(
                "UPDATE visit_reference_counter SET last_seq = last_seq + 1 WHERE counter_date = ?",
                date);
        if (updated == 0) {
            try {
                jdbc.update(
                        "INSERT INTO visit_reference_counter (counter_date, last_seq) VALUES (?, 1)",
                        date);
            } catch (DuplicateKeyException race) {
                jdbc.update(
                        "UPDATE visit_reference_counter SET last_seq = last_seq + 1 WHERE counter_date = ?",
                        date);
            }
        }
        Integer seq = jdbc.queryForObject(
                "SELECT last_seq FROM visit_reference_counter WHERE counter_date = ?",
                Integer.class,
                date);
        return String.format("V-%s-%04d", date.format(DATE_FMT), seq);
    }
}
