package my.cliniflow.domain.biz.visit.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * <p>Concurrency strategy:
 * <ol>
 *   <li>Try {@code UPDATE ... SET last_seq = last_seq + 1 WHERE counter_date = ?}.
 *       If a row exists, this acquires the row-level lock and serializes
 *       all concurrent allocators for that day.</li>
 *   <li>If 0 rows updated (first call of the day), delegate to
 *       {@link ReferenceCounterInitializer#ensureRowExists} which runs in a
 *       {@code REQUIRES_NEW} transaction. Concurrent INSERT collisions are
 *       caught inside that inner transaction and don't poison the outer.</li>
 *   <li>Retry the UPDATE (now guaranteed to find a row).</li>
 *   <li>{@code SELECT last_seq} to read the just-bumped value.</li>
 * </ol>
 *
 * <p>The implementation deliberately avoids PostgreSQL's
 * {@code INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING} so the same code
 * path runs against H2 PostgreSQL-mode in unit tests.
 */
@Service
public class ReferenceNumberDomainServiceImpl implements ReferenceNumberDomainService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final JdbcTemplate jdbc;
    private final ReferenceCounterInitializer initializer;

    public ReferenceNumberDomainServiceImpl(JdbcTemplate jdbc,
                                            ReferenceCounterInitializer initializer) {
        this.jdbc = jdbc;
        this.initializer = initializer;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public String nextFor(LocalDate date) {
        int updated = jdbc.update(
                "UPDATE visit_reference_counter SET last_seq = last_seq + 1 WHERE counter_date = ?",
                date);
        if (updated == 0) {
            initializer.ensureRowExists(date);
            jdbc.update(
                    "UPDATE visit_reference_counter SET last_seq = last_seq + 1 WHERE counter_date = ?",
                    date);
        }
        Integer seq = jdbc.queryForObject(
                "SELECT last_seq FROM visit_reference_counter WHERE counter_date = ?",
                Integer.class,
                date);
        return String.format("V-%s-%04d", date.format(DATE_FMT), seq);
    }
}
