package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "medical_reports")
public class MedicalReportModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "visit_id", nullable = false, unique = true)
    private UUID visitId;

    @Column(nullable = false, columnDefinition = "text")
    private String subjective = "";

    @Column(nullable = false, columnDefinition = "text")
    private String objective = "";

    @Column(nullable = false, columnDefinition = "text")
    private String assessment = "";

    @Column(nullable = false, columnDefinition = "text")
    private String plan = "";

    @Column(name = "ai_draft_hash", length = 64)
    private String aiDraftHash;

    @Column(name = "is_finalized", nullable = false)
    private boolean finalized = false;

    @Column(name = "finalized_by")
    private UUID finalizedBy;

    @Column(name = "finalized_at")
    private OffsetDateTime finalizedAt;

    @Column(name = "preview_approved_at")
    private OffsetDateTime previewApprovedAt;

    @Column(name = "summary_en", columnDefinition = "text")
    private String summaryEn;

    @Column(name = "summary_ms", columnDefinition = "text")
    private String summaryMs;

    @Column(name = "gmt_create", nullable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false)
    private OffsetDateTime gmtModified;

    @PrePersist
    void onInsert() {
        OffsetDateTime now = OffsetDateTime.now();
        gmtCreate = now;
        gmtModified = now;
    }

    @PreUpdate
    void onUpdate() { gmtModified = OffsetDateTime.now(); }

    public UUID getId() { return id; }
    public UUID getVisitId() { return visitId; }
    public void setVisitId(UUID v) { this.visitId = v; }
    public String getSubjective() { return subjective; }
    public void setSubjective(String v) { this.subjective = v == null ? "" : v; }
    public String getObjective() { return objective; }
    public void setObjective(String v) { this.objective = v == null ? "" : v; }
    public String getAssessment() { return assessment; }
    public void setAssessment(String v) { this.assessment = v == null ? "" : v; }
    public String getPlan() { return plan; }
    public void setPlan(String v) { this.plan = v == null ? "" : v; }
    public String getAiDraftHash() { return aiDraftHash; }
    public void setAiDraftHash(String v) { this.aiDraftHash = v; }
    public boolean isFinalized() { return finalized; }
    public void setFinalized(boolean v) { this.finalized = v; }
    public UUID getFinalizedBy() { return finalizedBy; }
    public void setFinalizedBy(UUID v) { this.finalizedBy = v; }
    public OffsetDateTime getFinalizedAt() { return finalizedAt; }
    public void setFinalizedAt(OffsetDateTime v) { this.finalizedAt = v; }
    public OffsetDateTime getPreviewApprovedAt() { return previewApprovedAt; }
    public void setPreviewApprovedAt(OffsetDateTime v) { this.previewApprovedAt = v; }
    public String getSummaryEn() { return summaryEn; }
    public void setSummaryEn(String v) { this.summaryEn = v; }
    public String getSummaryMs() { return summaryMs; }
    public void setSummaryMs(String v) { this.summaryMs = v; }
}
