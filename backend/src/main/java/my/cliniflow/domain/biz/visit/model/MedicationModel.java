package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "medications")
public class MedicationModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "visit_id", nullable = false)
    private UUID visitId;

    @Column(nullable = false, length = 255)
    private String name = "";

    @Column(nullable = false, length = 128)
    private String dosage = "";

    @Column(nullable = false, length = 128)
    private String frequency = "";

    @Column(name = "duration_days")
    private Integer durationDays;

    @Column(columnDefinition = "text")
    private String instructions;

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
    public String getName() { return name; }
    public void setName(String v) { this.name = v == null ? "" : v; }
    public String getDosage() { return dosage; }
    public void setDosage(String v) { this.dosage = v == null ? "" : v; }
    public String getFrequency() { return frequency; }
    public void setFrequency(String v) { this.frequency = v == null ? "" : v; }
    public Integer getDurationDays() { return durationDays; }
    public void setDurationDays(Integer v) { this.durationDays = v; }
    public String getInstructions() { return instructions; }
    public void setInstructions(String v) { this.instructions = v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
