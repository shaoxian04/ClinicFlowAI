package my.cliniflow.domain.biz.visit.service;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * Per-day counter row initializer. Lives in a separate bean so its
 * {@code REQUIRES_NEW} transaction commits (or rolls back) independently
 * of the caller — this is what isolates a {@link DuplicateKeyException}
 * raised by a concurrent first-of-day INSERT from poisoning the parent
 * transaction.
 */
@Component
public class ReferenceCounterInitializer {

    private final JdbcTemplate jdbc;

    public ReferenceCounterInitializer(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Insert the day row with last_seq = 0. Idempotent in effect: if a
     * concurrent caller already inserted the row, the INSERT throws
     * {@link DuplicateKeyException}, which the inner transaction rolls back
     * cleanly. The outer caller is free to immediately retry the UPDATE.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureRowExists(LocalDate date) {
        try {
            jdbc.update(
                    "INSERT INTO visit_reference_counter (counter_date, last_seq) VALUES (?, 0)",
                    date);
        } catch (DuplicateKeyException race) {
            // Another transaction won the race; row exists. Inner transaction
            // rolls back, outer continues with UPDATE.
        }
    }
}
