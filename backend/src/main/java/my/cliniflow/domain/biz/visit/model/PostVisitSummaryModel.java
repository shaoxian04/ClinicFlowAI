package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "post_visit_summaries")
public class PostVisitSummaryModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "visit_id", nullable = false, unique = true)
    private UUID visitId;

    @Column(name = "summary_en", nullable = false, columnDefinition = "text")
    private String summaryEn = "";

    @Column(name = "summary_ms", nullable = false, columnDefinition = "text")
    private String summaryMs = "";

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
    public String getSummaryEn() { return summaryEn; }
    public void setSummaryEn(String v) { this.summaryEn = v == null ? "" : v; }
    public String getSummaryMs() { return summaryMs; }
    public void setSummaryMs(String v) { this.summaryMs = v == null ? "" : v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
