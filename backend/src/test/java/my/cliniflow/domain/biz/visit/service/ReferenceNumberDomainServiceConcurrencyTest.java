package my.cliniflow.domain.biz.visit.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the {@link ReferenceCounterInitializer}-based race-isolation
 * fix: when multiple threads concurrently allocate the very first reference
 * number of a day, all threads must succeed (not throw transaction-aborted)
 * and produce a contiguous, unique sequence.
 *
 * <p>This test deliberately omits the class-level {@code @Transactional}
 * used by {@link ReferenceNumberDomainServiceTest} because each worker
 * thread must run in its own transaction — sharing one transaction across
 * threads would defeat the point of the test.
 */
@SpringBootTest
class ReferenceNumberDomainServiceConcurrencyTest {

    private static final LocalDate D = LocalDate.parse("2099-12-31");

    @Autowired ReferenceNumberDomainService svc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM visit_reference_counter WHERE counter_date = ?", D);
    }

    @AfterEach
    void cleanAfter() {
        jdbc.update("DELETE FROM visit_reference_counter WHERE counter_date = ?", D);
    }

    @Test
    void concurrent_first_of_day_calls_all_succeed_and_produce_unique_refs() throws Exception {
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<String>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return svc.nextFor(D);
                }));
            }

            start.countDown();

            List<String> refs = new ArrayList<>();
            for (Future<String> f : futures) {
                refs.add(f.get(15, TimeUnit.SECONDS));
            }

            // Every thread must have produced a non-null, well-formed ref...
            assertThat(refs).hasSize(threads);
            assertThat(refs).allMatch(s -> s != null && s.startsWith("V-2099-12-31-"));
            // ...and every ref must be unique (proves no double-issuance).
            assertThat(refs).doesNotHaveDuplicates();

            // The persisted last_seq must equal the number of allocations.
            Integer last = jdbc.queryForObject(
                    "SELECT last_seq FROM visit_reference_counter WHERE counter_date = ?",
                    Integer.class,
                    D);
            assertThat(last).isEqualTo(threads);
        } finally {
            pool.shutdownNow();
        }
    }
}
