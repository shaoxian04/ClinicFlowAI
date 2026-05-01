package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import my.cliniflow.domain.biz.visit.enums.FindingCategory;
import my.cliniflow.domain.biz.visit.enums.FindingSeverity;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "evaluator_findings")
public class EvaluatorFindingModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "visit_id", nullable = false)
    private UUID visitId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private FindingCategory category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private FindingSeverity severity;

    @Column(name = "field_path", length = 255)
    private String fieldPath;

    @Column(nullable = false, columnDefinition = "text")
    private String message;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> details = new HashMap<>();

    @Column(name = "acknowledged_at")
    private OffsetDateTime acknowledgedAt;

    @Column(name = "acknowledged_by")
    private UUID acknowledgedBy;

    @Column(name = "acknowledgement_reason", length = 255)
    private String acknowledgementReason;

    @Column(name = "superseded_at")
    private OffsetDateTime supersededAt;

    @Column(name = "gmt_create", nullable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false)
    private OffsetDateTime gmtModified;

    @PrePersist
    void onInsert() {
        OffsetDateTime now = OffsetDateTime.now();
        if (gmtCreate == null) gmtCreate = now;
        gmtModified = now;
        if (details == null) details = new HashMap<>();
    }

    @PreUpdate
    void onUpdate() {
        gmtModified = OffsetDateTime.now();
    }

    /* -------- domain invariants -------- */

    public boolean isUnacknowledgedCritical() {
        return severity == FindingSeverity.CRITICAL
            && acknowledgedAt == null
            && supersededAt == null;
    }

    public boolean isSuperseded() {
        return supersededAt != null;
    }

    public void acknowledge(UUID doctorId, String reason) {
        if (isSuperseded()) {
            throw new IllegalStateException("cannot acknowledge superseded finding");
        }
        if (acknowledgedAt != null) {
            return;  // idempotent
        }
        this.acknowledgedAt = OffsetDateTime.now();
        this.acknowledgedBy = doctorId;
        this.acknowledgementReason = reason == null ? null : reason.strip();
    }

    public void markSuperseded() {
        if (supersededAt == null) {
            this.supersededAt = OffsetDateTime.now();
        }
    }

    /* -------- getters / setters -------- */

    public UUID getId() { return id; }
    public void setId(UUID v) { this.id = v; }

    public UUID getVisitId() { return visitId; }
    public void setVisitId(UUID v) { this.visitId = v; }

    public FindingCategory getCategory() { return category; }
    public void setCategory(FindingCategory v) { this.category = v; }

    public FindingSeverity getSeverity() { return severity; }
    public void setSeverity(FindingSeverity v) { this.severity = v; }

    public String getFieldPath() { return fieldPath; }
    public void setFieldPath(String v) { this.fieldPath = v; }

    public String getMessage() { return message; }
    public void setMessage(String v) { this.message = v; }

    public Map<String, Object> getDetails() { return details; }
    public void setDetails(Map<String, Object> v) { this.details = v; }

    public OffsetDateTime getAcknowledgedAt() { return acknowledgedAt; }

    public UUID getAcknowledgedBy() { return acknowledgedBy; }

    public String getAcknowledgementReason() { return acknowledgementReason; }

    public OffsetDateTime getSupersededAt() { return supersededAt; }

    public OffsetDateTime getGmtCreate() { return gmtCreate; }

    public OffsetDateTime getGmtModified() { return gmtModified; }
}
