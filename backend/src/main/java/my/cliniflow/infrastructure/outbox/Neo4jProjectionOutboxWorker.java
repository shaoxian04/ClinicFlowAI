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
        long t0 = System.currentTimeMillis();
        List<Neo4jProjectionOutboxEntity> batch =
                repo.findDrainable(OffsetDateTime.now(), BATCH_SIZE);
        if (batch.isEmpty()) {
            log.trace("neo4j.projection.drain idle");
            return;
        }
        log.info("neo4j.projection.drain.start size={}", batch.size());
        int ok = 0;
        int fail = 0;
        for (Neo4jProjectionOutboxEntity row : batch) {
            if (processOne(row.getId())) ok++;
            else fail++;
        }
        log.info("neo4j.projection.drain.end size={} ok={} fail={} elapsedMs={}",
                batch.size(), ok, fail, System.currentTimeMillis() - t0);
    }

    /** Returns true on success, false on failure. */
    @Transactional
    public boolean processOne(Long id) {
        Neo4jProjectionOutboxEntity row = repo.findById(id).orElse(null);
        if (row == null) {
            log.debug("neo4j.projection.skip id={} reason=not_found", id);
            return false;
        }
        if (!"PENDING".equals(row.getStatus()) && !"FAILED".equals(row.getStatus())) {
            log.debug("neo4j.projection.skip id={} status={}", id, row.getStatus());
            return false;
        }
        long t0 = System.currentTimeMillis();
        try {
            Neo4jProjectionOperation op = Neo4jProjectionOperation.valueOf(row.getOperation());
            log.debug("neo4j.projection.apply id={} op={} aggregateId={} attempts={}",
                    row.getId(), op, row.getAggregateId(), row.getAttempts());
            client.handle(op, row.getAggregateId(), row.getPayload());
            row.setStatus("COMPLETED");
            row.setCompletedAt(OffsetDateTime.now());
            row.setLastError(null);
            repo.save(row);
            log.info("neo4j.projection.completed id={} op={} aggregateId={} elapsedMs={}",
                    row.getId(), row.getOperation(), row.getAggregateId(),
                    System.currentTimeMillis() - t0);
            return true;
        } catch (RuntimeException ex) {
            int attempts = row.getAttempts() == null ? 1 : row.getAttempts() + 1;
            row.setAttempts(attempts);
            row.setLastError(truncate(formatError(ex), 2000));
            row.setStatus("FAILED");
            long backoff = backoffSeconds(attempts);
            row.setNextAttemptAt(OffsetDateTime.now().plusSeconds(backoff));
            repo.save(row);
            // Full stack on first failure (so root cause is in the log) and at exhaustion.
            // Subsequent retries log compactly to avoid log spam.
            if (attempts == 1 || attempts >= MAX_ATTEMPTS) {
                log.warn("neo4j.projection.failed id={} op={} aggregateId={} attempts={} backoffSec={} elapsedMs={}",
                        row.getId(), row.getOperation(), row.getAggregateId(),
                        attempts, backoff, System.currentTimeMillis() - t0, ex);
            } else {
                log.warn("neo4j.projection.failed id={} op={} aggregateId={} attempts={} backoffSec={} cause={}",
                        row.getId(), row.getOperation(), row.getAggregateId(),
                        attempts, backoff, rootCauseMessage(ex));
            }
            return false;
        }
    }

    /** Walks the cause chain so masked exceptions (e.g. Neo4j Driver wrapping) are visible. */
    private static String formatError(Throwable ex) {
        StringBuilder sb = new StringBuilder();
        Throwable cur = ex;
        int depth = 0;
        while (cur != null && depth < 6) {
            if (depth > 0) sb.append(" | caused by: ");
            sb.append(cur.getClass().getSimpleName()).append(": ").append(cur.getMessage());
            if (cur.getCause() == cur) break;
            cur = cur.getCause();
            depth++;
        }
        return sb.toString();
    }

    private static String rootCauseMessage(Throwable ex) {
        Throwable cur = ex;
        while (cur.getCause() != null && cur.getCause() != cur) cur = cur.getCause();
        return cur.getClass().getSimpleName() + ": " + cur.getMessage();
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
