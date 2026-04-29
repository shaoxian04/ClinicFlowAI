package my.cliniflow.infrastructure.outbox;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "neo4j_projection_outbox")
public class Neo4jProjectionOutboxEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(nullable = false, length = 64)
    private String operation;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> payload;

    @Column(nullable = false, length = 16)
    private String status = "PENDING";

    @Column(nullable = false)
    private Integer attempts = 0;

    @Column(name = "next_attempt_at", nullable = false)
    private OffsetDateTime nextAttemptAt = OffsetDateTime.now();

    @Column(name = "last_error", columnDefinition = "text")
    private String lastError;

    @Column(name = "enqueued_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime enqueuedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    public Long getId() { return id; }
    public UUID getAggregateId() { return aggregateId; }
    public void setAggregateId(UUID v) { this.aggregateId = v; }
    public String getOperation() { return operation; }
    public void setOperation(String v) { this.operation = v; }
    public Map<String, Object> getPayload() { return payload; }
    public void setPayload(Map<String, Object> v) { this.payload = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public Integer getAttempts() { return attempts; }
    public void setAttempts(Integer v) { this.attempts = v; }
    public OffsetDateTime getNextAttemptAt() { return nextAttemptAt; }
    public void setNextAttemptAt(OffsetDateTime v) { this.nextAttemptAt = v; }
    public String getLastError() { return lastError; }
    public void setLastError(String v) { this.lastError = v; }
    public OffsetDateTime getEnqueuedAt() { return enqueuedAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime v) { this.completedAt = v; }
}
