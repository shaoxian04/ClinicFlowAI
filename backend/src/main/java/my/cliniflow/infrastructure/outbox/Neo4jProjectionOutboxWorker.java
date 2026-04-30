package my.cliniflow.infrastructure.outbox;

import my.cliniflow.infrastructure.neo4j.Neo4jProjectionClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Drains the Neo4j projection outbox. Runs only when the Neo4j Driver bean is
 * present (it's gated by {@code cliniflow.neo4j.uri} on the config side).
 *
 * Per-row failures don't poison the queue: the row's status flips to FAILED
 * with an exponential backoff in {@code next_attempt_at}. Up to MAX_ATTEMPTS
 * tries; after that the row stays FAILED for an operator to inspect.
 */
@Component
@ConditionalOnBean(Neo4jProjectionClient.class)
public class Neo4jProjectionOutboxWorker {

    private static final Logger log = LoggerFactory.getLogger(Neo4jProjectionOutboxWorker.class);

    private static final int BATCH_SIZE = 25;
    private static final int MAX_ATTEMPTS = 8;

    private final Neo4jProjectionOutboxRepository repo;
    private final Neo4jProjectionClient client;

    public Neo4jProjectionOutboxWorker(Neo4jProjectionOutboxRepository repo,
                                       Neo4jProjectionClient client) {
        this.repo = repo;
        this.client = client;
    }

    @Scheduled(fixedDelayString = "${cliniflow.neo4j.outbox.poll-ms:5000}",
               initialDelayString = "${cliniflow.neo4j.outbox.initial-delay-ms:10000}")
    public void drain() {
        List<Neo4jProjectionOutboxEntity> batch =
                repo.findDrainable(OffsetDateTime.now(), BATCH_SIZE);
        if (batch.isEmpty()) return;
        for (Neo4jProjectionOutboxEntity row : batch) {
            processOne(row.getId());
        }
    }

    @Transactional
    public void processOne(Long id) {
        Neo4jProjectionOutboxEntity row = repo.findById(id).orElse(null);
        if (row == null) return;
        if (!"PENDING".equals(row.getStatus()) && !"FAILED".equals(row.getStatus())) return;
        try {
            Neo4jProjectionOperation op = Neo4jProjectionOperation.valueOf(row.getOperation());
            client.handle(op, row.getAggregateId(), row.getPayload());
            row.setStatus("COMPLETED");
            row.setCompletedAt(OffsetDateTime.now());
            row.setLastError(null);
            repo.save(row);
        } catch (RuntimeException ex) {
            int attempts = row.getAttempts() == null ? 1 : row.getAttempts() + 1;
            row.setAttempts(attempts);
            row.setLastError(truncate(ex.toString(), 2000));
            row.setStatus("FAILED");
            row.setNextAttemptAt(OffsetDateTime.now().plusSeconds(backoffSeconds(attempts)));
            repo.save(row);
            log.warn("neo4j.projection.failed id={} op={} attempts={} err={}",
                    row.getId(), row.getOperation(), attempts, ex.getMessage());
        }
    }

    private static long backoffSeconds(int attempts) {
        if (attempts >= MAX_ATTEMPTS) return 60L * 60L * 24L; // park for a day after exhaustion
        // 30s, 60s, 120s, 240s, …, capped at 1h
        long s = 30L * (1L << Math.min(attempts - 1, 6));
        return Math.min(s, 3600L);
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
