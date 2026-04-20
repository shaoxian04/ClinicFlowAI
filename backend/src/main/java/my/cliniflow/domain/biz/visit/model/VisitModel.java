package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "visits")
public class VisitModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "patient_id", nullable = false)
    private UUID patientId;

    @Column(name = "doctor_id", nullable = false)
    private UUID doctorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private VisitStatus status = VisitStatus.SCHEDULED;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "finalized_at")
    private OffsetDateTime finalizedAt;

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

    @OneToOne(mappedBy = "visit", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
    private PreVisitReportModel preVisitReport;

    public UUID getId() { return id; }
    public UUID getPatientId() { return patientId; }
    public void setPatientId(UUID v) { this.patientId = v; }
    public UUID getDoctorId() { return doctorId; }
    public void setDoctorId(UUID v) { this.doctorId = v; }
    public VisitStatus getStatus() { return status; }
    public void setStatus(VisitStatus v) { this.status = v; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(OffsetDateTime v) { this.startedAt = v; }
    public OffsetDateTime getFinalizedAt() { return finalizedAt; }
    public void setFinalizedAt(OffsetDateTime v) { this.finalizedAt = v; }
    public PreVisitReportModel getPreVisitReport() { return preVisitReport; }
    public void setPreVisitReport(PreVisitReportModel v) {
        this.preVisitReport = v;
        if (v != null) v.setVisit(this);
    }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
