package my.cliniflow.infrastructure.outbox;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Component
public class Neo4jProjectionOutboxWriter {

    private final Neo4jProjectionOutboxRepository repo;

    public Neo4jProjectionOutboxWriter(Neo4jProjectionOutboxRepository repo) { this.repo = repo; }

    /** Enqueue inside the caller's @Transactional — outbox row commits with the business write. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(UUID aggregateId, Neo4jProjectionOperation op, Map<String, Object> payload) {
        Neo4jProjectionOutboxEntity row = new Neo4jProjectionOutboxEntity();
        row.setAggregateId(aggregateId);
        row.setOperation(op.name());
        row.setPayload(payload);
        row.setStatus("PENDING");
        row.setNextAttemptAt(OffsetDateTime.now());
        repo.save(row);
    }
}
