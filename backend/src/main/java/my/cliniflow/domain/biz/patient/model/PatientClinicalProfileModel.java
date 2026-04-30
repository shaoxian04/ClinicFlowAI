package my.cliniflow.domain.biz.patient.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "patient_clinical_profiles")
public class PatientClinicalProfileModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "patient_id", nullable = false, unique = true)
    private UUID patientId;

    @Column(name = "weight_kg", precision = 5, scale = 2)
    private BigDecimal weightKg;
    @Column(name = "weight_kg_updated_at")
    private OffsetDateTime weightKgUpdatedAt;
    @Column(name = "weight_kg_source", length = 32)
    private String weightKgSource;

    @Column(name = "height_cm", precision = 5, scale = 2)
    private BigDecimal heightCm;
    @Column(name = "height_cm_updated_at")
    private OffsetDateTime heightCmUpdatedAt;
    @Column(name = "height_cm_source", length = 32)
    private String heightCmSource;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "drug_allergies", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> drugAllergies = new ArrayList<>();
    @Column(name = "drug_allergies_updated_at")
    private OffsetDateTime drugAllergiesUpdatedAt;
    @Column(name = "drug_allergies_source", length = 32)
    private String drugAllergiesSource;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "chronic_conditions", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> chronicConditions = new ArrayList<>();
    @Column(name = "chronic_conditions_updated_at")
    private OffsetDateTime chronicConditionsUpdatedAt;
    @Column(name = "chronic_conditions_source", length = 32)
    private String chronicConditionsSource;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "regular_medications", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> regularMedications = new ArrayList<>();
    @Column(name = "regular_medications_updated_at")
    private OffsetDateTime regularMedicationsUpdatedAt;
    @Column(name = "regular_medications_source", length = 32)
    private String regularMedicationsSource;

    @Column(name = "pregnancy_status", length = 32)
    private String pregnancyStatus;
    @Column(name = "pregnancy_edd")
    private LocalDate pregnancyEdd;
    @Column(name = "pregnancy_updated_at")
    private OffsetDateTime pregnancyUpdatedAt;
    @Column(name = "pregnancy_source", length = 32)
    private String pregnancySource;

    @Column(name = "completeness_state", nullable = false, length = 16)
    private String completenessState = "INCOMPLETE";

    @Column(name = "gmt_create", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPatientId() { return patientId; }
    public void setPatientId(UUID v) { this.patientId = v; }
    public BigDecimal getWeightKg() { return weightKg; }
    public void setWeightKg(BigDecimal v) { this.weightKg = v; }
    public OffsetDateTime getWeightKgUpdatedAt() { return weightKgUpdatedAt; }
    public void setWeightKgUpdatedAt(OffsetDateTime v) { this.weightKgUpdatedAt = v; }
    public String getWeightKgSource() { return weightKgSource; }
    public void setWeightKgSource(String v) { this.weightKgSource = v; }
    public BigDecimal getHeightCm() { return heightCm; }
    public void setHeightCm(BigDecimal v) { this.heightCm = v; }
    public OffsetDateTime getHeightCmUpdatedAt() { return heightCmUpdatedAt; }
    public void setHeightCmUpdatedAt(OffsetDateTime v) { this.heightCmUpdatedAt = v; }
    public String getHeightCmSource() { return heightCmSource; }
    public void setHeightCmSource(String v) { this.heightCmSource = v; }
    public List<Map<String, Object>> getDrugAllergies() { return drugAllergies; }
    public void setDrugAllergies(List<Map<String, Object>> v) { this.drugAllergies = v; }
    public OffsetDateTime getDrugAllergiesUpdatedAt() { return drugAllergiesUpdatedAt; }
    public void setDrugAllergiesUpdatedAt(OffsetDateTime v) { this.drugAllergiesUpdatedAt = v; }
    public String getDrugAllergiesSource() { return drugAllergiesSource; }
    public void setDrugAllergiesSource(String v) { this.drugAllergiesSource = v; }
    public List<Map<String, Object>> getChronicConditions() { return chronicConditions; }
    public void setChronicConditions(List<Map<String, Object>> v) { this.chronicConditions = v; }
    public OffsetDateTime getChronicConditionsUpdatedAt() { return chronicConditionsUpdatedAt; }
    public void setChronicConditionsUpdatedAt(OffsetDateTime v) { this.chronicConditionsUpdatedAt = v; }
    public String getChronicConditionsSource() { return chronicConditionsSource; }
    public void setChronicConditionsSource(String v) { this.chronicConditionsSource = v; }
    public List<Map<String, Object>> getRegularMedications() { return regularMedications; }
    public void setRegularMedications(List<Map<String, Object>> v) { this.regularMedications = v; }
    public OffsetDateTime getRegularMedicationsUpdatedAt() { return regularMedicationsUpdatedAt; }
    public void setRegularMedicationsUpdatedAt(OffsetDateTime v) { this.regularMedicationsUpdatedAt = v; }
    public String getRegularMedicationsSource() { return regularMedicationsSource; }
    public void setRegularMedicationsSource(String v) { this.regularMedicationsSource = v; }
    public String getPregnancyStatus() { return pregnancyStatus; }
    public void setPregnancyStatus(String v) { this.pregnancyStatus = v; }
    public LocalDate getPregnancyEdd() { return pregnancyEdd; }
    public void setPregnancyEdd(LocalDate v) { this.pregnancyEdd = v; }
    public OffsetDateTime getPregnancyUpdatedAt() { return pregnancyUpdatedAt; }
    public void setPregnancyUpdatedAt(OffsetDateTime v) { this.pregnancyUpdatedAt = v; }
    public String getPregnancySource() { return pregnancySource; }
    public void setPregnancySource(String v) { this.pregnancySource = v; }
    public String getCompletenessState() { return completenessState; }
    public void setCompletenessState(String v) { this.completenessState = v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
